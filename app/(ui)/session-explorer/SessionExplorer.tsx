'use client';

import { useMemo, useState } from 'react';
import { useUiStore } from '@/stores/ui-slice';
import { useProjects } from '@/hooks/use-projects';
import { useAliases, useSetAlias } from '@/hooks/use-aliases';
import { useSessions, type SessionSummary } from '@/hooks/use-sessions';
import { useOpenSession } from '@/hooks/use-open-session';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { CHButton } from '@/components/ui/ch-button';
import { Badge } from '@/components/ui/badge';
import { IconEdit, IconPlus } from '@/components/ui/icons';
import { timeAgo, formatBytes } from '@/lib/ui/format';
import { formatUsd } from '@/lib/jsonl/usage';
import { toastError, toastSuccess } from '@/lib/ui/toast';
import { cn } from '@/lib/utils';

type SessionSort = 'recent' | 'size' | 'cost';

export function SessionExplorer() {
  const slug = useUiStore((s) => s.selectedProjectSlug);
  if (!slug) {
    return (
      <section className="pane">
        <div
          className="flex h-full items-center justify-center p-8 text-center"
          style={{ color: 'var(--fg-3)', fontSize: 12 }}
        >
          Pick a project from the list on the left.
        </div>
      </section>
    );
  }
  return <SessionExplorerForProject key={slug} slug={slug} />;
}

function SessionExplorerForProject({ slug }: { slug: string }) {
  const selectedId = useUiStore((s) => s.selectedSessionId);
  const setSelected = useUiStore((s) => s.setSelectedSession);
  const { data: projects } = useProjects();
  const { data: aliases } = useAliases();
  const setAlias = useSetAlias();
  const { data, isLoading, isError, refetch } = useSessions(slug);
  const openSession = useOpenSession();

  const project = projects?.find((p) => p.slug === slug);
  const alias = aliases?.[slug];
  const path = project?.resolvedCwd ?? project?.displayPath ?? slug;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(alias ?? '');
  const [sort, setSort] = useState<SessionSort>('recent');

  const sorted = useMemo(() => {
    if (!data) return [];
    const arr = data.slice();
    if (sort === 'size') arr.sort((a, b) => b.size - a.size);
    else if (sort === 'cost') arr.sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0));
    else arr.sort((a, b) => Date.parse(b.mtime) - Date.parse(a.mtime));
    return arr;
  }, [data, sort]);

  const commitAlias = () => {
    const value = draft.trim();
    if (value === (alias ?? '')) {
      setEditing(false);
      return;
    }
    setAlias.mutate(
      { slug, alias: value === '' ? null : value },
      {
        onSuccess: () => {
          setEditing(false);
          toastSuccess(value === '' ? 'Alias removed' : 'Alias updated', { id: 'project-alias' });
        },
        onError: (err) => {
          toastError('Failed to save alias', { id: 'project-alias', description: err.message });
        },
      },
    );
  };

  return (
    <section className="pane">
      <div className="sess-head">
        <div className="alias-wrap">
          {editing ? (
            <input
              autoFocus
              className="ch-input sm plain"
              value={draft}
              placeholder={alias ?? path}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitAlias();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditing(false);
                }
              }}
              onBlur={commitAlias}
              aria-label="Project alias"
            />
          ) : (
            <span className="alias">
              {alias ?? path.split('/').pop() ?? slug}
              <button
                type="button"
                className="edit"
                title="Edit alias"
                aria-label="Edit alias"
                onClick={() => {
                  setDraft(alias ?? '');
                  setEditing(true);
                }}
                style={{
                  width: 20,
                  height: 20,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'transparent',
                  border: 0,
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                <IconEdit />
              </button>
            </span>
          )}
          {!editing && <span className="path">{path}</span>}
        </div>
        <CHButton
          variant="outline"
          size="sm"
          disabled={openSession.isPending}
          onClick={() => openSession.mutate({ slug })}
          title="New claude session"
        >
          <IconPlus /> claude
        </CHButton>
      </div>

      <div className="sess-actions">
        <span
          style={{
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--fg-3)',
            fontWeight: 600,
          }}
        >
          {data?.length ?? 0} sessions
        </span>
        <div style={{ flex: 1 }} />
        <select
          className="ch-select"
          aria-label="Session sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as SessionSort)}
        >
          <option value="recent">Most recent</option>
          <option value="size">Largest</option>
          <option value="cost">Most costly</option>
        </select>
      </div>

      <ScrollArea className="sess-list">
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}
        {isError && (
          <div style={{ padding: 16, color: 'var(--red)', fontSize: 12 }}>
            Failed to load sessions.{' '}
            <CHButton size="sm" variant="outline" onClick={() => refetch()}>
              Retry
            </CHButton>
          </div>
        )}
        {!isLoading && !isError && sorted.length === 0 && (
          <div style={{ padding: 20, color: 'var(--fg-3)', fontSize: 12 }}>
            <p style={{ marginBottom: 10 }}>No sessions in this project yet.</p>
            <CHButton
              variant="outline"
              size="sm"
              onClick={() => openSession.mutate({ slug })}
              disabled={openSession.isPending}
            >
              <IconPlus /> claude
            </CHButton>
          </div>
        )}
        {sorted.map((s) => (
          <SessionRow
            key={s.id}
            s={s}
            active={s.id === selectedId}
            onSelect={() => setSelected(s.id)}
            onResume={() => openSession.mutate({ slug, resumeSessionId: s.id })}
            openPending={openSession.isPending}
          />
        ))}
      </ScrollArea>
    </section>
  );
}

function SessionRow({
  s,
  active,
  onSelect,
  onResume,
  openPending,
}: {
  s: SessionSummary;
  active: boolean;
  onSelect: () => void;
  onResume: () => void;
  openPending: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={cn('sess', active && 'active')}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="row1">
        <span className="sid">{s.id.slice(0, 8)}…</span>
        <Badge variant="emerald" style={{ fontSize: 9.5 }}>
          RESUMABLE
        </Badge>
        <span className="ago">{timeAgo(s.mtime)}</span>
      </div>
      {s.firstUserPreview && <p className="preview">{s.firstUserPreview}</p>}
      <div className="meta">
        <span>{s.messageCount ?? '—'} msgs</span>
        <span className="dot" />
        <span>{formatBytes(s.size)}</span>
        {s.costUsd !== null && <span className="cost">{formatUsd(s.costUsd)}</span>}
      </div>
      <div className="actions">
        <CHButton
          variant="outline"
          size="sm"
          disabled={openPending}
          onClick={(e) => {
            e.stopPropagation();
            onResume();
          }}
        >
          ▶ resume
        </CHButton>
      </div>
    </div>
  );
}
