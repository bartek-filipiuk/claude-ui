import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import * as jobsStore from '@/lib/cron/jobs-store';
import { cronScheduler } from '@/lib/cron/scheduler';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

const CRON_TAG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const CreateBody = z.object({
  name: z.string().min(1).max(80),
  cronExpression: z.string().min(1).max(120),
  targetCronTag: z.string().regex(CRON_TAG_RE),
  prompt: z.string().min(1).max(16_384),
  enabled: z.boolean().optional(),
  readyCheckEnabled: z.boolean().optional(),
  retryOnNotReady: z.boolean().optional(),
  retryDelayMinutes: z.number().int().min(1).max(120).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
});

export async function GET(): Promise<NextResponse> {
  const jobs = await jobsStore.readAll();
  const enriched = jobs.map((j) => ({
    ...j,
    nextRun: cronScheduler.getNextRun(j.id)?.toISOString() ?? null,
  }));
  return NextResponse.json({ jobs: enriched }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let parsed;
  try {
    parsed = CreateBody.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const job = await jobsStore.create(parsed.data);
    if (job.enabled) await cronScheduler.reload(job.id);
    return NextResponse.json({ job }, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.startsWith('bad_cron')) {
      return NextResponse.json({ error: 'bad_cron', detail: msg.slice(9) }, { status: 400 });
    }
    logger.error({ err: msg }, 'job_create_failed');
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
