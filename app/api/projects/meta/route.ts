import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { readMeta, setProjectMeta } from '@/lib/projects/meta';
import { isValidSlug } from '@/lib/jsonl/slug';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

const PatchBody = z.object({
  slug: z.string().min(1).max(256),
  alias: z.string().max(120).nullable().optional(),
  favorite: z.boolean().optional(),
});

export async function GET(): Promise<NextResponse> {
  const meta = await readMeta();
  return NextResponse.json({ meta }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }
  if (!isValidSlug(body.slug)) {
    return NextResponse.json({ error: 'invalid_slug' }, { status: 400 });
  }
  if (body.alias === undefined && body.favorite === undefined) {
    return NextResponse.json({ error: 'empty_patch' }, { status: 400 });
  }
  try {
    const patch: { alias?: string | null; favorite?: boolean } = {};
    if (body.alias !== undefined) patch.alias = body.alias;
    if (body.favorite !== undefined) patch.favorite = body.favorite;
    const meta = await setProjectMeta(body.slug, patch);
    return NextResponse.json({ meta }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const code = (err as Error).message;
    if (code === 'invalid_alias') {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    logger.error({ err: code }, 'meta_write_failed');
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
