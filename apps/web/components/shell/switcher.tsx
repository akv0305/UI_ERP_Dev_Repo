'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
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
  placeholder: string;
}

export function Switcher({ options, placeholder }: SwitcherProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const current = options.find((option) => option.value === selected)?.label ?? placeholder;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={options.length === 0} className="max-w-48">
          <span className="truncate">{current}</span>
          <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((option) => (
          <DropdownMenuItem key={option.value} onSelect={() => setSelected(option.value)}>
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
