import { NextResponse, type NextRequest } from 'next/server';
import { execFile } from 'node:child_process';
import { readlink, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { z } from 'zod';
import { ptyManager } from '@/lib/pty/manager';
import { persistentTabsRegistry } from '@/lib/pty/persistent-tabs-registry';
import { assertInside } from '@/lib/security/path-guard';
import { PATHS } from '@/lib/server/config';
import { isLinux, isMacOS } from '@/lib/server/platform';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

const exec = promisify(execFile);
const GIT_TIMEOUT_MS = 2000;
const RATE_WINDOW_MS = 60_000;
const RATE_CAP = 120;
const callLog: number[] = [];

const Query = z.object({
  persistentId: z.string().uuid(),
});

function rateLimited(now: number): boolean {
  while (callLog.length > 0 && now - callLog[0]! > RATE_WINDOW_MS) {
    callLog.shift();
  }
  if (callLog.length >= RATE_CAP) return true;
  callLog.push(now);
  return false;
}

/**
 * Resolve the current working directory of a running PID. On Linux this is
 * the kernel-authoritative /proc/<pid>/cwd symlink. On macOS we fall back to
 * `lsof -a -d cwd -p <pid> -Fn` which prints the cwd on lines prefixed with
 * 'n'. Returns null when the host is unsupported or the lookup fails — the
 * caller degrades gracefully to the cwd reported at spawn time.
 */
async function resolveProcessCwd(pid: number): Promise<string | null> {
  if (isLinux()) {
    try {
      return await readlink(`/proc/${pid}/cwd`);
    } catch {
      return null;
    }
  }
  if (isMacOS()) {
    try {
      const { stdout } = await exec('lsof', ['-a', '-d', 'cwd', '-p', String(pid), '-Fn'], {
        timeout: GIT_TIMEOUT_MS,
        windowsHide: true,
      });
      for (const line of stdout.split('\n')) {
        if (line.startsWith('n')) return line.slice(1);
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

async function readGitStatus(
  cwd: string,
): Promise<{ branch: string | null; dirty: boolean } | 'timeout'> {
  const opts = { cwd, timeout: GIT_TIMEOUT_MS, windowsHide: true } as const;

  let branch: string | null = null;
  try {
    const { stdout } = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], opts);
    const trimmed = stdout.trim();
    branch = trimmed.length > 0 && trimmed !== 'HEAD' ? trimmed : null;
  } catch (err) {
    const code = (err as { code?: string | number }).code;
    if (code === 'ETIMEDOUT') return 'timeout';
    return { branch: null, dirty: false };
  }

  let dirty = false;
  try {
    const { stdout } = await exec(
      'git',
      ['status', '--porcelain', '-z', '--untracked-files=no'],
      opts,
    );
    dirty = stdout.length > 0;
  } catch (err) {
    const code = (err as { code?: string | number }).code;
    if (code === 'ETIMEDOUT') return 'timeout';
    // Branch is known; treat dirty as false on other porcelain failures.
  }

  return { branch, dirty };
}

/**
 * Live header info for a persistent PTY tab: the PID's current cwd plus
 * branch/dirty status for that cwd. Polled client-side so the term-head
 * badges reflect `cd` and `git checkout` done inside the shell.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const parsed = Query.safeParse({
    persistentId: req.nextUrl.searchParams.get('persistentId') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_query' }, { status: 400 });
  }

  if (rateLimited(Date.now())) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const entry = persistentTabsRegistry.getEntry(parsed.data.persistentId);
  if (!entry) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const handle = ptyManager.get(entry.ptyId);
  if (!handle) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const rawCwd = await resolveProcessCwd(handle.pid);
  let cwd: string | null = null;
  if (rawCwd) {
    try {
      const safe = await assertInside(PATHS.HOME, rawCwd);
      const st = await stat(safe);
      if (st.isDirectory()) cwd = safe;
    } catch {
      // Path escaped HOME or vanished — surface as null so the client keeps
      // its last-known cwd rather than flashing a nonsense breadcrumb.
    }
  }

  let branch: string | null = null;
  let dirty = false;
  if (cwd) {
    const gs = await readGitStatus(cwd);
    if (gs === 'timeout') {
      logger.warn({ cwd }, 'head_info_git_timeout');
    } else {
      branch = gs.branch;
      dirty = gs.dirty;
    }
  }

  return NextResponse.json(
    { cwd, branch, dirty },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
