'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface CronJobDto {
  id: string;
  name: string;
  cronExpression: string;
  targetCronTag: string;
  prompt: string;
  enabled: boolean;
  readyCheckEnabled: boolean;
  retryOnNotReady: boolean;
  retryDelayMinutes: number;
  maxRetries: number;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  lastStatus?: string;
  lastError?: string;
  nextRun?: string | null;
}

export interface CronJobRun {
  id: string;
  jobId: string;
  triggeredAt: number;
  status: string;
  errorMessage?: string;
  persistentTabId?: string;
  promptLen: number;
  attempt: number;
}

export interface PersistentTabDto {
  persistentId: string;
  title: string;
  cwd: string;
  shell?: string;
  args?: string[];
  initCommand?: string;
  cronTag?: string;
  createdAt: number;
  updatedAt: number;
  alive: boolean;
  ptyId: string | null;
}

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m?.[1] ? decodeURIComponent(m[1]) : '';
}

function csrfHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-csrf-token': readCookie('codehelm_csrf'),
  };
}

export function useCronJobs() {
  return useQuery({
    queryKey: ['cron', 'jobs'],
    queryFn: async (): Promise<CronJobDto[]> => {
      const res = await fetch('/api/cron/jobs', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('failed_to_load');
      const body = (await res.json()) as { jobs: CronJobDto[] };
      return body.jobs;
    },
  });
}

export function useCronJob(id: string | null) {
  return useQuery({
    queryKey: ['cron', 'jobs', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<CronJobDto> => {
      const res = await fetch(`/api/cron/jobs/${id}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('failed_to_load');
      const body = (await res.json()) as { job: CronJobDto };
      return body.job;
    },
  });
}

export function useCronJobRuns(id: string | null, limit = 50) {
  return useQuery({
    queryKey: ['cron', 'jobs', id, 'runs', limit],
    enabled: Boolean(id),
    queryFn: async (): Promise<CronJobRun[]> => {
      const res = await fetch(`/api/cron/jobs/${id}/runs?limit=${limit}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error('failed_to_load');
      const body = (await res.json()) as { runs: CronJobRun[] };
      return body.runs;
    },
    refetchInterval: 5000,
  });
}

export interface CreateJobPayload {
  name: string;
  cronExpression: string;
  targetCronTag: string;
  prompt: string;
  enabled?: boolean;
  readyCheckEnabled?: boolean;
  retryOnNotReady?: boolean;
  retryDelayMinutes?: number;
  maxRetries?: number;
}

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateJobPayload): Promise<CronJobDto> => {
      const res = await fetch('/api/cron/jobs', {
        method: 'POST',
        credentials: 'same-origin',
        headers: csrfHeaders(),
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { job?: CronJobDto; error?: string; detail?: string };
      if (!res.ok) throw new Error(body.error ?? 'failed');
      if (!body.job) throw new Error('empty_response');
      return body.job;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cron', 'jobs'] });
      void qc.invalidateQueries({ queryKey: ['cron', 'dashboard'] });
    },
  });
}

export function useUpdateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<CreateJobPayload>;
    }): Promise<CronJobDto> => {
      const res = await fetch(`/api/cron/jobs/${id}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: csrfHeaders(),
        body: JSON.stringify(patch),
      });
      const body = (await res.json()) as { job?: CronJobDto; error?: string };
      if (!res.ok) throw new Error(body.error ?? 'failed');
      if (!body.job) throw new Error('empty_response');
      return body.job;
    },
    onSuccess: (_res, vars) => {
      void qc.invalidateQueries({ queryKey: ['cron', 'jobs'] });
      void qc.invalidateQueries({ queryKey: ['cron', 'jobs', vars.id] });
      void qc.invalidateQueries({ queryKey: ['cron', 'dashboard'] });
    },
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/cron/jobs/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: csrfHeaders(),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'failed');
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cron', 'jobs'] });
      void qc.invalidateQueries({ queryKey: ['cron', 'dashboard'] });
    },
  });
}

export interface TriggerResult {
  status: string;
  errorMessage?: string;
  attempt: number;
  shouldRetry: boolean;
  retryDelayMinutes?: number;
}

export function useTriggerJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<TriggerResult> => {
      const res = await fetch(`/api/cron/jobs/${id}/trigger`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: csrfHeaders(),
      });
      const body = (await res.json()) as { result?: TriggerResult; error?: string };
      if (!res.ok || !body.result) throw new Error(body.error ?? 'failed');
      return body.result;
    },
    onSuccess: (_res, id) => {
      void qc.invalidateQueries({ queryKey: ['cron', 'jobs', id, 'runs'] });
      void qc.invalidateQueries({ queryKey: ['cron', 'jobs'] });
    },
  });
}

export function usePersistentTabs() {
  return useQuery({
    queryKey: ['persistent-tabs'],
    queryFn: async (): Promise<PersistentTabDto[]> => {
      const res = await fetch('/api/persistent-tabs', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('failed_to_load');
      const body = (await res.json()) as { tabs: PersistentTabDto[] };
      return body.tabs;
    },
  });
}

export interface CreateTabPayload {
  title: string;
  cwd: string;
  shell?: string;
  initCommand?: string;
  cronTag?: string;
}

export function useCreatePersistentTab() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateTabPayload) => {
      const res = await fetch('/api/persistent-tabs', {
        method: 'POST',
        credentials: 'same-origin',
        headers: csrfHeaders(),
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as {
        tab?: PersistentTabDto;
        ptyId?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? 'failed');
      return body;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['persistent-tabs'] });
    },
  });
}

export function useUpdatePersistentTab() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      persistentId,
      patch,
    }: {
      persistentId: string;
      patch: { title?: string; initCommand?: string | null; cronTag?: string | null };
    }) => {
      const res = await fetch(`/api/persistent-tabs/${persistentId}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: csrfHeaders(),
        body: JSON.stringify(patch),
      });
      const body = (await res.json()) as { tab?: PersistentTabDto; error?: string };
      if (!res.ok) throw new Error(body.error ?? 'failed');
      return body.tab;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['persistent-tabs'] });
    },
  });
}

export function useDeletePersistentTab() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (persistentId: string): Promise<void> => {
      const res = await fetch(`/api/persistent-tabs/${persistentId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: csrfHeaders(),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'failed');
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['persistent-tabs'] });
    },
  });
}

export function useRespawnPersistentTab() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (persistentId: string): Promise<string> => {
      const res = await fetch(`/api/persistent-tabs/${persistentId}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: csrfHeaders(),
      });
      const body = (await res.json()) as { ptyId?: string; error?: string };
      if (!res.ok || !body.ptyId) throw new Error(body.error ?? 'failed');
      return body.ptyId;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['persistent-tabs'] });
    },
  });
}

export interface CronDashboardData {
  upcoming: Array<{
    jobId: string;
    name: string;
    cronExpression: string;
    targetCronTag: string;
    nextRun: string;
  }>;
  failures: CronJobRun[];
}

export function useCronDashboard() {
  return useQuery({
    queryKey: ['cron', 'dashboard'],
    queryFn: async (): Promise<CronDashboardData> => {
      const res = await fetch('/api/cron/dashboard', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('failed_to_load');
      return (await res.json()) as CronDashboardData;
    },
    refetchInterval: 15_000,
  });
}
