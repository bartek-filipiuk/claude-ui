// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  LAYOUT_STORAGE_KEY,
  isProjectGrouping,
  loadLayout,
  patchLayout,
} from '@/lib/ui/layout-storage';

beforeEach(() => {
  window.localStorage.clear();
});

describe('layout-storage projectGrouping', () => {
  it('defaults to undefined when never set', () => {
    expect(loadLayout().projectGrouping).toBeUndefined();
  });

  it('round-trips "prefix" through localStorage (persists across restart)', () => {
    patchLayout({ projectGrouping: 'prefix' });
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    expect(raw).not.toBeNull();
    // Simulate restart: new read from storage.
    expect(loadLayout().projectGrouping).toBe('prefix');
  });

  it('round-trips "flat" through localStorage', () => {
    patchLayout({ projectGrouping: 'flat' });
    expect(loadLayout().projectGrouping).toBe('flat');
  });

  it('ignores unknown values', () => {
    window.localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ projectGrouping: 'tree' }),
    );
    expect(loadLayout().projectGrouping).toBeUndefined();
  });

  it('isProjectGrouping type guard', () => {
    expect(isProjectGrouping('flat')).toBe(true);
    expect(isProjectGrouping('prefix')).toBe(true);
    expect(isProjectGrouping('')).toBe(false);
    expect(isProjectGrouping(null)).toBe(false);
    expect(isProjectGrouping(42)).toBe(false);
  });
});

describe('layout-storage groupOpen', () => {
  it('persists per-group open state', () => {
    patchLayout({ groupOpen: { 'main-projects': false, 'client-projects': true } });
    expect(loadLayout().groupOpen).toEqual({
      'main-projects': false,
      'client-projects': true,
    });
  });

  it('drops non-boolean entries defensively', () => {
    window.localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ groupOpen: { a: true, b: 'yes', c: false } }),
    );
    expect(loadLayout().groupOpen).toEqual({ a: true, c: false });
  });
});
