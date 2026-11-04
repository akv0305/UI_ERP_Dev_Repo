import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  PurchaseOrderComparisonFormQuery,
  PurchaseOrderComparisonFormResponse,
  PurchaseOrderComparisonOptionsResponse,
  PurchaseOrderFormOptionsResponse,
  PurchaseOrderItemOptionsResponse,
  PurchaseOrderSearchQuery,
  PurchaseOrderVendorDetails,
  PurchaseOrderVendorDetailsQuery,
  PurchaseOrderVendorOptionsResponse,
} from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { codeLabel } from '../auth/auth.mapper';
import { indentTargetOf } from '../indents/indent-rules';
import { isoDateOf } from '../indents/indents.mapper';
import { notFound } from '../masters/master-helpers';
import { forbidden, idFilter } from '../masters/scope';
import { PrismaService } from '../prisma/prisma.service';
import {
  duplicatePurchaseOrder,
  invalidPurchaseOrderComparison,
  invalidPurchaseOrderSite,
  invalidPurchaseOrderVendor,
} from './purchase-order-errors';
import { taxTypeFor } from './purchase-order-math';
import { PURCHASE_ORDER_MANAGE } from './purchase-order-rules';

const OPTION_LIMIT = 50;

const itemSummarySelect = {
  id: true,
  code: true,
  description: true,
  size: true,
  unit: { select: { code: true, decimalPlaces: true } },
} as const;

const billingSelect = { select: { gstin: true, stateId: true, isActive: true } } as const;

interface ItemRow {
  id: string;
  code: string;
  description: string;
  size: string | null;
  unit: { code: string; decimalPlaces: number };
}

interface Billing {
  gstin: string;
  stateId: string;
  isActive: boolean;
}

function itemSummaryOf(item: ItemRow) {
  return {
    id: item.id,
    code: item.code,
    description: item.description,
    size: item.size,
    unitCode: item.unit.code,
    decimalPlaces: item.unit.decimalPlaces,
  };
}

function activeBilling(billing: Billing | null): Billing | null {
  return billing !== null && billing.isActive ? billing : null;
}

@Injectable()
export class PurchaseOrderOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active sites where the user holds manage, with their active projects and active stores. */
  async formOptions(access: AccessContext): Promise<PurchaseOrderFormOptionsResponse> {
    const siteIds = await access.accessibleSiteIds(PURCHASE_ORDER_MANAGE);
    const sites = await this.prisma.site.findMany({
      where: {
        id: idFilter(siteIds),
        isActive: true,
        project: { isActive: true, company: { isActive: true } },
      },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        projectId: true,
        project: { select: { code: true, name: true, companyId: true } },
        stores: {
          where: { isActive: true },
          orderBy: [{ code: 'asc' }, { id: 'asc' }],
          select: { id: true, code: true, name: true },
        },
      },
    });
    const projects = new Map<string, { id: string; label: string; companyId: string }>();

    for (const site of sites) {
      projects.set(site.projectId, {
        id: site.projectId,
        label: codeLabel(site.project.code, site.project.name),
        companyId: site.project.companyId,
      });
    }

    return {
      projects: [...projects.values()].sort((a, b) => a.label.localeCompare(b.label)),
      sites: sites.map((site) => ({
        id: site.id,
        label: codeLabel(site.code, site.name),
        projectId: site.projectId,
      })),
      stores: sites.flatMap((site) =>
        site.stores.map((store) => ({
          id: store.id,
          label: codeLabel(store.code, store.name),
          siteId: site.id,
        })),
      ),
    };
  }

  /** Finalised comparisons in scope with at least one chosen vendor that has no live PO (OQ-83). */
  async comparisonOptions(
    query: PurchaseOrderSearchQuery,
    access: AccessContext,
  ): Promise<PurchaseOrderComparisonOptionsResponse> {
    const siteIds = await access.accessibleSiteIds(PURCHASE_ORDER_MANAGE);
    const where: Prisma.ComparisonWhereInput = { status: 'FINALISED', siteId: idFilter(siteIds) };

    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { number: { contains: query.search, mode: 'insensitive' } },
        { enquiry: { number: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const comparisons = await this.prisma.comparison.findMany({
      where,
      orderBy: [{ comparisonDate: 'desc' }, { id: 'asc' }],
      take: OPTION_LIMIT,
      select: {
        id: true,
        number: true,
        enquiry: { select: { number: true } },
        lines: {
          where: { selectedVendorId: { not: null } },
          select: { selectedVendor: { select: { id: true, code: true, legalName: true } } },
        },
        purchaseOrders: {
          where: { status: { not: 'CANCELLED' }, revisedFromId: null },
          select: { vendorId: true },
        },
      },
    });

    const result: PurchaseOrderComparisonOptionsResponse['comparisons'] = [];

    for (const comparison of comparisons) {
      const ordered = new Set(comparison.purchaseOrders.map((row) => row.vendorId));
      const vendors = new Map<string, { id: string; label: string }>();

      for (const line of comparison.lines) {
        const vendor = line.selectedVendor;

        if (vendor !== null && !ordered.has(vendor.id)) {
          vendors.set(vendor.id, {
            id: vendor.id,
            label: codeLabel(vendor.code, vendor.legalName),
          });
        }
      }

      if (vendors.size > 0) {
        result.push({
          id: comparison.id,
          label: `${comparison.number ?? ''} · ${comparison.enquiry.number ?? ''}`,
          vendors: [...vendors.values()].sort((a, b) => a.label.localeCompare(b.label)),
        });
      }
    }

    return { comparisons: result };
  }

  /** Prefill for a comparison PO: this vendor's chosen lines with the quoted values. */
  async comparisonForm(
    query: PurchaseOrderComparisonFormQuery,
    access: AccessContext,
  ): Promise<PurchaseOrderComparisonFormResponse> {
    const comparison = await this.prisma.comparison.findUnique({
      where: { id: query.comparisonId },
      select: {
        id: true,
        number: true,
        status: true,
        comparisonDate: true,
        companyId: true,
        projectId: true,
        siteId: true,
        project: { select: { id: true, code: true, name: true, billingGst: billingSelect } },
        site: { select: { id: true, code: true, name: true } },
        enquiry: { select: { id: true, number: true } },
        lines: {
          where: { selectedVendorId: query.vendorId },
          orderBy: { enquiryLine: { lineNo: 'asc' } },
          select: {
            id: true,
            enquiryLine: { select: { quantity: true, item: { select: itemSummarySelect } } },
            quotationLine: {
              select: {
                rate: true,
                discountPercent: true,
                gstRate: true,
                quotation: { select: { vendorQuoteRef: true, quoteDate: true } },
              },
            },
          },
        },
        purchaseOrders: {
          where: {
            vendorId: query.vendorId,
            status: { not: 'CANCELLED' },
            revisedFromId: null,
            // The PO being edited is not "another" live PO (PDEF-044).
            ...(query.purchaseOrderId === undefined ? {} : { id: { not: query.purchaseOrderId } }),
          },
          select: { id: true },
        },
      },
    });

    if (comparison === null || !access.canOn(PURCHASE_ORDER_MANAGE, indentTargetOf(comparison))) {
      throw notFound('Comparison');
    }

    if (comparison.status !== 'FINALISED') {
      throw invalidPurchaseOrderComparison(
        'Purchase orders can be made only from a finalised comparison.',
      );
    }

    if (comparison.lines.length === 0) {
      throw invalidPurchaseOrderVendor('This vendor was not chosen on any line of the comparison.');
    }

    if (comparison.purchaseOrders.length > 0) {
      throw duplicatePurchaseOrder(
        'This vendor already has a live purchase order for this comparison. Open it, or cancel it first.',
      );
    }

    const vendor = await this.vendorDetailsFor(
      query.vendorId,
      activeBilling(comparison.project.billingGst),
    );
    const quotation = comparison.lines[0]?.quotationLine?.quotation ?? null;

    return {
      comparison: {
        id: comparison.id,
        number: comparison.number ?? '',
        comparisonDate: isoDateOf(comparison.comparisonDate),
      },
      enquiry: { id: comparison.enquiry.id, number: comparison.enquiry.number ?? '' },
      project: {
        id: comparison.project.id,
        code: comparison.project.code,
        name: comparison.project.name,
      },
      site: comparison.site,
      vendor,
      vendorQuoteRef: quotation?.vendorQuoteRef ?? null,
      vendorQuoteDate: quotation === null ? null : isoDateOf(quotation.quoteDate),
      lines: comparison.lines.map((line) => {
        const item = line.enquiryLine.item;
        const quoted = line.quotationLine;

        return {
          comparisonLineId: line.id,
          item: itemSummaryOf(item),
          reference: {
            enquiryQuantity: line.enquiryLine.quantity.toFixed(item.unit.decimalPlaces),
            quotedRate: quoted?.rate?.toFixed(4) ?? '0.0000',
            quotedDiscountPercent: quoted?.discountPercent?.toFixed(2) ?? '0.00',
            quotedGstRate: quoted?.gstRate?.toFixed(2) ?? '0.00',
          },
        };
      }),
    };
  }

  /** Approved, active vendors searched by code, legal or trade name. */
  async vendorOptions(
    query: PurchaseOrderSearchQuery,
  ): Promise<PurchaseOrderVendorOptionsResponse> {
    const where: Prisma.VendorWhereInput = { status: 'APPROVED', isActive: true };

    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { legalName: { contains: query.search, mode: 'insensitive' } },
        { tradeName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const vendors = await this.prisma.vendor.findMany({
      where,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      take: OPTION_LIMIT,
      select: { id: true, code: true, legalName: true },
    });

    return {
      vendors: vendors.map((vendor) => ({
        id: vendor.id,
        label: codeLabel(vendor.code, vendor.legalName),
      })),
    };
  }

  /** The site decides the project and so the billing GST used for the tax type preview. */
  async vendorDetails(
    query: PurchaseOrderVendorDetailsQuery,
    access: AccessContext,
  ): Promise<PurchaseOrderVendorDetails> {
    const site = await this.prisma.site.findUnique({
      where: { id: query.siteId },
      select: {
        id: true,
        projectId: true,
        project: { select: { companyId: true, billingGst: billingSelect } },
      },
    });

    if (site === null) {
      throw invalidPurchaseOrderSite('Site not found.');
    }

    const target = {
      companyId: site.project.companyId,
      projectId: site.projectId,
      siteId: site.id,
    };

    if (!access.canOn(PURCHASE_ORDER_MANAGE, indentTargetOf(target))) {
      throw forbidden();
    }

    return this.vendorDetailsFor(query.vendorId, activeBilling(site.project.billingGst));
  }

  /** Approved, active items searched by code or description (OQ-27). */
  async itemOptions(query: PurchaseOrderSearchQuery): Promise<PurchaseOrderItemOptionsResponse> {
    const where: Prisma.ItemWhereInput = { status: 'APPROVED', isActive: true };

    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const items = await this.prisma.item.findMany({
      where,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      take: OPTION_LIMIT,
      select: { ...itemSummarySelect, gstRate: true },
    });

    return {
      items: items.map((item) => ({
        item: itemSummaryOf(item),
        defaultGstRate: item.gstRate?.toFixed(2) ?? null,
      })),
    };
  }

  private async vendorDetailsFor(
    vendorId: string,
    billing: Billing | null,
  ): Promise<PurchaseOrderVendorDetails> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        code: true,
        legalName: true,
        status: true,
        isActive: true,
        paymentTermsDays: true,
        gstRegistrations: {
          where: { isActive: true },
          orderBy: [{ gstin: 'asc' }],
          select: {
            id: true,
            gstin: true,
            stateId: true,
            state: { select: { gstCode: true, name: true } },
          },
        },
        contacts: {
          where: { isActive: true },
          orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
          select: { id: true, name: true, phone: true, isPrimary: true },
        },
      },
    });

    if (vendor === null || vendor.status !== 'APPROVED' || !vendor.isActive) {
      throw invalidPurchaseOrderVendor('The vendor is not approved or active.');
    }

    return {
      vendor: { id: vendor.id, code: vendor.code, legalName: vendor.legalName },
      billingGstin: billing?.gstin ?? null,
      paymentTermsDays: vendor.paymentTermsDays,
      gstRegistrations: vendor.gstRegistrations.map((row) => ({
        id: row.id,
        gstin: row.gstin,
        state: `${row.state.gstCode} ${row.state.name}`,
        taxType: billing === null ? null : taxTypeFor(billing.stateId, row.stateId),
      })),
      contacts: vendor.contacts,
    };
  }
}
