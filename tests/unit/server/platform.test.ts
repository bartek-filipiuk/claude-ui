import { describe, expect, it } from 'vitest';
import {
  chromiumCandidates,
  defaultShell,
  findChromium,
  isLinux,
  isMacOS,
  isSupportedPlatform,
  runtimeRootDir,
} from '@/lib/server/platform';

describe('defaultShell', () => {
  it('prefers $SHELL when it is an absolute path', () => {
    expect(defaultShell({ SHELL: '/usr/local/bin/fish' }, 'linux')).toBe('/usr/local/bin/fish');
    expect(defaultShell({ SHELL: '/bin/zsh' }, 'darwin')).toBe('/bin/zsh');
  });

  it('ignores a relative $SHELL (never resolves via PATH lookup)', () => {
    expect(defaultShell({ SHELL: 'zsh' }, 'darwin')).toBe('/bin/zsh');
    expect(defaultShell({ SHELL: 'bash' }, 'linux')).toBe('/bin/bash');
  });

  it('falls back to zsh on macOS when $SHELL is missing', () => {
    expect(defaultShell({}, 'darwin')).toBe('/bin/zsh');
  });

  it('falls back to bash on linux when $SHELL is missing', () => {
    expect(defaultShell({}, 'linux')).toBe('/bin/bash');
  });
});

describe('runtimeRootDir', () => {
  it('prefers $XDG_RUNTIME_DIR when present and existing', () => {
    // /tmp exists on every Unix test runner and stands in for XDG.
    const dir = runtimeRootDir({ XDG_RUNTIME_DIR: '/tmp', TMPDIR: '/tmp' });
    expect(dir).toBe('/tmp');
  });

  it('falls back to $TMPDIR on macOS where XDG is unset', () => {
    const dir = runtimeRootDir({ TMPDIR: '/tmp' });
    expect(dir).toBe('/tmp');
  });

  it('always returns a non-empty path when the env is empty', () => {
    const dir = runtimeRootDir({});
    expect(typeof dir).toBe('string');
    expect(dir.length).toBeGreaterThan(0);
  });
});

describe('chromiumCandidates', () => {
  it('honours CLAUDE_UI_CHROMIUM override as the first candidate', () => {
    const list = chromiumCandidates({ CLAUDE_UI_CHROMIUM: '/opt/brave/brave' }, 'linux');
    expect(list[0]).toBe('/opt/brave/brave');
  });

  it('lists macOS app bundle paths under /Applications on darwin', () => {
    const list = chromiumCandidates({}, 'darwin');
    expect(list.every((p) => p.startsWith('/'))).toBe(true);
    expect(list.some((p) => p.includes('/Applications/Google Chrome.app/'))).toBe(true);
    expect(list.some((p) => p.includes('/Applications/Chromium.app/'))).toBe(true);
  });

  it('lists absolute Linux binary paths on linux', () => {
    const list = chromiumCandidates({}, 'linux');
    expect(list.every((p) => p.startsWith('/'))).toBe(true);
    expect(list).toEqual(
      expect.arrayContaining(['/usr/bin/chromium', '/usr/bin/google-chrome-stable']),
    );
    // No macOS-specific paths leak into the Linux list.
    expect(list.some((p) => p.includes('/Applications/'))).toBe(false);
  });

  it('skips empty overrides without crashing', () => {
    const list = chromiumCandidates({ CLAUDE_UI_CHROMIUM: '' }, 'linux');
    expect(list[0]).toBe('/usr/bin/chromium');
  });
});

describe('findChromium', () => {
  it('returns null when no candidate is executable', () => {
    const res = findChromium(['/nonexistent/one', '/nonexistent/two']);
    expect(res).toBeNull();
  });

  it('returns the first existing + executable candidate (falls back after misses)', () => {
    // /bin/sh is guaranteed to exist and be executable on any POSIX host.
    // realpathSync may resolve it to dash/bash, so only assert a resolved path.
    const res = findChromium(['/nonexistent/one', '/bin/sh']);
    expect(res).toBeTruthy();
    expect(res?.startsWith('/')).toBe(true);
  });
});

describe('platform predicates', () => {
  it('isMacOS + isLinux are mutually exclusive on supported hosts', () => {
    // Whatever host runs the test, at most one can be true.
    expect(Number(isMacOS()) + Number(isLinux())).toBeLessThanOrEqual(1);
  });

  it('isSupportedPlatform matches the or of isMacOS / isLinux', () => {
    expect(isSupportedPlatform()).toBe(isMacOS() || isLinux());
  });
});
