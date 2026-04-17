import { describe, it, expect } from 'vitest';
import { isClaudeMdPath } from '@/lib/claude-md/write-guard';

describe('isClaudeMdPath — fuzz', () => {
  it('accepts a plain CLAUDE.md name', () => {
    expect(isClaudeMdPath('/tmp/proj/CLAUDE.md')).toBe(true);
    expect(isClaudeMdPath('CLAUDE.md')).toBe(true);
  });

  const rejected = [
    '',
    'CLAUDE.md\0',
    '/tmp/CLAUDE.md.bak',
    '/tmp/CLAUDE.md/inner',
    '/tmp/claude.md',
    '/tmp/settings.json',
    '/etc/passwd',
    '/tmp/CLAUDE.md.swp',
    'foo/CLAUDE.md.tmp',
    'CLAUDE.MD',
  ];
  it.each(rejected)('rejects %s', (p) => {
    expect(isClaudeMdPath(p)).toBe(false);
  });

  // Property-style: random printable strings that don't end with exactly "/CLAUDE.md" or "CLAUDE.md" → false
  it('100 random non-matching paths', () => {
    for (let i = 0; i < 100; i++) {
      const base = `file${i}.${['md', 'txt', 'json', 'sh', 'bak'][i % 5]}`;
      expect(isClaudeMdPath(`/tmp/x/${base}`)).toBe(false);
    }
  });
});
