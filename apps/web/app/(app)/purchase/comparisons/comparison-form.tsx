'use client';

import {
  CreateComparisonRequest,
  UpdateComparisonRequest,
  type ComparisonDetailResponse,
  type ComparisonGridLine,
  type ComparisonGridResponse,
  type ComparisonResponse,
  type ComparisonVendorColumn,
} from '@uie/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { DateField, FieldShell, FormLayout, FormSection, TextareaField } from '@/components/erp';
import { Input } from '@/components/ui/input';
import { terminology } from '@/config/terminology';
import { apiRequest } from '@/lib/api/client';
import * as toast from '@/lib/toast';
import { ComparisonGrid, type GridChoice } from './_components/comparison-grid';
import { comparisonErrorMessage } from './_components/comparison-text';

const t = terminology.comparisons;
const v = terminology.validation;

/** Today in IST (UTC+05:30), the same rule the API applies. */
function todayInIst(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

interface ComparisonFormValues {
  comparisonDate: string;
  remarks: string;
  /** selectedVendorId '' = line not awarded. */
  lines: { enquiryLineId: string; selectedVendorId: string; reason: string }[];
}

function buildSchema(minDate: string | null) {
  return z
    .object({
      comparisonDate: z.string().min(1, v.required),
      remarks: z.string().max(500),
      lines: z.array(
        z.object({
          enquiryLineId: z.string(),
          selectedVendorId: z.string(),
          reason: z.string().max(300),
        }),
      ),
    })
    .superRefine((values, ctx) => {
      if (values.comparisonDate > todayInIst()) {
        ctx.addIssue({ code: 'custom', path: ['comparisonDate'], message: t.futureDate });
      }

      if (minDate !== null && values.comparisonDate.length > 0 && values.comparisonDate < minDate) {
        ctx.addIssue({ code: 'custom', path: ['comparisonDate'], message: t.beforeEnquiryDate });
      }
    });
}

export interface ComparisonFormProps {
  /** Creating: grid for the chosen enquiry. */
  grid?: ComparisonGridResponse;
  /** Editing: a draft (only canEdit reaches the form). */
  comparison?: ComparisonDetailResponse;
}

export function ComparisonForm({ grid, comparison }: ComparisonFormProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const vendors = comparison?.vendors ?? grid?.vendors ?? [];
  const lines: ComparisonGridLine[] = comparison?.lines ?? grid?.lines ?? [];
  const [schema] = useState(() => buildSchema(grid?.enquiry.enquiryDate ?? null));
  const [defaults] = useState<ComparisonFormValues>(() =>
    comparison !== undefined
      ? {
          comparisonDate: comparison.comparisonDate,
          remarks: comparison.remarks ?? '',
          lines: comparison.lines.map((line) => ({
            enquiryLineId: line.enquiryLineId,
            selectedVendorId: line.selectedVendorId ?? '',
            reason: line.reason ?? '',
          })),
        }
      : {
          comparisonDate: todayInIst(),
          remarks: '',
          lines: lines.map((line) => ({
            enquiryLineId: line.enquiryLineId,
            selectedVendorId: '',
            reason: '',
          })),
        },
  );
  const enquiryNumber = comparison?.enquiry.number ?? grid?.enquiry.number ?? '';

  async function handleSubmit(values: ComparisonFormValues): Promise<void> {
    setErrorMessage(null);

    // Blank vendor / reason become null in the contract schemas.
    const body = {
      comparisonDate: values.comparisonDate,
      remarks: values.remarks,
      lines: values.lines.map((line) => ({
        enquiryLineId: line.enquiryLineId,
        selectedVendorId: line.selectedVendorId,
        reason: line.selectedVendorId === '' ? '' : line.reason,
      })),
    };

    if (comparison !== undefined) {
      const checked = UpdateComparisonRequest.safeParse(body);

      if (!checked.success) {
        setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
        return;
      }

      const result = await apiRequest('PATCH', `/api/comparisons/${comparison.id}`, checked.data);

      if (!result.ok) {
        setErrorMessage(comparisonErrorMessage(result.code));
        return;
      }

      toast.success(t.updated);
      router.push(`/purchase/comparisons/${comparison.id}`);
      return;
    }

    const checked = CreateComparisonRequest.safeParse({ ...body, enquiryId: grid?.enquiry.id });

    if (!checked.success) {
      setErrorMessage(terminology.apiErrors.VALIDATION_ERROR);
      return;
    }

    const result = await apiRequest<ComparisonResponse>('POST', '/api/comparisons', checked.data);

    if (!result.ok) {
      setErrorMessage(comparisonErrorMessage(result.code));
      return;
    }

    toast.success(t.created);
    router.push(`/purchase/comparisons/${result.data.id}`);
  }

  return (
    <div className="flex flex-col gap-3">
      {errorMessage === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}
      <FormLayout<ComparisonFormValues>
        schema={schema}
        defaultValues={defaults}
        onSubmit={handleSubmit}
        onCancel={() =>
          router.push(
            comparison !== undefined
              ? `/purchase/comparisons/${comparison.id}`
              : '/purchase/comparisons',
          )
        }
      >
        <FormSection title={t.sectionHeader}>
          <FieldShell id="field-enquiry-fixed" label={t.fieldEnquiry}>
            <Input id="field-enquiry-fixed" value={enquiryNumber} readOnly disabled />
          </FieldShell>
          <DateField<ComparisonFormValues>
            name="comparisonDate"
            label={t.fieldComparisonDate}
            description={t.fieldComparisonDateHint}
            required
          />
          <TextareaField<ComparisonFormValues>
            name="remarks"
            label={t.fieldRemarks}
            className="sm:col-span-2"
            rows={2}
          />
        </FormSection>
        <FormSection title={t.sectionGrid} columns={1}>
          <ComparisonGridEditor vendors={vendors} lines={lines} />
        </FormSection>
      </FormLayout>
    </div>
  );
}

function ComparisonGridEditor({
  vendors,
  lines,
}: {
  vendors: ComparisonVendorColumn[];
  lines: ComparisonGridLine[];
}) {
  const { control, setValue } = useFormContext<ComparisonFormValues>();
  const rows = useWatch({ control, name: 'lines' });
  const choices: GridChoice[] = rows.map((row) => ({
    vendorId: row.selectedVendorId === '' ? null : row.selectedVendorId,
    reason: row.reason,
  }));

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">{t.gridHint}</p>
      <ComparisonGrid
        vendors={vendors}
        lines={lines}
        choices={choices}
        onChoose={(index, vendorId) => {
          setValue(`lines.${index}.selectedVendorId`, vendorId ?? '', { shouldDirty: true });

          if (vendorId === null) {
            setValue(`lines.${index}.reason`, '', { shouldDirty: true });
          }
        }}
        onReason={(index, reason) =>
          setValue(`lines.${index}.reason`, reason, { shouldDirty: true })
        }
      />
    </div>
  );
}
