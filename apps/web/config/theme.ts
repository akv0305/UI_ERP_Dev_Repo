export const theme = {
  colors: {
    background: 'hsl(210 20% 98%)',
    surface: 'hsl(0 0% 100%)',
    surfaceMuted: 'hsl(212 22% 96%)',
    foreground: 'hsl(213 15% 12%)',
    foregroundMuted: 'hsl(213 13% 43%)',
    primary: 'hsl(211 67% 21%)',
    primaryForeground: 'hsl(0 0% 100%)',
    secondary: 'hsl(213 31% 93%)',
    secondaryForeground: 'hsl(211 67% 21%)',
    accent: 'hsl(213 40% 92%)',
    border: 'hsl(213 20% 88%)',
    input: 'hsl(213 18% 84%)',
    ring: 'hsl(212 66% 32%)',
    success: 'hsl(152 55% 33%)',
    warning: 'hsl(32 85% 44%)',
    danger: 'hsl(0 65% 46%)',
    info: 'hsl(206 70% 42%)',
    status: {
      draft: 'hsl(215 14% 52%)',
      submitted: 'hsl(206 70% 42%)',
      pendingApproval: 'hsl(32 85% 44%)',
      approved: 'hsl(152 55% 33%)',
      rejected: 'hsl(0 65% 46%)',
      returned: 'hsl(270 45% 48%)',
      revised: 'hsl(190 60% 36%)',
      cancelled: 'hsl(215 10% 60%)',
      closed: 'hsl(215 22% 34%)',
    },
  },
  typography: {
    fontSans: 'Inter',
    fontMono:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    baseFontSize: '14px',
    headingWeight: 600,
  },
  shape: {
    radiusSm: '4px',
    radiusMd: '6px',
    radiusLg: '10px',
  },
  density: {
    default: 'comfortable',
    comfortable: {
      rowHeight: '44px',
      fieldHeight: '38px',
      pagePaddingX: '24px',
      cardPadding: '20px',
    },
    compact: {
      rowHeight: '34px',
      fieldHeight: '32px',
      pagePaddingX: '16px',
      cardPadding: '14px',
    },
  },
  brand: {
    appName: 'Unique Infra Engineers',
    shortName: 'UIE',
  },
} as const;

export type Theme = typeof theme;

export type ThemeDensity = keyof Omit<Theme['density'], 'default'>;
