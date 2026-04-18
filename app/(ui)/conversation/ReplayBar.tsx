'use client';

import {
  REPLAY_SPEEDS,
  type ReplayControls,
  type ReplaySpeed,
  type ReplayState,
} from '@/hooks/use-replay';
import { CHButton } from '@/components/ui/ch-button';
import { IconPause, IconPlay } from '@/components/ui/icons';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const SPEED_LABEL: Record<ReplaySpeed, string> = {
  '1x': '1x',
  '2x': '2x',
  '5x': '5x',
  timestamps: 'real',
};

function formatClock(total: number, revealed: number): { current: string; end: string } {
  const pct = total === 0 ? 0 : revealed / total;
  return {
    current: `${revealed}/${total}`,
    end: `${Math.round(pct * 100)}%`,
  };
}

export function ReplayBar({ state, controls }: { state: ReplayState; controls: ReplayControls }) {
  const atEnd = state.revealed >= state.total && state.total > 0;
  const percent = state.total === 0 ? 0 : Math.round((state.revealed / state.total) * 100);
  const clock = formatClock(state.total, state.revealed);

  return (
    <div className="replay" role="region" aria-label="Replay mode controls">
      <Badge variant="gold">● REPLAY</Badge>

      {atEnd ? (
        <CHButton size="sm" onClick={controls.reset} title="Replay from start">
          ↻ restart
        </CHButton>
      ) : (
        <CHButton
          size="sm"
          onClick={controls.toggle}
          aria-label={state.playing ? 'Pause' : 'Play'}
          title={state.playing ? 'Pause (Space)' : 'Play (Space)'}
          style={{ color: 'var(--gold-200)' }}
        >
          {state.playing ? <IconPause /> : <IconPlay />}
          <span style={{ marginLeft: 4 }}>{state.playing ? 'pause' : 'play'}</span>
        </CHButton>
      )}

      <div className="scrubwrap">
        <span className="t">{clock.current}</span>
        <div
          className="scrub"
          role="slider"
          aria-label="Playback progress"
          aria-valuemin={0}
          aria-valuemax={state.total}
          aria-valuenow={state.revealed}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
            controls.setRevealed(Math.round(ratio * state.total));
          }}
        >
          <div className="filled" style={{ width: `${percent}%` }} />
          <div className="knob" style={{ left: `${percent}%` }} />
        </div>
        <span className="t" style={{ textAlign: 'right' }}>
          {clock.end}
        </span>
      </div>

      <div className="speed" role="group" aria-label="Playback speed">
        {REPLAY_SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className={cn(state.speed === s && 'on')}
            onClick={() => controls.setSpeed(s)}
            aria-pressed={state.speed === s}
          >
            {SPEED_LABEL[s]}
          </button>
        ))}
      </div>

      <CHButton
        size="sm"
        variant="outline"
        onClick={controls.exit}
        title="Exit Replay mode"
        style={{ borderColor: 'var(--gold-800)', color: 'var(--gold-300)' }}
      >
        exit
      </CHButton>
    </div>
  );
}
