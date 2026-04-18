'use client';

import Link from 'next/link';
import { useCronJob, useCronJobRuns, useTriggerJob } from '@/hooks/use-cron-jobs';
import { CHButton } from '@/components/ui/ch-button';
import { Badge } from '@/components/ui/badge';

function statusVariant(status: string): 'default' | 'emerald' | 'gold' | 'red' {
  if (status === 'sent') return 'emerald';
  if (status === 'tab_not_ready' || status === 'locked') return 'gold';
  return 'red';
}

function fmtTs(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function JobDetailView({ jobId }: { jobId: string }) {
  const { data: job } = useCronJob(jobId);
  const { data: runs } = useCronJobRuns(jobId, 100);
  const trigger = useTriggerJob();

  return (
    <div
      style={{
        padding: 20,
        maxWidth: 1100,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link
          href="/jobs"
          style={{ fontSize: 12, color: 'var(--fg-4)', textDecoration: 'underline' }}
        >
          ← jobs
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
          {job?.name ?? 'Job'}
        </h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <CHButton
            size="sm"
            variant="primary"
            disabled={trigger.isPending}
            onClick={() => trigger.mutate(jobId)}
          >
            run now
          </CHButton>
        </div>
      </header>

      {job && (
        <section
          style={{
            background: 'var(--bg-1)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: 16,
            display: 'grid',
            gridTemplateColumns: '160px 1fr',
            rowGap: 6,
            columnGap: 12,
            fontSize: 12,
          }}
        >
          <div style={{ color: 'var(--fg-4)' }}>cron</div>
          <div style={{ fontFamily: 'var(--font-jetbrains), monospace' }}>
            {job.cronExpression}
          </div>
          <div style={{ color: 'var(--fg-4)' }}>target</div>
          <div style={{ fontFamily: 'var(--font-jetbrains), monospace' }}>
            {job.targetCronTag}
          </div>
          <div style={{ color: 'var(--fg-4)' }}>enabled</div>
          <div>{job.enabled ? 'yes' : 'no'}</div>
          <div style={{ color: 'var(--fg-4)' }}>ready-check</div>
          <div>{job.readyCheckEnabled ? 'yes' : 'no'}</div>
          <div style={{ color: 'var(--fg-4)' }}>retry</div>
          <div>
            {job.retryOnNotReady
              ? `${job.retryDelayMinutes}m × ${job.maxRetries}`
              : 'off'}
          </div>
          <div style={{ color: 'var(--fg-4)' }}>next run</div>
          <div>{job.nextRun ? new Date(job.nextRun).toLocaleString() : '—'}</div>
          <div style={{ color: 'var(--fg-4)' }}>last run</div>
          <div>
            {job.lastStatus ? (
              <Badge variant={statusVariant(job.lastStatus)}>{job.lastStatus}</Badge>
            ) : (
              '—'
            )}{' '}
            {job.lastRunAt ? fmtTs(job.lastRunAt) : ''}
            {job.lastError ? (
              <span style={{ color: 'var(--fg-4)', marginLeft: 8 }}>
                — {job.lastError}
              </span>
            ) : null}
          </div>
          <div style={{ color: 'var(--fg-4)' }}>prompt</div>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
              padding: 8,
              background: 'var(--bg-0)',
              border: '1px solid var(--line)',
              borderRadius: 4,
              fontFamily: 'var(--font-jetbrains), monospace',
              fontSize: 11,
            }}
          >
            {job.prompt}
          </pre>
        </section>
      )}

      <section
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: 16,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, marginBottom: 12 }}>Runs</h2>
        {!runs || runs.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--fg-4)' }}>no runs yet</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--fg-4)' }}>
                <th style={{ padding: '6px 4px', fontWeight: 500 }}>time</th>
                <th style={{ padding: '6px 4px', fontWeight: 500 }}>status</th>
                <th style={{ padding: '6px 4px', fontWeight: 500 }}>attempt</th>
                <th style={{ padding: '6px 4px', fontWeight: 500 }}>prompt size</th>
                <th style={{ padding: '6px 4px', fontWeight: 500 }}>error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '6px 4px' }}>{fmtTs(r.triggeredAt)}</td>
                  <td style={{ padding: '6px 4px' }}>
                    <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                  </td>
                  <td style={{ padding: '6px 4px' }}>{r.attempt}</td>
                  <td style={{ padding: '6px 4px' }}>{r.promptLen}B</td>
                  <td
                    style={{
                      padding: '6px 4px',
                      color: 'var(--fg-4)',
                      fontFamily: 'var(--font-jetbrains), monospace',
                    }}
                  >
                    {r.errorMessage ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
