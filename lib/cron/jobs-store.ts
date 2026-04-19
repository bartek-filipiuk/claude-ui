import { mkdir, readFile, rename, writeFile, chmod } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { Cron } from 'croner';
import { z } from 'zod';
import { PATHS } from '@/lib/server/config';

const CRON_TAG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const JobStatusSchema = z.enum([
  'sent',
  'tab_not_found',
  'pty_dead',
  'tab_not_ready',
  'locked',
  'error',
  'never_run',
]);

export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  cronExpression: z.string().min(1).max(120),
  targetCronTag: z.string().regex(CRON_TAG_RE),
  prompt: z.string().min(1).max(16_384),
  enabled: z.boolean(),
  readyCheckEnabled: z.boolean(),
  retryOnNotReady: z.boolean(),
  retryDelayMinutes: z.number().int().min(1).max(120),
  maxRetries: z.number().int().min(0).max(10),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  lastRunAt: z.number().int().nonnegative().optional(),
  lastStatus: JobStatusSchema.optional(),
  lastError: z.string().max(500).optional(),
});

export type Job = z.infer<typeof JobSchema>;

const FileSchema = z.object({
  version: z.literal(1),
  jobs: z.array(JobSchema),
});

const FILE_PATH = join(PATHS.CODEHELM_STATE_DIR, 'jobs.json');

let mutex = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutex.then(fn, fn);
  mutex = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function ensureDir(): Promise<void> {
  await mkdir(dirname(FILE_PATH), { recursive: true, mode: 0o700 });
}

async function atomicWrite(content: string): Promise<void> {
  await ensureDir();
  const tmp = `${FILE_PATH}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, content, { mode: 0o600 });
  await chmod(tmp, 0o600).catch(() => undefined);
  await rename(tmp, FILE_PATH);
}

async function innerReadAll(): Promise<Job[]> {
  try {
    const raw = await readFile(FILE_PATH, 'utf8');
    const parsed = FileSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    return parsed.data.jobs;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function writeAll(jobs: Job[]): Promise<void> {
  const payload = JSON.stringify({ version: 1, jobs }, null, 2);
  await atomicWrite(payload);
}

export async function readAll(): Promise<Job[]> {
  return enqueue(() => innerReadAll());
}

export async function getById(id: string): Promise<Job | null> {
  const jobs = await readAll();
  return jobs.find((j) => j.id === id) ?? null;
}

export interface CreateJobInput {
  name: string;
  cronExpression: string;
  targetCronTag: string;
  prompt: string;
  enabled?: boolean | undefined;
  readyCheckEnabled?: boolean | undefined;
  retryOnNotReady?: boolean | undefined;
  retryDelayMinutes?: number | undefined;
  maxRetries?: number | undefined;
}

export async function create(input: CreateJobInput): Promise<Job> {
  return enqueue(async () => {
    validateCronExpression(input.cronExpression);
    const now = Date.now();
    const job: Job = {
      id: randomUUID(),
      name: input.name.trim().slice(0, 80),
      cronExpression: input.cronExpression.trim(),
      targetCronTag: input.targetCronTag,
      prompt: input.prompt,
      enabled: input.enabled ?? true,
      readyCheckEnabled: input.readyCheckEnabled ?? true,
      retryOnNotReady: input.retryOnNotReady ?? true,
      retryDelayMinutes: input.retryDelayMinutes ?? 5,
      maxRetries: input.maxRetries ?? 3,
      createdAt: now,
      updatedAt: now,
    };
    const parsed = JobSchema.parse(job);
    const current = await innerReadAll();
    await writeAll([...current, parsed]);
    return parsed;
  });
}

export interface UpdateJobInput {
  name?: string | undefined;
  cronExpression?: string | undefined;
  targetCronTag?: string | undefined;
  prompt?: string | undefined;
  enabled?: boolean | undefined;
  readyCheckEnabled?: boolean | undefined;
  retryOnNotReady?: boolean | undefined;
  retryDelayMinutes?: number | undefined;
  maxRetries?: number | undefined;
}

export async function update(id: string, patch: UpdateJobInput): Promise<Job> {
  return enqueue(async () => {
    const current = await innerReadAll();
    const idx = current.findIndex((j) => j.id === id);
    if (idx === -1) throw new Error('not_found');
    const existing = current[idx];
    if (!existing) throw new Error('not_found');
    if (patch.cronExpression) validateCronExpression(patch.cronExpression);
    const next: Job = {
      ...existing,
      ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 80) } : {}),
      ...(patch.cronExpression !== undefined ? { cronExpression: patch.cronExpression.trim() } : {}),
      ...(patch.targetCronTag !== undefined ? { targetCronTag: patch.targetCronTag } : {}),
      ...(patch.prompt !== undefined ? { prompt: patch.prompt } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.readyCheckEnabled !== undefined ? { readyCheckEnabled: patch.readyCheckEnabled } : {}),
      ...(patch.retryOnNotReady !== undefined ? { retryOnNotReady: patch.retryOnNotReady } : {}),
      ...(patch.retryDelayMinutes !== undefined ? { retryDelayMinutes: patch.retryDelayMinutes } : {}),
      ...(patch.maxRetries !== undefined ? { maxRetries: patch.maxRetries } : {}),
      updatedAt: Date.now(),
    };
    const parsed = JobSchema.parse(next);
    const copy = [...current];
    copy[idx] = parsed;
    await writeAll(copy);
    return parsed;
  });
}

export async function remove(id: string): Promise<boolean> {
  return enqueue(async () => {
    const current = await innerReadAll();
    const next = current.filter((j) => j.id !== id);
    if (next.length === current.length) return false;
    await writeAll(next);
    return true;
  });
}

export interface LastRunPatch {
  lastRunAt: number;
  lastStatus: JobStatus;
  lastError?: string;
}

export async function recordLastRun(id: string, patch: LastRunPatch): Promise<Job | null> {
  return enqueue(async () => {
    const current = await innerReadAll();
    const idx = current.findIndex((j) => j.id === id);
    if (idx === -1) return null;
    const existing = current[idx];
    if (!existing) return null;
    const next: Job = {
      ...existing,
      lastRunAt: patch.lastRunAt,
      lastStatus: patch.lastStatus,
      ...(patch.lastError !== undefined ? { lastError: patch.lastError.slice(0, 500) } : {}),
    };
    if (patch.lastError === undefined) {
      delete (next as Partial<Job>).lastError;
    }
    const parsed = JobSchema.parse(next);
    const copy = [...current];
    copy[idx] = parsed;
    await writeAll(copy);
    return parsed;
  });
}

export function validateCronExpression(expr: string): void {
  try {
    new Cron(expr, { paused: true });
  } catch (err) {
    throw new Error(`bad_cron:${(err as Error).message.slice(0, 80)}`);
  }
}

export function nextRun(expr: string): Date | null {
  try {
    const c = new Cron(expr, { paused: true });
    return c.nextRun();
  } catch {
    return null;
  }
}
