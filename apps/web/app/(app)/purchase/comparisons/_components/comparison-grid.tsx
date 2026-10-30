import type { ComparisonGridLine, ComparisonVendorColumn } from '@uie/contracts';
import { Input } from '@/components/ui/input';
import { terminology } from '@/config/terminology';
import { formatDate, formatINR, formatQty } from '@/lib/format';
import { cn } from '@/lib/utils';
import { codeName, itemText } from '../../enquiries/_components/enquiry-text';
import { daysText, rateText } from '../../quotations/_components/quotation-text';
import { offerDetail, rankText } from './comparison-text';

const t = terminology.comparisons;
const notSet = terminology.labels.notSet;
const daysSuffix = terminology.quotations.daysSuffix;

export interface GridChoice {
  vendorId: string | null;
  reason: string;
}

export interface ComparisonGridProps {
  vendors: ComparisonVendorColumn[];
  lines: ComparisonGridLine[];
  /** Same order as lines. */
  choices: GridChoice[];
  /** Given = editable grid. */
  onChoose?: (index: number, vendorId: string | null) => void;
  onReason?: (index: number, reason: string) => void;
}

const FOOTER: { key: string; label: string; value: (vendor: ComparisonVendorColumn) => string }[] =
  [
    { key: 'subtotal', label: t.footerSubtotal, value: (v) => formatINR(v.subtotal) },
    { key: 'tax', label: t.footerTax, value: (v) => formatINR(v.taxTotal) },
    { key: 'charges', label: t.footerCharges, value: (v) => formatINR(v.chargesTotal) },
    { key: 'grand', label: t.footerGrandTotal, value: (v) => formatINR(v.grandTotal) },
    {
      key: 'delivery',
      label: t.footerDelivery,
      value: (v) => daysText(v.deliveryDays, daysSuffix, notSet),
    },
    {
      key: 'payment',
      label: t.footerPaymentTerms,
      value: (v) => daysText(v.paymentTermsDays, daysSuffix, notSet),
    },
    {
      key: 'validUntil',
      label: t.footerValidUntil,
      value: (v) => (v.validUntil === null ? notSet : formatDate(v.validUntil)),
    },
  ];

export function ComparisonGrid({
  vendors,
  lines,
  choices,
  onChoose,
  onReason,
}: ComparisonGridProps) {
  const editable = onChoose !== undefined;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-5xl text-sm">
        <thead>
          <tr className="border-b border-border text-left align-bottom text-muted-foreground">
            <th className="w-10 px-2 py-2 font-medium">{t.columnLineNo}</th>
            <th className="min-w-56 px-2 py-2 font-medium">{t.columnItem}</th>
            <th className="w-16 px-2 py-2 font-medium">{t.columnUnit}</th>
            <th className="w-24 px-2 py-2 text-right font-medium">{t.columnQuantity}</th>
            {vendors.map((vendor) => (
              <th key={vendor.quotationId} className="min-w-44 px-2 py-2 font-medium">
                <div className="text-foreground">
                  {codeName(vendor.vendor.code, vendor.vendor.legalName)}
                </div>
                <div className="text-xs font-normal">{vendor.quotationLabel}</div>
                {vendor.isExpired ? (
                  <div className="text-xs font-normal text-warning">{t.expired}</div>
                ) : null}
              </th>
            ))}
            <th className="w-28 px-2 py-2 font-medium">
              {editable ? t.columnNone : t.columnChosen}
            </th>
            <th className="min-w-56 px-2 py-2 font-medium">{t.columnReason}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const choice = choices[index] ?? { vendorId: null, reason: '' };
            const chosenOffer = line.offers.find((offer) => offer.vendorId === choice.vendorId);
            const chosenVendor = vendors.find((vendor) => vendor.vendor.id === choice.vendorId);
            const needsReason =
              chosenOffer !== undefined && chosenOffer.rank !== 1 && choice.reason.trim() === '';

            return (
              <tr key={line.enquiryLineId} className="border-b border-border align-top">
                <td className="px-2 py-2">{line.lineNo}</td>
                <td className="px-2 py-2">{itemText(line.item)}</td>
                <td className="px-2 py-2">{line.item.unitCode}</td>
                <td className="px-2 py-2 text-right">
                  {formatQty(line.quantity, line.item.decimalPlaces)}
                </td>
                {vendors.map((vendor) => {
                  const offer = line.offers.find((entry) => entry.vendorId === vendor.vendor.id);
                  const chosen = choice.vendorId === vendor.vendor.id;

                  return (
                    <td
                      key={vendor.quotationId}
                      className={cn('px-2 py-2', chosen ? 'bg-accent' : '')}
                    >
                      {offer === undefined || !offer.isQuoted || offer.netRate === null ? (
                        <span className="text-muted-foreground">{t.notQuoted}</span>
                      ) : (
                        <label className={cn('flex gap-2', editable ? 'cursor-pointer' : '')}>
                          {editable ? (
                            <input
                              type="radio"
                              className="mt-1 size-4 accent-primary"
                              name={`choice-${line.enquiryLineId}`}
                              checked={chosen}
                              aria-label={t.chooseVendor}
                              onChange={() => onChoose?.(index, vendor.vendor.id)}
                            />
                          ) : null}
                          <span className="flex flex-col gap-0.5">
                            <span className="flex items-center gap-2 font-medium">
                              <span>{rateText(offer.netRate)}</span>
                              {offer.rank === null ? null : (
                                <span
                                  className={cn(
                                    'rounded px-1 text-xs',
                                    offer.rank === 1
                                      ? 'bg-success/10 text-success'
                                      : 'bg-surface-muted text-muted-foreground',
                                  )}
                                >
                                  {rankText(offer.rank)}
                                </span>
                              )}
                            </span>
                            {offer.rate === null ? null : (
                              <span className="text-xs text-muted-foreground">
                                {offerDetail(offer.rate, offer.discountPercent)}
                              </span>
                            )}
                            {offer.makeBrand === null ? null : (
                              <span className="text-xs text-muted-foreground">
                                {offer.makeBrand}
                              </span>
                            )}
                          </span>
                        </label>
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-2">
                  {editable ? (
                    <input
                      type="radio"
                      className="size-4 accent-primary"
                      name={`choice-${line.enquiryLineId}`}
                      checked={choice.vendorId === null}
                      aria-label={t.noVendor}
                      onChange={() => onChoose?.(index, null)}
                    />
                  ) : chosenVendor === undefined ? (
                    <span className="text-muted-foreground">{t.notChosen}</span>
                  ) : (
                    <span className="font-medium">{chosenVendor.vendor.code}</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {editable ? (
                    <>
                      <Input
                        aria-label={t.columnReason}
                        maxLength={300}
                        value={choice.reason}
                        disabled={choice.vendorId === null}
                        onChange={(event) => onReason?.(index, event.target.value)}
                      />
                      {needsReason ? (
                        <p className="mt-1 text-xs text-warning">{t.reasonNeeded}</p>
                      ) : null}
                    </>
                  ) : (
                    <span>{choice.reason.length === 0 ? notSet : choice.reason}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {FOOTER.map((row) => (
            <tr key={row.key} className="border-b border-border text-muted-foreground">
              <td colSpan={4} className="px-2 py-2 text-right font-medium">
                {row.label}
              </td>
              {vendors.map((vendor) => (
                <td key={vendor.quotationId} className="px-2 py-2 text-foreground">
                  {row.value(vendor)}
                </td>
              ))}
              <td colSpan={2} />
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  );
}
