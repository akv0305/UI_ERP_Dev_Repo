'use client';

import { useState } from 'react';
import { theme } from '@/config/theme';
import { cn } from '@/lib/utils';

export interface BrandLogoProps {
  variant: 'full' | 'mark';
  height: number;
  className?: string;
}

export function BrandLogo({ variant, height, className }: BrandLogoProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
        <span
          className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground"
          style={{ height, width: height, fontSize: height * 0.4 }}
        >
          {theme.brand.shortName}
        </span>
        {variant === 'full' ? (
          <span className="truncate text-sm font-semibold text-foreground">
            {theme.brand.appName}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <img
      src={variant === 'full' ? theme.brand.logoFull : theme.brand.logoMark}
      alt={theme.brand.appName}
      onError={() => setFailed(true)}
      className={cn('shrink-0 object-contain', className)}
      style={{ height, width: 'auto' }}
    />
  );
}
