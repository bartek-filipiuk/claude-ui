'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/components/common/csrf';

export interface ClaudeMdDoc {
  kind: 'global' | 'project';
  path: string;
  content: string;
  mtime: string | null;
  size: number;
}

function endpoint(slug: string | null): string {
  return slug ? `/api/claude-md/${encodeURIComponent(slug)}` : '/api/claude-md';
}

export function useClaudeMd(slug: string | null) {
  return useQuery<ClaudeMdDoc>({
    queryKey: ['claude-md', slug],
    queryFn: async () => {
      const res = await apiFetch(endpoint(slug));
      if (!res.ok) throw new Error(`load failed: ${res.status}`);
      return (await res.json()) as ClaudeMdDoc;
    },
  });
}

export interface SaveResult {
  mtime: string;
  size: number;
  writeKind: 'created' | 'updated';
}

export interface SaveError extends Error {
  code: string;
  status: number;
}

export function useSaveClaudeMd(slug: string | null) {
  const qc = useQueryClient();
  return useMutation<SaveResult, SaveError, { content: string; ifUnmodifiedSince: string | null }>({
    mutationFn: async ({ content, ifUnmodifiedSince }) => {
      const res = await apiFetch(endpoint(slug), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(ifUnmodifiedSince ? { 'If-Unmodified-Since': ifUnmodifiedSince } : {}),
        },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        let code = `status ${res.status}`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) code = body.error;
        } catch {
          /* ignore */
        }
        const err = new Error(code) as SaveError;
        err.code = code;
        err.status = res.status;
        throw err;
      }
      return (await res.json()) as SaveResult;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['claude-md', slug] });
    },
  });
}
