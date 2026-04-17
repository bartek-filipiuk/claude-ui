import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdir, realpath, rm, utimes, writeFile, symlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const FAKE_HOME = resolve(__dirname, '..', '..', 'fixtures', 'fake-home');

vi.mock('@/lib/server/config', async () => {
  const { join } = await import('node:path');
  const CLAUDE_DIR = join(FAKE_HOME, '.claude');
  return {
    PATHS: {
      HOME: FAKE_HOME,
      CLAUDE_DIR,
      CLAUDE_PROJECTS_DIR: join(CLAUDE_DIR, 'projects'),
      CLAUDE_GLOBAL_MD: join(CLAUDE_DIR, 'CLAUDE.md'),
      CLAUDE_UI_STATE_DIR: join(CLAUDE_DIR, 'claude-ui'),
      AUDIT_LOG: join(CLAUDE_DIR, 'claude-ui', 'audit.log'),
    },
    LIMITS: {
      MAX_PTY: 16,
      PTY_SPAWN_PER_MINUTE: 10,
      REST_PER_MINUTE: 100,
      WS_MSG_PER_SECOND: 500,
      CLAUDE_MD_MAX_BYTES: 1_000_000,
      RENDERED_FIELD_MAX_BYTES: 10_000_000,
      PTY_UNACKED_MAX_BYTES: 1_000_000,
      PTY_CHUNK_BYTES: 64 * 1024,
    },
    COOKIE_NAMES: { AUTH: 'claude_ui_auth', CSRF: 'claude_ui_csrf' },
    CSRF_HEADER: 'x-csrf-token',
    getServerToken: () => 'test-token',
    getServerPort: () => 12345,
  };
});

const { inferCwdFromSlug, listProjects, listSessions, resolveSessionPath, sessionPreview } =
  await import('@/lib/jsonl/index');

// Normalize fixture mtimes so session ordering assertions are stable
// regardless of how git checked the files out.
beforeAll(async () => {
  const epsilonDir = join(FAKE_HOME, '.claude', 'projects', '-tmp-epsilon');
  const base = Date.parse('2026-04-15T00:00:00.000Z') / 1000;
  const files = [
    '44444444-0000-4000-8000-000000000001.jsonl',
    '44444444-0000-4000-8000-000000000002.jsonl',
    '44444444-0000-4000-8000-000000000003.jsonl',
  ];
  for (let i = 0; i < files.length; i++) {
    const name = files[i];
    if (!name) continue;
    const t = base + i * 60;
    await utimes(join(epsilonDir, name), t, t);
  }
});

describe('listProjects (fake-home)', () => {
  it('discovers 5 fixture projects', async () => {
    const projects = await listProjects();
    expect(projects).toHaveLength(5);
    const slugs = projects.map((p) => p.slug).sort();
    expect(slugs).toEqual(['-tmp-alpha', '-tmp-beta', '-tmp-delta', '-tmp-epsilon', '-tmp-gamma']);
  });

  it('sniffs resolvedCwd from the first event', async () => {
    const projects = await listProjects();
    const alpha = projects.find((p) => p.slug === '-tmp-alpha');
    expect(alpha?.resolvedCwd).toBe('/tmp/alpha');
  });

  it('counts sessions per project', async () => {
    const projects = await listProjects();
    const epsilon = projects.find((p) => p.slug === '-tmp-epsilon');
    expect(epsilon?.sessionCount).toBe(3);
    const alpha = projects.find((p) => p.slug === '-tmp-alpha');
    expect(alpha?.sessionCount).toBe(2);
  });
});

describe('listSessions', () => {
  it('returns sessions for a valid slug sorted by mtime DESC', async () => {
    const sessions = await listSessions('-tmp-epsilon');
    expect(sessions).toHaveLength(3);
    expect(sessions[0]?.id).toBe('44444444-0000-4000-8000-000000000003');
  });

  it('throws on an invalid slug', async () => {
    await expect(listSessions('../../etc')).rejects.toThrow('invalid_slug');
    await expect(listSessions('')).rejects.toThrow('invalid_slug');
    await expect(listSessions('foo/bar')).rejects.toThrow('invalid_slug');
  });
});

describe('resolveSessionPath', () => {
  it('returns a safe, resolved path', async () => {
    const p = await resolveSessionPath('-tmp-alpha', '00000000-0000-4000-8000-000000000001');
    expect(p).toMatch(/\-tmp-alpha\/00000000-0000-4000-8000-000000000001\.jsonl$/);
  });

  it('rejects path traversal in sessionId', async () => {
    await expect(resolveSessionPath('-tmp-alpha', '../../etc/passwd')).rejects.toThrow();
  });

  it('rejects an invalid slug', async () => {
    await expect(
      resolveSessionPath('../alpha', '00000000-0000-4000-8000-000000000001'),
    ).rejects.toThrow();
  });
});

describe('sessionPreview', () => {
  it('counts messages (skipping malformed lines)', async () => {
    const path = await resolveSessionPath('-tmp-alpha', '00000000-0000-4000-8000-000000000001');
    const preview = await sessionPreview(path);
    // Fixture has 10 well-formed lines plus 1 malformed.
    expect(preview.messageCount).toBe(10);
    expect(preview.firstUserPreview).toBe('Hello there');
  });
});

describe('inferCwdFromSlug (legacy fallback)', () => {
  let homeDir: string;
  let otherDir: string;

  beforeAll(async () => {
    // Resolve any tmpdir symlinks up-front so the paths we build contain no
    // components that would be lost when converting path -> slug -> path.
    // Prefer /tmp (no dashes on Linux/macOS) to keep the slug round-trip clean.
    const base = await realpath('/tmp').catch(() => realpath(tmpdir()));
    const homeName = 'cluithome' + randomBytes(4).toString('hex');
    const otherName = 'cluitother' + randomBytes(4).toString('hex');
    homeDir = join(base, homeName);
    otherDir = join(base, otherName);
    await mkdir(homeDir);
    await mkdir(otherDir);
    await mkdir(join(homeDir, 'projectdir'));
    await writeFile(join(homeDir, 'notadir'), 'hello');
    await mkdir(join(otherDir, 'outside'));
    await symlink(join(otherDir, 'outside'), join(homeDir, 'escape'));
  });

  afterAll(async () => {
    await rm(homeDir, { recursive: true, force: true });
    await rm(otherDir, { recursive: true, force: true });
  });

  it('(a) a sniff hit wins over the fallback', async () => {
    // Alpha has sniffed cwd '/tmp/alpha' which is NOT under FAKE_HOME. If the
    // fallback ran, it would return null and overwrite the sniff. Observing
    // the sniffed value proves sniff-hit takes precedence.
    const projects = await listProjects();
    const alpha = projects.find((p) => p.slug === '-tmp-alpha');
    expect(alpha?.resolvedCwd).toBe('/tmp/alpha');
  });

  it('(b) sniff miss + real directory under $HOME returns that directory', async () => {
    const slug = homeDir.replaceAll('/', '-') + '-projectdir';
    const result = await inferCwdFromSlug(slug, homeDir);
    expect(result).toBe(join(homeDir, 'projectdir'));
  });

  it('(c) sniff miss + directory outside $HOME returns null', async () => {
    const slug = otherDir.replaceAll('/', '-') + '-outside';
    const result = await inferCwdFromSlug(slug, homeDir);
    expect(result).toBeNull();
  });

  it('rejects a symlink pointing outside $HOME', async () => {
    const slug = homeDir.replaceAll('/', '-') + '-escape';
    const result = await inferCwdFromSlug(slug, homeDir);
    expect(result).toBeNull();
  });

  it('rejects a missing path', async () => {
    const slug = homeDir.replaceAll('/', '-') + '-nope';
    const result = await inferCwdFromSlug(slug, homeDir);
    expect(result).toBeNull();
  });

  it('rejects a regular file (not a directory)', async () => {
    const slug = homeDir.replaceAll('/', '-') + '-notadir';
    const result = await inferCwdFromSlug(slug, homeDir);
    expect(result).toBeNull();
  });

  it('odrzuca sam $HOME (nie podkatalog)', async () => {
    const slug = homeDir.replaceAll('/', '-');
    const result = await inferCwdFromSlug(slug, homeDir);
    expect(result).toBeNull();
  });

  it('rejects an invalid slug', async () => {
    expect(await inferCwdFromSlug('../etc', homeDir)).toBeNull();
    expect(await inferCwdFromSlug('foo/bar', homeDir)).toBeNull();
    expect(await inferCwdFromSlug('', homeDir)).toBeNull();
  });
});
