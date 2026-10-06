'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, type ReactNode } from 'react';
import {
  FormProvider,
  useForm,
  type DefaultValues,
  type FieldValues,
  type Resolver,
} from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import type { ZodType } from 'zod';

export interface FormLayoutProps<TValues extends FieldValues> {
  schema: ZodType<TValues, TValues>;
  defaultValues: DefaultValues<TValues>;
  onSubmit: (values: TValues) => void | Promise<void>;
  children: ReactNode;
  submitLabel?: string;
  onCancel?: () => void;
}

export function FormLayout<TValues extends FieldValues>({
  schema,
  defaultValues,
  onSubmit,
  children,
  submitLabel,
  onCancel,
}: FormLayoutProps<TValues>) {
  const form = useForm<TValues>({
    resolver: zodResolver(schema) as Resolver<TValues>,
    defaultValues,
    mode: 'onBlur',
  });

  const isDirty = form.formState.isDirty;

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = terminology.forms.unsavedChanges;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="space-y-4">{children}</div>
        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-border bg-surface p-[var(--card-padding)]">
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel}>
              {terminology.actions.cancel}
            </Button>
          ) : null}
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {submitLabel ?? terminology.actions.save}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
