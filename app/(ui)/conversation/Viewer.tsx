'use client';

import { useMemo, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { useSessionStream } from '@/hooks/use-session-stream';
import { useUiStore } from '@/stores/ui-slice';
import { searchInEvents } from '@/lib/jsonl/search';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { renderEvent } from '@/components/conversation/messages';
import { cn } from '@/lib/utils';

export function Viewer() {
  const slug = useUiStore((s) => s.selectedProjectSlug);
  const sessionId = useUiStore((s) => s.selectedSessionId);
  const { events, loading, error, done, bytes } = useSessionStream(slug, sessionId);
  const [query, setQuery] = useState('');
  const [hitIndex, setHitIndex] = useState(0);
  const [follow, setFollow] = useState(true);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const hits = useMemo(() => searchInEvents(events, query, { limit: 200 }), [events, query]);

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-neutral-500">
        Wybierz sesję z listy.
      </div>
    );
  }

  const goToHit = (nextIdx: number) => {
    if (hits.length === 0) return;
    const idx = ((nextIdx % hits.length) + hits.length) % hits.length;
    setHitIndex(idx);
    const hit = hits[idx];
    if (hit) virtuosoRef.current?.scrollToIndex({ index: hit.eventIndex, align: 'center' });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-4 py-2">
        <div className="relative flex-1">
          <Input
            type="search"
            placeholder="Szukaj w sesji…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHitIndex(0);
            }}
            aria-label="Szukaj w sesji"
          />
          {query && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-neutral-500">
              {hits.length === 0 ? '0' : `${hitIndex + 1}/${hits.length}`}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => goToHit(hitIndex - 1)}
          disabled={hits.length === 0}
        >
          ↑
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => goToHit(hitIndex + 1)}
          disabled={hits.length === 0}
        >
          ↓
        </Button>
        <Button
          size="sm"
          variant={follow ? 'secondary' : 'outline'}
          onClick={() => setFollow((f) => !f)}
          aria-pressed={follow}
          title="Automatyczne przewijanie do najnowszej wiadomości"
        >
          {follow ? 'Follow: on' : 'Follow: off'}
        </Button>
        <span className="text-[10px] text-neutral-500">
          {events.length} · {(bytes / 1024).toFixed(1)} KB {loading && !done && '…'}
        </span>
      </div>

      {error && (
        <div className="border-b border-red-900 bg-red-900/20 px-4 py-2 text-sm text-red-300">
          Błąd: {error}
        </div>
      )}

      <div className="min-h-0 flex-1">
        {events.length === 0 && loading ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            className={cn('h-full')}
            data={events}
            followOutput={follow ? 'smooth' : false}
            atBottomThreshold={120}
            itemContent={(index, ev) => <div className="px-4 py-1.5">{renderEvent(ev, index)}</div>}
          />
        )}
      </div>
    </div>
  );
}
