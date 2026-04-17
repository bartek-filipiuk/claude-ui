import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { Providers } from '@/components/providers';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'codehelm',
  description: 'Local manager for Claude Code CLI sessions',
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Nonce is injected by the custom server middleware on the request headers.
  // We only need to read it — response CSP is already set there. No meta tag
  // needed (meta CSP is weaker anyway).
  const headersList = await headers();
  void headersList.get('x-nonce');

  return (
    <html lang="en" className="dark">
      <body className="bg-neutral-950 text-neutral-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
