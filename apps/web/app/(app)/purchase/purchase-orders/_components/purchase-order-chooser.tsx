'use client';

import { PurchaseOrderComparisonOptionsResponse } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { apiRead } from '@/lib/api/client';
import { buildQueryString } from '@/lib/list-params';
import { RemotePicker } from '../../enquiries/_components/remote-picker';

const t = terminology.purchaseOrders;

type ComparisonOption = PurchaseOrderComparisonOptionsResponse['comparisons'][number];

async function loadComparisons(search: string): Promise<ComparisonOption[] | null> {
  const query = buildQueryString({ search });
  const result = await apiRead(
    `/api/purchase-orders/comparison-options${query.length > 0 ? `?${query}` : ''}`,
    PurchaseOrderComparisonOptionsResponse,
  );

  return result.ok ? result.data.comparisons : null;
}

/** Step 1 of a new PO: a finalised comparison + chosen vendor (OQ-83), or direct (OQ-68). */
export function PurchaseOrderChooser() {
  const router = useRouter();
  const [comparison, setComparison] = useState<ComparisonOption | null>(null);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t.startFromComparison}</h2>
        <RemotePicker<ComparisonOption>
          id="field-comparison"
          placeholder={t.chooseComparison}
          selectedLabel={comparison?.label ?? null}
          unavailableText={t.comparisonsUnavailable}
          load={loadComparisons}
          optionKey={(option) => option.id}
          optionLabel={(option) => option.label}
          isSelected={(option) => option.id === comparison?.id}
          onSelect={setComparison}
        />
        {comparison === null ? null : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{t.chooseVendorForComparison}</p>
            {comparison.vendors.map((vendor) => (
              <Button
                key={vendor.id}
                type="button"
                variant="outline"
                className="justify-start"
                onClick={() =>
                  router.push(
                    `/purchase/purchase-orders/new?${buildQueryString({
                      comparisonId: comparison.id,
                      vendorId: vendor.id,
                    })}`,
                  )
                }
              >
                {vendor.label}
              </Button>
            ))}
          </div>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t.startDirect}</h2>
        <p className="text-sm text-muted-foreground">{t.directHint}</p>
        <div>
          <Button
            type="button"
            onClick={() => router.push('/purchase/purchase-orders/new?source=direct')}
          >
            {t.startDirectButton}
          </Button>
        </div>
      </section>
    </div>
  );
}
