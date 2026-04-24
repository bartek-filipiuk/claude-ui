import { appendFile, mkdir, readFile, chmod, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { PATHS } from '@/lib/server/config';

const JobRunSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  triggeredAt: z.number().int().nonnegative(),
  status: z.enum(['sent', 'tab_not_found', 'pty_dead', 'tab_not_ready', 'locked', 'error']),
  errorMessage: z.string().max(500).optional(),
  persistentTabId: z.string().uuid().optional(),
  promptLen: z.number().int().nonnegative(),
  attempt: z.number().int().min(1).max(11),
});

export type JobRun = z.infer<typeof JobRunSchema>;

const FILE_PATH = join(PATHS.CODEHELM_STATE_DIR, 'job-runs.jsonl');
const MAX_RUNS_PER_JOB = 100;

let mutex = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutex.then(fn, fn);
  mutex = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function ensureFile(): Promise<void> {
  await mkdir(dirname(FILE_PATH), { recursive: true, mode: 0o700 });
}

export interface AppendInput {
  jobId: string;
  status: JobRun['status'];
  errorMessage?: string;
  persistentTabId?: string;
  promptLen: number;
  attempt?: number;
}

export async function append(input: AppendInput): Promise<JobRun> {
  return enqueue(async () => {
    await ensureFile();
    const run: JobRun = {
      id: randomUUID(),
      jobId: input.jobId,
      triggeredAt: Date.now(),
      status: input.status,
      ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage.slice(0, 500) } : {}),
      ...(input.persistentTabId !== undefined ? { persistentTabId: input.persistentTabId } : {}),
      promptLen: input.promptLen,
      attempt: input.attempt ?? 1,
    };
    const parsed = JobRunSchema.parse(run);
    await appendFile(FILE_PATH, `${JSON.stringify(parsed)}\n`, { mode: 0o600 });
    await chmod(FILE_PATH, 0o600).catch(() => undefined);
    return parsed;
  });
}

async function readAllLines(): Promise<JobRun[]> {
  try {
    const raw = await readFile(FILE_PATH, 'utf8');
    if (!raw) return [];
    const out: JobRun[] = [];
    for (const line of raw.split('\n')) {
      if (!line) continue;
      try {
        const parsed = JobRunSchema.safeParse(JSON.parse(line));
        if (parsed.success) out.push(parsed.data);
      } catch {
        /* skip malformed */
      }
    }
    return out;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export async function listForJob(jobId: string, limit = 50): Promise<JobRun[]> {
  const all = await readAllLines();
  const filtered = all.filter((r) => r.jobId === jobId);
  filtered.sort((a, b) => b.triggeredAt - a.triggeredAt);
  return filtered.slice(0, limit);
}

export async function listRecentFailures(limit = 10): Promise<JobRun[]> {
  const all = await readAllLines();
  const fails = all.filter((r) => r.status !== 'sent');
  fails.sort((a, b) => b.triggeredAt - a.triggeredAt);
  return fails.slice(0, limit);
}

/**
 * Keeps the last MAX_RUNS_PER_JOB entries per job. Called by scheduler on a
 * low-frequency timer to prevent runs.jsonl growth.
 */
export async function purgeOldRuns(): Promise<number> {
  return enqueue(async () => {
    const all = await readAllLines();
    const grouped = new Map<string, JobRun[]>();
    for (const r of all) {
      const arr = grouped.get(r.jobId) ?? [];
      arr.push(r);
      grouped.set(r.jobId, arr);
    }
    let keep: JobRun[] = [];
    for (const arr of grouped.values()) {
      arr.sort((a, b) => b.triggeredAt - a.triggeredAt);
      keep = keep.concat(arr.slice(0, MAX_RUNS_PER_JOB));
    }
    const removed = all.length - keep.length;
    if (removed <= 0) return 0;
    keep.sort((a, b) => a.triggeredAt - b.triggeredAt);
    const payload = keep.map((r) => JSON.stringify(r)).join('\n') + (keep.length ? '\n' : '');
    const tmp = `${FILE_PATH}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, payload, { mode: 0o600 });
    await chmod(tmp, 0o600).catch(() => undefined);
    await rename(tmp, FILE_PATH);
    return removed;
  });
}
