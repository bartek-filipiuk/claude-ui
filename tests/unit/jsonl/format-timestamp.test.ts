import { describe, expect, it } from 'vitest';
import { formatTimestamp } from '@/lib/jsonl/format-timestamp';

const BASE = new Date('2026-04-16T12:00:00Z');

describe('formatTimestamp — iso', () => {
  it('passes a valid ISO string through unchanged', () => {
    const iso = '2026-04-16T11:58:00Z';
    expect(formatTimestamp(iso, 'iso', BASE)).toBe(iso);
  });
});

describe('formatTimestamp — local', () => {
  it('renders 24h hh:mm:ss in pl-PL locale', () => {
    const out = formatTimestamp('2026-04-16T12:00:05Z', 'local', BASE);
    expect(out).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(out.endsWith(':05')).toBe(true);
  });

  it('never uses 12-hour AM/PM marker', () => {
    const out = formatTimestamp('2026-04-16T23:30:00Z', 'local', BASE);
    expect(out).not.toMatch(/AM|PM/i);
  });
});

describe('formatTimestamp — relative', () => {
  it('formats a time 2 minutes in the past in Polish', () => {
    const iso = new Date(BASE.getTime() - 2 * 60 * 1000).toISOString();
    const out = formatTimestamp(iso, 'relative', BASE);
    expect(out).toContain('min');
    expect(out).toContain('temu');
  });

  it('formats a time 3 hours in the past', () => {
    const iso = new Date(BASE.getTime() - 3 * 60 * 60 * 1000).toISOString();
    const out = formatTimestamp(iso, 'relative', BASE);
    expect(out).toMatch(/godz/);
    expect(out).toContain('temu');
  });

  it('uses seconds for sub-minute offsets', () => {
    const iso = new Date(BASE.getTime() - 5 * 1000).toISOString();
    const out = formatTimestamp(iso, 'relative', BASE);
    expect(out).toMatch(/sek/);
  });

  it('uses days for multi-day offsets', () => {
    const iso = new Date(BASE.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const out = formatTimestamp(iso, 'relative', BASE);
    expect(out).toMatch(/dni|dzie/);
  });
});

describe('formatTimestamp — invalid input', () => {
  it('returns empty string for empty', () => {
    expect(formatTimestamp('', 'iso', BASE)).toBe('');
    expect(formatTimestamp('', 'local', BASE)).toBe('');
    expect(formatTimestamp('', 'relative', BASE)).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(formatTimestamp(null, 'relative', BASE)).toBe('');
    expect(formatTimestamp(undefined, 'relative', BASE)).toBe('');
  });

  it('returns empty string for unparseable strings (no throw)', () => {
    expect(() => formatTimestamp('not a date', 'iso', BASE)).not.toThrow();
    expect(formatTimestamp('not a date', 'iso', BASE)).toBe('');
    expect(formatTimestamp('not a date', 'local', BASE)).toBe('');
    expect(formatTimestamp('not a date', 'relative', BASE)).toBe('');
  });

  it('returns empty string for non-string values', () => {
    expect(formatTimestamp(123 as unknown as string, 'iso', BASE)).toBe('');
  });
});
