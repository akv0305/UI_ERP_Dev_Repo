'use client';

import { useController, useFormContext, type FieldValues } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { FieldShell } from './field-shell';
import type { BaseFieldProps } from './field-props';

export interface TextFieldProps<
  TValues extends FieldValues = FieldValues,
> extends BaseFieldProps<TValues> {
  placeholder?: string;
  type?: 'text' | 'email' | 'tel' | 'password';
  autoComplete?: string;
}

export function TextField<TValues extends FieldValues = FieldValues>({
  name,
  label,
  description,
  required,
  disabled,
  className,
  placeholder,
  type = 'text',
  autoComplete,
}: TextFieldProps<TValues>) {
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
      <Input
        id={id}
        type={type}
        autoComplete={autoComplete}
        name={field.name}
        placeholder={placeholder}
        disabled={disabled}
        value={field.value ?? ''}
        onChange={field.onChange}
        onBlur={field.onBlur}
        ref={field.ref}
      />
    </FieldShell>
  );
}
