import type { WebSocket } from 'ws';
import { projectsWatcher, type WatchEvent } from '@/lib/watcher/chokidar';
import { logger } from '@/lib/server/logger';

const FLUSH_MS = 100;
const MAX_PER_PUSH = 50;

interface Ctx {
  buffer: WatchEvent[];
  flushTimer: ReturnType<typeof setTimeout> | null;
  listener: (e: WatchEvent) => void;
}

function safeSend(ws: WebSocket, payload: unknown): void {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch (err) {
    logger.warn({ err }, 'watch_send_err');
  }
}

/**
 * Attaches a client WS to the singleton project watcher. Events are batched
 * every FLUSH_MS ms, capped at MAX_PER_PUSH per push, so a burst of JSONL
 * appends cannot saturate the socket.
 */
export function attachWatchChannel(ws: WebSocket): void {
  projectsWatcher.start();
  const ctx: Ctx = { buffer: [], flushTimer: null, listener: () => undefined };

  const flush = () => {
    ctx.flushTimer = null;
    if (ctx.buffer.length === 0) return;
    const batch = ctx.buffer.splice(0, MAX_PER_PUSH);
    safeSend(ws, { type: 'events', events: batch });
    if (ctx.buffer.length > 0) {
      ctx.flushTimer = setTimeout(flush, FLUSH_MS);
    }
  };

  ctx.listener = (e) => {
    ctx.buffer.push(e);
    if (!ctx.flushTimer) ctx.flushTimer = setTimeout(flush, FLUSH_MS);
  };
  projectsWatcher.on('event', ctx.listener);

  safeSend(ws, { type: 'ready' });

  const cleanup = () => {
    projectsWatcher.off('event', ctx.listener);
    if (ctx.flushTimer) clearTimeout(ctx.flushTimer);
    ctx.buffer.length = 0;
  };

  ws.on('close', cleanup);
  ws.on('error', (err) => {
    logger.warn({ err }, 'watch_ws_err');
    cleanup();
  });
}
