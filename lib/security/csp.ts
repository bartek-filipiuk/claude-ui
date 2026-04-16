/**
 * Pure CSP directive builder. No node imports so this file can be used from
 * Next.js edge middleware (middleware.ts) and from server-side code alike.
 */
export function makeCsp(nonce: string, opts: { dev?: boolean } = {}): string {
  // Next.js dev-mode HMR uses `eval` for module replacement. Allow it only
  // when dev=true so production stays strict.
  const scriptSrc = [`'nonce-${nonce}'`, "'strict-dynamic'"];
  if (opts.dev) scriptSrc.push("'unsafe-eval'");
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': scriptSrc,
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", 'ws:', 'wss:'],
    'worker-src': ["'self'", 'blob:'],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
  };
  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}
