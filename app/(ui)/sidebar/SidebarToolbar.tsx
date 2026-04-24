'use client';

import { useProjects } from '@/hooks/use-projects';
import { useUiStore } from '@/stores/ui-slice';
import { isProjectGrouping, isSortMode } from '@/lib/ui/layout-storage';

export function SidebarToolbar() {
  const { data } = useProjects();
  const count = data?.length ?? 0;
  const sortMode = useUiStore((s) => s.sortMode);
  const setSortMode = useUiStore((s) => s.setSortMode);
  const grouping = useUiStore((s) => s.projectGrouping);
  const setGrouping = useUiStore((s) => s.setProjectGrouping);

  return (
    <div className="sidebar-filter-row">
      <select
        className="ch-select"
        aria-label="Project sort order"
        value={sortMode}
        onChange={(e) => {
          const next = e.target.value;
          if (isSortMode(next)) setSortMode(next);
        }}
      >
        <option value="activity">Last activity</option>
        <option value="name">Name</option>
        <option value="sessions">Session count</option>
      </select>
      <select
        className="ch-select"
        aria-label="Project grouping"
        value={grouping}
        onChange={(e) => {
          const next = e.target.value;
          if (isProjectGrouping(next)) setGrouping(next);
        }}
      >
        <option value="flat">Flat</option>
        <option value="prefix">By folder</option>
      </select>
      <span
        style={{
          marginLeft: 'auto',
          fontFamily: 'var(--font-jetbrains), monospace',
          fontSize: 10.5,
          color: 'var(--fg-4)',
        }}
      >
        {count} projects
      </span>
    </div>
  );
}
