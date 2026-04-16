import { EventEmitter } from 'node:events';
import { basename, dirname, relative } from 'node:path';
import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import { PATHS } from '@/lib/server/config';
import { isValidSlug } from '@/lib/jsonl/slug';
import { logger } from '@/lib/server/logger';

const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i;

export type WatchEvent =
  | { kind: 'project-added'; slug: string }
  | { kind: 'session-added'; slug: string; sessionId: string }
  | { kind: 'session-updated'; slug: string; sessionId: string };

interface WatcherEvents {
  event: (e: WatchEvent) => void;
}

function parseSessionPath(absPath: string): { slug: string; sessionId: string } | null {
  const rel = relative(PATHS.CLAUDE_PROJECTS_DIR, absPath);
  if (rel.startsWith('..')) return null;
  const parts = rel.split('/');
  if (parts.length !== 2) return null;
  const [slug, file] = parts;
  if (!slug || !file) return null;
  if (!isValidSlug(slug)) return null;
  if (!SESSION_RE.test(file)) return null;
  return { slug, sessionId: basename(file, '.jsonl') };
}

function parseProjectDir(absPath: string): string | null {
  const rel = relative(PATHS.CLAUDE_PROJECTS_DIR, absPath);
  if (!rel || rel.startsWith('..')) return null;
  const parts = rel.split('/');
  if (parts.length !== 1) return null;
  const [slug] = parts;
  if (!slug || !isValidSlug(slug)) return null;
  return slug;
}

/**
 * Singleton fs watcher over ~/.claude/projects/. Emits metadata-only events
 * (slug, sessionId) — never path prefixes from outside the root, never file
 * contents. Debounces bursty writes so JSONL appends do not flood clients.
 */
class ProjectsWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly debounceMs = 200;

  override on<K extends keyof WatcherEvents>(event: K, listener: WatcherEvents[K]): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }
  override off<K extends keyof WatcherEvents>(event: K, listener: WatcherEvents[K]): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  start(): void {
    if (this.watcher) return;
    this.watcher = chokidar.watch(PATHS.CLAUDE_PROJECTS_DIR, {
      ignoreInitial: true,
      followSymlinks: false,
      depth: 2,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
      ignored: (p) => p.includes('/.git/') || p.endsWith('.swp'),
    });

    const emit = (e: WatchEvent) => this.emit('event', e);

    this.watcher.on('addDir', (p) => {
      const slug = parseProjectDir(p);
      if (slug) emit({ kind: 'project-added', slug });
    });

    this.watcher.on('add', (p) => {
      const parsed = parseSessionPath(p);
      if (parsed) emit({ kind: 'session-added', ...parsed });
    });

    this.watcher.on('change', (p) => {
      const parsed = parseSessionPath(p);
      if (!parsed) return;
      const key = `${parsed.slug}/${parsed.sessionId}`;
      const existing = this.debounceTimers.get(key);
      if (existing) clearTimeout(existing);
      this.debounceTimers.set(
        key,
        setTimeout(() => {
          this.debounceTimers.delete(key);
          emit({ kind: 'session-updated', ...parsed });
        }, this.debounceMs),
      );
    });

    this.watcher.on('error', (err) => {
      logger.warn({ err: (err as Error).message }, 'watcher_error');
    });

    logger.info({ dir: PATHS.CLAUDE_PROJECTS_DIR }, 'watcher_started');
  }

  async stop(): Promise<void> {
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.removeAllListeners();
  }

  hasListeners(): boolean {
    return this.listenerCount('event') > 0;
  }
}

export const projectsWatcher = new ProjectsWatcher();

// Tests may need to reset the singleton between server starts.
export function _resetWatcherForTests(): void {
  projectsWatcher.removeAllListeners();
  void projectsWatcher.stop();
}

// Silence the unused-file parser warning for the path helper export.
export { parseSessionPath, parseProjectDir };
export { dirname };
