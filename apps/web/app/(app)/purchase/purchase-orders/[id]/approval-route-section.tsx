import type { ApprovalRouteResponse, PurchaseOrderResponse } from '@uie/contracts';
import { KeyValueGrid } from '@/components/erp';
import { terminology } from '@/config/terminology';
import {
  appliesWhenText,
  approverText,
  decidedAtText,
  decisionText,
  roleText,
  routeValueText,
  stepRemarksText,
  versionText,
} from '../_components/approval-route-text';

const a = terminology.purchaseOrders.approval;
const notSet = terminology.labels.notSet;
const warningClass =
  'rounded-md border border-status-returned/40 bg-status-returned/10 px-3 py-2 text-sm text-status-returned';

/** Levels of the PO's route: a preview for Draft / Rejected, the fixed route after Submit (PD-054). */
export function ApprovalRouteSection({
  route,
  purchaseOrder,
}: {
  route: ApprovalRouteResponse | null;
  purchaseOrder: PurchaseOrderResponse;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-(--card-padding)">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{a.sectionTitle}</h2>
      {route === null ? (
        <p className="text-sm text-muted-foreground">{a.loadError}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {route.preview ? <p className="text-sm text-muted-foreground">{a.previewNote}</p> : null}
          {route.problem === null ? null : <p className={warningClass}>{route.problem}</p>}
          {route.workflow === null ? null : (
            <KeyValueGrid
              columns={3}
              items={[
                { label: a.infoWorkflow, value: versionText(route.workflow.version) },
                { label: a.infoAmountBasis, value: a.amountBases[route.workflow.amountBasis] },
                {
                  label: a.infoRouteValue,
                  value: routeValueText(purchaseOrder, route.workflow.amountBasis),
                },
              ]}
            />
          )}
          {route.steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">{a.noSteps}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-4xl text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="w-14 px-2 py-2 font-medium">{a.columnLevel}</th>
                    <th className="px-2 py-2 font-medium">{a.columnRole}</th>
                    <th className="w-36 px-2 py-2 font-medium">{a.columnAppliesWhen}</th>
                    <th className="w-24 px-2 py-2 font-medium">{a.columnStatus}</th>
                    <th className="px-2 py-2 font-medium">{a.columnApprover}</th>
                    <th className="px-2 py-2 font-medium">{a.columnDecision}</th>
                    <th className="w-40 px-2 py-2 font-medium">{a.columnDecidedAt}</th>
                    <th className="px-2 py-2 font-medium">{a.columnRemarks}</th>
                  </tr>
                </thead>
                <tbody>
                  {route.steps.map((step) => (
                    <tr
                      key={step.levelNo}
                      className={
                        step.status === 'PENDING' || step.status === 'ON_HOLD'
                          ? 'border-b border-border align-top font-medium'
                          : 'border-b border-border align-top'
                      }
                    >
                      <td className="px-2 py-2">{step.levelNo}</td>
                      <td className="px-2 py-2">{roleText(step)}</td>
                      <td className="px-2 py-2">{appliesWhenText(step.minAmount)}</td>
                      <td className="px-2 py-2">{a.stepStatuses[step.status]}</td>
                      <td className="px-2 py-2">{approverText(step, notSet)}</td>
                      <td className="px-2 py-2">{decisionText(step, notSet)}</td>
                      <td className="px-2 py-2">{decidedAtText(step, notSet)}</td>
                      <td className="px-2 py-2">{stepRemarksText(step, notSet)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
