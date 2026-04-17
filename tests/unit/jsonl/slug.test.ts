import { describe, it, expect } from 'vitest';
import { decodeSlugToDisplayPath, isValidSlug } from '@/lib/jsonl/slug';

describe('isValidSlug', () => {
  it('accepts typical slugs', () => {
    expect(isValidSlug('-home-bartek-main-projects-foo')).toBe(true);
    expect(isValidSlug('-a0-usr-workdir')).toBe(true);
    expect(isValidSlug('foo')).toBe(true);
  });

  it('rejects slashes', () => {
    expect(isValidSlug('home/bartek')).toBe(false);
  });

  it('rejects dot-dot components', () => {
    expect(isValidSlug('..')).toBe(false);
    expect(isValidSlug('foo/../bar')).toBe(false);
    expect(isValidSlug('-home-..-etc')).toBe(false);
  });

  it('rejects null bytes', () => {
    expect(isValidSlug('foo\0')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidSlug('')).toBe(false);
  });

  it('rejects special characters', () => {
    expect(isValidSlug('foo bar')).toBe(false);
    expect(isValidSlug('foo&bar')).toBe(false);
    expect(isValidSlug('<script>')).toBe(false);
  });
});

describe('decodeSlugToDisplayPath', () => {
  it('decodes a slug that starts with a dash', () => {
    expect(decodeSlugToDisplayPath('-home-bartek-foo')).toBe('/home/bartek/foo');
  });

  it('decodes a slug without a leading dash', () => {
    expect(decodeSlugToDisplayPath('a-b-c')).toBe('a/b/c');
  });

  it('returns the input for an invalid slug', () => {
    expect(decodeSlugToDisplayPath('foo/bar')).toBe('foo/bar');
  });

  it('round-trips for typical paths', () => {
    const cases = [
      ['-home-bartek-foo', '/home/bartek/foo'],
      ['-tmp', '/tmp'],
      ['-home-a-b', '/home/a/b'],
    ] as const;
    for (const [slug, expected] of cases) {
      expect(decodeSlugToDisplayPath(slug)).toBe(expected);
    }
  });
});
