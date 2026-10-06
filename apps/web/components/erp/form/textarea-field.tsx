'use client';

import { useController, useFormContext, type FieldValues } from 'react-hook-form';
import { Textarea } from '@/components/ui/textarea';
import { FieldShell } from './field-shell';
import type { BaseFieldProps } from './field-props';

export interface TextareaFieldProps<
  TValues extends FieldValues = FieldValues,
> extends BaseFieldProps<TValues> {
  placeholder?: string;
  rows?: number;
}

export function TextareaField<TValues extends FieldValues = FieldValues>({
  name,
  label,
  description,
  required,
  disabled,
  className,
  placeholder,
  rows,
}: TextareaFieldProps<TValues>) {
  const { control } = useFormContext<TValues>();
  const { field, fieldState } = useController({ name, control, disabled });
  const id = `field-${String(name)}`;

  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      description={description}
      error={fieldState.error?.message}
      className={className}
    >
      <Textarea
        id={id}
        name={field.name}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        value={field.value ?? ''}
        onChange={(event) => field.onChange(event.target.value)}
        onBlur={field.onBlur}
        ref={field.ref}
      />
    </FieldShell>
  );
}
