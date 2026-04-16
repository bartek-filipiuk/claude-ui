'use client';

import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/components/common/csrf';
import { useTerminalStore } from '@/stores/terminal-slice';
import { useUiStore } from '@/stores/ui-slice';

interface SessionNewResp {
  cwd: string;
  command: string;
  args: string[];
  title: string;
}

interface Vars {
  slug: string;
  resumeSessionId?: string;
}

/**
 * Mutation: asks the server for a safe cwd + claude args, then opens a
 * terminal tab running `claude [--resume <id>]`. Server enforces CSRF,
 * path-guard and PTY caps; client side just orchestrates.
 */
export function useOpenSession() {
  const openTab = useTerminalStore((s) => s.openTab);
  const openTerminalView = useUiStore((s) => s.openTerminal);

  return useMutation({
    mutationFn: async (vars: Vars): Promise<SessionNewResp> => {
      const res = await apiFetch('/api/sessions/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: vars.slug,
          ...(vars.resumeSessionId ? { resumeSessionId: vars.resumeSessionId } : {}),
        }),
      });
      if (!res.ok) {
        let code = `status ${res.status}`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) code = body.error;
        } catch {
          /* ignore */
        }
        throw new Error(code);
      }
      return (await res.json()) as SessionNewResp;
    },
    onSuccess: (data, vars) => {
      openTab({
        projectSlug: vars.slug,
        cwd: data.cwd,
        shell: data.command,
        args: data.args,
        title: data.title,
      });
      // Mark UI as terminal mode so MainPanel renders TabManager.
      openTerminalView(data.cwd);
    },
  });
}
