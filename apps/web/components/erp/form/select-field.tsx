'use client';

import { useController, useFormContext, type FieldValues } from 'react-hook-form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { terminology } from '@/config/terminology';
import { FieldShell } from './field-shell';
import type { BaseFieldProps, FieldOption } from './field-props';

export interface SelectFieldProps<
  TValues extends FieldValues = FieldValues,
> extends BaseFieldProps<TValues> {
  options: FieldOption[];
  placeholder?: string;
}

export function SelectField<TValues extends FieldValues = FieldValues>({
  name,
  label,
  description,
  required,
  disabled,
  className,
  options,
  placeholder,
}: SelectFieldProps<TValues>) {
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
      <Select
        value={field.value ?? ''}
        onValueChange={field.onChange}
        disabled={disabled}
        name={field.name}
      >
        <SelectTrigger id={id} onBlur={field.onBlur} ref={field.ref}>
          <SelectValue placeholder={placeholder ?? terminology.filters.all} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}
