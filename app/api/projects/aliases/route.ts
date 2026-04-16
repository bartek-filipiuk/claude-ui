import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { readAliases, setAlias } from '@/lib/aliases/io';
import { isValidSlug } from '@/lib/jsonl/slug';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

const PatchBody = z.object({
  slug: z.string().min(1).max(256),
  alias: z.string().max(120).nullable(),
});

export async function GET(): Promise<NextResponse> {
  const aliases = await readAliases();
  return NextResponse.json({ aliases }, { headers: { 'Cache-Control': 'no-store' } });
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
  try {
    const aliases = await setAlias(body.slug, body.alias);
    return NextResponse.json({ aliases }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const code = (err as Error).message;
    if (code === 'invalid_alias') {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    logger.error({ err: code }, 'aliases_write_failed');
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
