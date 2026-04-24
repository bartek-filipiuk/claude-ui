import { describe, expect, it } from 'vitest';
import { IDLE_READY_MS, isReadyHybrid, markerMatches, stripAnsi } from '@/lib/pty/ready-check';

describe('stripAnsi', () => {
  it('removes common CSI sequences', () => {
    expect(stripAnsi('\x1b[31mhello\x1b[0m')).toBe('hello');
    expect(stripAnsi('\x1b[2J\x1b[H> ')).toBe('> ');
  });
  it('removes OSC sequences', () => {
    expect(stripAnsi('\x1b]0;title\x07text')).toBe('text');
  });
});

describe('markerMatches', () => {
  it('matches common shell prompts', () => {
    expect(markerMatches('user@host:~$ ')).toBe(true);
    expect(markerMatches('root@h:# ')).toBe(true);
  });
  it('matches Claude Code-like input line', () => {
    expect(markerMatches('│ > ')).toBe(true);
    expect(markerMatches('│ > _')).toBe(true);
  });
  it('returns false for streaming content', () => {
    expect(markerMatches('\x1b[31mThinking about it...')).toBe(false);
    expect(markerMatches('processing line 1\nprocessing line 2\n')).toBe(false);
  });
});

describe('isReadyHybrid', () => {
  it('returns true when last data is older than idle threshold', () => {
    const old = Date.now() - IDLE_READY_MS - 10;
    expect(isReadyHybrid('anything', old)).toBe(true);
  });
  it('returns true when marker matches even if recent', () => {
    const recent = Date.now();
    expect(isReadyHybrid('│ > ', recent)).toBe(true);
  });
  it('returns false for recent streaming content without marker', () => {
    const recent = Date.now();
    expect(isReadyHybrid('streaming... ', recent)).toBe(false);
  });
});
