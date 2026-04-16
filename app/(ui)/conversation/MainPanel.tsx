'use client';

import { useUiStore } from '@/stores/ui-slice';
import { useProjects } from '@/hooks/use-projects';
import { useTerminalStore } from '@/stores/terminal-slice';
import { Button } from '@/components/ui/button';
import { Viewer } from './Viewer';
import { TabBar } from '@/app/(ui)/terminal/TabBar';
import { TabManager } from '@/app/(ui)/terminal/TabManager';

/**
 * Right-side panel. Shows the Viewer by default; swaps to the multi-tab
 * terminal area when at least one tab is open. Header button toggles between
 * viewer and terminal view; TabBar owns new/close/switch interactions.
 */
export function MainPanel() {
  const projectSlug = useUiStore((s) => s.selectedProjectSlug);
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const openTerminal = useUiStore((s) => s.openTerminal);
  const closeTerminal = useUiStore((s) => s.closeTerminal);
  const tabs = useTerminalStore((s) => s.tabs);
  const openTab = useTerminalStore((s) => s.openTab);
  const { data: projects } = useProjects();

  const activeProject = projects?.find((p) => p.slug === projectSlug);

  const newShellTab = () => {
    if (!activeProject?.resolvedCwd) return;
    const id = openTab({
      projectSlug: activeProject.slug,
      cwd: activeProject.resolvedCwd,
      title: `shell (${activeProject.slug.slice(-24)})`,
    });
    if (id) openTerminal(activeProject.resolvedCwd);
  };

  const showTerminal = terminalOpen && tabs.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <h2 className="text-sm font-medium">
          {showTerminal ? `Terminal · ${tabs.length}/16` : 'Historia'}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!activeProject?.resolvedCwd}
            onClick={newShellTab}
            title={
              activeProject?.resolvedCwd
                ? `Nowy shell w ${activeProject.resolvedCwd}`
                : 'Wybierz projekt aby otworzyć terminal'
            }
          >
            + shell
          </Button>
          {showTerminal ? (
            <Button size="sm" variant="ghost" onClick={closeTerminal}>
              Pokaż historię
            </Button>
          ) : (
            tabs.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => openTerminal(tabs[0]?.cwd ?? '/')}>
                Pokaż terminal ({tabs.length})
              </Button>
            )
          )}
        </div>
      </header>
      {showTerminal && <TabBar onNewTab={newShellTab} />}
      <div className="min-h-0 flex-1">{showTerminal ? <TabManager /> : <Viewer />}</div>
    </div>
  );
}
