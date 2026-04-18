import { Cron } from 'croner';
import { logger } from '@/lib/server/logger';
import { getSingleton } from '@/lib/server/singleton';
import * as jobsStore from './jobs-store';
import * as runsStore from './runs-store';
import { cronExecutor } from './executor';

const PURGE_INTERVAL_MS = 60 * 60 * 1000; // 1h

interface ScheduledCron {
  jobId: string;
  cron: Cron;
}

class CronScheduler {
  private scheduled = new Map<string, ScheduledCron>();
  private purgeTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  async load(): Promise<void> {
    if (this.started) return;
    const jobs = await jobsStore.readAll();
    let registered = 0;
    for (const job of jobs) {
      if (!job.enabled) continue;
      try {
        this.register(job.id, job.cronExpression);
        registered += 1;
      } catch (err) {
        logger.warn(
          { err: (err as Error).message, jobId: job.id },
          'scheduler_register_failed',
        );
      }
    }
    this.started = true;
    this.purgeTimer = setInterval(() => {
      runsStore.purgeOldRuns().catch((err) => logger.warn({ err }, 'runs_purge_failed'));
    }, PURGE_INTERVAL_MS);
    this.purgeTimer.unref();
    logger.info({ registered, total: jobs.length }, 'cron_scheduler_loaded');
  }

  private register(jobId: string, expression: string): void {
    this.unregister(jobId);
    const cron = new Cron(expression, { protect: true }, () => {
      void this.dispatchRun(jobId);
    });
    this.scheduled.set(jobId, { jobId, cron });
  }

  private unregister(jobId: string): void {
    const existing = this.scheduled.get(jobId);
    if (!existing) return;
    try {
      existing.cron.stop();
    } catch {
      /* ignore */
    }
    this.scheduled.delete(jobId);
  }

  async reload(jobId: string): Promise<void> {
    const job = await jobsStore.getById(jobId);
    if (!job || !job.enabled) {
      this.unregister(jobId);
      return;
    }
    try {
      this.register(jobId, job.cronExpression);
    } catch (err) {
      logger.warn({ err: (err as Error).message, jobId }, 'scheduler_reload_failed');
    }
  }

  private async dispatchRun(jobId: string, attempt = 1): Promise<void> {
    try {
      const result = await cronExecutor.run(jobId, attempt);
      if (result.shouldRetry && result.retryDelayMinutes !== undefined) {
        const delayMs = result.retryDelayMinutes * 60 * 1000;
        setTimeout(() => void this.dispatchRun(jobId, attempt + 1), delayMs).unref();
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message, jobId }, 'dispatch_run_failed');
    }
  }

  async triggerNow(jobId: string): Promise<void> {
    await this.dispatchRun(jobId, 1);
  }

  getNextRun(jobId: string): Date | null {
    return this.scheduled.get(jobId)?.cron.nextRun() ?? null;
  }

  listNextRuns(limit = 5): Array<{ jobId: string; nextRun: Date }> {
    const out: Array<{ jobId: string; nextRun: Date }> = [];
    for (const [jobId, entry] of this.scheduled) {
      const next = entry.cron.nextRun();
      if (next) out.push({ jobId, nextRun: next });
    }
    out.sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime());
    return out.slice(0, limit);
  }

  stop(): void {
    for (const [jobId] of this.scheduled) this.unregister(jobId);
    if (this.purgeTimer) {
      clearInterval(this.purgeTimer);
      this.purgeTimer = null;
    }
    this.started = false;
  }
}

export const cronScheduler = getSingleton('cronScheduler', () => new CronScheduler());
