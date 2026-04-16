import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocketServer } from 'ws';
import { parseCookies } from '@/lib/server/middleware';
import { isOriginAllowed } from '@/lib/security/host-check';
import { safeCompare } from '@/lib/security/token';
import { COOKIE_NAMES, getServerPort, getServerToken } from '@/lib/server/config';
import { logger } from '@/lib/server/logger';
import { attachPtyChannel } from './pty-channel';
import { attachWatchChannel } from './watch-channel';

/**
 * Attach upgrade router to the same HTTP server. Delegates Next's HMR
 * websocket, accepts /api/ws/pty and /api/ws/watch after Origin + cookie
 * verification. CSRF for PTY happens inside the channel (first message).
 */
export function attachUpgradeRouter(server: HttpServer): void {
  const ptyWss = new WebSocketServer({ noServer: true });
  const watchWss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = req.url ?? '';
    if (url.startsWith('/_next/')) return;

    if (url === '/api/ws/pty') {
      if (!checkWsAuth(req)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      const cookies = parseCookies(req.headers.cookie);
      const csrfCookie = cookies.get(COOKIE_NAMES.CSRF) ?? '';
      ptyWss.handleUpgrade(req, socket, head, (ws) => {
        attachPtyChannel(ws, csrfCookie);
      });
      return;
    }

    if (url === '/api/ws/watch') {
      if (!checkWsAuth(req)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      watchWss.handleUpgrade(req, socket, head, (ws) => {
        attachWatchChannel(ws);
      });
      return;
    }

    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  });
}

function checkWsAuth(req: IncomingMessage): boolean {
  const port = getServerPort();
  if (!isOriginAllowed(req.headers.origin ?? null, port)) {
    logger.warn({ origin: req.headers.origin }, 'ws_origin_denied');
    return false;
  }
  const cookies = parseCookies(req.headers.cookie);
  const auth = cookies.get(COOKIE_NAMES.AUTH) ?? '';
  if (!auth || !safeCompare(auth, getServerToken())) {
    logger.warn({}, 'ws_auth_denied');
    return false;
  }
  return true;
}
