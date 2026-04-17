import { describe, expect, it } from 'vitest';
import { makeCsp } from '@/lib/security/csp';
import { generateNonce } from '@/lib/security/nonce';

describe('generateNonce', () => {
  it('returns a base64 string of at least 22 chars (16 bytes)', () => {
    const nonce = generateNonce();
    expect(nonce.length).toBeGreaterThanOrEqual(22);
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('stays unique across 1000 iterations', () => {
    const set = new Set(Array.from({ length: 1000 }, generateNonce));
    expect(set.size).toBe(1000);
  });
});

describe('makeCsp', () => {
  it('embeds the nonce in script-src', () => {
    const nonce = 'abc123';
    const csp = makeCsp(nonce);
    expect(csp).toContain(`'nonce-${nonce}'`);
    expect(csp).toMatch(/script-src[^;]*'nonce-abc123'/);
  });

  it('does not contain unsafe-inline in script-src', () => {
    const csp = makeCsp('x');
    const scriptSrc = csp.match(/script-src[^;]*/)?.[0] ?? '';
    expect(scriptSrc).not.toContain('unsafe-inline');
  });

  it('does not contain unsafe-eval', () => {
    const csp = makeCsp('x');
    expect(csp).not.toContain('unsafe-eval');
  });

  it("includes default-src 'self'", () => {
    const csp = makeCsp('x');
    expect(csp).toMatch(/default-src[^;]*'self'/);
  });

  it('includes a connect-src that allows ws://', () => {
    const csp = makeCsp('x');
    expect(csp).toMatch(/connect-src[^;]*'self'[^;]*ws:/);
  });

  it("includes frame-ancestors 'none'", () => {
    const csp = makeCsp('x');
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("includes object-src 'none'", () => {
    const csp = makeCsp('x');
    expect(csp).toContain("object-src 'none'");
  });

  it("includes base-uri 'self'", () => {
    const csp = makeCsp('x');
    expect(csp).toContain("base-uri 'self'");
  });
});
