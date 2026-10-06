'use client';

import { useState } from 'react';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  KeyValueGrid,
  LoadingSkeleton,
  NotAuthorised,
  StatusChip,
  type StatusKey,
} from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import { error as toastError, info as toastInfo, success as toastSuccess } from '@/lib/toast';
import { GallerySection } from './gallery-section';
import { sampleLabels } from './sample-data';

const statusKeys = Object.keys(terminology.statuses) as StatusKey[];

export function GallerySharedSection() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTone, setDialogTone] = useState<'default' | 'danger'>('default');

  return (
    <div className="space-y-8">
      <GallerySection title={terminology.gallery.sectionStatus}>
        <div className="flex flex-wrap gap-2">
          {statusKeys.map((status) => (
            <StatusChip key={status} status={status} />
          ))}
        </div>
      </GallerySection>

      <GallerySection title={terminology.gallery.sectionKeyValue}>
        <div className="rounded-lg border border-border bg-surface p-[var(--card-padding)]">
          <KeyValueGrid
            columns={3}
            items={[
              { label: sampleLabels.gridReference, value: 'Sample 001' },
              { label: sampleLabels.gridOwner, value: 'Sample 002' },
              { label: sampleLabels.gridValue, value: '1,250.00' },
              {
                label: sampleLabels.gridStatus,
                value: <StatusChip status="approved" />,
              },
            ]}
          />
        </div>
      </GallerySection>

      <GallerySection title={terminology.gallery.sectionFeedback}>
        <div className="grid gap-4 lg:grid-cols-2">
          <ErrorState
            title={sampleLabels.errorTitle}
            description={sampleLabels.errorDescription}
            onRetry={() => toastInfo(terminology.gallery.toastInfo)}
          />
          <div className="space-y-4">
            <EmptyState
              title={sampleLabels.emptyTitle}
              description={sampleLabels.emptyDescription}
            />
            <NotAuthorised />
          </div>
          <LoadingSkeleton variant="table" />
          <div className="grid gap-4 sm:grid-cols-2">
            <LoadingSkeleton variant="form" />
            <LoadingSkeleton variant="detail" />
          </div>
        </div>
      </GallerySection>

      <GallerySection title={terminology.gallery.sectionDialog}>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDialogTone('default');
              setDialogOpen(true);
            }}
          >
            {terminology.gallery.openDialog}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              setDialogTone('danger');
              setDialogOpen(true);
            }}
          >
            {terminology.actions.delete}
          </Button>
        </div>
        <ConfirmDialog
          open={dialogOpen}
          title={sampleLabels.dialogTitle}
          description={sampleLabels.dialogDescription}
          confirmLabel={sampleLabels.dialogConfirm}
          tone={dialogTone}
          onConfirm={() => toastSuccess(terminology.gallery.toastSuccess)}
          onOpenChange={setDialogOpen}
        />
      </GallerySection>

      <GallerySection title={terminology.gallery.sectionToast}>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => toastSuccess(terminology.gallery.toastSuccess)}>
            {terminology.gallery.showSuccess}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => toastError(terminology.gallery.toastError)}
          >
            {terminology.gallery.showError}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => toastInfo(terminology.gallery.toastInfo)}
          >
            {terminology.gallery.showInfo}
          </Button>
        </div>
      </GallerySection>
    </div>
  );
}
