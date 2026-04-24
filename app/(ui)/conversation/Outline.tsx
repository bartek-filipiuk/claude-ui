'use client';

import { useMemo } from 'react';
import {
  categorizeEvent,
  eventBytes,
  eventPreview,
  markerHeightPx,
  type EventCategory,
} from '@/lib/jsonl/outline';
import type { JsonlEvent } from '@/lib/jsonl/types';

type Pair = { ev: JsonlEvent; origIndex: number };

const CATEGORY_CLASS: Record<EventCategory, string> = {
  user: 'user',
  assistant: 'assistant',
  tools: 'tool',
  system: 'system',
};

export type OutlineProps = {
  events: Pair[];
  visibleStart: number;
  visibleEnd: number;
  onJump: (visibleIdx: number) => void;
};

export function Outline({ events, visibleStart, visibleEnd, onJump }: OutlineProps) {
  const markers = useMemo(
    () =>
      events.map((p) => ({
        category: categorizeEvent(p.ev),
        height: markerHeightPx(eventBytes(p.ev)),
        preview: eventPreview(p.ev),
      })),
    [events],
  );

  if (events.length === 0) return null;

  const total = Math.max(1, events.length);
  const top = (visibleStart / total) * 100;
  const height = Math.max(4, ((visibleEnd - visibleStart + 1) / total) * 100);

  return (
    <div data-testid="session-outline" role="list" aria-label="Session map" className="outline">
      <div className="viewport" style={{ top: `${top}%`, height: `${height}%` }} />
      {markers.map((m, i) => (
        <button
          key={i}
          type="button"
          role="listitem"
          data-testid={`outline-marker-${i}`}
          data-in-view={i >= visibleStart && i <= visibleEnd ? 'true' : 'false'}
          data-category={m.category}
          onClick={() => onJump(i)}
          title={m.preview || m.category}
          aria-label={`Event ${i + 1}: ${m.preview || m.category}`}
          className={`mk ${CATEGORY_CLASS[m.category]}`}
          style={{ height: `${m.height}px`, minHeight: 2 }}
        />
      ))}
    </div>
  );
}
