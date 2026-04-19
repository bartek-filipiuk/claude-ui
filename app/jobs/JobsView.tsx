'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useCronJobs,
  useDeleteJob,
  usePersistentTabs,
  useUpdateJob,
  useTriggerJob,
} from '@/hooks/use-cron-jobs';
import { CHButton } from '@/components/ui/ch-button';
import { Badge } from '@/components/ui/badge';
import { PersistentTabsPanel } from './PersistentTabsPanel';
import { JobFormDialog } from './JobFormDialog';

function formatRel(ts: string | number | null | undefined): string {
  if (!ts) return '—';
  const date = new Date(ts);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const sign = diff >= 0 ? 'in ' : '';
  const past = diff < 0 ? ' ago' : '';
  if (abs < 60_000) return `${sign}${Math.round(abs / 1000)}s${past}`;
  if (abs < 3_600_000) return `${sign}${Math.round(abs / 60_000)}m${past}`;
  if (abs < 86_400_000) return `${sign}${Math.round(abs / 3_600_000)}h${past}`;
  return date.toLocaleString();
}

function statusVariant(status: string | undefined): 'default' | 'emerald' | 'gold' | 'red' {
  if (status === 'sent') return 'emerald';
  if (status === 'tab_not_ready' || status === 'locked') return 'gold';
  if (status && status !== 'never_run') return 'red';
  return 'default';
}

export function JobsView() {
  const { data: jobs, isLoading } = useCronJobs();
  const { data: tabs } = usePersistentTabs();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const del = useDeleteJob();
  const update = useUpdateJob();
  const trigger = useTriggerJob();

  return (
    <div
      style={{
        padding: 20,
        maxWidth: 1100,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link
          href="/"
          style={{
            fontSize: 12,
            color: 'var(--fg-4)',
            textDecoration: 'underline',
          }}
        >
          ← back
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Cron jobs</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <CHButton
            size="sm"
            variant="primary"
            disabled={!tabs || tabs.length === 0}
            onClick={() => {
              setEditingId(null);
              setFormOpen(true);
            }}
          >
            + new job
          </CHButton>
        </div>
      </header>

      <section
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: 16,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, marginBottom: 12 }}>
          Jobs
        </h2>
        {isLoading && (
          <div style={{ fontSize: 12, color: 'var(--fg-4)' }}>loading…</div>
        )}
        {!isLoading && (!jobs || jobs.length === 0) && (
          <div style={{ fontSize: 13, color: 'var(--fg-4)' }}>
            {tabs && tabs.length > 0
              ? 'No jobs yet. Click "+ new job".'
              : 'Create a persistent tab first — jobs need a target.'}
          </div>
        )}
        {jobs && jobs.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--fg-4)' }}>
                <th style={{ padding: '6px 4px', fontWeight: 500 }}>name</th>
                <th style={{ padding: '6px 4px', fontWeight: 500 }}>cron</th>
                <th style={{ padding: '6px 4px', fontWeight: 500 }}>target</th>
                <th style={{ padding: '6px 4px', fontWeight: 500 }}>next run</th>
                <th style={{ padding: '6px 4px', fontWeight: 500 }}>last</th>
                <th style={{ padding: '6px 4px', fontWeight: 500 }}>enabled</th>
                <th style={{ padding: '6px 4px', fontWeight: 500, textAlign: 'right' }}>
                  actions
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '8px 4px', fontWeight: 500 }}>
                    <Link href={`/jobs/${j.id}`} style={{ textDecoration: 'underline' }}>
                      {j.name}
                    </Link>
                  </td>
                  <td
                    style={{
                      padding: '8px 4px',
                      fontFamily: 'var(--font-jetbrains), monospace',
                      color: 'var(--fg-2)',
                    }}
                  >
                    {j.cronExpression}
                  </td>
                  <td
                    style={{
                      padding: '8px 4px',
                      fontFamily: 'var(--font-jetbrains), monospace',
                    }}
                  >
                    {j.targetCronTag}
                  </td>
                  <td style={{ padding: '8px 4px', color: 'var(--fg-2)' }}>
                    {j.enabled ? formatRel(j.nextRun ?? null) : '—'}
                  </td>
                  <td style={{ padding: '8px 4px' }}>
                    <Badge variant={statusVariant(j.lastStatus)}>
                      {j.lastStatus ?? 'never_run'}
                    </Badge>
                    {j.lastRunAt && (
                      <span
                        style={{
                          marginLeft: 6,
                          color: 'var(--fg-4)',
                        }}
                      >
                        {formatRel(j.lastRunAt)}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '8px 4px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={j.enabled}
                        onChange={(e) =>
                          update.mutate({ id: j.id, patch: { enabled: e.target.checked } })
                        }
                      />
                    </label>
                  </td>
                  <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <CHButton
                        size="sm"
                        onClick={() => trigger.mutate(j.id)}
                        disabled={trigger.isPending}
                        title="Run this job now (manual trigger)"
                      >
                        run now
                      </CHButton>
                      <CHButton
                        size="sm"
                        onClick={() => {
                          setEditingId(j.id);
                          setFormOpen(true);
                        }}
                      >
                        edit
                      </CHButton>
                      <CHButton
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (confirm(`Delete job "${j.name}"?`)) del.mutate(j.id);
                        }}
                      >
                        delete
                      </CHButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <PersistentTabsPanel />

      {formOpen && (
        <JobFormDialog
          jobId={editingId}
          onClose={() => {
            setFormOpen(false);
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}
