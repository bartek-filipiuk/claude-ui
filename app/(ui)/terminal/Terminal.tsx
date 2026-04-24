'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CHButton } from '@/components/ui/ch-button';
import { Badge } from '@/components/ui/badge';
import { usePty, type PtyStatus } from '@/hooks/use-pty';
import { useSettings } from '@/hooks/use-settings';
import { useTerminalStore } from '@/stores/terminal-slice';
import { toastInfo } from '@/lib/ui/toast';
import {
  registerPersistentTab,
  respawnPersistentTabRequest,
} from '@/lib/ui/persistent-tab-sync';

export interface TerminalProps {
  cwd: string;
  /** Optional shell override. */
  shell?: string;
  /** Optional args (e.g. ['--resume', sessionId] for claude). */
  args?: string[];
  /** Command typed into PTY stdin after it becomes ready. */
  initCommand?: string;
  /**
   * When set, the terminal registers its write function in the terminal
   * store keyed by this id. External consumers (quick actions) can then
   * `sendToActive` without prop-drilling.
   */
  paneId?: string;
  /**
   * Attach to an existing persistent PTY instead of spawning one. The PTY
   * survives tab close and browser reload; cron jobs can write to it.
   */
  persistentId?: string;
  /** Owning tab id — used to upgrade the pane to persistent on mount. */
  tabId?: string;
  /** Tab title — stored server-side so reload restores the label. */
  title?: string;
  /** Project slug owning this tab — lets reload group tabs under projects. */
  projectSlug?: string | null;
  /** Stable alias key (e.g. `resume:<id>`) persisted for reload. */
  aliasKey?: string;
}

const RESIZE_DEBOUNCE_MS = 100;

export function Terminal({
  cwd,
  shell,
  args,
  initCommand,
  paneId,
  persistentId,
  tabId,
  title,
  projectSlug,
  aliasKey,
}: TerminalProps) {
  const registerWriter = useTerminalStore((s) => s.registerWriter);
  const unregisterWriter = useTerminalStore((s) => s.unregisterWriter);
  const setPanePersistentId = useTerminalStore((s) => s.setPanePersistentId);
  const purgeStaleTab = useTerminalStore((s) => s.purgeStaleTab);
  const [gitStatus, setGitStatus] = useState<{ branch: string | null; dirty: boolean } | null>(
    null,
  );
  // Live cwd — initial value is the spawn-time cwd from props, but updated
  // from the server whenever the user `cd`s inside the shell.
  const [actualCwd, setActualCwd] = useState(cwd);
  // persistentId becomes known only after registerPersistentTab succeeds on
  // mount. Kept in state so effects can subscribe and start polling head-info
  // as soon as we have an id to query.
  const [effectivePersistentId, setEffectivePersistentId] = useState<string | undefined>(
    persistentId,
  );
  const headInfoInflightRef = useRef(false);
  const headInfoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshHeadInfo = useCallback(async () => {
    if (!effectivePersistentId) return;
    if (headInfoInflightRef.current) return;
    headInfoInflightRef.current = true;
    try {
      const res = await fetch(
        `/api/pty/head-info?persistentId=${encodeURIComponent(effectivePersistentId)}`,
        { credentials: 'same-origin' },
      );
      if (!res.ok) return;
      const body = (await res.json()) as {
        cwd: string | null;
        branch: string | null;
        dirty: boolean;
      };
      if (body.cwd) setActualCwd(body.cwd);
      setGitStatus({ branch: body.branch, dirty: body.dirty });
    } catch {
      /* transient — next trigger will retry */
    } finally {
      headInfoInflightRef.current = false;
    }
  }, [effectivePersistentId]);

  // Refs let event handlers registered in the mount-once xterm effect reach
  // the current refresh function without re-subscribing on every rerender.
  const refreshHeadInfoRef = useRef(refreshHeadInfo);
  useEffect(() => {
    refreshHeadInfoRef.current = refreshHeadInfo;
  }, [refreshHeadInfo]);

  const scheduleHeadInfoRefresh = useCallback(() => {
    if (headInfoDebounceRef.current) clearTimeout(headInfoDebounceRef.current);
    headInfoDebounceRef.current = setTimeout(() => {
      headInfoDebounceRef.current = null;
      void refreshHeadInfoRef.current();
    }, 400);
  }, []);
  const scheduleHeadInfoRefreshRef = useRef(scheduleHeadInfoRefresh);
  useEffect(() => {
    scheduleHeadInfoRefreshRef.current = scheduleHeadInfoRefresh;
  }, [scheduleHeadInfoRefresh]);
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<import('@xterm/xterm').Terminal | null>(null);
  const fitRef = useRef<import('@xterm/addon-fit').FitAddon | null>(null);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initSentRef = useRef(false);
  const [status, setStatus] = useState<PtyStatus>('closed');
  const { data: settings } = useSettings();
  const fontSize = settings?.terminalFontSize ?? 13;
  const attachedServerSideRef = useRef<boolean>(Boolean(persistentId));
  const { connect, write, resize, close } = usePty({
    onData: (chunk) => termRef.current?.write(chunk),
    onExit: ({ exitCode }) => {
      termRef.current?.write(`\r\n\x1b[33m[exit ${exitCode}]\x1b[0m\r\n`);
    },
    onError: (code) => {
      termRef.current?.write(`\r\n\x1b[31m[pty error: ${code}]\x1b[0m\r\n`);
      // Fatal codes: the server says this persistent tab is truly gone
      // (file deleted via /jobs, different persistentId after store reset).
      // Remove it from Zustand locally so closeTab will not fire a DELETE
      // that 404s, and so the next navigation does not keep re-attaching.
      if ((code === 'persistent_not_found' || code === 'pty_dead') && tabId) {
        setTimeout(() => purgeStaleTab(tabId), 0);
      }
    },
    onStatus: (s) => {
      setStatus(s);
      // initCommand is only typed client-side for ephemeral (non-persistent)
      // PTYs. Persistent PTYs run initCommand server-side at spawn time, so
      // re-sending here would double-type it on every attach.
      if (
        s === 'ready' &&
        initCommand &&
        !initSentRef.current &&
        !attachedServerSideRef.current
      ) {
        initSentRef.current = true;
        setTimeout(() => write(`${initCommand}\r`), 80);
      }
    },
  });

  // Publish our write function to the store so quick actions can reach us.
  useEffect(() => {
    if (!paneId) return;
    registerWriter(paneId, write);
    return () => unregisterWriter(paneId);
  }, [paneId, write, registerWriter, unregisterWriter]);

  // Mount xterm exactly once.
  useEffect(() => {
    if (!hostRef.current || termRef.current) return;
    let disposed = false;
    (async () => {
      const [{ Terminal: XTerm }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-web-links'),
      ]);
      if (disposed) return;
      const term = new XTerm({
        convertEol: false,
        cursorBlink: true,
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
        fontSize,
        scrollback: 10_000,
        theme: {
          background: '#0a0a0a',
          foreground: '#e5e5e5',
          cursor: '#e5e5e5',
          selectionBackground: '#374151',
        },
      });
      const fit = new FitAddon();
      const links = new WebLinksAddon();
      term.loadAddon(fit);
      term.loadAddon(links);
      if (!hostRef.current) return;
      term.open(hostRef.current);

      // Register handlers BEFORE the first fit so the initial resize event is
      // observed. The first onResize after mount is forwarded synchronously —
      // without debounce — so the PTY's termios never lags behind xterm during
      // the first render, which is when split panes' final geometry settles
      // and mismatches would otherwise desync the shell's cursor math.
      let initialResizeSent = false;
      term.onData((data) => {
        write(data);
        // Enter (CR) means the user just dispatched a command — `cd` and
        // `git checkout` are the cases we care about. Debounce the refresh
        // so a pasted multi-line block only fires one request.
        if (data.includes('\r')) scheduleHeadInfoRefreshRef.current();
      });
      term.onResize(({ cols: c, rows: r }) => {
        if (!initialResizeSent) {
          initialResizeSent = true;
          resize(c, r);
          return;
        }
        if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = setTimeout(() => resize(c, r), RESIZE_DEBOUNCE_MS);
      });

      try {
        fit.fit();
      } catch {
        /* ignore */
      }
      termRef.current = term;
      fitRef.current = fit;

      // Second fit after the browser has committed the first layout. Split
      // panes typically receive their final flex-basis here, so this catches
      // the geometry xterm saw during term.open() as wrong and corrects it
      // before the user types anything.
      requestAnimationFrame(() => {
        if (disposed) return;
        try {
          fit.fit();
        } catch {
          /* ignore */
        }
      });

      // Upgrade the pane to a persistent PTY if it isn't one already. The PTY
      // then survives WS close (tab switch, browser reload) and dies only on
      // explicit close (X button → DELETE /api/persistent-tabs/:id).
      let effectivePersistentId = persistentId;
      if (!effectivePersistentId) {
        const reg = await registerPersistentTab({
          title: title ?? cwd,
          cwd,
          ...(shell ? { shell } : {}),
          ...(initCommand ? { initCommand } : {}),
          ...(projectSlug ? { projectSlug } : {}),
          ...(aliasKey ? { aliasKey } : {}),
        });
        if (!disposed && reg) {
          effectivePersistentId = reg.persistentId;
          attachedServerSideRef.current = true;
          setEffectivePersistentId(reg.persistentId);
          if (tabId && paneId) {
            setPanePersistentId(tabId, paneId, reg.persistentId);
          }
        }
      }

      const cols = term.cols;
      const rows = term.rows;
      connect({
        cwd,
        cols,
        rows,
        ...(shell ? { shell } : {}),
        ...(args ? { args } : {}),
        ...(effectivePersistentId ? { persistentId: effectivePersistentId } : {}),
      });
    })();
    return () => {
      disposed = true;
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
      if (headInfoDebounceRef.current) {
        clearTimeout(headInfoDebounceRef.current);
        headInfoDebounceRef.current = null;
      }
      // Null the fit ref before disposing the terminal so any in-flight
      // ResizeObserver / custom-event handler that reaches `fitRef.current?.fit()`
      // becomes a no-op instead of hitting a terminal whose internals are gone.
      fitRef.current = null;
      termRef.current?.dispose();
      termRef.current = null;
      close();
    };
    // Only on mount: cwd/shell/args are fixed per terminal instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refit on container resize.
  useEffect(() => {
    if (!hostRef.current) return;
    const obs = new ResizeObserver(() => {
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = setTimeout(() => {
        try {
          fitRef.current?.fit();
        } catch {
          /* ignore */
        }
      }, RESIZE_DEBOUNCE_MS);
    });
    obs.observe(hostRef.current);
    return () => obs.disconnect();
  }, []);

  // Refit immediately (in rAF) when a PaneGrid splitter release fires.
  // ResizeObserver catches this too, but aligning to a frame kills tearing.
  useEffect(() => {
    const onEnd = () => {
      requestAnimationFrame(() => {
        try {
          fitRef.current?.fit();
        } catch {
          /* ignore */
        }
      });
    };
    window.addEventListener('codehelm:pane-resize-end', onEnd);
    return () => window.removeEventListener('codehelm:pane-resize-end', onEnd);
  }, []);

  // Refit on wake from suspend / tab return. After suspend the browser can
  // restore the page with stale font metrics cached inside xterm's render
  // service — FitAddon reads `dimensions.css.cell.width` from that cache,
  // computes too few columns, and the terminal ends up rendered at ~1/3 of
  // the real container width. A plain fit() does not help because xterm has
  // no reason to re-measure on its own. We force a re-measurement by briefly
  // nudging fontSize (the setter invalidates the cache), wait for
  // document.fonts.ready so the measurement runs against loaded glyphs, and
  // run fit() across three frames so the compositor, DPR, and layout all
  // have time to settle.
  useEffect(() => {
    const refit = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const doFit = () => {
        const term = termRef.current;
        const fit = fitRef.current;
        if (!term || !fit) return;
        try {
          const fs = term.options.fontSize ?? 13;
          term.options.fontSize = fs + 1;
          term.options.fontSize = fs;
          fit.fit();
        } catch {
          /* ignore */
        }
      };
      const run = () => {
        requestAnimationFrame(doFit);
        setTimeout(doFit, 150);
        setTimeout(doFit, 500);
      };
      if (typeof document !== 'undefined' && document.fonts && 'ready' in document.fonts) {
        document.fonts.ready.then(run).catch(run);
      } else {
        run();
      }
    };
    document.addEventListener('visibilitychange', refit);
    window.addEventListener('focus', refit);
    return () => {
      document.removeEventListener('visibilitychange', refit);
      window.removeEventListener('focus', refit);
    };
  }, []);

  // React to font-size changes from settings without re-mounting xterm.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    if (term.options.fontSize === fontSize) return;
    term.options.fontSize = fontSize;
    try {
      fitRef.current?.fit();
    } catch {
      /* ignore */
    }
  }, [fontSize]);

  // Refresh cwd/branch whenever the PTY first becomes ready (mount, RESTART,
  // reconnect). `connecting`/`closed`/`error` are skipped — they have no
  // useful cwd to report.
  useEffect(() => {
    if (status !== 'ready') return;
    void refreshHeadInfo();
  }, [status, refreshHeadInfo]);

  // Backup polling + react-to-return-to-tab. Enter-in-shell is the primary
  // trigger for interactive changes; this catches external changes (git
  // checkout from an IDE, another terminal) and any Enter we missed. Paused
  // when the tab is hidden so background tabs don't burn the rate limit.
  useEffect(() => {
    if (!effectivePersistentId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshHeadInfo();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') void refreshHeadInfo();
    }, 20_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      clearInterval(iv);
    };
  }, [effectivePersistentId, refreshHeadInfo]);

  const handleClear = () => {
    termRef.current?.clear();
  };

  const handleSave = () => {
    const term = termRef.current;
    if (!term) return;
    const content = serializeTerminalBuffer(term);
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `terminal-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toastInfo('Terminal buffer saved', { description: a.download });
  };

  const segments = actualCwd.split('/').filter(Boolean);
  const leaf = segments[segments.length - 1] ?? actualCwd;
  const prefix = segments.slice(0, -1);

  return (
    <div className="term-wrap">
      <div className="term-head">
        <span className="cwd">
          {actualCwd.startsWith('/') ? (
            <span className="sep">/</span>
          ) : (
            <span className="home">~</span>
          )}
          {prefix.map((seg, i) => (
            <span key={`${seg}-${i}`}>
              {seg}
              <span className="sep">/</span>
            </span>
          ))}
          <span className="leaf">{leaf}</span>
        </span>
        {gitStatus?.branch && (
          <button
            type="button"
            className="gitbadge"
            onClick={() => void refreshHeadInfo()}
            title={gitStatus.dirty ? `${gitStatus.branch} (dirty)` : gitStatus.branch}
          >
            <span>⎇ {gitStatus.branch}</span>
            {gitStatus.dirty && <span className="dirty">●</span>}
          </button>
        )}
        <StatusBadge status={status} />
        <div className="actions">
          <CHButton size="sm" onClick={handleClear} title="Clear buffer">
            clear
          </CHButton>
          <CHButton size="sm" onClick={handleSave} title="Download buffer as .txt">
            save
          </CHButton>
          <CHButton
            size="sm"
            variant="outline"
            onClick={() => {
              // RESTART semantics:
              //  - persistent tab → ask the server to kill the backing PTY
              //    and spawn a fresh one with the original initCommand
              //    (e.g. `claude --resume <id>`). This is a real restart of
              //    the underlying process — the user's "stuck" Claude
              //    session is replaced by a new one against the same resume
              //    id, no `/exit` keystroke required.
              //  - ephemeral tab → kill + spawn a new shell with the same
              //    args; same effect, no server-side store involved.
              // In both cases reset xterm first so leftover ANSI state and
              // any replayed tail can't garble the new session's output.
              try {
                termRef.current?.reset();
              } catch {
                /* ignore */
              }
              const cols = termRef.current?.cols ?? 80;
              const rows = termRef.current?.rows ?? 24;
              if (persistentId) {
                close();
                void (async () => {
                  const ok = await respawnPersistentTabRequest(persistentId);
                  if (!ok) {
                    termRef.current?.write(
                      '\r\n\x1b[31m[restart failed: server could not respawn this tab]\x1b[0m\r\n',
                    );
                    return;
                  }
                  connect({ cwd, cols, rows, persistentId });
                })();
              } else {
                close();
                connect({
                  cwd,
                  cols,
                  rows,
                  ...(shell ? { shell } : {}),
                  ...(args ? { args } : {}),
                });
              }
            }}
          >
            restart
          </CHButton>
        </div>
      </div>
      <div ref={hostRef} className="term-body" style={{ padding: 0 }} />
    </div>
  );
}

function serializeTerminalBuffer(term: import('@xterm/xterm').Terminal): string {
  const buf = term.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i);
    if (line) lines.push(line.translateToString(true));
  }
  // Trim trailing empty lines.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n') + '\n';
}

function StatusBadge({ status }: { status: PtyStatus }) {
  const variant =
    status === 'ready'
      ? 'emerald'
      : status === 'connecting'
        ? 'gold'
        : status === 'error'
          ? 'red'
          : 'default';
  return <Badge variant={variant}>{status}</Badge>;
}
