'use client';

import { useEffect, useState } from 'react';
import { useController, useFormContext, type FieldValues } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { terminology } from '@/config/terminology';
import { formatDate } from '@/lib/format';
import { FieldShell } from './field-shell';
import type { BaseFieldProps } from './field-props';

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DISPLAY_PATTERN = /^(\d{2})-(\d{2})-(\d{4})$/;

export type DateFieldProps<TValues extends FieldValues = FieldValues> = BaseFieldProps<TValues>;

function toDisplay(value: unknown): string {
  const iso = String(value ?? '');
  return ISO_PATTERN.test(iso) ? formatDate(iso) : '';
}

function toIso(display: string): string | null {
  const match = DISPLAY_PATTERN.exec(display.trim());

  if (match === null) {
    return null;
  }

  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;

  return formatDate(iso) === display.trim() ? iso : null;
}

export function DateField<TValues extends FieldValues = FieldValues>({
  name,
  label,
  description,
  required,
  disabled,
  className,
}: DateFieldProps<TValues>) {
  const { control } = useFormContext<TValues>();
  const { field, fieldState } = useController({ name, control, disabled });
  const id = `field-${String(name)}`;
  const [text, setText] = useState(() => toDisplay(field.value));

  useEffect(() => {
    setText(toDisplay(field.value));
  }, [field.value]);

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
        name={field.name}
        inputMode="numeric"
        placeholder={terminology.fields.dateFormat}
        disabled={disabled}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          const trimmed = text.trim();

          if (trimmed.length === 0) {
            field.onChange('');
          } else {
            const iso = toIso(trimmed);

            if (iso !== null) {
              field.onChange(iso);
            } else {
              setText(toDisplay(field.value));
            }
          }

          field.onBlur();
        }}
        ref={field.ref}
      />
    </FieldShell>
  );
}
