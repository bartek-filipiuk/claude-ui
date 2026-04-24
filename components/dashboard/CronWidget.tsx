'use client';

import Link from 'next/link';
import { useCronDashboard } from '@/hooks/use-cron-jobs';

function formatRel(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const sign = diff >= 0 ? 'in ' : '';
  const past = diff < 0 ? ' ago' : '';
  if (abs < 60_000) return `${sign}${Math.round(abs / 1000)}s${past}`;
  if (abs < 3_600_000) return `${sign}${Math.round(abs / 60_000)}m${past}`;
  if (abs < 86_400_000) return `${sign}${Math.round(abs / 3_600_000)}h${past}`;
  return new Date(iso).toLocaleString();
}

export function CronWidget() {
  const { data } = useCronDashboard();
  const upcoming = data?.upcoming ?? [];
  const failures = data?.failures ?? [];

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 6,
        padding: 10,
        margin: '10px 12px',
        fontSize: 11,
        background: 'var(--bg-1)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <strong style={{ fontSize: 11, color: 'var(--fg-2)' }}>cron</strong>
        <Link
          href="/jobs"
          style={{ fontSize: 10, textDecoration: 'underline', color: 'var(--fg-4)' }}
        >
          manage
        </Link>
      </div>

      {upcoming.length === 0 && failures.length === 0 && (
        <div style={{ color: 'var(--fg-4)' }}>No scheduled jobs.</div>
      )}

      {upcoming.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ color: 'var(--fg-4)', marginBottom: 2 }}>upcoming</div>
          {upcoming.slice(0, 3).map((u) => (
            <div
              key={u.jobId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <Link
                href={`/jobs/${u.jobId}`}
                style={{
                  color: 'var(--fg-1)',
                  textDecoration: 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {u.name}
              </Link>
              <span style={{ color: 'var(--fg-4)' }}>{formatRel(u.nextRun)}</span>
            </div>
          ))}
        </div>
      )}

      {failures.length > 0 && (
        <div>
          <div style={{ color: 'var(--red-500, #ef4444)', marginBottom: 2 }}>
            recent failures
          </div>
          {failures.slice(0, 3).map((f) => (
            <div
              key={f.id}
              style={{ color: 'var(--fg-3)', fontSize: 10 }}
              title={f.errorMessage ?? f.status}
            >
              {f.status} · {new Date(f.triggeredAt).toLocaleTimeString()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
