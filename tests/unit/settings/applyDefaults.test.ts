import { describe, expect, it } from 'vitest';
import { applyDefaults, DEFAULT_SETTINGS } from '@/lib/settings/types';

describe('applyDefaults — hiddenCategories', () => {
  it('defaults to empty array when missing', () => {
    const out = applyDefaults({});
    expect(out.hiddenCategories).toEqual([]);
  });

  it('accepts a valid subset of category names', () => {
    const out = applyDefaults({ hiddenCategories: ['tools', 'system'] });
    expect(out.hiddenCategories).toEqual(['tools', 'system']);
  });

  it('accepts an empty array explicitly', () => {
    const out = applyDefaults({ hiddenCategories: [] });
    expect(out.hiddenCategories).toEqual([]);
  });

  it('accepts all four canonical categories', () => {
    const all = ['user', 'assistant', 'tools', 'system'];
    const out = applyDefaults({ hiddenCategories: all });
    expect(out.hiddenCategories).toEqual(all);
  });

  it('rejects unknown category names and falls back to default', () => {
    const out = applyDefaults({ hiddenCategories: ['tools', 'trees'] });
    expect(out.hiddenCategories).toEqual(DEFAULT_SETTINGS.hiddenCategories);
  });

  it('rejects non-array values and falls back to default', () => {
    const out = applyDefaults({ hiddenCategories: 'tools' });
    expect(out.hiddenCategories).toEqual(DEFAULT_SETTINGS.hiddenCategories);
  });

  it('keeps other fields intact when hiddenCategories is corrupt', () => {
    const out = applyDefaults({
      viewerFontSize: 'lg',
      hiddenCategories: { tools: true },
    });
    expect(out.viewerFontSize).toBe('lg');
    expect(out.hiddenCategories).toEqual(DEFAULT_SETTINGS.hiddenCategories);
  });
});
