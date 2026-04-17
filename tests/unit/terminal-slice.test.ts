import { describe, it, expect, beforeEach } from 'vitest';
import { useTerminalStore, TERMINAL_TAB_CAP } from '@/stores/terminal-slice';

beforeEach(() => {
  useTerminalStore.getState().clear();
});

describe('terminal-slice', () => {
  it('openTab appends a tab and sets it active', () => {
    const id = useTerminalStore.getState().openTab({ cwd: '/tmp/a', title: 'a' });
    expect(id).not.toBeNull();
    const s = useTerminalStore.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.activeTabId).toBe(id);
  });

  it('caps at 16 tabs — the 17th returns null', () => {
    const s = useTerminalStore.getState();
    for (let i = 0; i < TERMINAL_TAB_CAP; i++) {
      s.openTab({ cwd: `/tmp/${i}`, title: `t${i}` });
    }
    expect(useTerminalStore.getState().tabs).toHaveLength(TERMINAL_TAB_CAP);
    const id17 = useTerminalStore.getState().openTab({ cwd: '/tmp/17', title: 't17' });
    expect(id17).toBeNull();
    expect(useTerminalStore.getState().tabs).toHaveLength(TERMINAL_TAB_CAP);
  });

  it('closeTab sets active to a neighbouring tab', () => {
    const s = useTerminalStore.getState();
    const a = s.openTab({ cwd: '/a', title: 'a' })!;
    const b = s.openTab({ cwd: '/b', title: 'b' })!;
    const c = s.openTab({ cwd: '/c', title: 'c' })!;
    useTerminalStore.getState().setActive(b);
    useTerminalStore.getState().closeTab(b);
    const next = useTerminalStore.getState();
    expect(next.tabs.map((t) => t.id)).toEqual([a, c]);
    expect(next.activeTabId).toBe(c);
  });

  it('closeTab on the last tab clears activeTabId', () => {
    const s = useTerminalStore.getState();
    const a = s.openTab({ cwd: '/a', title: 'a' })!;
    useTerminalStore.getState().closeTab(a);
    expect(useTerminalStore.getState().activeTabId).toBeNull();
    expect(useTerminalStore.getState().tabs).toHaveLength(0);
  });

  it('setActive ignores unknown ids', () => {
    const s = useTerminalStore.getState();
    const a = s.openTab({ cwd: '/a', title: 'a' })!;
    useTerminalStore.getState().setActive('nope');
    expect(useTerminalStore.getState().activeTabId).toBe(a);
  });
});
