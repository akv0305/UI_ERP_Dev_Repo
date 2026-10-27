import type { EnquiryPrintResponse } from '@uie/contracts';
import { terminology } from '@/config/terminology';
import { formatDate, formatQty } from '@/lib/format';
import {
  addressLines,
  codeName,
  forCompany,
  itemDescription,
  joinPresent,
  labelled,
  requestSentence,
} from './print-text';

const t = terminology.enquiries;

function TextLines({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line, index) => (
        <p key={index}>{line}</p>
      ))}
    </>
  );
}

/** The paper copy for one vendor (OQ-52 A). */
export function EnquiryPrintDocument({ copy }: { copy: EnquiryPrintResponse }) {
  const { company, site, vendor } = copy;
  const companyIds = joinPresent([
    labelled(t.printGstin, company.gstin),
    labelled(t.printPan, company.pan),
  ]);
  const vendorExtra = [
    labelled(t.printGstin, vendor.gstin),
    labelled(t.printVendorContact, joinPresent([vendor.contactName, vendor.contactPhone])),
    vendor.contactEmail,
  ].filter((line): line is string => line !== null && line.length > 0);
  const siteContact = labelled(
    t.printSiteContact,
    joinPresent([site.contactPerson, site.contactPhone]),
  );

  return (
    <article className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-8 text-sm text-foreground print:rounded-none print:border-0 print:p-0">
      <header className="border-b border-border pb-3 text-center">
        <h1 className="text-xl font-semibold">{company.legalName}</h1>
        <div className="text-xs text-muted-foreground">
          <TextLines lines={addressLines(company.address)} />
          {companyIds.length > 0 ? <p>{companyIds}</p> : null}
        </div>
        <h2 className="mt-3 text-base font-semibold uppercase">{t.printTitle}</h2>
      </header>

      <section className="grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">{t.printTo}</p>
          <p className="font-semibold">{vendor.legalName}</p>
          <TextLines lines={addressLines(vendor.address)} />
          <TextLines lines={vendorExtra} />
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 self-start">
          <dt className="text-muted-foreground">{t.printEnquiryNo}</dt>
          <dd className="font-semibold">{copy.number}</dd>
          <dt className="text-muted-foreground">{t.printDate}</dt>
          <dd>{formatDate(copy.enquiryDate)}</dd>
          <dt className="text-muted-foreground">{t.printQuoteDue}</dt>
          <dd className="font-semibold">{formatDate(copy.quoteDueDate)}</dd>
          <dt className="text-muted-foreground">{t.printProject}</dt>
          <dd>{codeName(copy.project.code, copy.project.name)}</dd>
        </dl>
      </section>

      <section>
        <p className="text-xs font-semibold text-muted-foreground">{t.printDeliveryTo}</p>
        <p className="font-semibold">{codeName(site.code, site.name)}</p>
        <TextLines lines={addressLines(site.address)} />
        {siteContact === null ? null : <p>{siteContact}</p>}
      </section>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-border text-left">
            <th className="w-10 px-2 py-2 font-semibold">{t.printLineNo}</th>
            <th className="w-32 px-2 py-2 font-semibold">{t.printItemCode}</th>
            <th className="px-2 py-2 font-semibold">{t.printDescription}</th>
            <th className="w-20 px-2 py-2 font-semibold">{t.printUnit}</th>
            <th className="w-32 px-2 py-2 text-right font-semibold">{t.printQuantity}</th>
            <th className="px-2 py-2 font-semibold">{t.printRemarks}</th>
          </tr>
        </thead>
        <tbody>
          {copy.lines.map((line) => (
            <tr key={line.lineNo} className="border-b border-border align-top">
              <td className="px-2 py-2">{line.lineNo}</td>
              <td className="px-2 py-2">{line.item.code}</td>
              <td className="px-2 py-2">{itemDescription(line.item)}</td>
              <td className="px-2 py-2">{line.item.unitCode}</td>
              <td className="px-2 py-2 text-right">
                {formatQty(line.quantity, line.item.decimalPlaces)}
              </td>
              <td className="px-2 py-2">{line.remarks}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {copy.terms === null ? null : (
        <section>
          <p className="text-xs font-semibold text-muted-foreground">{t.printTerms}</p>
          <p className="whitespace-pre-line">{copy.terms}</p>
        </section>
      )}

      <p>{requestSentence(t.printRequest, formatDate(copy.quoteDueDate))}</p>

      <footer className="mt-10 flex justify-end">
        <div className="text-center">
          <p className="font-semibold">{forCompany(t.printFor, company.legalName)}</p>
          <p className="mt-12 border-t border-border pt-1 text-xs">{t.printSignatory}</p>
        </div>
      </footer>
    </article>
  );
}
