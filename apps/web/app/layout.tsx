import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import { fontSans } from '@/app/fonts';
import { terminology } from '@/config/terminology';
import { theme } from '@/config/theme';
import './globals.css';

export const metadata: Metadata = {
  title: terminology.app.title,
  description: terminology.app.description,
};

function kebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function buildThemeVariables(): CSSProperties {
  const { colors, typography, shape, density } = theme;
  const activeDensity = density[density.default];
  const variables: Record<string, string> = {
    '--font-family-mono': typography.fontMono,
    '--font-size-base': typography.baseFontSize,
    '--font-weight-heading': String(typography.headingWeight),
    '--shape-radius-sm': shape.radiusSm,
    '--shape-radius-md': shape.radiusMd,
    '--shape-radius-lg': shape.radiusLg,
    '--density': density.default,
    '--row-height': activeDensity.rowHeight,
    '--field-height': activeDensity.fieldHeight,
    '--page-padding-x': activeDensity.pagePaddingX,
    '--card-padding': activeDensity.cardPadding,
  };

  for (const [key, value] of Object.entries(colors)) {
    if (typeof value === 'string') {
      variables[`--${kebabCase(key)}`] = value;
    }
  }

  for (const [key, value] of Object.entries(colors.status)) {
    variables[`--status-${kebabCase(key)}`] = value;
  }

  for (const [name, values] of Object.entries(density)) {
    if (typeof values === 'string') {
      continue;
    }

    for (const [key, value] of Object.entries(values)) {
      variables[`--density-${name}-${kebabCase(key)}`] = value;
    }
  }

  return variables as unknown as CSSProperties;
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontSans.variable} style={buildThemeVariables()}>
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
