'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { JsonlEvent } from '@/lib/jsonl/types';

/**
 * Replay mode speed. Constants tune per-step interval; "timestamps" uses the
 * actual mtime gap between adjacent events, clamped so a 10-minute quiet
 * patch doesn't stall the playback.
 */
export type ReplaySpeed = '1x' | '2x' | '5x' | 'timestamps';

export const REPLAY_SPEEDS: ReplaySpeed[] = ['1x', '2x', '5x', 'timestamps'];

const BASE_INTERVAL_MS = 500;
const SPEED_DIVIDER: Record<Exclude<ReplaySpeed, 'timestamps'>, number> = {
  '1x': 1,
  '2x': 2,
  '5x': 5,
};
const TIMESTAMP_MIN_MS = 50;
const TIMESTAMP_MAX_MS = 2000;

export interface ReplayState {
  active: boolean;
  playing: boolean;
  speed: ReplaySpeed;
  revealed: number;
  total: number;
}

export interface ReplayControls {
  start: () => void;
  exit: () => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  setSpeed: (speed: ReplaySpeed) => void;
  setRevealed: (n: number) => void;
  reset: () => void;
}

function extractTimestampMs(ev: JsonlEvent | undefined): number | null {
  if (!ev) return null;
  const ts = ev.timestamp;
  if (!ts) return null;
  const parsed = Date.parse(ts);
  return Number.isFinite(parsed) ? parsed : null;
}

export function computeStepDelay(
  events: readonly JsonlEvent[],
  nextIndex: number,
  speed: ReplaySpeed,
): number {
  if (speed !== 'timestamps') {
    return BASE_INTERVAL_MS / SPEED_DIVIDER[speed];
  }
  const prev = extractTimestampMs(events[nextIndex - 1]);
  const next = extractTimestampMs(events[nextIndex]);
  if (prev == null || next == null) return BASE_INTERVAL_MS;
  const gap = next - prev;
  if (!Number.isFinite(gap) || gap <= 0) return TIMESTAMP_MIN_MS;
  return Math.max(TIMESTAMP_MIN_MS, Math.min(TIMESTAMP_MAX_MS, gap));
}

export function useReplay(events: readonly JsonlEvent[]): [ReplayState, ReplayControls] {
  const total = events.length;
  const [active, setActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState<ReplaySpeed>('2x');
  const [revealed, setRevealedState] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If the event list shrinks (user switches session), keep revealed in range.
  // setState is deferred so we don't trigger "Calling setState in effect" lint.
  useEffect(() => {
    queueMicrotask(() => {
      setRevealedState((prev) => (prev > total ? total : prev));
    });
  }, [total]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Playback engine: schedules the next reveal based on current speed. All
  // state writes happen inside timers (async) — none are synchronous in the
  // effect body, which keeps react-hooks/set-state-in-effect happy.
  useEffect(() => {
    if (!active || !playing) {
      clearTimer();
      return;
    }
    if (revealed >= total) {
      clearTimer();
      queueMicrotask(() => setPlaying(false));
      return;
    }
    const delay = computeStepDelay(events, revealed, speed);
    timerRef.current = setTimeout(() => {
      setRevealedState((v) => Math.min(total, v + 1));
    }, delay);
    return clearTimer;
  }, [active, playing, speed, revealed, total, events, clearTimer]);

  const start = useCallback(() => {
    setActive(true);
    setPlaying(true);
    setRevealedState((prev) => (prev === 0 ? 1 : prev));
  }, []);

  const exit = useCallback(() => {
    clearTimer();
    setActive(false);
    setPlaying(false);
  }, [clearTimer]);

  const play = useCallback(() => {
    if (total === 0) return;
    setActive(true);
    setPlaying(true);
    setRevealedState((prev) => (prev === 0 ? 1 : prev));
  }, [total]);

  const pause = useCallback(() => {
    setPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    setPlaying((p) => !p);
  }, []);

  const setSpeed = useCallback((s: ReplaySpeed) => {
    setSpeedState(s);
  }, []);

  const setRevealed = useCallback(
    (n: number) => {
      const clamped = Math.max(0, Math.min(total, Math.floor(n)));
      setRevealedState(clamped);
      // Scrubbing pauses automatically — the user just took manual control.
      setPlaying(false);
    },
    [total],
  );

  const reset = useCallback(() => {
    setRevealedState(0);
    setPlaying(false);
  }, []);

  return [
    { active, playing, speed, revealed, total },
    { start, exit, play, pause, toggle, setSpeed, setRevealed, reset },
  ];
}
