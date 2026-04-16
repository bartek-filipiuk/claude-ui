'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/components/common/csrf';

export interface ProjectMeta {
  alias?: string;
  favorite?: boolean;
}

export type ProjectMetaMap = Record<string, ProjectMeta>;

const META_KEY = ['project-meta'] as const;

export function useProjectMeta() {
  return useQuery<ProjectMetaMap>({
    queryKey: META_KEY,
    queryFn: async () => {
      const res = await apiFetch('/api/projects/meta');
      if (!res.ok) throw new Error(`meta failed: ${res.status}`);
      const body = (await res.json()) as { meta: ProjectMetaMap };
      return body.meta ?? {};
    },
  });
}

export interface MetaPatch {
  slug: string;
  alias?: string | null;
  favorite?: boolean;
}

export function useSetProjectMeta() {
  const qc = useQueryClient();
  return useMutation<ProjectMetaMap, Error, MetaPatch>({
    mutationFn: async ({ slug, alias, favorite }) => {
      const payload: Record<string, unknown> = { slug };
      if (alias !== undefined) payload['alias'] = alias;
      if (favorite !== undefined) payload['favorite'] = favorite;
      const res = await apiFetch('/api/projects/meta', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let code = `status ${res.status}`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) code = body.error;
        } catch {
          /* ignore */
        }
        throw new Error(code);
      }
      const body = (await res.json()) as { meta: ProjectMetaMap };
      return body.meta ?? {};
    },
    onSuccess: (data) => {
      qc.setQueryData(META_KEY, data);
      const aliases: Record<string, string> = {};
      for (const [slug, entry] of Object.entries(data)) {
        if (entry.alias) aliases[slug] = entry.alias;
      }
      qc.setQueryData(['aliases'], aliases);
    },
  });
}
