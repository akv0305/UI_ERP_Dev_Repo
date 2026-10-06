'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useController, useFormContext, type FieldValues } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { terminology } from '@/config/terminology';
import { cn } from '@/lib/utils';
import { FieldShell } from './field-shell';
import type { BaseFieldProps, FieldOption } from './field-props';

export interface ComboboxFieldProps<
  TValues extends FieldValues = FieldValues,
> extends BaseFieldProps<TValues> {
  loadOptions: (query: string) => Promise<FieldOption[]>;
  placeholder?: string;
}

export function ComboboxField<TValues extends FieldValues = FieldValues>({
  name,
  label,
  description,
  required,
  disabled,
  className,
  loadOptions,
  placeholder,
}: ComboboxFieldProps<TValues>) {
  const { control } = useFormContext<TValues>();
  const { field, fieldState } = useController({ name, control, disabled });
  const id = `field-${String(name)}`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<FieldOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const loadOptionsRef = useRef(loadOptions);
  loadOptionsRef.current = loadOptions;

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    setIsLoading(true);

    loadOptionsRef
      .current(query)
      .then((next) => {
        if (active) {
          setOptions(next);
        }
      })
      .catch(() => {
        if (active) {
          setOptions([]);
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [open, query]);

  const selected = options.find((option) => option.value === field.value);
  const triggerLabel =
    selected?.label ?? field.value ?? placeholder ?? terminology.combobox.searchPlaceholder;

  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      description={description}
      error={fieldState.error?.message}
      className={className}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={terminology.combobox.searchPlaceholder}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {isLoading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {terminology.labels.loading}
                </div>
              ) : (
                <>
                  <CommandEmpty>{terminology.combobox.empty}</CommandEmpty>
                  {options.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => {
                        field.onChange(option.value);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          'size-4',
                          field.value === option.value ? 'opacity-100' : 'opacity-0',
                        )}
                        aria-hidden
                      />
                      {option.label}
                    </CommandItem>
                  ))}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </FieldShell>
  );
}
