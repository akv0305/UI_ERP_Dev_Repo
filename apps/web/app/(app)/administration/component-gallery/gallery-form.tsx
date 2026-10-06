'use client';

import {
  ComboboxField,
  DateField,
  DetailLayout,
  EmptyState,
  FormLayout,
  FormSection,
  KeyValueGrid,
  NumberField,
  SelectField,
  StatusChip,
  SwitchField,
  TextField,
  TextareaField,
} from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { info as toastInfo, success as toastSuccess } from '@/lib/toast';
import { GallerySection } from './gallery-section';
import { sampleLabels, sampleOptions } from './sample-data';
import { sampleFormDefaults, sampleFormSchema, type SampleFormValues } from './sample-schema';

async function loadOptions(query: string) {
  const normalized = query.trim().toLowerCase();

  return sampleOptions.filter((option) => option.label.toLowerCase().includes(normalized));
}

export function GalleryFormSection() {
  return (
    <GallerySection title={terminology.gallery.sectionForm}>
      <FormLayout<SampleFormValues>
        schema={sampleFormSchema}
        defaultValues={sampleFormDefaults}
        onSubmit={(values) => toastSuccess(values.name)}
        onCancel={() => toastInfo(terminology.actions.cancel)}
      >
        <FormSection
          title={sampleLabels.sectionTitle}
          description={sampleLabels.sectionDescription}
          columns={2}
        >
          <TextField name="name" label={sampleLabels.formName} required />
          <NumberField name="quantity" label={sampleLabels.formQuantity} required />
          <SelectField
            name="status"
            label={sampleLabels.formStatus}
            options={sampleOptions}
            required
          />
          <DateField name="date" label={sampleLabels.formDate} required />
          <ComboboxField name="vendor" label={sampleLabels.formVendor} loadOptions={loadOptions} />
          <SwitchField name="active" label={sampleLabels.formActive} />
          <TextareaField name="notes" label={sampleLabels.formNotes} className="sm:col-span-2" />
        </FormSection>
      </FormLayout>
    </GallerySection>
  );
}

export function GalleryDetailSection() {
  return (
    <GallerySection title={terminology.gallery.sectionDetail}>
      <DetailLayout
        title={sampleLabels.detailTitle}
        status="approved"
        actions={
          <Button type="button" variant="outline">
            {terminology.actions.edit}
          </Button>
        }
        tabs={[
          {
            key: 'overview',
            label: sampleLabels.detailOverviewTab,
            content: (
              <KeyValueGrid
                columns={2}
                items={[
                  { label: sampleLabels.gridReference, value: 'Sample 001' },
                  { label: sampleLabels.gridStatus, value: <StatusChip status="approved" /> },
                  { label: sampleLabels.gridValue, value: '1,250.00' },
                  { label: sampleLabels.gridOwner, value: 'Sample 002' },
                ]}
              />
            ),
          },
          {
            key: 'lines',
            label: sampleLabels.detailLinesTab,
            content: <EmptyState title={sampleLabels.emptyTitle} />,
          },
        ]}
        sidePanel={
          <div className="space-y-3 rounded-lg border border-border bg-surface p-[var(--card-padding)]">
            <p className="text-sm font-medium text-foreground">{sampleLabels.detailSideTitle}</p>
            <StatusChip status="approved" />
          </div>
        }
      />
    </GallerySection>
  );
}
