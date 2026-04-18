'use client';

import { useMemo } from 'react';
import type { JsonlEvent } from '@/lib/jsonl/types';
import {
  computeSessionStats,
  formatDuration,
  formatTokens,
  type SessionStats,
} from '@/lib/jsonl/stats';

interface StatsBarProps {
  events: JsonlEvent[];
}

function topTools(stats: SessionStats): string {
  if (stats.toolCounts.length === 0) return '—';
  return stats.toolCounts
    .slice(0, 3)
    .map((t) => `${t.name}×${t.count}`)
    .join(' ');
}

export function StatsBar({ events }: StatsBarProps) {
  const stats = useMemo(() => computeSessionStats(events), [events]);
  const tokens =
    stats.inputTokens || stats.outputTokens
      ? `${formatTokens(stats.inputTokens)} / ${formatTokens(stats.outputTokens)}`
      : '—';
  const totalTokens = stats.totalTokens > 0 ? formatTokens(stats.totalTokens) : '—';

  return (
    <div className="meta-strip" data-testid="stats-bar">
      <span className="kv">
        <span className="k">Duration</span>
        <span className="v">{formatDuration(stats.durationMs)}</span>
      </span>
      <span className="kv">
        <span className="k">Events</span>
        <span className="v">{stats.eventCount}</span>
      </span>
      <span className="kv">
        <span className="k">In / Out</span>
        <span className="v">{tokens}</span>
      </span>
      <span className="kv">
        <span className="k">Tokens</span>
        <span className="v gold">{totalTokens}</span>
      </span>
      <span className="kv">
        <span className="k">Top tools</span>
        <span className="v">{topTools(stats)}</span>
      </span>
    </div>
  );
}
