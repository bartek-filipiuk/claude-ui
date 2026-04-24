'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CHButton } from '@/components/ui/ch-button';
import { Kbd } from '@/components/ui/kbd';
import { IconChev } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DiffView } from '@/components/conversation/DiffView';
import { useUiStore } from '@/stores/ui-slice';
import { useClaudeMd, useSaveClaudeMd } from '@/hooks/use-claude-md';
import { Markdown } from '@/components/conversation/Markdown';
import { loadLayout, patchLayout } from '@/lib/ui/layout-storage';
import { toastError, toastSuccess, toastWarning } from '@/lib/ui/toast';
import { loadRecentFiles, pushRecentFile, type RecentFileEntry } from '@/lib/ui/recent-files';

type EditorTarget = 'project' | 'global';

/**
 * CodeMirror 6 editor for CLAUDE.md files. Toggle between the active project's
 * per-project file and the global ~/.claude/CLAUDE.md. Save via button or
 * Ctrl+S — conflict (412) flags the user so they can choose to reload.
 */
export function MarkdownEditor() {
  const projectSlug = useUiStore((s) => s.selectedProjectSlug);
  const setSelectedProject = useUiStore((s) => s.setSelectedProject);
  const [target, setTarget] = useState<EditorTarget>(projectSlug ? 'project' : 'global');
  const effectiveSlug = target === 'project' ? projectSlug : null;
  const query = useClaudeMd(effectiveSlug);
  const save = useSaveClaudeMd(effectiveSlug);
  const [recent, setRecent] = useState<RecentFileEntry[]>([]);
  const lastPushedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setRecent(loadRecentFiles());
  }, []);

  // Record the current target in the recent-files LRU whenever a load
  // succeeds. Keyed by kind+slug so switching back-and-forth still dedups.
  useEffect(() => {
    if (!query.data) return;
    const key = target === 'global' ? 'global' : `project:${projectSlug ?? ''}`;
    if (lastPushedKeyRef.current === key) return;
    const entry =
      target === 'global'
        ? ({ kind: 'global', label: 'Global CLAUDE.md' } as const)
        : projectSlug
          ? ({ kind: 'project', slug: projectSlug, label: projectSlug } as const)
          : null;
    if (!entry) return;
    setRecent(pushRecentFile(entry));
    lastPushedKeyRef.current = key;
  }, [query.data, target, projectSlug]);

  const openRecent = (entry: RecentFileEntry) => {
    if (entry.kind === 'global') {
      setTarget('global');
      return;
    }
    if (entry.slug && entry.slug !== projectSlug) {
      setSelectedProject(entry.slug);
    }
    setTarget('project');
  };

  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<unknown>(null);
  const setDocRef = useRef<((text: string) => void) | null>(null);
  const getDocRef = useRef<(() => string) | null>(null);
  const [mounted, setMounted] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastMtime, setLastMtime] = useState<string | null>(null);
  const [preview, setPreview] = useState<boolean>(false);
  const [previewText, setPreviewText] = useState<string>('');
  const [diffOpen, setDiffOpen] = useState<boolean>(false);

  useEffect(() => {
    setPreview(loadLayout().editorPreview ?? false);
  }, []);

  const togglePreview = () => {
    setPreview((prev) => {
      const next = !prev;
      patchLayout({ editorPreview: next });
      return next;
    });
  };

  useEffect(() => {
    if (!hostRef.current) return;
    let cancelled = false;
    (async () => {
      const [
        { EditorView, keymap, lineNumbers },
        { EditorState },
        { markdown },
        { oneDark },
        { defaultKeymap, history, historyKeymap },
      ] = await Promise.all([
        import('@codemirror/view'),
        import('@codemirror/state'),
        import('@codemirror/lang-markdown'),
        import('@codemirror/theme-one-dark'),
        import('@codemirror/commands'),
      ]);
      if (cancelled || !hostRef.current) return;

      const updateListener = EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          setDirty(true);
          setPreviewText(u.state.doc.toString());
        }
      });

      const state = EditorState.create({
        doc: '',
        extensions: [
          lineNumbers(),
          history(),
          markdown(),
          oneDark,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          updateListener,
        ],
      });
      const view = new EditorView({ state, parent: hostRef.current });
      viewRef.current = view;
      setDocRef.current = (text: string) => {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      };
      getDocRef.current = () => view.state.doc.toString();
      setMounted(true);
    })();
    return () => {
      cancelled = true;
      const view = viewRef.current as { destroy?: () => void } | null;
      view?.destroy?.();
      viewRef.current = null;
      setDocRef.current = null;
      getDocRef.current = null;
    };
  }, []);

  // Load new doc into the editor whenever the target changes or query finishes.
  useEffect(() => {
    if (!mounted || !query.data || !setDocRef.current) return;
    setDocRef.current(query.data.content);
    setPreviewText(query.data.content);
    setLastMtime(query.data.mtime);
    setDirty(false);
  }, [mounted, query.data]);

  const doSave = async () => {
    if (!getDocRef.current || save.isPending) return;
    try {
      const res = await save.mutateAsync({
        content: getDocRef.current(),
        ifUnmodifiedSince: lastMtime,
      });
      setLastMtime(res.mtime);
      setDirty(false);
      toastSuccess('CLAUDE.md zapisany', { id: 'claude-md-save' });
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === 'conflict') {
        toastWarning('File changed on disk', {
          id: 'claude-md-conflict',
          description: 'Reload the latest version (current edits will be lost).',
          duration: 8000,
          action: {
            label: 'Reload',
            onClick: () => {
              void query.refetch();
            },
          },
        });
      } else {
        toastError('Failed to save CLAUDE.md', {
          id: 'claude-md-save-error',
          description: e.code ?? 'save_failed',
        });
      }
    }
  };

  // Ctrl+S / Cmd+S.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void doSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // doSave is referentially unstable — we intentionally capture the current closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, save.isPending, lastMtime]);

  const isLoading = query.isLoading || !mounted;
  const canSwitchProject = !!projectSlug;

  return (
    <div className="editor-wrap">
      <div className="editor-head">
        <div className="editor-toggle">
          <button
            type="button"
            className={target === 'project' ? 'on' : ''}
            onClick={() => setTarget('project')}
            disabled={!canSwitchProject}
          >
            Per-project
          </button>
          <button
            type="button"
            className={target === 'global' ? 'on' : ''}
            onClick={() => setTarget('global')}
          >
            Global
          </button>
        </div>
        {recent.length > 0 && (
          <Popover>
            <PopoverTrigger className="editor-recent" title="Recently opened CLAUDE.md files">
              <span style={{ color: 'var(--fg-3)' }}>recent</span>
              <span className="name">
                {recent[0]?.kind === 'global' ? 'global' : (recent[0]?.label ?? '—')}
              </span>
              <IconChev dir="down" />
            </PopoverTrigger>
            <PopoverContent className="w-64 p-1">
              <ul className="flex flex-col">
                {recent.map((e, i) => {
                  const isCurrent =
                    e.kind === target && (e.kind === 'global' || e.slug === projectSlug);
                  return (
                    <li key={`${e.kind}:${e.slug ?? 'global'}:${i}`}>
                      <button
                        type="button"
                        onClick={() => openRecent(e)}
                        disabled={isCurrent}
                        className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs ${
                          isCurrent
                            ? 'cursor-default bg-[color:var(--bg-3)] text-[color:var(--fg-3)]'
                            : 'text-[color:var(--fg-1)] hover:bg-[color:var(--bg-2)]'
                        }`}
                      >
                        <span className="mono text-[9px] uppercase tracking-wider text-[color:var(--fg-4)]">
                          {e.kind === 'global' ? 'glb' : 'prj'}
                        </span>
                        <span className="truncate">{e.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </PopoverContent>
          </Popover>
        )}
        <span
          className="mono"
          style={{ fontSize: 10.5, color: 'var(--fg-3)' }}
          title={query.data?.path}
        >
          {query.data?.path ?? ''}
        </span>
        <div style={{ flex: 1 }} />
        {dirty && <span className="editor-dirty">● unsaved</span>}
        <CHButton
          variant={preview ? 'on' : 'outline'}
          size="sm"
          onClick={togglePreview}
          aria-pressed={preview}
          title="Toggle markdown preview"
        >
          preview
        </CHButton>
        <CHButton
          variant="outline"
          size="sm"
          onClick={() => setDiffOpen(true)}
          disabled={!query.data || !mounted}
          title="Show diff vs disk"
        >
          diff
        </CHButton>
        <CHButton
          variant="primary"
          size="sm"
          onClick={doSave}
          disabled={!dirty || save.isPending}
          title="Save (Ctrl+S)"
        >
          {save.isPending ? 'saving…' : 'save'} · <Kbd>⌘S</Kbd>
        </CHButton>
      </div>
      <DiffDialog
        open={diffOpen}
        onOpenChange={setDiffOpen}
        diskText={query.data?.content ?? ''}
        bufferText={getDocRef.current?.() ?? ''}
        filePath={query.data?.path ?? null}
        dirty={dirty}
        isSaving={save.isPending}
        onConfirmSave={async () => {
          await doSave();
          setDiffOpen(false);
        }}
      />
      <div className={`editor-body ${preview ? '' : 'single'}`}>
        <div className="relative min-h-0 flex-1">
          <div
            ref={hostRef}
            className="h-full min-h-0 [&_.cm-editor]:h-full [&_.cm-scroller]:font-mono"
            style={{ background: 'var(--bg-0)' }}
          />
          {isLoading && (
            <div
              className="absolute inset-0 flex flex-col gap-2 p-4"
              style={{ background: 'var(--bg-0)' }}
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          )}
        </div>
        {preview && (
          <div className="editor-preview" data-testid="markdown-preview">
            <Markdown text={previewText} />
          </div>
        )}
      </div>
    </div>
  );
}

interface DiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diskText: string;
  bufferText: string;
  filePath: string | null;
  dirty: boolean;
  isSaving: boolean;
  onConfirmSave: () => void | Promise<void>;
}

function DiffDialog({
  open,
  onOpenChange,
  diskText,
  bufferText,
  filePath,
  dirty,
  isSaving,
  onConfirmSave,
}: DiffDialogProps) {
  const unchanged = !dirty || diskText === bufferText;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Diff vs disk</DialogTitle>
          <DialogDescription>
            {filePath ? (
              <span className="font-mono text-[11px]">{filePath}</span>
            ) : (
              'Compare the current buffer with what is on disk.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded border border-neutral-800 bg-neutral-950 p-2">
          {unchanged ? (
            <p className="p-4 text-center text-sm text-neutral-400" data-testid="diff-unchanged">
              No changes to save.
            </p>
          ) : (
            <DiffView oldText={diskText} newText={bufferText} label="CLAUDE.md" />
          )}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button size="sm" onClick={() => void onConfirmSave()} disabled={unchanged || isSaving}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
