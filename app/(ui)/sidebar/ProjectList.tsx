'use client';

import { useMemo } from 'react';
import { useProjects, type ProjectSummary } from '@/hooks/use-projects';
import { useUiStore } from '@/stores/ui-slice';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { timeAgo } from '@/lib/ui/format';
import { cn } from '@/lib/utils';

export function ProjectList() {
  const { data, isLoading, isError, refetch } = useProjects();
  const search = useUiStore((s) => s.search);
  const selectedSlug = useUiStore((s) => s.selectedProjectSlug);
  const setSelected = useUiStore((s) => s.setSelectedProject);

  const filtered = useMemo(() => {
    const list = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.slug.toLowerCase().includes(q) ||
        (p.displayPath ?? '').toLowerCase().includes(q) ||
        (p.resolvedCwd ?? '').toLowerCase().includes(q),
    );
  }, [data, search]);

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!data || data.length === 0) return <EmptyState />;

  return (
    <ScrollArea className="h-full">
      <ul className="flex flex-col gap-0.5 p-2" role="list">
        {filtered.map((p) => (
          <ProjectItem
            key={p.slug}
            project={p}
            active={p.slug === selectedSlug}
            onSelect={() => setSelected(p.slug)}
          />
        ))}
        {filtered.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-neutral-500">Brak dopasowań.</li>
        )}
      </ul>
    </ScrollArea>
  );
}

function ProjectItem({
  project,
  active,
  onSelect,
}: {
  project: ProjectSummary;
  active: boolean;
  onSelect: () => void;
}) {
  const label = project.resolvedCwd ?? project.displayPath;
  return (
    <li>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={active ? 'secondary' : 'ghost'}
            onClick={onSelect}
            className={cn('h-auto w-full justify-between px-3 py-2 text-left')}
          >
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{label}</span>
            <span className="ml-2 inline-flex items-center gap-2 text-[10px] text-neutral-400">
              <span>{project.sessionCount}</span>
              <span>{timeAgo(project.lastActivity)}</span>
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-xs">{label}</span>
            <span className="text-[10px] text-neutral-400">slug: {project.slug}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </li>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-2 p-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 p-4 text-sm text-red-400">
      <p>Nie udało się załadować listy projektów.</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Ponów
      </Button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col gap-2 px-4 py-8 text-sm text-neutral-400">
      <p className="font-medium text-neutral-200">Brak projektów.</p>
      <p className="text-xs text-neutral-500">
        Aby zaczął się pojawiać tu lista, uruchom Claude Code w jakimś projekcie przynajmniej raz.
        Katalog <code className="rounded bg-neutral-800 px-1">~/.claude/projects/</code> zostanie
        utworzony po pierwszej sesji.
      </p>
    </div>
  );
}
