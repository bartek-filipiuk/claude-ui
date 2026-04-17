import { describe, expect, it } from 'vitest';
import {
  checkNodeVersion,
  detectOs,
  needsPathUpdate,
  pathRcSnippet,
  resolveHomeBinDir,
} from '@/lib/install/checks';

describe('detectOs', () => {
  it('accepts linux and darwin as supported', () => {
    expect(detectOs('linux').kind).toBe('supported');
    expect(detectOs('darwin').kind).toBe('supported');
  });

  it('flags win32 with a WSL hint', () => {
    const res = detectOs('win32');
    expect(res.kind).toBe('unsupported');
    if (res.kind === 'unsupported') {
      expect(res.hint.toLowerCase()).toContain('wsl');
    }
  });

  it('flags any other platform as unsupported', () => {
    const res = detectOs('openbsd');
    expect(res.kind).toBe('unsupported');
    if (res.kind === 'unsupported') {
      expect(res.hint).toContain('openbsd');
    }
  });
});

describe('checkNodeVersion', () => {
  it('passes for the current node when above the required floor', () => {
    expect(checkNodeVersion('20.11.0').ok).toBe(true);
    expect(checkNodeVersion('22.1.0').ok).toBe(true);
  });

  it('fails for nodes below the required minor', () => {
    const res = checkNodeVersion('20.10.9');
    expect(res.ok).toBe(false);
    expect(res.hint).toContain('Node 20.11.0+');
  });

  it('fails for fundamentally old majors', () => {
    expect(checkNodeVersion('18.20.0').ok).toBe(false);
    expect(checkNodeVersion('16.20.0').ok).toBe(false);
  });

  it('handles odd but valid version strings', () => {
    // pre-release gets stripped by parseInt — still treated as that major.minor.patch
    expect(checkNodeVersion('21.0.0-pre').ok).toBe(true);
  });
});

describe('resolveHomeBinDir', () => {
  it('always returns $HOME/.local/bin', () => {
    expect(resolveHomeBinDir('/home/bartek')).toBe('/home/bartek/.local/bin');
    expect(resolveHomeBinDir('/Users/bartek')).toBe('/Users/bartek/.local/bin');
  });
});

describe('needsPathUpdate', () => {
  it('returns true when PATH is undefined', () => {
    expect(needsPathUpdate('/home/u/.local/bin', undefined)).toBe(true);
  });

  it('returns true when the bin dir is missing from PATH', () => {
    expect(needsPathUpdate('/home/u/.local/bin', '/usr/bin:/bin')).toBe(true);
  });

  it('returns false when PATH already contains the bin dir', () => {
    expect(needsPathUpdate('/home/u/.local/bin', '/home/u/.local/bin:/usr/bin')).toBe(false);
  });

  it('is tolerant of trailing slashes on either side', () => {
    expect(needsPathUpdate('/home/u/.local/bin/', '/home/u/.local/bin:/usr/bin')).toBe(false);
    expect(needsPathUpdate('/home/u/.local/bin', '/home/u/.local/bin/:/usr/bin')).toBe(false);
  });
});

describe('pathRcSnippet', () => {
  it('formats a double-quoted export so the dir can contain spaces', () => {
    expect(pathRcSnippet('/home/u/.local/bin')).toBe('export PATH="/home/u/.local/bin:$PATH"');
  });
});
