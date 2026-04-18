'use client';

import { useSettings } from '@/hooks/use-settings';
import { useTerminalStore } from '@/stores/terminal-slice';
import { DEFAULT_TERMINAL_QUICK_ACTIONS } from '@/lib/settings/types';

export function QuickActions() {
  const { data: settings } = useSettings();
  const actions = settings?.terminalQuickActions ?? DEFAULT_TERMINAL_QUICK_ACTIONS;
  const activeTabId = useTerminalStore((s) => s.activeTabId);
  const sendToActive = useTerminalStore((s) => s.sendToActive);

  if (!activeTabId || actions.length === 0) return null;

  return (
    <div className="quickactions" role="toolbar" aria-label="Terminal quick actions">
      <span className="lbl">Quick</span>
      {actions.map((a, i) => (
        <button
          key={`${a.label}-${i}`}
          type="button"
          className="qa-chip"
          title={a.command}
          onClick={() => sendToActive(`${a.command}\r`)}
        >
          <span className="glyph">▸</span>
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}
