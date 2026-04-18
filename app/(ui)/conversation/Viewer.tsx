'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '@/hooks/use-settings';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { useSessionStream } from '@/hooks/use-session-stream';
import { useUiStore } from '@/stores/ui-slice';
import { searchInEvents } from '@/lib/jsonl/search';
import { Skeleton } from '@/components/ui/skeleton';
import { CHButton } from '@/components/ui/ch-button';
import { IconSearch } from '@/components/ui/icons';
import { renderEvent } from '@/components/conversation/messages';
import type { JsonlEvent } from '@/lib/jsonl/types';
import {
  categorizeEvent as categorize,
  EVENT_CATEGORIES as ALL_CATEGORIES,
  type EventCategory as Category,
} from '@/lib/jsonl/outline';
import { buildToolUseRegistry, buildParentToolUseRegistry } from '@/lib/jsonl/tool-pairs';
import { parseJumpQuery } from '@/lib/jsonl/jump';
import { Outline } from './Outline';
import { StatsBar } from './StatsBar';
import { ReplayBar } from './ReplayBar';
import { useReplay } from '@/hooks/use-replay';
import { toastError } from '@/lib/ui/toast';
import { cn } from '@/lib/utils';

const CATEGORY_LABEL: Record<Category, string> = {
  user: 'User',
  assistant: 'Assistant',
  tools: 'Tools',
  system: 'System',
};

export function Viewer() {
  const slug = useUiStore((s) => s.selectedProjectSlug);
  const sessionId = useUiStore((s) => s.selectedSessionId);
  const pendingEventIndex = useUiStore((s) => s.pendingEventIndex);
  const consumePendingEvent = useUiStore((s) => s.consumePendingEvent);
  const { events, loading, error, done, bytes } = useSessionStream(slug, sessionId);
  const { data: settings } = useSettings();
  const settingsHiddenKey = (settings?.hiddenCategories ?? []).slice().sort().join(',');
  const [query, setQuery] = useState('');
  const [hitIndex, setHitIndex] = useState(0);
  const [jumpQuery, setJumpQuery] = useState('');
  const [follow, setFollow] = useState(true);
  const [hidden, setHidden] = useState<Set<Category>>(
    () => new Set(settings?.hiddenCategories ?? []),
  );

  useEffect(() => {
    setHidden(new Set(settings?.hiddenCategories ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, settingsHiddenKey]);
  const [onlyHits, setOnlyHits] = useState(false);
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const [replayState, replayControls] = useReplay(events);

  const categoryCounts = useMemo(() => {
    const counts: Record<Category, number> = { user: 0, assistant: 0, tools: 0, system: 0 };
    for (const ev of events) counts[categorize(ev)]++;
    return counts;
  }, [events]);

  const toolUseRegistry = useMemo(() => buildToolUseRegistry(events), [events]);
  const parentToolUseRegistry = useMemo(() => buildParentToolUseRegistry(events), [events]);

  const hits = useMemo(() => searchInEvents(events, query, { limit: 500 }), [events, query]);
  const hitEventIndexSet = useMemo(() => new Set(hits.map((h) => h.eventIndex)), [hits]);

  useEffect(() => {
    if (pendingEventIndex == null) return;
    if (pendingEventIndex >= events.length) return;
    const target = pendingEventIndex;
    queueMicrotask(() => {
      setFollow(false);
      setHidden((prev) => (prev.size === 0 ? prev : new Set()));
      setOnlyHits((prev) => (prev ? false : prev));
      queueMicrotask(() => {
        virtuosoRef.current?.scrollToIndex({ index: target, align: 'center' });
        consumePendingEvent();
      });
    });
  }, [pendingEventIndex, events.length, consumePendingEvent]);

  const visibleEvents = useMemo(() => {
    const cap = replayState.active ? replayState.revealed : events.length;
    const out: { ev: JsonlEvent; origIndex: number }[] = [];
    for (let i = 0; i < cap; i++) {
      const ev = events[i];
      if (!ev) continue;
      if (hidden.has(categorize(ev))) continue;
      if (onlyHits && query && !hitEventIndexSet.has(i)) continue;
      out.push({ ev, origIndex: i });
    }
    return out;
  }, [events, hidden, onlyHits, query, hitEventIndexSet, replayState.active, replayState.revealed]);

  useEffect(() => {
    if (!replayState.active || !replayState.playing) return;
    if (visibleEvents.length === 0) return;
    virtuosoRef.current?.scrollToIndex({
      index: visibleEvents.length - 1,
      align: 'end',
      behavior: 'auto',
    });
  }, [replayState.active, replayState.playing, visibleEvents.length]);

  useEffect(() => {
    if (!replayState.active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.code !== 'Space') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      e.preventDefault();
      replayControls.toggle();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [replayState.active, replayControls]);

  if (!sessionId) {
    return (
      <div
        className="flex h-full items-center justify-center p-8 text-sm"
        style={{ color: 'var(--fg-3)' }}
      >
        Pick a session to start.
      </div>
    );
  }

  const toggleCategory = (c: Category) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const handleJump = () => {
    const idx = parseJumpQuery(jumpQuery, events);
    if (idx == null) {
      toastError('Unrecognised. Use an event number (42) or an offset (5m, 1h30m).');
      return;
    }
    const visibleIdx = visibleEvents.findIndex((v) => v.origIndex === idx);
    const target = visibleIdx >= 0 ? visibleIdx : Math.min(idx, visibleEvents.length - 1);
    if (target < 0) return;
    virtuosoRef.current?.scrollToIndex({ index: target, align: 'center' });
  };

  const goToHit = (nextIdx: number) => {
    if (hits.length === 0) return;
    const idx = ((nextIdx % hits.length) + hits.length) % hits.length;
    setHitIndex(idx);
    const hit = hits[idx];
    if (!hit) return;
    const visibleIdx = visibleEvents.findIndex((v) => v.origIndex === hit.eventIndex);
    if (visibleIdx >= 0) {
      virtuosoRef.current?.scrollToIndex({ index: visibleIdx, align: 'center' });
    }
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{
        fontSize: 'var(--ui-viewer-font-size, var(--viewer-size, 13.5px))',
        lineHeight: 'var(--ui-viewer-line-height, var(--viewer-line, 1.55))',
      }}
    >
      <StatsBar events={events} />

      <div className="viewer-toolbar">
        <div className="search-wrap">
          <span className="icon">
            <IconSearch />
          </span>
          <input
            type="search"
            className="ch-input"
            placeholder="Search in session"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHitIndex(0);
            }}
            aria-label="Search in session"
          />
          {query && (
            <span className="hits">
              {hits.length === 0 ? '0' : `${hitIndex + 1}/${hits.length}`}
            </span>
          )}
        </div>
        <CHButton
          variant="outline"
          size="icon"
          onClick={() => goToHit(hitIndex - 1)}
          disabled={hits.length === 0}
          title="Previous match"
        >
          ↑
        </CHButton>
        <CHButton
          variant="outline"
          size="icon"
          onClick={() => goToHit(hitIndex + 1)}
          disabled={hits.length === 0}
          title="Next match"
        >
          ↓
        </CHButton>
        <CHButton
          variant={onlyHits ? 'on' : 'outline'}
          onClick={() => setOnlyHits((v) => !v)}
          disabled={!query}
          title="Show only matches"
          size="sm"
        >
          only hits
        </CHButton>
        <div style={{ flex: 1 }} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleJump();
          }}
          className="flex items-center gap-1"
        >
          <input
            type="text"
            className="ch-input sm plain"
            value={jumpQuery}
            onChange={(e) => setJumpQuery(e.target.value)}
            placeholder="jump · 42 · 5m · 1h30m"
            style={{ width: 170 }}
            aria-label="Jump to event"
            title="Event number (42) or offset from the session start (5m, 1h30m)"
          />
        </form>
        <CHButton
          variant={follow ? 'on' : 'outline'}
          size="sm"
          onClick={() => setFollow((f) => !f)}
          aria-pressed={follow}
          disabled={replayState.active}
          title={
            replayState.active
              ? 'Follow is disabled in Replay mode'
              : 'Auto-scroll to the newest message'
          }
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: follow ? 'var(--gold-400)' : 'var(--fg-4)',
              boxShadow: follow ? '0 0 6px var(--gold-glow)' : 'none',
            }}
          />
          Follow {follow ? 'on' : 'off'}
        </CHButton>
        <CHButton
          variant={replayState.active ? 'on' : 'outline'}
          size="sm"
          onClick={() => (replayState.active ? replayControls.exit() : replayControls.start())}
          disabled={events.length === 0}
          title="Replay the session event by event"
        >
          {replayState.active ? '◼ exit replay' : '▶ replay'}
        </CHButton>
      </div>

      {replayState.active && <ReplayBar state={replayState} controls={replayControls} />}

      <div className="viewer-filters">
        {ALL_CATEGORIES.map((c) => {
          const on = !hidden.has(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => toggleCategory(c)}
              className={cn('chip', on && 'on')}
              aria-pressed={on}
            >
              <span>{CATEGORY_LABEL[c]}</span>
              <span className="count">{categoryCounts[c]}</span>
            </button>
          );
        })}
        <div className="spacer" />
        <span className="stat">
          {visibleEvents.length}/{events.length} events · {(bytes / 1024).toFixed(1)} KB{' '}
          {loading && !done && '…'}
        </span>
      </div>

      {error && (
        <div
          style={{
            borderBottom: '1px solid var(--red-bg)',
            background: 'var(--red-bg)',
            padding: '8px 16px',
            fontSize: 12,
            color: 'var(--red)',
          }}
        >
          Error: {error}
        </div>
      )}

      <div className="viewer-body">
        <div className="viewer-list">
          {events.length === 0 && loading ? (
            <div className="flex flex-col gap-3 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : visibleEvents.length === 0 ? (
            <div
              className="flex h-full items-center justify-center p-8 text-sm"
              style={{ color: 'var(--fg-3)' }}
            >
              No event matches the current filters.
            </div>
          ) : (
            <Virtuoso
              ref={virtuosoRef}
              style={{ height: '100%' }}
              data={visibleEvents}
              followOutput={follow ? 'smooth' : false}
              atBottomThreshold={120}
              rangeChanged={({ startIndex, endIndex }) =>
                setVisibleRange({ start: startIndex, end: endIndex })
              }
              itemContent={(_index, pair) =>
                renderEvent(pair.ev, pair.origIndex, toolUseRegistry, parentToolUseRegistry)
              }
            />
          )}
        </div>
        {visibleEvents.length > 0 && (
          <Outline
            events={visibleEvents}
            visibleStart={visibleRange.start}
            visibleEnd={visibleRange.end}
            onJump={(idx) => virtuosoRef.current?.scrollToIndex({ index: idx, align: 'center' })}
          />
        )}
      </div>
    </div>
  );
}
