import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { LIMITS } from '@/lib/server/config';
import { resolveClaudeMdTarget } from '@/lib/claude-md/write-guard';
import { readClaudeMd, writeClaudeMd } from '@/lib/claude-md/io';
import { PathGuardError } from '@/lib/security/path-guard';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

const PutBody = z.object({ content: z.string().max(LIMITS.CLAUDE_MD_MAX_BYTES) });

export async function GET(): Promise<NextResponse> {
  const target = await resolveClaudeMdTarget(null);
  const result = await readClaudeMd(target.path);
  if (!result) {
    return NextResponse.json(
      { kind: target.kind, path: target.path, content: '', mtime: null, size: 0 },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return NextResponse.json(
    { kind: target.kind, path: target.path, ...result },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Last-Modified': result.mtime,
      },
    },
  );
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
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
    const target = await resolveClaudeMdTarget(null);
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

export function mapError(err: unknown): NextResponse {
  const msg = (err as Error).message;
  if (err instanceof PathGuardError) {
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  if (msg === 'conflict') {
    return NextResponse.json({ error: 'conflict' }, { status: 412 });
  }
  if (msg === 'too_large') {
    return NextResponse.json({ error: 'too_large' }, { status: 413 });
  }
  logger.error({ err: msg }, 'claude_md_error');
  return NextResponse.json({ error: 'internal' }, { status: 500 });
}
