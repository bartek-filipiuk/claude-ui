import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import * as jobsStore from '@/lib/cron/jobs-store';
import { cronScheduler } from '@/lib/cron/scheduler';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

const CRON_TAG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const UpdateBody = z.object({
  name: z.string().min(1).max(80).optional(),
  cronExpression: z.string().min(1).max(120).optional(),
  targetCronTag: z.string().regex(CRON_TAG_RE).optional(),
  prompt: z.string().min(1).max(16_384).optional(),
  enabled: z.boolean().optional(),
  readyCheckEnabled: z.boolean().optional(),
  retryOnNotReady: z.boolean().optional(),
  retryDelayMinutes: z.number().int().min(1).max(120).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
});

const UuidSchema = z.string().uuid();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  }
  const job = await jobsStore.getById(id);
  if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const nextRun = cronScheduler.getNextRun(id);
  return NextResponse.json({ job: { ...job, nextRun: nextRun?.toISOString() ?? null } });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  }
  let parsed;
  try {
    parsed = UpdateBody.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const job = await jobsStore.update(id, parsed.data);
    await cronScheduler.reload(id);
    return NextResponse.json({ job });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'not_found') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (msg.startsWith('bad_cron')) {
      return NextResponse.json({ error: 'bad_cron', detail: msg.slice(9) }, { status: 400 });
    }
    logger.error({ err: msg }, 'job_update_failed');
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  }
  const removed = await jobsStore.remove(id);
  if (!removed) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await cronScheduler.reload(id);
  return NextResponse.json({ ok: true });
}
