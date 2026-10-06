import type { ReactNode } from 'react';

export interface GallerySectionProps {
  title: string;
  children: ReactNode;
}

export function GallerySection({ title, children }: GallerySectionProps) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}
