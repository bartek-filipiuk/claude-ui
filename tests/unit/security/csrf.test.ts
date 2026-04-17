import { describe, expect, it } from 'vitest';
import { issueCsrf, verifyCsrf } from '@/lib/security/csrf';

describe('issueCsrf', () => {
  it('returns a cookie + header pair with identical values', () => {
    const { cookie, header } = issueCsrf();
    expect(cookie).toBe(header);
  });

  it('generates unique tokens', () => {
    const a = issueCsrf();
    const b = issueCsrf();
    expect(a.cookie).not.toBe(b.cookie);
  });

  it('token is 64 hex chars (32 bytes)', () => {
    const { cookie } = issueCsrf();
    expect(cookie).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('verifyCsrf', () => {
  it('accepts a match', () => {
    const { cookie, header } = issueCsrf();
    expect(verifyCsrf(cookie, header)).toBe(true);
  });

  it('rejects a mismatch', () => {
    const a = issueCsrf();
    const b = issueCsrf();
    expect(verifyCsrf(a.cookie, b.header)).toBe(false);
  });

  it('rejects null / undefined / empty', () => {
    expect(verifyCsrf(null, null)).toBe(false);
    expect(verifyCsrf(undefined, undefined)).toBe(false);
    expect(verifyCsrf('', '')).toBe(false);
    expect(verifyCsrf('x', '')).toBe(false);
    expect(verifyCsrf('', 'x')).toBe(false);
  });

  it('rejects mismatched lengths without throwing', () => {
    expect(() => verifyCsrf('short', 'much-longer')).not.toThrow();
    expect(verifyCsrf('short', 'much-longer')).toBe(false);
  });

  it('rejects a tampered token (byte swap)', () => {
    const { cookie } = issueCsrf();
    const tampered = (cookie[0] === 'a' ? 'b' : 'a') + cookie.slice(1);
    expect(verifyCsrf(cookie, tampered)).toBe(false);
  });
});
