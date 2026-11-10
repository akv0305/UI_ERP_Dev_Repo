import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  PURCHASE_ORDER_NUMBER_DIGITS,
  PURCHASE_ORDER_NUMBER_PREFIX,
  fiscalYearOf,
  formatDocumentNumber,
  type ApprovalRouteResponse,
  type ApprovePurchaseOrderRequest,
  type CancelPurchaseOrderRequest,
  type CreatePurchaseOrderRequest,
  type PagedPurchaseOrdersResponse,
  type PurchaseOrderDetailResponse,
  type PurchaseOrderListQuery,
  type PurchaseOrderResponse,
  type PurchaseOrderStatus,
  type PurchaseOrderTaxType,
  type ReassignApproverRequest,
  type RejectPurchaseOrderRequest,
  type RouteToHigherRoleRequest,
  type SubmitPurchaseOrderRequest,
  type UpdatePurchaseOrderRequest,
} from '@uie/contracts';
import type { AccessContext } from '../access/access-context';
import { AuditService } from '../audit/audit.service';
import { takeNextNumber } from '../documents/document-number';
import { indentTargetOf, todayInIst } from '../indents/indent-rules';
import { isoDateOf } from '../indents/indents.mapper';
import { isUniqueViolation, notFound, pageOf, toDateOnly } from '../masters/master-helpers';
import { forbidden, idFilter } from '../masters/scope';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseOrderApprovalsService } from '../purchase-order-approvals/purchase-order-approvals.service';
import {
  billingGstMissing,
  duplicatePurchaseOrder,
  invalidPurchaseOrderComparison,
  invalidPurchaseOrderDate,
  invalidPurchaseOrderItem,
  invalidPurchaseOrderLines,
  invalidPurchaseOrderProject,
  invalidPurchaseOrderSite,
  invalidPurchaseOrderStatus,
  invalidPurchaseOrderStore,
  invalidPurchaseOrderVendor,
  invalidPurchaseOrderVendorContact,
  invalidPurchaseOrderVendorGst,
} from './purchase-order-errors';
import { pricePurchaseOrder, taxTypeFor, type PricedPurchaseOrder } from './purchase-order-math';
import {
  AWAITING_APPROVAL_PURCHASE_ORDER_STATUSES,
  CANCELLABLE_PURCHASE_ORDER_STATUSES,
  EDITABLE_PURCHASE_ORDER_STATUSES,
  PURCHASE_ORDER_MANAGE,
  PURCHASE_ORDER_VIEW,
  canSeePurchaseOrder,
  isAdministrator,
  purchaseOrderFlagsFor,
  purchaseOrderTargetOf,
} from './purchase-order-rules';
import {
  purchaseOrderDetailInclude,
  purchaseOrderInclude,
  toPurchaseOrderAuditSnapshot,
  toPurchaseOrderDetailResponse,
  toPurchaseOrderResponse,
  type PurchaseOrderWithDetails,
  type PurchaseOrderWithRelations,
} from './purchase-orders.mapper';

const ENTITY = 'Purchase order';
const CHANGED_BY_SOMEONE_ELSE =
  'This purchase order was changed by someone else. Reload and try again.';
const NOT_EDITABLE = 'Only a draft or rejected purchase order can be changed or submitted.';
const NOT_CANCELLABLE = 'Only a draft, submitted or rejected purchase order can be cancelled.';
const NOT_AWAITING = 'This purchase order is not waiting for approval.';
const DATE_LOCKED = 'The PO date cannot change once the purchase order has a number.';
const LIVE_PO_EXISTS =
  'This vendor already has a live purchase order for this comparison. Open it, or cancel it first.';
const NOT_FINALISED = 'Purchase orders can be made only from a finalised comparison.';
const TAX_CHANGED =
  'Billing or vendor GST details changed since this purchase order was saved. Open it, check the amounts and save it again.';

type Tx = Prisma.TransactionClient;

const comparisonSelect = {
  id: true,
  status: true,
  comparisonDate: true,
  companyId: true,
  projectId: true,
  siteId: true,
  lines: {
    select: { id: true, selectedVendorId: true, enquiryLine: { select: { itemId: true } } },
  },
} satisfies Prisma.ComparisonSelect;

type ComparisonForPurchaseOrder = Prisma.ComparisonGetPayload<{ select: typeof comparisonSelect }>;

const vendorSelect = {
  id: true,
  code: true,
  status: true,
  isActive: true,
  gstRegistrations: { select: { id: true, stateId: true, isActive: true } },
  contacts: { select: { id: true, isActive: true } },
} satisfies Prisma.VendorSelect;

interface PurchaseOrderScope {
  companyId: string;
  projectId: string;
  siteId: string;
  vendorId: string;
  comparison: ComparisonForPurchaseOrder | null;
}

/** Choices already saved on a draft: they may stay even if since made inactive (OQ-85 c). */
interface SavedChoices {
  storeId: string | null;
  vendorGstRegistrationId: string | null;
  vendorContactId: string | null;
}

const NO_SAVED_CHOICES: SavedChoices = {
  storeId: null,
  vendorGstRegistrationId: null,
  vendorContactId: null,
};

interface PreparedPurchaseOrder {
  billingGstRegistrationId: string;
  taxType: PurchaseOrderTaxType;
  priced: PricedPurchaseOrder;
}

function dateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** Significant decimal places of a quantity string ("10.500" -> 1). */
function decimalPlacesOf(quantity: string): number {
  const fraction = String(quantity).split('.')[1] ?? '';

  return fraction.replace(/0+$/, '').length;
}

function headerData(request: UpdatePurchaseOrderRequest, prepared: PreparedPurchaseOrder) {
  const priced = prepared.priced;

  return {
    storeId: request.storeId,
    vendorGstRegistrationId: request.vendorGstRegistrationId,
    vendorContactId: request.vendorContactId,
    billingGstRegistrationId: prepared.billingGstRegistrationId,
    taxType: prepared.taxType,
    poDate: dateOnly(request.poDate),
    subject: request.subject,
    vendorQuoteRef: request.vendorQuoteRef,
    vendorQuoteDate: toDateOnly(request.vendorQuoteDate),
    deliveryDate: toDateOnly(request.deliveryDate),
    paymentTermsDays: request.paymentTermsDays,
    remarks: request.remarks,
    subtotal: priced.subtotal,
    chargesAmount: priced.chargesAmount,
    cgstTotal: priced.cgstTotal,
    sgstTotal: priced.sgstTotal,
    igstTotal: priced.igstTotal,
    taxTotal: priced.taxTotal,
    grandTotal: priced.grandTotal,
  };
}

function termsOf(request: UpdatePurchaseOrderRequest) {
  return request.terms.map((term, index) => ({
    sortOrder: index + 1,
    title: term.title,
    text: term.text,
  }));
}

/** Saved rows turned back into a request, so Submit re-checks exactly what was saved. */
function storedRequestOf(purchaseOrder: PurchaseOrderWithDetails): UpdatePurchaseOrderRequest {
  return {
    storeId: purchaseOrder.storeId,
    vendorGstRegistrationId: purchaseOrder.vendorGstRegistrationId,
    vendorContactId: purchaseOrder.vendorContactId,
    poDate: isoDateOf(purchaseOrder.poDate),
    subject: purchaseOrder.subject,
    vendorQuoteRef: purchaseOrder.vendorQuoteRef,
    vendorQuoteDate:
      purchaseOrder.vendorQuoteDate === null ? null : isoDateOf(purchaseOrder.vendorQuoteDate),
    deliveryDate:
      purchaseOrder.deliveryDate === null ? null : isoDateOf(purchaseOrder.deliveryDate),
    paymentTermsDays: purchaseOrder.paymentTermsDays,
    remarks: purchaseOrder.remarks,
    lines: purchaseOrder.lines.map((line) => ({
      itemId: line.itemId,
      comparisonLineId: line.comparisonLineId,
      quantity: line.quantity.toFixed(3),
      rate: line.rate.toFixed(4),
      discountPercent: line.discountPercent.toFixed(2),
      gstRate: line.gstRate.toFixed(2),
      remarks: line.remarks,
    })),
    charges: purchaseOrder.charges.map((charge) => ({
      chargeType: charge.chargeType,
      description: charge.description,
      amount: charge.amount.toFixed(2),
      gstRate: charge.gstRate.toFixed(2),
    })),
    terms: purchaseOrder.terms.map((term) => ({ title: term.title, text: term.text })),
  };
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: PurchaseOrderApprovalsService,
  ) {}

  async list(
    query: PurchaseOrderListQuery,
    access: AccessContext,
  ): Promise<PagedPurchaseOrdersResponse> {
    const siteIds = await access.accessibleSiteIds([PURCHASE_ORDER_VIEW, PURCHASE_ORDER_MANAGE]);
    const filters: Prisma.PurchaseOrderWhereInput[] = [{ siteId: idFilter(siteIds) }];

    if (query.search !== undefined && query.search.length > 0) {
      filters.push({
        OR: [
          { number: { contains: query.search, mode: 'insensitive' } },
          { subject: { contains: query.search, mode: 'insensitive' } },
          { vendor: { code: { contains: query.search, mode: 'insensitive' } } },
          { vendor: { legalName: { contains: query.search, mode: 'insensitive' } } },
          { comparison: { number: { contains: query.search, mode: 'insensitive' } } },
        ],
      });
    }

    if (query.projectId !== undefined) {
      filters.push({ projectId: query.projectId });
    }

    if (query.siteId !== undefined) {
      filters.push({ siteId: query.siteId });
    }

    if (query.vendorId !== undefined) {
      filters.push({ vendorId: query.vendorId });
    }

    if (query.source !== undefined) {
      filters.push({ source: query.source });
    }

    if (query.status !== undefined) {
      filters.push({ status: query.status });
    }

    if (query.fromDate !== undefined) {
      filters.push({ poDate: { gte: dateOnly(query.fromDate) } });
    }

    if (query.toDate !== undefined) {
      filters.push({ poDate: { lte: dateOnly(query.toDate) } });
    }

    const where: Prisma.PurchaseOrderWhereInput = { AND: filters };
    const [total, purchaseOrders] = await Promise.all([
      this.prisma.purchaseOrder.count({ where }),
      this.prisma.purchaseOrder.findMany({
        where,
        include: purchaseOrderInclude,
        orderBy: [{ [query.sortBy]: query.sortDir }, { revisionNo: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return pageOf(
      purchaseOrders.map((purchaseOrder) =>
        toPurchaseOrderResponse(purchaseOrder, purchaseOrderFlagsFor(access, purchaseOrder)),
      ),
      total,
      query,
    );
  }

  async get(
    id: string,
    access: AccessContext,
    viewerId: string,
  ): Promise<PurchaseOrderDetailResponse> {
    const purchaseOrder = await this.requireVisible(id, access, viewerId);

    return toPurchaseOrderDetailResponse(
      purchaseOrder,
      purchaseOrderFlagsFor(access, purchaseOrder),
    );
  }

  async create(
    request: CreatePurchaseOrderRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<PurchaseOrderResponse> {
    const scope = await this.scopeForCreate(request, access);
    const prepared = await this.prepare(scope, request, NO_SAVED_CHOICES);

    if (scope.comparison !== null) {
      const live = await this.prisma.purchaseOrder.count({
        where: {
          comparisonId: scope.comparison.id,
          vendorId: scope.vendorId,
          status: { not: 'CANCELLED' },
          revisedFromId: null,
        },
      });

      if (live > 0) {
        throw duplicatePurchaseOrder(LIVE_PO_EXISTS);
      }
    }

    const created = await this.guardDuplicate(() =>
      this.prisma.$transaction(async (tx) => {
        const purchaseOrder = await tx.purchaseOrder.create({
          data: {
            source: request.source,
            companyId: scope.companyId,
            projectId: scope.projectId,
            siteId: scope.siteId,
            comparisonId: scope.comparison?.id ?? null,
            vendorId: scope.vendorId,
            ...headerData(request, prepared),
            createdById: actorId,
            updatedById: actorId,
            lines: { create: prepared.priced.lines },
            charges: { create: prepared.priced.charges },
            terms: { create: termsOf(request) },
          },
          include: purchaseOrderDetailInclude,
        });

        await this.audit.record(tx, {
          actorUserId: actorId,
          action: 'CREATE',
          entityType: 'PurchaseOrder',
          entityId: purchaseOrder.id,
          companyId: purchaseOrder.companyId,
          before: null,
          after: toPurchaseOrderAuditSnapshot(purchaseOrder),
        });

        return purchaseOrder;
      }),
    );

    return this.respond(created, access);
  }

  /** Draft only. Source, comparison, project, site and vendor fixed; lines, charges, terms replaced. */
  async update(
    id: string,
    request: UpdatePurchaseOrderRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<PurchaseOrderResponse> {
    const existing = await this.requireVisible(id, access);

    this.assertCanManage(existing, access);
    this.assertStatus(existing, EDITABLE_PURCHASE_ORDER_STATUSES, NOT_EDITABLE);

    // OQ-116: once numbered (a rejected PO), the PO date stays as first submitted.
    if (existing.number !== null && request.poDate !== isoDateOf(existing.poDate)) {
      throw invalidPurchaseOrderDate(DATE_LOCKED);
    }

    const scope = await this.scopeOf(existing);
    const prepared = await this.prepare(scope, request, existing);

    return this.transition(
      existing,
      EDITABLE_PURCHASE_ORDER_STATUSES,
      actorId,
      access,
      () => Promise.resolve(headerData(request, prepared)),
      async (tx) => {
        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
        await tx.purchaseOrderLine.createMany({
          data: prepared.priced.lines.map((line) => ({ ...line, purchaseOrderId: id })),
        });
        await tx.purchaseOrderCharge.deleteMany({ where: { purchaseOrderId: id } });
        await tx.purchaseOrderCharge.createMany({
          data: prepared.priced.charges.map((charge) => ({ ...charge, purchaseOrderId: id })),
        });
        await tx.purchaseOrderTerm.deleteMany({ where: { purchaseOrderId: id } });
        await tx.purchaseOrderTerm.createMany({
          data: termsOf(request).map((term) => ({ ...term, purchaseOrderId: id })),
        });
      },
    );
  }

  /**
   * Re-checks the saved PO against today's masters (OQ-85 d), takes the number on first Submit
   * (PD-003; a rejected PO keeps it, OQ-111) and fixes the approval route (PD-054).
   */
  async submit(
    id: string,
    request: SubmitPurchaseOrderRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<PurchaseOrderResponse> {
    const existing = await this.requireVisible(id, access);

    this.assertCanManage(existing, access);
    this.assertStatus(existing, EDITABLE_PURCHASE_ORDER_STATUSES, NOT_EDITABLE);

    const scope = await this.scopeOf(existing);
    const prepared = await this.prepare(scope, storedRequestOf(existing), existing);

    if (
      prepared.billingGstRegistrationId !== existing.billingGstRegistrationId ||
      prepared.taxType !== existing.taxType ||
      prepared.priced.grandTotal !== existing.grandTotal.toFixed(2)
    ) {
      throw invalidPurchaseOrderLines(TAX_CHANGED);
    }

    const plan = await this.approvals.planSubmit(existing, actorId, request.nextApproverId);

    return this.transition(
      existing,
      EDITABLE_PURCHASE_ORDER_STATUSES,
      actorId,
      access,
      async (tx) => {
        const now = new Date();
        const approval = {
          status: plan.finished ? ('APPROVED' as const) : ('SUBMITTED' as const),
          approvalWorkflowId: plan.workflowId,
          approvalCycle: plan.cycleNo,
          approvedAt: plan.finished ? now : null,
          submittedAt: now,
          submittedById: actorId,
        };

        if (existing.number !== null) {
          return approval;
        }

        const fiscalYear = fiscalYearOf(isoDateOf(existing.poDate));
        const next = await takeNextNumber(tx, {
          companyId: existing.companyId,
          documentType: 'PURCHASE_ORDER',
          projectId: existing.projectId,
          fiscalYear,
        });

        return {
          ...approval,
          number: formatDocumentNumber(
            PURCHASE_ORDER_NUMBER_PREFIX,
            existing.project.code,
            fiscalYear,
            next,
            PURCHASE_ORDER_NUMBER_DIGITS,
          ),
          fiscalYear,
        };
      },
      (tx) => this.approvals.writeSubmit(tx, existing.id, plan, actorId),
    );
  }

  async cancel(
    id: string,
    request: CancelPurchaseOrderRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<PurchaseOrderResponse> {
    const existing = await this.requireVisible(id, access);

    this.assertCanManage(existing, access);
    this.assertStatus(existing, CANCELLABLE_PURCHASE_ORDER_STATUSES, NOT_CANCELLABLE);

    return this.transition(
      existing,
      CANCELLABLE_PURCHASE_ORDER_STATUSES,
      actorId,
      access,
      () =>
        Promise.resolve({
          status: 'CANCELLED' as const,
          cancelledAt: new Date(),
          cancelledById: actorId,
          cancelRemarks: request.remarks,
        }),
      (tx) => this.approvals.closeOpenSteps(tx, existing, actorId),
    );
  }

  /** Current approver only; assigns the next level or makes the PO Approved (PD-054). */
  async approve(
    id: string,
    request: ApprovePurchaseOrderRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<PurchaseOrderResponse> {
    const existing = await this.requireVisible(id, access, actorId);

    this.assertStatus(existing, AWAITING_APPROVAL_PURCHASE_ORDER_STATUSES, NOT_AWAITING);

    const plan = await this.approvals.planApprove(existing, actorId, request.nextApproverId);

    return this.transition(
      existing,
      AWAITING_APPROVAL_PURCHASE_ORDER_STATUSES,
      actorId,
      access,
      () =>
        Promise.resolve(
          plan.finished ? { status: 'APPROVED' as const, approvedAt: new Date() } : {},
        ),
      (tx) => this.approvals.writeApprove(tx, existing, plan, actorId, request.remarks),
    );
  }

  /** Current approver only; back to the maker for edit and resubmit (OQ-95, OQ-111). */
  async reject(
    id: string,
    request: RejectPurchaseOrderRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<PurchaseOrderResponse> {
    const existing = await this.requireVisible(id, access, actorId);

    this.assertStatus(existing, AWAITING_APPROVAL_PURCHASE_ORDER_STATUSES, NOT_AWAITING);

    const plan = await this.approvals.planReject(existing, actorId);

    return this.transition(
      existing,
      AWAITING_APPROVAL_PURCHASE_ORDER_STATUSES,
      actorId,
      access,
      () => Promise.resolve({ status: 'REJECTED' as const }),
      (tx) => this.approvals.writeReject(tx, existing, plan, actorId, request.remarks),
    );
  }

  /** Administrator only: another holder takes the open level (OQ-97, OQ-118, OQ-119). */
  async reassignApprover(
    id: string,
    request: ReassignApproverRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<PurchaseOrderResponse> {
    const existing = await this.requireVisible(id, access);

    if (!isAdministrator(access)) {
      throw forbidden();
    }

    this.assertStatus(existing, AWAITING_APPROVAL_PURCHASE_ORDER_STATUSES, NOT_AWAITING);

    const plan = await this.approvals.planReassign(existing, request);

    return this.transition(
      existing,
      AWAITING_APPROVAL_PURCHASE_ORDER_STATUSES,
      actorId,
      access,
      () => Promise.resolve({}),
      (tx) => this.approvals.writeReassign(tx, existing, plan, actorId),
    );
  }

  /** Administrator only, On hold level: route to a higher role with a reason (OQ-99, OQ-119). */
  async routeToHigherRole(
    id: string,
    request: RouteToHigherRoleRequest,
    actorId: string,
    access: AccessContext,
  ): Promise<PurchaseOrderResponse> {
    const existing = await this.requireVisible(id, access);

    if (!isAdministrator(access)) {
      throw forbidden();
    }

    this.assertStatus(existing, AWAITING_APPROVAL_PURCHASE_ORDER_STATUSES, NOT_AWAITING);

    const plan = await this.approvals.planRouteHigher(existing, request);

    return this.transition(
      existing,
      AWAITING_APPROVAL_PURCHASE_ORDER_STATUSES,
      actorId,
      access,
      () => Promise.resolve({}),
      (tx) => this.approvals.writeReassign(tx, existing, plan, actorId),
    );
  }

  async approvalRoute(
    id: string,
    access: AccessContext,
    viewerId: string,
  ): Promise<ApprovalRouteResponse> {
    const existing = await this.requireVisible(id, access, viewerId);

    return this.approvals.route(existing, viewerId, isAdministrator(access));
  }

  private async scopeForCreate(
    request: CreatePurchaseOrderRequest,
    access: AccessContext,
  ): Promise<PurchaseOrderScope> {
    if (request.source === 'COMPARISON') {
      const comparison = await this.loadComparison(request.comparisonId);

      // Scope is checked before anything about the comparison is revealed.
      if (comparison === null || !access.canOn(PURCHASE_ORDER_MANAGE, indentTargetOf(comparison))) {
        throw notFound('Comparison');
      }

      this.assertComparisonFinalised(comparison);

      if (!comparison.lines.some((line) => line.selectedVendorId === request.vendorId)) {
        throw invalidPurchaseOrderVendor(
          'This vendor was not chosen on any line of the comparison.',
        );
      }

      return {
        companyId: comparison.companyId,
        projectId: comparison.projectId,
        siteId: comparison.siteId,
        vendorId: request.vendorId,
        comparison,
      };
    }

    const site = await this.prisma.site.findUnique({
      where: { id: request.siteId },
      select: {
        id: true,
        isActive: true,
        projectId: true,
        project: { select: { companyId: true, isActive: true } },
      },
    });

    if (site === null || site.projectId !== request.projectId) {
      throw invalidPurchaseOrderSite('The site does not belong to this project.');
    }

    const target = {
      companyId: site.project.companyId,
      projectId: site.projectId,
      siteId: site.id,
    };

    if (!access.canOn(PURCHASE_ORDER_MANAGE, indentTargetOf(target))) {
      throw forbidden();
    }

    if (!site.project.isActive) {
      throw invalidPurchaseOrderProject('The project is inactive.');
    }

    if (!site.isActive) {
      throw invalidPurchaseOrderSite('The site is inactive.');
    }

    return { ...target, vendorId: request.vendorId, comparison: null };
  }

  private async scopeOf(existing: PurchaseOrderWithDetails): Promise<PurchaseOrderScope> {
    let comparison: ComparisonForPurchaseOrder | null = null;

    if (existing.comparisonId !== null) {
      comparison = await this.loadComparison(existing.comparisonId);

      if (comparison === null) {
        throw new Error('Purchase order comparison missing');
      }

      this.assertComparisonFinalised(comparison);
    }

    return {
      companyId: existing.companyId,
      projectId: existing.projectId,
      siteId: existing.siteId,
      vendorId: existing.vendorId,
      comparison,
    };
  }

  private loadComparison(id: string): Promise<ComparisonForPurchaseOrder | null> {
    return this.prisma.comparison.findUnique({ where: { id }, select: comparisonSelect });
  }

  private assertComparisonFinalised(comparison: ComparisonForPurchaseOrder): void {
    if (comparison.status !== 'FINALISED') {
      throw invalidPurchaseOrderComparison(NOT_FINALISED);
    }
  }

  /** Every check that needs the database, then pricing. Throws on the first problem. */
  private async prepare(
    scope: PurchaseOrderScope,
    request: UpdatePurchaseOrderRequest,
    saved: SavedChoices,
  ): Promise<PreparedPurchaseOrder> {
    const [vendor, project, store, items] = await Promise.all([
      this.prisma.vendor.findUnique({ where: { id: scope.vendorId }, select: vendorSelect }),
      this.prisma.project.findUnique({
        where: { id: scope.projectId },
        select: { code: true, billingGst: { select: { id: true, stateId: true, isActive: true } } },
      }),
      request.storeId === null
        ? Promise.resolve(null)
        : this.prisma.store.findUnique({
            where: { id: request.storeId },
            select: { id: true, siteId: true, isActive: true },
          }),
      this.prisma.item.findMany({
        where: { id: { in: [...new Set(request.lines.map((line) => line.itemId))] } },
        select: {
          id: true,
          code: true,
          status: true,
          isActive: true,
          unit: { select: { decimalPlaces: true } },
        },
      }),
    ]);

    if (vendor === null) {
      throw invalidPurchaseOrderVendor('Vendor not found.');
    }

    if (vendor.status !== 'APPROVED' || !vendor.isActive) {
      throw invalidPurchaseOrderVendor(`Vendor ${vendor.code} is not approved or active.`);
    }

    if (project === null) {
      throw invalidPurchaseOrderProject('Project not found.');
    }

    const billing = project.billingGst;

    if (billing === null || !billing.isActive) {
      throw billingGstMissing(
        `Project ${project.code} has no active billing GST registration. Set it in Masters → Projects first.`,
      );
    }

    if (request.storeId !== null) {
      if (store === null || store.siteId !== scope.siteId) {
        throw invalidPurchaseOrderStore('The store is not at this site.');
      }

      if (!store.isActive && store.id !== saved.storeId) {
        throw invalidPurchaseOrderStore('The store is inactive.');
      }
    }

    // OQ-85 (b): a GST-registered vendor must have one of its registrations chosen.
    let vendorGstStateId: string | null = null;

    if (request.vendorGstRegistrationId === null) {
      if (vendor.gstRegistrations.some((row) => row.isActive)) {
        throw invalidPurchaseOrderVendorGst('Choose the vendor GST registration.');
      }
    } else {
      const row = vendor.gstRegistrations.find((gst) => gst.id === request.vendorGstRegistrationId);

      if (row === undefined) {
        throw invalidPurchaseOrderVendorGst('This GST registration is not the vendor’s.');
      }

      if (!row.isActive && row.id !== saved.vendorGstRegistrationId) {
        throw invalidPurchaseOrderVendorGst('This GST registration is inactive.');
      }

      vendorGstStateId = row.stateId;
    }

    if (request.vendorContactId !== null) {
      const contact = vendor.contacts.find((row) => row.id === request.vendorContactId);

      if (contact === undefined) {
        throw invalidPurchaseOrderVendorContact('This contact is not the vendor’s.');
      }

      if (!contact.isActive && contact.id !== saved.vendorContactId) {
        throw invalidPurchaseOrderVendorContact('This contact is inactive.');
      }
    }

    // OQ-85 (a)
    if (request.poDate > todayInIst()) {
      throw invalidPurchaseOrderDate('The PO date cannot be in the future.');
    }

    if (scope.comparison !== null && request.poDate < isoDateOf(scope.comparison.comparisonDate)) {
      throw invalidPurchaseOrderDate('The PO date is before the comparison date.');
    }

    const itemById = new Map(items.map((item) => [item.id, item]));
    const comparisonLines = new Map((scope.comparison?.lines ?? []).map((line) => [line.id, line]));

    for (const [index, line] of request.lines.entries()) {
      const lineNo = index + 1;
      const item = itemById.get(line.itemId);

      if (item === undefined) {
        throw invalidPurchaseOrderItem(`Line ${lineNo}: item not found.`);
      }

      // OQ-27: pending, rejected or inactive items cannot go on new documents.
      if (item.status !== 'APPROVED' || !item.isActive) {
        throw invalidPurchaseOrderItem(
          `Line ${lineNo}: item ${item.code} is not approved or active.`,
        );
      }

      if (decimalPlacesOf(line.quantity) > item.unit.decimalPlaces) {
        throw invalidPurchaseOrderLines(
          `Line ${lineNo}: the unit allows ${item.unit.decimalPlaces} decimal place(s).`,
        );
      }

      if (scope.comparison !== null && line.comparisonLineId !== null) {
        const comparisonLine = comparisonLines.get(line.comparisonLineId);

        if (comparisonLine === undefined) {
          throw invalidPurchaseOrderLines(`Line ${lineNo}: not a line of this comparison.`);
        }

        if (comparisonLine.selectedVendorId !== scope.vendorId) {
          throw invalidPurchaseOrderLines(
            `Line ${lineNo}: this vendor was not chosen for it in the comparison.`,
          );
        }

        if (comparisonLine.enquiryLine.itemId !== line.itemId) {
          throw invalidPurchaseOrderLines(
            `Line ${lineNo}: the item does not match the comparison line.`,
          );
        }
      }
    }

    const taxType = taxTypeFor(billing.stateId, vendorGstStateId);
    const result = pricePurchaseOrder(request.lines, request.charges, taxType);

    if (result.problem !== null) {
      throw invalidPurchaseOrderLines(result.problem);
    }

    return { billingGstRegistrationId: billing.id, taxType, priced: result.priced };
  }

  /**
   * One change in one transaction: updated only if the status is allowed and nobody saved it since it
   * was read (updatedAt), then the audit row is written.
   */
  private async transition(
    existing: PurchaseOrderWithDetails,
    allowed: readonly PurchaseOrderStatus[],
    actorId: string,
    access: AccessContext,
    data: (tx: Tx) => Promise<Prisma.PurchaseOrderUncheckedUpdateManyInput>,
    after?: (tx: Tx) => Promise<void>,
  ): Promise<PurchaseOrderResponse> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const values = await data(tx);
      const result = await tx.purchaseOrder.updateMany({
        where: { id: existing.id, status: { in: [...allowed] }, updatedAt: existing.updatedAt },
        data: { ...values, updatedById: actorId },
      });

      if (result.count === 0) {
        throw invalidPurchaseOrderStatus(CHANGED_BY_SOMEONE_ELSE);
      }

      if (after !== undefined) {
        await after(tx);
      }

      const purchaseOrder = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: existing.id },
        include: purchaseOrderDetailInclude,
      });

      await this.audit.record(tx, {
        actorUserId: actorId,
        action: 'UPDATE',
        entityType: 'PurchaseOrder',
        entityId: purchaseOrder.id,
        companyId: purchaseOrder.companyId,
        before: toPurchaseOrderAuditSnapshot(existing),
        after: toPurchaseOrderAuditSnapshot(purchaseOrder),
      });

      return purchaseOrder;
    });

    return this.respond(updated, access);
  }

  private respond(
    purchaseOrder: PurchaseOrderWithRelations,
    access: AccessContext,
  ): PurchaseOrderResponse {
    return toPurchaseOrderResponse(purchaseOrder, purchaseOrderFlagsFor(access, purchaseOrder));
  }

  /** A concurrent save can still hit the one-live-PO partial unique index (P2002). */
  private async guardDuplicate<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw duplicatePurchaseOrder(LIVE_PO_EXISTS);
      }

      throw error;
    }
  }

  /**
   * Out-of-scope purchase orders do not exist as far as the caller can tell: 404, never 403.
   * An assigned or past approver may open the PO without PO view permission (OQ-103).
   */
  private async requireVisible(
    id: string,
    access: AccessContext,
    viewerId?: string,
  ): Promise<PurchaseOrderWithDetails> {
    const purchaseOrder = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: purchaseOrderDetailInclude,
    });

    if (purchaseOrder === null) {
      throw notFound(ENTITY);
    }

    if (canSeePurchaseOrder(access, purchaseOrderTargetOf(purchaseOrder))) {
      return purchaseOrder;
    }

    if (viewerId !== undefined && (await this.approvals.isOnRoute(purchaseOrder.id, viewerId))) {
      return purchaseOrder;
    }

    throw notFound(ENTITY);
  }

  private assertCanManage(purchaseOrder: PurchaseOrderWithDetails, access: AccessContext): void {
    if (!access.canOn(PURCHASE_ORDER_MANAGE, purchaseOrderTargetOf(purchaseOrder))) {
      throw forbidden();
    }
  }

  private assertStatus(
    purchaseOrder: PurchaseOrderWithDetails,
    allowed: readonly PurchaseOrderStatus[],
    message: string,
  ): void {
    if (!allowed.includes(purchaseOrder.status)) {
      throw invalidPurchaseOrderStatus(message);
    }
  }
}
