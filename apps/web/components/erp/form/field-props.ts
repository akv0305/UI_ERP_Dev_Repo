import type { FieldValues, Path } from 'react-hook-form';

export interface BaseFieldProps<TValues extends FieldValues = FieldValues> {
  name: Path<TValues>;
  label: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export interface FieldOption {
  value: string;
  label: string;
}
