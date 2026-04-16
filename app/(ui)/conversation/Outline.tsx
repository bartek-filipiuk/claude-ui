'use client';

import { useMemo } from 'react';
import {
  CATEGORY_MARKER_CLASS,
  categorizeEvent,
  eventBytes,
  eventPreview,
  markerHeightPx,
} from '@/lib/jsonl/outline';
import type { JsonlEvent } from '@/lib/jsonl/types';
import { cn } from '@/lib/utils';

type Pair = { ev: JsonlEvent; origIndex: number };

export type OutlineProps = {
  events: Pair[];
  /** Indices into `events` currently visible inside the viewer. */
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

  return (
    <div
      data-testid="session-outline"
      role="list"
      aria-label="Mapa sesji"
      className="hidden w-10 shrink-0 overflow-y-auto border-l border-neutral-800 bg-neutral-950 py-1 sm:block"
    >
      {markers.map((m, i) => {
        const inView = i >= visibleStart && i <= visibleEnd;
        return (
          <button
            key={i}
            type="button"
            role="listitem"
            data-testid={`outline-marker-${i}`}
            data-in-view={inView ? 'true' : 'false'}
            data-category={m.category}
            onClick={() => onJump(i)}
            title={m.preview || m.category}
            aria-label={`Wydarzenie ${i + 1}: ${m.preview || m.category}`}
            className={cn(
              'block w-full px-1.5 py-px text-left',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400',
            )}
          >
            <span
              className={cn(
                'block w-full rounded-sm transition-opacity',
                CATEGORY_MARKER_CLASS[m.category],
                inView ? 'opacity-100' : 'opacity-40 hover:opacity-80',
              )}
              style={{ height: `${m.height}px`, minHeight: '2px' }}
            />
          </button>
        );
      })}
    </div>
  );
}
