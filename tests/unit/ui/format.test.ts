import { describe, it, expect, vi, afterEach } from 'vitest';
import { timeAgo, formatBytes } from '@/lib/ui/format';

describe('timeAgo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('zwraca "teraz" dla < 5 s', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-04-16T12:00:02Z'));
    expect(timeAgo('2026-04-16T12:00:00Z')).toBe('teraz');
  });

  it('zwraca sekundy dla < 1 min', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-04-16T12:00:30Z'));
    expect(timeAgo('2026-04-16T12:00:00Z')).toBe('30 s temu');
  });

  it('zwraca minuty', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-04-16T12:05:00Z'));
    expect(timeAgo('2026-04-16T12:00:00Z')).toBe('5 min temu');
  });

  it('zwraca godziny', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-04-16T15:00:00Z'));
    expect(timeAgo('2026-04-16T12:00:00Z')).toBe('3 h temu');
  });

  it('zwraca dni', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-04-19T12:00:00Z'));
    expect(timeAgo('2026-04-16T12:00:00Z')).toBe('3 d temu');
  });

  it('— dla null', () => {
    expect(timeAgo(null)).toBe('—');
  });

  it('— dla invalid', () => {
    expect(timeAgo('not a date')).toBe('—');
  });
});

describe('formatBytes', () => {
  it('B', () => {
    expect(formatBytes(512)).toBe('512 B');
  });
  it('KB', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });
  it('MB', () => {
    expect(formatBytes(5_000_000)).toBe('4.8 MB');
  });
  it('GB', () => {
    expect(formatBytes(3_000_000_000)).toBe('2.79 GB');
  });
});
