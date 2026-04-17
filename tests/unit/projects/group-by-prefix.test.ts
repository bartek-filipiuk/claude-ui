import { describe, expect, it } from 'vitest';
import {
  FAVORITES_GROUP_KEY,
  OTHER_GROUP_KEY,
  groupProjectsByPrefix,
  inferHomeDir,
} from '@/lib/projects/group-by-prefix';
import type { ProjectSummary } from '@/hooks/use-projects';
import type { ProjectMetaMap } from '@/hooks/use-project-meta';

function makeProject(slug: string, cwd: string | null): ProjectSummary {
  return {
    slug,
    displayPath: cwd ?? slug,
    resolvedCwd: cwd,
    sessionCount: 1,
    lastActivity: '2026-04-16T10:00:00.000Z',
    totalBytes: 0,
  };
}

describe('inferHomeDir', () => {
  it('returns first two path segments', () => {
    const projects = [makeProject('a', '/home/bart/main-projects/alpha')];
    expect(inferHomeDir(projects)).toBe('/home/bart');
  });

  it('handles macOS /Users layout', () => {
    const projects = [makeProject('a', '/Users/bart/work/thing')];
    expect(inferHomeDir(projects)).toBe('/Users/bart');
  });

  it('returns null when no project has a cwd', () => {
    expect(inferHomeDir([makeProject('a', null)])).toBeNull();
    expect(inferHomeDir([])).toBeNull();
  });

  it('skips non-absolute paths and falls back to next project', () => {
    const projects = [
      makeProject('a', 'relative/path'),
      makeProject('b', '/home/bart/main/foo'),
    ];
    expect(inferHomeDir(projects)).toBe('/home/bart');
  });
});

describe('groupProjectsByPrefix', () => {
  it('groups projects by first segment under $HOME and sorts keys', () => {
    const projects = [
      makeProject('alpha', '/home/bart/main-projects/alpha'),
      makeProject('beta', '/home/bart/client-projects/beta'),
      makeProject('gamma', '/home/bart/main-projects/gamma'),
    ];
    const groups = groupProjectsByPrefix(projects, {}, '/home/bart');
    expect(groups.map((g) => g.key)).toEqual(['client-projects', 'main-projects']);
    expect(groups[0]?.label).toBe('client-projects/');
    expect(groups[0]?.projects.map((p) => p.slug)).toEqual(['beta']);
    expect(groups[1]?.projects.map((p) => p.slug)).toEqual(['alpha', 'gamma']);
  });

  it('places favorites in a dedicated pinned group at the top', () => {
    const projects = [
      makeProject('alpha', '/home/bart/main/alpha'),
      makeProject('beta', '/home/bart/client/beta'),
      makeProject('gamma', '/home/bart/main/gamma'),
    ];
    const meta: ProjectMetaMap = { gamma: { favorite: true }, beta: { favorite: true } };
    const groups = groupProjectsByPrefix(projects, meta, '/home/bart');
    expect(groups[0]?.key).toBe(FAVORITES_GROUP_KEY);
    expect(groups[0]?.label).toBe('Pinned');
    expect(groups[0]?.projects.map((p) => p.slug)).toEqual(['beta', 'gamma']);
    // favorites removed from their folder buckets
    const main = groups.find((g) => g.key === 'main');
    expect(main?.projects.map((p) => p.slug)).toEqual(['alpha']);
    expect(groups.find((g) => g.key === 'client')).toBeUndefined();
  });

  it('bucket projects with no cwd (or cwd outside $HOME) into the "Other" group', () => {
    const projects = [
      makeProject('alpha', '/home/bart/main/alpha'),
      makeProject('beta', null),
      makeProject('delta', '/opt/external/delta'),
    ];
    const groups = groupProjectsByPrefix(projects, {}, '/home/bart');
    const other = groups.find((g) => g.key === OTHER_GROUP_KEY);
    expect(other).toBeDefined();
    expect(other?.label).toBe('Other');
    expect(other?.projects.map((p) => p.slug)).toEqual(['beta', 'delta']);
    // Other always last in the result list
    expect(groups.at(-1)?.key).toBe(OTHER_GROUP_KEY);
  });

  it('falls back to "Other" when $HOME cannot be inferred', () => {
    const projects = [makeProject('a', null), makeProject('b', null)];
    const groups = groupProjectsByPrefix(projects, {});
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe(OTHER_GROUP_KEY);
    expect(groups[0]?.projects.map((p) => p.slug)).toEqual(['a', 'b']);
  });

  it('preserves input order inside each bucket', () => {
    const projects = [
      makeProject('b', '/home/bart/main/b'),
      makeProject('a', '/home/bart/main/a'),
      makeProject('c', '/home/bart/main/c'),
    ];
    const groups = groupProjectsByPrefix(projects, {}, '/home/bart');
    expect(groups[0]?.projects.map((p) => p.slug)).toEqual(['b', 'a', 'c']);
  });

  it('infers $HOME automatically when not provided', () => {
    const projects = [
      makeProject('alpha', '/home/bart/main/alpha'),
      makeProject('beta', '/home/bart/client/beta'),
    ];
    const groups = groupProjectsByPrefix(projects, {});
    expect(groups.map((g) => g.key)).toEqual(['client', 'main']);
  });
});
