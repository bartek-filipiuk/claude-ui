import { describe, expect, it } from 'vitest';
import { filterAndSortProjects } from '@/app/(ui)/sidebar/ProjectList';
import type { ProjectSummary } from '@/hooks/use-projects';
import type { ProjectMetaMap } from '@/hooks/use-project-meta';

function makeProject(slug: string, lastActivity: string | null, sessionCount = 1): ProjectSummary {
  return {
    slug,
    displayPath: `/home/bartek/${slug}`,
    resolvedCwd: `/home/bartek/${slug}`,
    sessionCount,
    lastActivity,
    totalBytes: 0,
  };
}

const projects: ProjectSummary[] = [
  makeProject('alpha', '2026-04-16T10:00:00.000Z'),
  makeProject('beta', '2026-04-16T12:00:00.000Z'),
  makeProject('gamma', '2026-04-16T08:00:00.000Z'),
];

describe('filterAndSortProjects', () => {
  it('sorts by lastActivity descending when no favorites are pinned', () => {
    const meta: ProjectMetaMap = {};
    const sorted = filterAndSortProjects(projects, meta, '');
    expect(sorted.map((p) => p.slug)).toEqual(['beta', 'alpha', 'gamma']);
  });

  it('pinned projects surface at the top', () => {
    const meta: ProjectMetaMap = { gamma: { favorite: true } };
    const sorted = filterAndSortProjects(projects, meta, '');
    expect(sorted.map((p) => p.slug)).toEqual(['gamma', 'beta', 'alpha']);
  });

  it('multiple pins — each group still sorted by lastActivity', () => {
    const meta: ProjectMetaMap = {
      alpha: { favorite: true },
      gamma: { favorite: true },
    };
    const sorted = filterAndSortProjects(projects, meta, '');
    expect(sorted.map((p) => p.slug)).toEqual(['alpha', 'gamma', 'beta']);
  });

  it('substring filter keeps pins and ordering intact', () => {
    const meta: ProjectMetaMap = { gamma: { favorite: true } };
    const sorted = filterAndSortProjects(projects, meta, 'a');
    // gamma, alpha, beta all contain "a"
    expect(sorted.map((p) => p.slug)).toEqual(['gamma', 'beta', 'alpha']);
  });

  it('filters by alias', () => {
    const meta: ProjectMetaMap = { beta: { alias: 'My super app' } };
    const sorted = filterAndSortProjects(projects, meta, 'super');
    expect(sorted.map((p) => p.slug)).toEqual(['beta']);
  });

  it("mode 'name' sorts alphabetically by alias or path", () => {
    const meta: ProjectMetaMap = {
      alpha: { alias: 'Charlie' },
      beta: { alias: 'Alpha project' },
      gamma: { alias: 'Bravo' },
    };
    const sorted = filterAndSortProjects(projects, meta, '', 'name');
    expect(sorted.map((p) => p.slug)).toEqual(['beta', 'gamma', 'alpha']);
  });

  it("mode 'sessions' sorts by session count desc, breaking ties by activity", () => {
    const list: ProjectSummary[] = [
      makeProject('alpha', '2026-04-16T10:00:00.000Z', 2),
      makeProject('beta', '2026-04-16T12:00:00.000Z', 5),
      makeProject('gamma', '2026-04-16T08:00:00.000Z', 5),
    ];
    const sorted = filterAndSortProjects(list, {}, '', 'sessions');
    expect(sorted.map((p) => p.slug)).toEqual(['beta', 'gamma', 'alpha']);
  });

  it("mode 'name' still pins favorites to the top", () => {
    const meta: ProjectMetaMap = { gamma: { favorite: true } };
    const sorted = filterAndSortProjects(projects, meta, '', 'name');
    expect(sorted[0]?.slug).toBe('gamma');
    // Remaining two sorted by display path — alpha before beta
    expect(sorted.slice(1).map((p) => p.slug)).toEqual(['alpha', 'beta']);
  });
});
