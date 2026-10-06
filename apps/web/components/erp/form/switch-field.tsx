'use client';

import { useController, useFormContext, type FieldValues } from 'react-hook-form';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { terminology } from '@/config/terminology';
import { cn } from '@/lib/utils';
import type { BaseFieldProps } from './field-props';

export type SwitchFieldProps<TValues extends FieldValues = FieldValues> = BaseFieldProps<TValues>;

export function SwitchField<TValues extends FieldValues = FieldValues>({
  name,
  label,
  description,
  required,
  disabled,
  className,
}: SwitchFieldProps<TValues>) {
  const { control } = useFormContext<TValues>();
  const { field, fieldState } = useController({ name, control, disabled });
  const id = `field-${String(name)}`;

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label htmlFor={id}>
            {label}
            {required ? (
              <span className="ml-0.5 text-danger" aria-hidden>
                {terminology.labels.requiredMark}
              </span>
            ) : null}
          </Label>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        <Switch
          id={id}
          name={field.name}
          checked={field.value === true}
          onCheckedChange={field.onChange}
          onBlur={field.onBlur}
          ref={field.ref}
          disabled={disabled}
        />
      </div>
      {fieldState.error ? <p className="text-xs text-danger">{fieldState.error.message}</p> : null}
    </div>
  );
}
