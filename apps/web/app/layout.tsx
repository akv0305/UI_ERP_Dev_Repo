import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { terminology } from '@/config/terminology';
import './globals.css';

export const metadata: Metadata = {
  title: terminology.app.title,
  description: terminology.app.description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
