'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { terminology } from '@/config/terminology';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterFieldText {
  key: string;
  label: string;
  type: 'text';
}

export interface FilterFieldSelect {
  key: string;
  label: string;
  type: 'select';
  options: FilterOption[];
}

export interface FilterFieldDateRange {
  key: string;
  label: string;
  type: 'dateRange';
}

export type FilterField = FilterFieldText | FilterFieldSelect | FilterFieldDateRange;

export type FilterBarValue = Record<string, string>;

export interface FilterBarProps {
  fields: FilterField[];
  value: FilterBarValue;
  onChange: (value: FilterBarValue) => void;
  onReset: () => void;
}

export function FilterBar({ fields, value, onChange, onReset }: FilterBarProps) {
  const setValue = (key: string, next: string) => {
    onChange({ ...value, [key]: next });
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-[var(--card-padding)]">
      <div className="flex flex-wrap items-end gap-3">
        {fields.map((field) => {
          if (field.type === 'text') {
            return (
              <div key={field.key} className="min-w-48 flex-1 space-y-1">
                <Label htmlFor={`filter-${field.key}`}>{field.label}</Label>
                <Input
                  id={`filter-${field.key}`}
                  value={value[field.key] ?? ''}
                  onChange={(event) => setValue(field.key, event.target.value)}
                />
              </div>
            );
          }

          if (field.type === 'select') {
            return (
              <div key={field.key} className="min-w-48 flex-1 space-y-1">
                <Label htmlFor={`filter-${field.key}`}>{field.label}</Label>
                <Select
                  value={value[field.key] ?? ''}
                  onValueChange={(next) => setValue(field.key, next)}
                >
                  <SelectTrigger id={`filter-${field.key}`}>
                    <SelectValue placeholder={terminology.filters.all} />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          }

          const fromKey = `${field.key}From`;
          const toKey = `${field.key}To`;

          return (
            <div key={field.key} className="space-y-1">
              <Label>{field.label}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  aria-label={field.label}
                  value={value[fromKey] ?? ''}
                  onChange={(event) => setValue(fromKey, event.target.value)}
                />
                <Input
                  type="date"
                  aria-label={field.label}
                  value={value[toKey] ?? ''}
                  onChange={(event) => setValue(toKey, event.target.value)}
                />
              </div>
            </div>
          );
        })}

        <Button type="button" variant="outline" onClick={onReset}>
          {terminology.filters.reset}
        </Button>
      </div>
    </div>
  );
}
