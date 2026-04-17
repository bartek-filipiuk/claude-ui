import { describe, expect, it } from 'vitest';
import { isHostAllowed, isOriginAllowed } from '@/lib/security/host-check';

describe('isHostAllowed', () => {
  const port = 54321;

  it('accepts 127.0.0.1:PORT', () => {
    expect(isHostAllowed(`127.0.0.1:${port}`, port)).toBe(true);
  });

  it('accepts localhost:PORT', () => {
    expect(isHostAllowed(`localhost:${port}`, port)).toBe(true);
  });

  it('rejects 127.0.0.1:wrong-port', () => {
    expect(isHostAllowed(`127.0.0.1:99999`, port)).toBe(false);
  });

  it('rejects 127.0.0.1 without a port', () => {
    expect(isHostAllowed(`127.0.0.1`, port)).toBe(false);
  });

  it('rejects evil.com', () => {
    expect(isHostAllowed(`evil.com`, port)).toBe(false);
    expect(isHostAllowed(`evil.com:${port}`, port)).toBe(false);
  });

  it('rejects DNS-rebinding 127.0.0.1.evil.com', () => {
    expect(isHostAllowed(`127.0.0.1.evil.com:${port}`, port)).toBe(false);
  });

  it('rejects null / undefined / empty', () => {
    expect(isHostAllowed(null, port)).toBe(false);
    expect(isHostAllowed(undefined, port)).toBe(false);
    expect(isHostAllowed('', port)).toBe(false);
  });

  it('rejects IPv6 [::1]:PORT (not supported)', () => {
    expect(isHostAllowed(`[::1]:${port}`, port)).toBe(false);
  });

  it('rejects 0.0.0.0', () => {
    expect(isHostAllowed(`0.0.0.0:${port}`, port)).toBe(false);
  });
});

describe('isOriginAllowed', () => {
  const port = 54321;
  const origin = `http://127.0.0.1:${port}`;

  it('accepts an exact match', () => {
    expect(isOriginAllowed(origin, port)).toBe(true);
  });

  it('accepts the localhost variant', () => {
    expect(isOriginAllowed(`http://localhost:${port}`, port)).toBe(true);
  });

  it('rejects https:// (we always speak HTTP to 127.0.0.1)', () => {
    expect(isOriginAllowed(`https://127.0.0.1:${port}`, port)).toBe(false);
  });

  it('rejects a mismatched port', () => {
    expect(isOriginAllowed(`http://127.0.0.1:99999`, port)).toBe(false);
  });

  it('rejects an evil origin', () => {
    expect(isOriginAllowed(`http://evil.com`, port)).toBe(false);
    expect(isOriginAllowed(`http://evil.com:${port}`, port)).toBe(false);
  });

  it('rejects a trailing slash or path', () => {
    expect(isOriginAllowed(`${origin}/`, port)).toBe(false);
    expect(isOriginAllowed(`${origin}/foo`, port)).toBe(false);
  });

  it('rejects null / undefined', () => {
    expect(isOriginAllowed(null, port)).toBe(false);
    expect(isOriginAllowed(undefined, port)).toBe(false);
  });
});
