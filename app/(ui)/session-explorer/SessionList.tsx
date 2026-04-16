'use client';

import { useSessions, type SessionSummary } from '@/hooks/use-sessions';
import { useUiStore } from '@/stores/ui-slice';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { timeAgo, formatBytes } from '@/lib/ui/format';
import { cn } from '@/lib/utils';

export function SessionList() {
  const slug = useUiStore((s) => s.selectedProjectSlug);
  const selectedId = useUiStore((s) => s.selectedSessionId);
  const setSelected = useUiStore((s) => s.setSelectedSession);
  const { data, isLoading, isError, refetch } = useSessions(slug);

  if (!slug) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-neutral-500">
        Wybierz projekt z listy po lewej.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-start gap-2 p-4 text-sm text-red-400">
        <p>Nie udało się załadować sesji.</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Ponów
        </Button>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="p-6 text-sm text-neutral-500">Brak sesji w tym projekcie (jeszcze).</div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <ul className="flex flex-col gap-2 p-4" role="list">
        {data.map((s) => (
          <SessionItem
            key={s.id}
            session={s}
            active={s.id === selectedId}
            onSelect={() => setSelected(s.id)}
          />
        ))}
      </ul>
    </ScrollArea>
  );
}

function SessionItem({
  session,
  active,
  onSelect,
}: {
  session: SessionSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'flex w-full flex-col gap-1 rounded-md border border-neutral-800 bg-neutral-900/60 p-3 text-left transition-colors hover:border-neutral-700',
          active && 'border-neutral-500 bg-neutral-900',
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] text-neutral-400">{session.id.slice(0, 8)}…</span>
          <span className="text-[11px] text-neutral-500">{timeAgo(session.mtime)}</span>
        </div>
        {session.firstUserPreview && (
          <p className="line-clamp-2 text-sm text-neutral-200">{session.firstUserPreview}</p>
        )}
        <div className="flex items-center gap-3 text-[11px] text-neutral-500">
          <span>{session.messageCount ?? '—'} wiadomości</span>
          <span>•</span>
          <span>{formatBytes(session.size)}</span>
        </div>
      </button>
    </li>
  );
}
