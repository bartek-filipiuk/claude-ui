import { describe, expect, it } from 'vitest';
import { generateToken, safeCompare } from '@/lib/security/token';

describe('generateToken', () => {
  it('returns a 64-char hex string (32 bytes)', () => {
    const token = generateToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generuje unikalne tokeny (1000 iteracji)', () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateToken));
    expect(tokens.size).toBe(1000);
  });
});

describe('safeCompare', () => {
  it('returns true for identical strings', () => {
    const token = generateToken();
    expect(safeCompare(token, token)).toBe(true);
  });

  it('returns false for different strings of the same length', () => {
    const a = 'a'.repeat(64);
    const b = 'b'.repeat(64);
    expect(safeCompare(a, b)).toBe(false);
  });

  it('returns false for mismatched lengths without throwing', () => {
    expect(() => safeCompare('short', 'much-longer-string')).not.toThrow();
    expect(safeCompare('short', 'much-longer-string')).toBe(false);
  });

  it('returns false for empty strings', () => {
    expect(safeCompare('', '')).toBe(false);
    expect(safeCompare('', 'x')).toBe(false);
    expect(safeCompare('x', '')).toBe(false);
  });

  it('does not throw on non-hex input', () => {
    expect(() => safeCompare('zolc', 'ASCII')).not.toThrow();
    expect(safeCompare('zolc', 'zolc')).toBe(true);
  });
});
