import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isValidSlug } from '@/lib/jsonl/slug';
import { inferCwdFromSlug, listProjects } from '@/lib/jsonl/index';
import { assertInside } from '@/lib/security/path-guard';
import { PATHS } from '@/lib/server/config';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

const Body = z.object({
  slug: z.string().min(1).max(256),
  resumeSessionId: z
    .string()
    .regex(/^[0-9a-f-]{8,}$/i)
    .optional(),
});

/**
 * Resolves a project slug to a safe cwd and command for the Terminal to spawn.
 * Does NOT spawn itself — client receives metadata and opens a WS /api/ws/pty.
 * Rate limiting and PTY cap live in lib/pty/manager on the actual spawn path.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'sessions_new_bad_body');
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }
  if (!isValidSlug(parsed.slug)) {
    return NextResponse.json({ error: 'invalid_slug' }, { status: 400 });
  }

  const projects = await listProjects();
  const project = projects.find((p) => p.slug === parsed.slug);
  if (!project) {
    return NextResponse.json({ error: 'project_not_found' }, { status: 404 });
  }
  const resolvedCwd = project.resolvedCwd ?? (await inferCwdFromSlug(parsed.slug));
  if (!resolvedCwd) {
    return NextResponse.json({ error: 'no_resolved_cwd' }, { status: 409 });
  }

  let safeCwd: string;
  try {
    safeCwd = await assertInside(PATHS.HOME, resolvedCwd);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'sessions_new_cwd_escape');
    return NextResponse.json({ error: 'cwd_outside_home' }, { status: 403 });
  }

  const args = parsed.resumeSessionId ? ['--resume', parsed.resumeSessionId] : [];

  return NextResponse.json(
    {
      cwd: safeCwd,
      command: 'claude',
      args,
      title: parsed.resumeSessionId
        ? `claude --resume ${parsed.resumeSessionId.slice(0, 8)}`
        : `claude (${project.slug.slice(-24)})`,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
