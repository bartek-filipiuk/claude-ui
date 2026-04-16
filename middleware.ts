import { NextResponse, type NextRequest } from 'next/server';
import { makeCsp } from '@/lib/security/csp';

// Edge runtime: use Web Crypto instead of node:crypto. base64 over 16 random
// bytes — same shape as lib/security/csp.generateNonce() but compatible here.
function edgeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Next.js edge middleware. We use it exclusively for CSP nonce propagation —
 * Next only auto-injects the nonce into its own scripts when the nonce is set
 * on a request header here. Auth/CSRF/Host-allowlist still run in the custom
 * server middleware (server.ts) before Next ever sees the request.
 */
export function middleware(request: NextRequest): NextResponse {
  const nonce = edgeNonce();
  const dev = process.env['NODE_ENV'] !== 'production';
  const csp = makeCsp(nonce, { dev });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api/|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
