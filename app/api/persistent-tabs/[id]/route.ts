import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  deletePersistentTab,
  respawnPersistentTab,
  updatePersistentTab,
} from '@/lib/pty/persistent-tabs-service';
import { CRON_TAG_RE } from '@/lib/pty/persistent-tabs-store';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

const UuidSchema = z.string().uuid();

const UpdateBody = z.object({
  title: z.string().min(1).max(80).optional(),
  initCommand: z.string().max(2048).nullable().optional(),
  cronTag: z.string().regex(CRON_TAG_RE).nullable().optional(),
});

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
    const tab = await updatePersistentTab(id, parsed.data);
    return NextResponse.json({ tab });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (msg === 'cron_tag_taken')
      return NextResponse.json({ error: 'cron_tag_taken' }, { status: 409 });
    logger.error({ err: msg }, 'persistent_tab_update_failed');
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
  const ok = await deletePersistentTab(id);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  }
  try {
    const handle = await respawnPersistentTab(id);
    if (!handle) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ptyId: handle.id });
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'persistent_tab_respawn_failed');
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
