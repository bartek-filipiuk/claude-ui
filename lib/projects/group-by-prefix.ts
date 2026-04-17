import type { ProjectSummary } from '@/hooks/use-projects';
import type { ProjectMeta, ProjectMetaMap } from '@/hooks/use-project-meta';

export const FAVORITES_GROUP_KEY = '__favorites__';
export const OTHER_GROUP_KEY = '__other__';

export interface ProjectGroup {
  key: string;
  label: string;
  projects: ProjectSummary[];
}

/**
 * Best-effort detection of the user's home directory from a project list.
 * Assumes Linux/macOS convention where every project path is `/<seg1>/<seg2>/…`
 * under `$HOME` (e.g. `/home/bart` or `/Users/bart`).
 */
export function inferHomeDir(projects: ProjectSummary[]): string | null {
  for (const project of projects) {
    const cwd = project.resolvedCwd;
    if (!cwd || !cwd.startsWith('/')) continue;
    const segments = cwd.split('/');
    if (segments.length >= 3 && segments[1] && segments[2]) {
      return `/${segments[1]}/${segments[2]}`;
    }
  }
  return null;
}

function firstSegmentUnderHome(cwd: string, homeDir: string): string | null {
  if (!cwd.startsWith('/')) return null;
  const normalizedHome = homeDir.replace(/\/+$/, '');
  if (cwd !== normalizedHome && !cwd.startsWith(`${normalizedHome}/`)) return null;
  const rest = cwd.slice(normalizedHome.length).replace(/^\/+/, '');
  if (!rest) return null;
  const sep = rest.indexOf('/');
  const head = sep === -1 ? rest : rest.slice(0, sep);
  return head || null;
}

function isFavorite(meta: ProjectMeta | undefined): boolean {
  return meta?.favorite === true;
}

/**
 * Groups projects by the first path segment under `$HOME`.
 * Favorites always form the first group. Projects with no cwd (or cwd
 * outside `$HOME`) land in the "Other" group. Input order is preserved
 * inside each group, so callers should sort beforehand.
 */
export function groupProjectsByPrefix(
  projects: ProjectSummary[],
  meta: ProjectMetaMap,
  homeDir?: string | null,
): ProjectGroup[] {
  const resolvedHome = homeDir ?? inferHomeDir(projects);
  const favorites: ProjectSummary[] = [];
  const buckets = new Map<string, ProjectSummary[]>();
  const other: ProjectSummary[] = [];

  for (const project of projects) {
    if (isFavorite(meta[project.slug])) {
      favorites.push(project);
      continue;
    }
    const cwd = project.resolvedCwd;
    const key = cwd && resolvedHome ? firstSegmentUnderHome(cwd, resolvedHome) : null;
    if (!key) {
      other.push(project);
      continue;
    }
    const bucket = buckets.get(key);
    if (bucket) bucket.push(project);
    else buckets.set(key, [project]);
  }

  const groups: ProjectGroup[] = [];
  if (favorites.length > 0) {
    groups.push({ key: FAVORITES_GROUP_KEY, label: 'Pinned', projects: favorites });
  }
  const sortedKeys = Array.from(buckets.keys()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
  for (const key of sortedKeys) {
    const list = buckets.get(key);
    if (!list) continue;
    groups.push({ key, label: `${key}/`, projects: list });
  }
  if (other.length > 0) {
    groups.push({ key: OTHER_GROUP_KEY, label: 'Other', projects: other });
  }
  return groups;
}
