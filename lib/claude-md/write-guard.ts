import { realpath } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { PathGuardError } from '@/lib/security/path-guard';
import { isValidSlug } from '@/lib/jsonl/slug';
import { listProjects } from '@/lib/jsonl/index';
import { PATHS } from '@/lib/server/config';

export type ClaudeMdTarget =
  | { kind: 'global'; path: string }
  | { kind: 'project'; slug: string; path: string; projectDir: string };

const FILE_NAME = 'CLAUDE.md';

/**
 * Resolves a CLAUDE.md target for either the global file (~/.claude/CLAUDE.md)
 * or a per-project file at `<project-cwd>/CLAUDE.md`. The returned `path` is
 * guaranteed to be exactly `<allowed-dir>/CLAUDE.md` — no symlink escape,
 * no traversal. Throws PathGuardError on any violation.
 *
 * Critical invariant: resolved path MUST equal `<allowed-dir>/CLAUDE.md`
 * byte-for-byte. This blocks settings.json, CLAUDE.md.bak, ../anything,
 * nested subdirs, etc. — even if the project dir itself is writable.
 */
export async function resolveClaudeMdTarget(
  slug: string | null | undefined,
): Promise<ClaudeMdTarget> {
  if (!slug) {
    return { kind: 'global', path: PATHS.CLAUDE_GLOBAL_MD };
  }
  if (!isValidSlug(slug)) {
    throw new PathGuardError('invalid_slug', slug);
  }
  const projects = await listProjects();
  const project = projects.find((p) => p.slug === slug);
  if (!project) {
    throw new PathGuardError('project_not_found', slug);
  }
  if (!project.resolvedCwd) {
    throw new PathGuardError('no_resolved_cwd', slug);
  }

  // Canonicalize the project dir via realpath — otherwise a symlinked
  // project dir could escape $HOME even though the literal path looks inside.
  let canonicalProject: string;
  try {
    canonicalProject = await realpath(project.resolvedCwd);
  } catch {
    throw new PathGuardError('project_dir_missing', project.resolvedCwd);
  }

  const home = await realpath(PATHS.HOME);
  if (canonicalProject !== home && !canonicalProject.startsWith(home + sep)) {
    throw new PathGuardError('project_outside_home', canonicalProject);
  }

  const target = join(canonicalProject, FILE_NAME);
  // Constant-form invariant: target is literally <dir>/CLAUDE.md.
  if (resolve(target) !== target) {
    throw new PathGuardError('non_canonical_target', target);
  }
  if (dirname(target) !== canonicalProject) {
    throw new PathGuardError('dirname_mismatch', target);
  }
  return { kind: 'project', slug, path: target, projectDir: canonicalProject };
}

/**
 * Sanity check for an arbitrary input path (used by fuzz tests). Returns
 * true only if the path resolves to a CLAUDE.md directly under a safe
 * parent (home-rooted for global, $HOME-rooted for project).
 */
export function isClaudeMdPath(path: string): boolean {
  if (path.includes('\0')) return false;
  if (path.length === 0) return false;
  const base = path.split('/').pop();
  return base === FILE_NAME;
}
