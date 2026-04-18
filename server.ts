import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { parse } from 'node:url';
import next from 'next';
import { getServerPort, getServerToken } from '@/lib/server/config';
import { logger } from '@/lib/server/logger';
import { runMiddleware } from '@/lib/server/middleware';
import { attachUpgradeRouter } from '@/lib/ws/server';
import { ptyManager } from '@/lib/pty/manager';
import { projectsWatcher } from '@/lib/watcher/chokidar';
import { restoreAllAtStartup } from '@/lib/pty/persistent-tabs-service';
import { cronScheduler } from '@/lib/cron/scheduler';

const dev = process.env['NODE_ENV'] !== 'production';

async function main(): Promise<void> {
  const port = getServerPort();
  getServerToken();

  const app = next({ dev, hostname: '127.0.0.1', port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (runMiddleware(req, res)) return;
    const parsed = parse(req.url ?? '/', true);
    handle(req, res, parsed).catch((err) => {
      logger.error({ err }, 'next_handler_error');
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end();
      }
    });
  });

  attachUpgradeRouter(httpServer);

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen({ port, host: '127.0.0.1' }, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });

  logger.info({ port }, 'codehelm_ready');

  try {
    await restoreAllAtStartup();
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'persistent_tabs_restore_failed');
  }
  try {
    await cronScheduler.load();
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'cron_scheduler_load_failed');
  }

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting_down');
    cronScheduler.stop();
    ptyManager.killAll('SIGTERM');
    void projectsWatcher.stop();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'fatal');
  process.exit(1);
});
