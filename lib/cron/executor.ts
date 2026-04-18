import { ptyManager } from '@/lib/pty/manager';
import { persistentTabsRegistry } from '@/lib/pty/persistent-tabs-registry';
import { audit } from '@/lib/server/audit';
import { logger } from '@/lib/server/logger';
import * as jobsStore from './jobs-store';
import * as runsStore from './runs-store';
import { tabLockManager } from './tab-lock';

const LOCK_RELEASE_DELAY_MS = 5000;

export interface ExecuteResult {
  status: runsStore.JobRun['status'];
  errorMessage?: string;
  attempt: number;
  shouldRetry: boolean;
  retryDelayMinutes?: number;
}

export interface ExecutorHooks {
  onCompleted?: (jobId: string, result: ExecuteResult) => void;
}

export class Executor {
  constructor(private hooks: ExecutorHooks = {}) {}

  async run(jobId: string, attempt = 1): Promise<ExecuteResult> {
    const job = await jobsStore.getById(jobId);
    if (!job) {
      return { status: 'error', errorMessage: 'job_not_found', attempt, shouldRetry: false };
    }
    if (!job.enabled) {
      return { status: 'error', errorMessage: 'disabled', attempt, shouldRetry: false };
    }

    const entry = persistentTabsRegistry.findByCronTag(job.targetCronTag);
    if (!entry) {
      return this.finalize(job, {
        status: 'tab_not_found',
        errorMessage: `no persistent tab with cron_tag='${job.targetCronTag}'`,
        attempt,
        shouldRetry: false,
      });
    }

    const handle = ptyManager.get(entry.ptyId);
    if (!handle || handle.exited) {
      return this.finalize(job, {
        status: 'pty_dead',
        errorMessage: 'persistent PTY is no longer alive',
        attempt,
        shouldRetry: false,
      });
    }

    if (job.readyCheckEnabled && !handle.isReady()) {
      const shouldRetry = job.retryOnNotReady && attempt <= job.maxRetries;
      return this.finalize(job, {
        status: 'tab_not_ready',
        errorMessage: 'Claude is not at input prompt',
        attempt,
        shouldRetry,
        ...(shouldRetry ? { retryDelayMinutes: job.retryDelayMinutes } : {}),
      });
    }

    if (!tabLockManager.acquire(entry.tab.persistentId)) {
      return this.finalize(job, {
        status: 'locked',
        errorMessage: 'another write is in progress',
        attempt,
        shouldRetry: false,
      });
    }

    try {
      const payload = wrapBracketedPaste(job.prompt);
      handle.write(payload);
    } catch (err) {
      tabLockManager.release(entry.tab.persistentId);
      return this.finalize(job, {
        status: 'error',
        errorMessage: (err as Error).message.slice(0, 300),
        attempt,
        shouldRetry: false,
      });
    }

    setTimeout(
      () => tabLockManager.release(entry.tab.persistentId),
      LOCK_RELEASE_DELAY_MS,
    );

    return this.finalize(job, {
      status: 'sent',
      attempt,
      shouldRetry: false,
    });
  }

  private async finalize(
    job: jobsStore.Job,
    result: ExecuteResult & { status: runsStore.JobRun['status'] },
  ): Promise<ExecuteResult> {
    const entry = persistentTabsRegistry.findByCronTag(job.targetCronTag);
    await runsStore
      .append({
        jobId: job.id,
        status: result.status,
        ...(result.errorMessage !== undefined ? { errorMessage: result.errorMessage } : {}),
        ...(entry ? { persistentTabId: entry.tab.persistentId } : {}),
        promptLen: job.prompt.length,
        attempt: result.attempt,
      })
      .catch((err) => logger.warn({ err }, 'runs_append_failed'));
    await jobsStore
      .recordLastRun(job.id, {
        lastRunAt: Date.now(),
        lastStatus: result.status,
        ...(result.errorMessage !== undefined ? { lastError: result.errorMessage } : {}),
      })
      .catch((err) => logger.warn({ err }, 'last_run_record_failed'));
    await audit({
      event: 'cron.cron_write',
      jobId: job.id,
      persistentTabId: entry?.tab.persistentId,
      cronTag: job.targetCronTag,
      promptLen: job.prompt.length,
      status: result.status,
      attempt: result.attempt,
    }).catch((err) => logger.warn({ err }, 'audit_failed'));
    this.hooks.onCompleted?.(job.id, result);
    return result;
  }
}

function wrapBracketedPaste(prompt: string): string {
  const START = '\x1b[200~';
  const END = '\x1b[201~';
  return `${START}${prompt}${END}\r`;
}

export const cronExecutor = new Executor();
