'use client';

import { useState, type CSSProperties } from 'react';
import { PageHeader } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { terminology } from '@/config/terminology';
import type { ThemeDensity } from '@/config/theme';
import { GalleryDetailSection, GalleryFormSection } from './gallery-form';
import { GallerySharedSection } from './gallery-shared';
import { GalleryTableSection } from './gallery-table';

export function GalleryClient() {
  const [density, setDensity] = useState<ThemeDensity>('comfortable');

  const densityVariables = {
    '--row-height': `var(--density-${density}-row-height)`,
    '--field-height': `var(--density-${density}-field-height)`,
    '--page-padding-x': `var(--density-${density}-page-padding-x)`,
    '--card-padding': `var(--density-${density}-card-padding)`,
  } as CSSProperties;

  return (
    <div className="space-y-8" style={densityVariables}>
      <PageHeader
        title={terminology.nav.componentGallery}
        subtitle={terminology.gallery.description}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{terminology.gallery.density}</span>
        <Button
          type="button"
          size="sm"
          variant={density === 'comfortable' ? 'default' : 'outline'}
          onClick={() => setDensity('comfortable')}
        >
          {terminology.gallery.comfortable}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={density === 'compact' ? 'default' : 'outline'}
          onClick={() => setDensity('compact')}
        >
          {terminology.gallery.compact}
        </Button>
      </div>

      <GallerySharedSection />
      <GalleryTableSection />
      <GalleryFormSection />
      <GalleryDetailSection />
    </div>
  );
}
