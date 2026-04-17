import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { request } from 'node:http';
import { startServer, type StartedServer } from './helpers/start-server';

function rawRequest(
  host: string,
  port: number,
  path: string,
  extraHeaders: Record<string, string> = {},
): Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined> }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host,
        port,
        path,
        method: 'GET',
        headers: { ...extraHeaders },
      },
      (res) => {
        res.resume();
        res.on('end', () =>
          resolve({ statusCode: res.statusCode ?? 0, headers: res.headers as never }),
        );
      },
    );
    req.once('error', reject);
    req.end();
  });
}

let server: StartedServer;

beforeAll(async () => {
  server = await startServer();
}, 30_000);

afterAll(async () => {
  await server.stop();
});

describe('GET /api/auth', () => {
  it('200 HTML + sets cookie on a valid token', async () => {
    const res = await fetch(`${server.baseUrl}/api/auth?k=${server.token}`, {
      redirect: 'manual',
    });
    // HTML redirect (not 302): Chromium --app drops cookies across 302.
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    // Meta + JS redirect to bare "/" (no token in URL or body).
    expect(body).toMatch(/location\.replace\("\/"\)/);
    expect(body).not.toContain(server.token);

    const cookies = res.headers.getSetCookie();
    const auth = cookies.find((c) => c.startsWith('codehelm_auth='));
    const csrf = cookies.find((c) => c.startsWith('codehelm_csrf='));
    expect(auth).toBeDefined();
    expect(auth).toMatch(/HttpOnly/i);
    expect(auth).toMatch(/SameSite=lax/i);
    expect(csrf).toBeDefined();
    expect(csrf).not.toMatch(/HttpOnly/i);
  });

  it('401 on a bad token', async () => {
    const res = await fetch(`${server.baseUrl}/api/auth?k=deadbeef`, { redirect: 'manual' });
    expect(res.status).toBe(401);
  });

  it('401 on an empty token', async () => {
    const res = await fetch(`${server.baseUrl}/api/auth`, { redirect: 'manual' });
    expect(res.status).toBe(401);
  });
});

describe('Host allowlist', () => {
  it('403 on Host: evil.com', async () => {
    // Node's undici fetch disallows overriding Host header for security reasons,
    // so use raw http.request which honours the Host we set.
    const res = await rawRequest('127.0.0.1', server.port, '/api/healthz', {
      Host: 'evil.com',
    });
    expect(res.statusCode).toBe(403);
  });

  it('OK on Host: 127.0.0.1:PORT', async () => {
    const res = await fetch(`${server.baseUrl}/api/healthz`);
    expect(res.status).toBe(200);
  });

  it('OK on Host: localhost:PORT', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/healthz`);
    expect(res.status).toBe(200);
  });
});

describe('Auth-gated endpoints', () => {
  it('401 without cookie on an unknown endpoint (e.g. /)', async () => {
    const res = await fetch(`${server.baseUrl}/`);
    // Either 401 (if / is auth-gated) or 200 depending on exemption rules.
    // In our setup / is not exempt — must be 401.
    expect(res.status).toBe(401);
  });
});

describe('CSRF on unsafe methods', () => {
  it('403 on POST without CSRF, even with an auth cookie', async () => {
    // First obtain an auth cookie.
    const authRes = await fetch(`${server.baseUrl}/api/auth?k=${server.token}`, {
      redirect: 'manual',
    });
    const cookies = authRes.headers
      .getSetCookie()
      .map((c) => c.split(';', 1)[0])
      .filter(Boolean)
      .join('; ');

    const res = await fetch(`${server.baseUrl}/api/does-not-exist`, {
      method: 'POST',
      headers: { Cookie: cookies },
      body: '{}',
    });
    // Middleware rejects on CSRF before the Next 404 handler kicks in.
    expect(res.status).toBe(403);
  });
});
