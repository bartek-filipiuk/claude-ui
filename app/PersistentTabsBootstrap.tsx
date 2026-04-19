'use client';

import { useEffect } from 'react';
import { useTerminalStore } from '@/stores/terminal-slice';
import { useUiStore } from '@/stores/ui-slice';
import { fetchPersistentTabs } from '@/lib/ui/persistent-tab-sync';

/**
 * Keeps the terminal store in sync with the server's persistent-tab list.
 *
 * This runs on every mount (not gated by a ref) because `/jobs` CRUD can
 * mutate the server-side set while the user is away from the main page.
 * When they return, the page re-mounts and we reconcile: add anything the
 * server has that we do not, remove anything we carry that the server
 * forgot. The hydrate action is idempotent + cheap — one HTTP GET + a
 * Zustand set — so running it more than once is fine.
 *
 * The UX sugar (auto-select a project, flip into terminal mode) only
 * happens on the first cold mount, detected by `tabs.length === 0`
 * before the hydrate. Subsequent mounts just reconcile silently so we do
 * not yank the user out of viewer / editor mode on every navigation.
 */
export function PersistentTabsBootstrap() {
  const hydrate = useTerminalStore((s) => s.hydrate);
  const openTerminal = useUiStore((s) => s.openTerminal);
  const setSelectedProject = useUiStore((s) => s.setSelectedProject);

  useEffect(() => {
    void fetchPersistentTabs().then((serverTabs) => {
      const hadTabsBefore = useTerminalStore.getState().tabs.length > 0;
      hydrate(serverTabs);
      if (hadTabsBefore) return;
      if (serverTabs.length === 0) return;
      // Cold start with server-side tabs — pick a project and show them.
      const firstWithProject = serverTabs.find((t) => t.projectSlug);
      if (firstWithProject?.projectSlug && !useUiStore.getState().selectedProjectSlug) {
        setSelectedProject(firstWithProject.projectSlug);
      }
      const first = serverTabs[0];
      if (first) openTerminal(first.cwd);
    });
  }, [hydrate, openTerminal, setSelectedProject]);

  return null;
}
