'use client';

import { useTerminalStore, TERMINAL_TAB_CAP } from '@/stores/terminal-slice';
import { cn } from '@/lib/utils';
import { toastInfo } from '@/lib/ui/toast';

interface Props {
  onNewTab?: () => void;
}

export function TabBar({ onNewTab }: Props) {
  const tabs = useTerminalStore((s) => s.tabs);
  const activeId = useTerminalStore((s) => s.activeTabId);
  const setActive = useTerminalStore((s) => s.setActive);
  const closeTab = useTerminalStore((s) => s.closeTab);

  const closeWithToast = (id: string) => {
    const tab = useTerminalStore.getState().tabs.find((t) => t.id === id);
    closeTab(id);
    toastInfo('Tab closed', {
      id: `tab-closed-${id}`,
      ...(tab?.title ? { description: tab.title } : {}),
    });
  };

  return (
    <div className="tabs-row">
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tab"
          aria-selected={t.id === activeId}
          className={cn('tab', t.id === activeId && 'active')}
          title={`${t.title} · ${t.cwd}`}
          onClick={() => setActive(t.id)}
          onMouseDown={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              closeWithToast(t.id);
            }
          }}
        >
          <span className="dot ready" />
          <span className="mono">{t.title}</span>
          <button
            type="button"
            className="close"
            aria-label="Close tab"
            onClick={(e) => {
              e.stopPropagation();
              closeWithToast(t.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
      {onNewTab && (
        <button
          type="button"
          className="tab-add"
          disabled={tabs.length >= TERMINAL_TAB_CAP}
          onClick={onNewTab}
          title={tabs.length >= TERMINAL_TAB_CAP ? '16-tab limit reached' : 'New tab'}
          aria-label="New tab"
        >
          +
        </button>
      )}
    </div>
  );
}
