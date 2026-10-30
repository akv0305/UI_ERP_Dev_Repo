'use client';

import { ComparisonEnquiryOptionsResponse } from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { terminology } from '@/config/terminology';
import { apiRead } from '@/lib/api/client';
import { buildQueryString } from '@/lib/list-params';
import { RemotePicker } from '../../enquiries/_components/remote-picker';

const t = terminology.comparisons;

type EnquiryOption = ComparisonEnquiryOptionsResponse['enquiries'][number];

async function loadEnquiries(search: string): Promise<EnquiryOption[] | null> {
  const query = buildQueryString({ search });
  const result = await apiRead(
    `/api/comparisons/enquiry-options${query.length > 0 ? `?${query}` : ''}`,
    ComparisonEnquiryOptionsResponse,
  );

  return result.ok ? result.data.enquiries : null;
}

/** Step 1 of a new comparison: pick a sent enquiry with submitted quotations. */
export function EnquiryChooser() {
  const router = useRouter();

  return (
    <div className="max-w-xl">
      <RemotePicker<EnquiryOption>
        id="field-enquiry"
        placeholder={t.chooseEnquiry}
        selectedLabel={null}
        unavailableText={t.enquiriesUnavailable}
        load={loadEnquiries}
        optionKey={(option) => option.id}
        optionLabel={(option) => option.label}
        onSelect={(option) =>
          router.push(`/purchase/comparisons/new?enquiryId=${encodeURIComponent(option.id)}`)
        }
      />
    </div>
  );
}
