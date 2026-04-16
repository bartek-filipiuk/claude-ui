import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { LIMITS } from '@/lib/server/config';
import { resolveClaudeMdTarget } from '@/lib/claude-md/write-guard';
import { readClaudeMd, writeClaudeMd } from '@/lib/claude-md/io';
import { mapError } from '../route';

export const dynamic = 'force-dynamic';

const PutBody = z.object({ content: z.string().max(LIMITS.CLAUDE_MD_MAX_BYTES) });

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await ctx.params;
  try {
    const target = await resolveClaudeMdTarget(slug);
    const result = await readClaudeMd(target.path);
    if (!result) {
      return NextResponse.json(
        { kind: target.kind, path: target.path, content: '', mtime: null, size: 0 },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(
      { kind: target.kind, path: target.path, ...result },
      { headers: { 'Cache-Control': 'no-store', 'Last-Modified': result.mtime } },
    );
  } catch (err) {
    return mapError(err);
  }
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await ctx.params;
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > LIMITS.CLAUDE_MD_MAX_BYTES) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 });
  }
  let body: z.infer<typeof PutBody>;
  try {
    body = PutBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }
  try {
    const target = await resolveClaudeMdTarget(slug);
    const ifUnmodifiedSince = req.headers.get('if-unmodified-since');
    const out = await writeClaudeMd(target.path, body.content, {
      ...(ifUnmodifiedSince ? { ifUnmodifiedSince } : {}),
    });
    return NextResponse.json(
      { kind: target.kind, path: target.path, ...out },
      { headers: { 'Last-Modified': out.mtime } },
    );
  } catch (err) {
    return mapError(err);
  }
}
