'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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

const SEARCH_DEBOUNCE_MS = 300;

export interface RemotePickerProps<T> {
  id: string;
  placeholder: string;
  /** Label of the current value, kept by the form so a saved row shows text, not an id. */
  selectedLabel: string | null;
  unavailableText: string;
  /** Returns null when loading failed. */
  load: (search: string) => Promise<T[] | null>;
  optionKey: (option: T) => string;
  optionLabel: (option: T) => string;
  optionHint?: (option: T) => string | null;
  isSelected?: (option: T) => boolean;
  onSelect: (option: T) => void;
  /** Options are reloaded when this changes (for example the site). */
  reloadKey?: string;
  disabled?: boolean;
  invalid?: boolean;
}

export function RemotePicker<T>({
  id,
  placeholder,
  selectedLabel,
  unavailableText,
  load,
  optionKey,
  optionLabel,
  optionHint,
  isSelected,
  onSelect,
  reloadKey,
  disabled,
  invalid,
}: RemotePickerProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    setIsLoading(true);

    const timer = setTimeout(() => {
      void loadRef.current(query).then((result) => {
        if (!active) {
          return;
        }

        setFailed(result === null);
        setOptions(result ?? []);
        setIsLoading(false);
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, query, reloadKey]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{selectedLabel ?? placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-xl p-0">
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
                <CommandEmpty>{failed ? unavailableText : terminology.combobox.empty}</CommandEmpty>
                {options.map((option) => {
                  const hint = optionHint?.(option) ?? null;

                  return (
                    <CommandItem
                      key={optionKey(option)}
                      value={optionKey(option)}
                      onSelect={() => {
                        onSelect(option);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          'size-4',
                          isSelected?.(option) === true ? 'opacity-100' : 'opacity-0',
                        )}
                        aria-hidden
                      />
                      <span className="flex-1 truncate">{optionLabel(option)}</span>
                      {hint === null ? null : (
                        <span className="text-xs text-muted-foreground">{hint}</span>
                      )}
                    </CommandItem>
                  );
                })}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
