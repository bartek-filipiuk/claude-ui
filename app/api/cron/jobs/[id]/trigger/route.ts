import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import * as jobsStore from '@/lib/cron/jobs-store';
import { cronExecutor } from '@/lib/cron/executor';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

const UuidSchema = z.string().uuid();

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  }
  const job = await jobsStore.getById(id);
  if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  try {
    const result = await cronExecutor.run(id, 1);
    return NextResponse.json({ result });
  } catch (err) {
    logger.error({ err: (err as Error).message, jobId: id }, 'manual_trigger_failed');
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
