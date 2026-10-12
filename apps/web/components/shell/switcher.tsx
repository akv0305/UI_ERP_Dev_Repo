'use client';

import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface SwitcherOption {
  value: string;
  label: string;
}

export interface SwitcherProps {
  options: SwitcherOption[];
  /** The selected option's value; null = nothing selected (or "all" when `allLabel` is given). */
  value: string | null;
  /** Called with the chosen value, or null for the "all" entry. */
  onChange: (value: string | null) => void;
  /** Shown when nothing is selected and there is no "all" entry. */
  placeholder: string;
  /** When set, adds a first entry that selects null and is shown while nothing is selected. */
  allLabel?: string;
  /** Disables the switcher while a change is being saved. */
  busy?: boolean;
}

/** Text on the button: the selected option, else the "all" label, else the placeholder. */
export function switcherLabel(
  options: SwitcherOption[],
  value: string | null,
  placeholder: string,
  allLabel?: string,
): string {
  const selected = options.find((option) => option.value === value);

  if (selected !== undefined) {
    return selected.label;
  }

  return allLabel ?? placeholder;
}

/** Entries of the menu in order; the "all" entry (value null) comes first when there is one. */
export function switcherItems(
  options: SwitcherOption[],
  allLabel?: string,
): Array<{ value: string | null; label: string }> {
  return allLabel === undefined ? options : [{ value: null, label: allLabel }, ...options];
}

/** Nothing to choose from (or a change in flight) disables the control. */
export function isSwitcherDisabled(options: SwitcherOption[], busy = false): boolean {
  return options.length === 0 || busy;
}

/** Controlled: the parent owns `value` and decides what `onChange` does. */
export function Switcher({
  options,
  value,
  onChange,
  placeholder,
  allLabel,
  busy = false,
}: SwitcherProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isSwitcherDisabled(options, busy)}
          className="max-w-48"
        >
          <span className="truncate">{switcherLabel(options, value, placeholder, allLabel)}</span>
          <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {switcherItems(options, allLabel).map((item) => (
          <DropdownMenuItem key={item.value ?? 'all'} onSelect={() => onChange(item.value)}>
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
