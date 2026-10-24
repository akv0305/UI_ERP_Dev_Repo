'use client';

import { IndentItemOptionsResponse } from '@uie/contracts';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { apiRead } from '@/lib/api/client';
import { buildQueryString } from '@/lib/list-params';
import { cn } from '@/lib/utils';

export type IndentItemOption = IndentItemOptionsResponse['items'][number];

const SEARCH_DEBOUNCE_MS = 300;

export interface ItemPickerProps {
  id: string;
  value: string;
  /** Label of the current value, kept by the form so a saved line shows its item, not its id. */
  selectedLabel: string | null;
  invalid?: boolean;
  onSelect: (option: IndentItemOption) => void;
}

/** Approved, active items only (GET /api/indents/item-options, OQ-38). */
export function ItemPicker({ id, value, selectedLabel, invalid, onSelect }: ItemPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<IndentItemOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    setIsLoading(true);

    const timer = setTimeout(() => {
      const search = buildQueryString({ search: query });
      const path = `/api/indents/item-options${search.length > 0 ? `?${search}` : ''}`;

      void apiRead(path, IndentItemOptionsResponse).then((result) => {
        if (!active) {
          return;
        }

        setFailed(!result.ok);
        setOptions(result.ok ? result.data.items : []);
        setIsLoading(false);
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, query]);

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
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{selectedLabel ?? terminology.indents.selectItem}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-md p-0">
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
                <CommandEmpty>
                  {failed ? terminology.indents.itemsUnavailable : terminology.combobox.empty}
                </CommandEmpty>
                {options.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={option.id}
                    onSelect={() => {
                      onSelect(option);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn('size-4', value === option.id ? 'opacity-100' : 'opacity-0')}
                      aria-hidden
                    />
                    <span className="flex-1 truncate">{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.unitCode}</span>
                  </CommandItem>
                ))}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
