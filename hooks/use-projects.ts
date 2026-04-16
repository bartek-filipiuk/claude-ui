'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/components/common/csrf';

export interface ProjectSummary {
  slug: string;
  displayPath: string;
  resolvedCwd: string | null;
  sessionCount: number;
  lastActivity: string | null;
  totalBytes: number;
}

export function useProjects() {
  return useQuery<ProjectSummary[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await apiFetch('/api/projects');
      if (!res.ok) throw new Error(`projects failed: ${res.status}`);
      const body = (await res.json()) as { projects: ProjectSummary[] };
      return body.projects;
    },
  });
}
