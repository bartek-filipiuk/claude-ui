import { describe, expect, it } from 'vitest';
import { computeStepDelay, REPLAY_SPEEDS } from '@/hooks/use-replay';
import type { JsonlEvent } from '@/lib/jsonl/types';

function userEv(ts: string): JsonlEvent {
  // Minimal valid "user" event shape for testing; timestamp drives delay math.
  return {
    type: 'user',
    timestamp: ts,
    message: { role: 'user', content: 'x' },
  } as JsonlEvent;
}

describe('REPLAY_SPEEDS', () => {
  it('contains the four supported values in the expected order', () => {
    expect(REPLAY_SPEEDS).toEqual(['1x', '2x', '5x', 'timestamps']);
  });
});

describe('computeStepDelay', () => {
  const events = [
    userEv('2026-04-16T12:00:00.000Z'),
    userEv('2026-04-16T12:00:00.300Z'),
    userEv('2026-04-16T12:00:05.000Z'),
  ];

  it('1x returns 500 ms per step regardless of gap', () => {
    expect(computeStepDelay(events, 1, '1x')).toBe(500);
    expect(computeStepDelay(events, 2, '1x')).toBe(500);
  });

  it('2x halves the interval', () => {
    expect(computeStepDelay(events, 1, '2x')).toBe(250);
  });

  it('5x gives 100 ms steps', () => {
    expect(computeStepDelay(events, 1, '5x')).toBe(100);
  });

  it('timestamps uses the real gap, clamped to the min floor', () => {
    // gap 300 ms → passes through
    expect(computeStepDelay(events, 1, 'timestamps')).toBe(300);
  });

  it('timestamps clamps long quiet patches to the 2 s ceiling', () => {
    // gap 4.7 s → clamped to 2000
    expect(computeStepDelay(events, 2, 'timestamps')).toBe(2000);
  });

  it('timestamps floors zero / negative gaps to 50 ms', () => {
    const same = [userEv('2026-04-16T12:00:00.000Z'), userEv('2026-04-16T12:00:00.000Z')];
    expect(computeStepDelay(same, 1, 'timestamps')).toBe(50);
  });

  it('timestamps falls back to 500 ms when timestamps are missing', () => {
    const noTs: JsonlEvent[] = [
      { type: 'user', message: { role: 'user', content: 'a' } } as JsonlEvent,
      { type: 'user', message: { role: 'user', content: 'b' } } as JsonlEvent,
    ];
    expect(computeStepDelay(noTs, 1, 'timestamps')).toBe(500);
  });
});
