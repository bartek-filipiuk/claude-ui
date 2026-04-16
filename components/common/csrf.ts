const CSRF_COOKIE = 'claude_ui_csrf';

export function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * Fetch wrapper adding credentials + CSRF header for unsafe methods.
 * All app fetches go through this — keeps the double-submit consistent.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = readCsrfCookie();
    if (token) headers.set('x-csrf-token', token);
  }
  return fetch(input, { ...init, credentials: 'include', headers });
}
