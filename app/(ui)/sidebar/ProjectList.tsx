'use client';

import { useCallback, useMemo, useState } from 'react';
import { useProjects, type ProjectSummary } from '@/hooks/use-projects';
import { useProjectMeta, useSetProjectMeta, type ProjectMetaMap } from '@/hooks/use-project-meta';
import { useSessions } from '@/hooks/use-sessions';
import { useUiStore } from '@/stores/ui-slice';
import { CHButton } from '@/components/ui/ch-button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { IconStar, IconChev } from '@/components/ui/icons';
import { timeAgo } from '@/lib/ui/format';
import { formatUsd } from '@/lib/jsonl/usage';
import type { SortMode } from '@/lib/ui/layout-storage';
import { groupProjectsByPrefix, type ProjectGroup } from '@/lib/projects/group-by-prefix';
import { cn } from '@/lib/utils';

const GROUP_OPEN_STORAGE_KEY = 'codehelm:project-groups:open';

function loadGroupOpenMap(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(GROUP_OPEN_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function saveGroupOpenMap(map: Record<string, boolean>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GROUP_OPEN_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // swallow quota / access errors
  }
}

export function ProjectList() {
  const { data, isLoading, isError, refetch } = useProjects();
  const { data: meta } = useProjectMeta();
  const setMeta = useSetProjectMeta();
  const search = useUiStore((s) => s.search);
  const selectedSlug = useUiStore((s) => s.selectedProjectSlug);
  const setSelected = useUiStore((s) => s.setSelectedProject);
  const sortMode = useUiStore((s) => s.sortMode);
  const grouping = useUiStore((s) => s.projectGrouping);

  const isGrouped = grouping === 'prefix';

  const visible = useMemo(
    () =>
      filterAndSortProjects(data ?? [], meta ?? {}, search, sortMode, {
        hoistFavorites: !isGrouped,
      }),
    [data, meta, search, sortMode, isGrouped],
  );

  const groups = useMemo<ProjectGroup[]>(
    () => (isGrouped ? groupProjectsByPrefix(visible, meta ?? {}) : []),
    [isGrouped, visible, meta],
  );

  const { data: selectedSessions } = useSessions(selectedSlug);
  const selectedCost = useMemo(() => {
    if (!selectedSessions || selectedSessions.length === 0) return null;
    let total = 0;
    let seen = false;
    for (const s of selectedSessions) {
      if (typeof s.costUsd === 'number' && Number.isFinite(s.costUsd)) {
        total += s.costUsd;
        seen = true;
      }
    }
    return seen ? total : null;
  }, [selectedSessions]);

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!data || data.length === 0) return <EmptyState />;

  const renderItem = (p: ProjectSummary) => {
    const entry = meta?.[p.slug];
    const isActive = p.slug === selectedSlug;
    return (
      <ProjectItem
        key={p.slug}
        project={p}
        alias={entry?.alias}
        favorite={entry?.favorite === true}
        active={isActive}
        costUsd={isActive ? selectedCost : null}
        onSelect={() => setSelected(p.slug)}
        onToggleFavorite={() => {
          setMeta.mutate({
            slug: p.slug,
            favorite: entry?.favorite !== true,
          });
        }}
      />
    );
  };

  return (
    <ScrollArea className="sidebar-body">
      {isGrouped ? (
        <GroupedProjects groups={groups} renderItem={renderItem} />
      ) : (
        <div role="list">
          {visible.map(renderItem)}
          {visible.length === 0 && (
            <div
              style={{
                padding: '16px 20px',
                fontSize: 11,
                color: 'var(--fg-4)',
                textAlign: 'center',
              }}
            >
              No matches.
            </div>
          )}
        </div>
      )}
    </ScrollArea>
  );
}

function GroupedProjects({
  groups,
  renderItem,
}: {
  groups: ProjectGroup[];
  renderItem: (p: ProjectSummary) => React.ReactElement;
}) {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => loadGroupOpenMap());

  const setOpen = useCallback((key: string, open: boolean) => {
    setOpenMap((prev) => {
      const next = { ...prev, [key]: open };
      saveGroupOpenMap(next);
      return next;
    });
  }, []);

  if (groups.length === 0) {
    return (
      <div
        style={{
          padding: '16px 20px',
          fontSize: 11,
          color: 'var(--fg-4)',
          textAlign: 'center',
        }}
      >
        No matches.
      </div>
    );
  }

  return (
    <div>
      {groups.map((group) => {
        const isOpen = openMap[group.key] !== false;
        return (
          <section key={group.key}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(group.key, !isOpen)}
              className="section-head clickable"
              style={{ width: '100%', border: 0, background: 'transparent' }}
            >
              <IconChev dir={isOpen ? 'down' : 'right'} />
              <span>{group.label}</span>
              <span className="count">{group.items.length}</span>
            </button>
            {isOpen && <div>{group.items.map(renderItem)}</div>}
          </section>
        );
      })}
    </div>
  );
}

function projectSortName(project: ProjectSummary, meta: ProjectMetaMap): string {
  const alias = meta[project.slug]?.alias;
  if (alias) return alias;
  return project.resolvedCwd ?? project.displayPath ?? project.slug;
}

export function filterAndSortProjects(
  projects: ProjectSummary[],
  meta: ProjectMetaMap,
  search: string,
  sortMode: SortMode = 'activity',
  options: { hoistFavorites?: boolean } = {},
): ProjectSummary[] {
  const { hoistFavorites = true } = options;
  const q = search.trim().toLowerCase();
  const filtered = q
    ? projects.filter((p) => {
        const alias = meta[p.slug]?.alias ?? '';
        return (
          alias.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          (p.displayPath ?? '').toLowerCase().includes(q) ||
          (p.resolvedCwd ?? '').toLowerCase().includes(q)
        );
      })
    : projects.slice();
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
  filtered.sort((a, b) => {
    if (hoistFavorites) {
      const aFav = meta[a.slug]?.favorite === true ? 1 : 0;
      const bFav = meta[b.slug]?.favorite === true ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
    }
    if (sortMode === 'name') {
      return collator.compare(projectSortName(a, meta), projectSortName(b, meta));
    }
    if (sortMode === 'sessions') {
      if (a.sessionCount !== b.sessionCount) return b.sessionCount - a.sessionCount;
    }
    const aTs = a.lastActivity ? Date.parse(a.lastActivity) : 0;
    const bTs = b.lastActivity ? Date.parse(b.lastActivity) : 0;
    return bTs - aTs;
  });
  return filtered;
}

function ProjectItem({
  project,
  alias,
  favorite,
  active,
  costUsd,
  onSelect,
  onToggleFavorite,
}: {
  project: ProjectSummary;
  alias: string | undefined;
  favorite: boolean;
  active: boolean;
  costUsd: number | null;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  const path = project.resolvedCwd ?? project.displayPath ?? project.slug;
  const primary = alias ?? path.split('/').pop() ?? path;
  const tooltip = `${alias ? alias + '\n' : ''}${path}\nslug: ${project.slug}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      title={tooltip}
      className={cn('proj', active && 'active', favorite && 'fav')}
    >
      <button
        type="button"
        className="star"
        aria-label={favorite ? 'Unpin project' : 'Pin project'}
        aria-pressed={favorite}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        title={favorite ? 'Unpin' : 'Pin'}
      >
        <IconStar filled={favorite} />
      </button>
      <div className="name">
        <span className="primary">{primary}</span>
        <span className="path">{path}</span>
      </div>
      <div className="meta">
        {costUsd !== null && <span className="cost">{formatUsd(costUsd)}</span>}
        <span>
          {project.sessionCount}s · {timeAgo(project.lastActivity)}
        </span>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="sidebar-body" style={{ padding: 12 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="mb-1 h-9 w-full" />
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="sidebar-body" style={{ padding: 16, color: 'var(--red)' }}>
      <p style={{ fontSize: 12, marginBottom: 8 }}>Failed to load the project list.</p>
      <CHButton variant="outline" size="sm" onClick={onRetry}>
        Retry
      </CHButton>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="sidebar-body" style={{ padding: '24px 20px', color: 'var(--fg-3)' }}>
      <p style={{ color: 'var(--fg-1)', fontWeight: 500, marginBottom: 6 }}>No projects yet.</p>
      <p style={{ fontSize: 11 }}>
        Run Claude Code inside a project at least once to populate this list.
      </p>
    </div>
  );
}
