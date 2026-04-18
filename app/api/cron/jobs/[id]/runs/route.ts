import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import * as runsStore from '@/lib/cron/runs-store';

export const dynamic = 'force-dynamic';

const UuidSchema = z.string().uuid();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  }
  const limitRaw = req.nextUrl.searchParams.get('limit') ?? '50';
  const limit = Math.max(1, Math.min(500, Number(limitRaw) || 50));
  const runs = await runsStore.listForJob(id, limit);
  return NextResponse.json({ runs }, { headers: { 'Cache-Control': 'no-store' } });
}
