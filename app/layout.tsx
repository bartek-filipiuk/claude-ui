import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { Geist, JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'codehelm',
  description: 'Local manager for Claude Code CLI sessions',
  robots: { index: false, follow: false },
};

// Self-hosted by next/font — files land in .next/static/media so CSP
// strict-dynamic + nonce stays happy (no fonts.googleapis.com fetch).
const geist = Geist({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist',
  weight: ['400', '500', '600', '700'],
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
  weight: ['400', '500', '600'],
});

export default async function RootLayout({ children }: { children: ReactNode }) {
  const headersList = await headers();
  void headersList.get('x-nonce');

  return (
    <html lang="en" className={`dark ${geist.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
