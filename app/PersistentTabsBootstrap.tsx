'use client';

import { useEffect, useRef } from 'react';
import { useTerminalStore } from '@/stores/terminal-slice';
import { useUiStore } from '@/stores/ui-slice';
import { fetchPersistentTabs } from '@/lib/ui/persistent-tab-sync';

/**
 * Fetches persistent tabs from the server once at mount and hydrates the
 * terminal store. If anything came back, also:
 *   - pre-selects a project (first restored tab with a projectSlug) so the
 *     sidebar highlights something and `+ new shell` has a valid context,
 *   - flips the main panel into terminal mode so the user sees their
 *     previous workspace immediately.
 *
 * Rendered as a sibling of the main layout (see `app/page.tsx`) so it runs
 * regardless of which panel mode is active — previously hydration lived in
 * `TabManager`, which only mounts inside terminal mode and therefore left
 * the store empty on a fresh browser load.
 */
export function PersistentTabsBootstrap() {
  const hydrate = useTerminalStore((s) => s.hydrate);
  const openTerminal = useUiStore((s) => s.openTerminal);
  const setSelectedProject = useUiStore((s) => s.setSelectedProject);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    void fetchPersistentTabs().then((serverTabs) => {
      if (serverTabs.length === 0) return;
      hydrate(serverTabs);
      // Only overwrite the sidebar selection if the user hasn't already
      // picked a project themselves (rare race — they clicked during the
      // in-flight fetch). Otherwise pick the first restored tab that belongs
      // to a project so the sidebar is highlighted and the `+` button in
      // MainPanel has a valid cwd to spawn a new shell for.
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
