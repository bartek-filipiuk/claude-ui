'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/components/common/csrf';

export type AliasMap = Record<string, string>;

export function useAliases() {
  return useQuery<AliasMap>({
    queryKey: ['aliases'],
    queryFn: async () => {
      const res = await apiFetch('/api/projects/aliases');
      if (!res.ok) throw new Error(`aliases failed: ${res.status}`);
      const body = (await res.json()) as { aliases: AliasMap };
      return body.aliases;
    },
  });
}

export function useSetAlias() {
  const qc = useQueryClient();
  return useMutation<AliasMap, Error, { slug: string; alias: string | null }>({
    mutationFn: async ({ slug, alias }) => {
      const res = await apiFetch('/api/projects/aliases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, alias }),
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
      const body = (await res.json()) as { aliases: AliasMap };
      return body.aliases;
    },
    onSuccess: (data) => {
      qc.setQueryData(['aliases'], data);
      qc.invalidateQueries({ queryKey: ['project-meta'] });
    },
  });
}
