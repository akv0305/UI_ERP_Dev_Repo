import { terminology } from '@/config/terminology';
import { approvalBands, type BandLevel } from '@/lib/approval-bands';
import { bandLabel, routeText } from './approval-matrix-text';

export function ApprovalBandsTable({ levels }: { levels: readonly BandLevel[] }) {
  const t = terminology.approvalMatrix;
  const bands = approvalBands(levels);

  if (bands.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.routeEmpty}</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted-foreground">
          <th className="py-2 pr-4 font-medium">{t.columnValue}</th>
          <th className="py-2 font-medium">{t.columnRoute}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {bands.map((band, index) => (
          <tr key={band.from}>
            <td className="py-2 pr-4 text-foreground">{bandLabel(band, index === 0)}</td>
            <td className="py-2 text-foreground">{routeText(band.roles)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
