'use client';

import { useEffect, useState } from 'react';
import {
  useCreateJob,
  useCronJob,
  usePersistentTabs,
  useUpdateJob,
  type CreateJobPayload,
} from '@/hooks/use-cron-jobs';
import { CHButton } from '@/components/ui/ch-button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface FormState {
  name: string;
  preset: 'daily' | 'hourly' | 'every-n' | 'custom';
  dailyHour: string;
  dailyMinute: string;
  everyN: string;
  custom: string;
  targetCronTag: string;
  prompt: string;
  enabled: boolean;
  readyCheckEnabled: boolean;
  retryOnNotReady: boolean;
  retryDelayMinutes: string;
  maxRetries: string;
}

const DEFAULT_FORM: FormState = {
  name: '',
  preset: 'daily',
  dailyHour: '12',
  dailyMinute: '00',
  everyN: '2',
  custom: '',
  targetCronTag: '',
  prompt: '',
  enabled: true,
  readyCheckEnabled: true,
  retryOnNotReady: true,
  retryDelayMinutes: '5',
  maxRetries: '3',
};

function computeCron(s: FormState): string {
  if (s.preset === 'daily') {
    return `${Number(s.dailyMinute)} ${Number(s.dailyHour)} * * *`;
  }
  if (s.preset === 'hourly') return `0 * * * *`;
  if (s.preset === 'every-n') {
    const n = Math.max(1, Math.min(23, Number(s.everyN) || 1));
    return `0 */${n} * * *`;
  }
  return s.custom.trim();
}

export function JobFormDialog({ jobId, onClose }: { jobId: string | null; onClose: () => void }) {
  const isEdit = Boolean(jobId);
  const { data: existing } = useCronJob(jobId);
  const { data: tabs } = usePersistentTabs();
  const create = useCreateJob();
  const update = useUpdateJob();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit && existing) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setForm({
        name: existing.name,
        preset: 'custom',
        dailyHour: '12',
        dailyMinute: '00',
        everyN: '2',
        custom: existing.cronExpression,
        targetCronTag: existing.targetCronTag,
        prompt: existing.prompt,
        enabled: existing.enabled,
        readyCheckEnabled: existing.readyCheckEnabled,
        retryOnNotReady: existing.retryOnNotReady,
        retryDelayMinutes: String(existing.retryDelayMinutes),
        maxRetries: String(existing.maxRetries),
      });
    }
    if (!isEdit) {
      setForm(() => ({
        ...DEFAULT_FORM,
        targetCronTag: tabs?.[0]?.cronTag ?? '',
      }));
    }
  }, [isEdit, existing, tabs]);

  const cronExpr = computeCron(form);
  const hasNewlines = form.prompt.includes('\n');

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent style={{ maxWidth: 720 }}>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit job' : 'New cron job'}</DialogTitle>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ color: 'var(--fg-4)' }}>name</span>
            <input
              className="ch-input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="daily research digest"
            />
          </label>

          <fieldset
            style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 10 }}
          >
            <legend style={{ padding: '0 6px', color: 'var(--fg-4)' }}>schedule</legend>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <input
                  type="radio"
                  checked={form.preset === 'daily'}
                  onChange={() => setForm((f) => ({ ...f, preset: 'daily' }))}
                />
                daily at
                <input
                  className="ch-input"
                  style={{ width: 48 }}
                  value={form.dailyHour}
                  onChange={(e) => setForm((f) => ({ ...f, dailyHour: e.target.value }))}
                />
                :
                <input
                  className="ch-input"
                  style={{ width: 48 }}
                  value={form.dailyMinute}
                  onChange={(e) => setForm((f) => ({ ...f, dailyMinute: e.target.value }))}
                />
              </label>
              <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <input
                  type="radio"
                  checked={form.preset === 'hourly'}
                  onChange={() => setForm((f) => ({ ...f, preset: 'hourly' }))}
                />
                every hour
              </label>
              <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <input
                  type="radio"
                  checked={form.preset === 'every-n'}
                  onChange={() => setForm((f) => ({ ...f, preset: 'every-n' }))}
                />
                every
                <input
                  className="ch-input"
                  style={{ width: 48 }}
                  value={form.everyN}
                  onChange={(e) => setForm((f) => ({ ...f, everyN: e.target.value }))}
                />
                hours
              </label>
              <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <input
                  type="radio"
                  checked={form.preset === 'custom'}
                  onChange={() => setForm((f) => ({ ...f, preset: 'custom' }))}
                />
                custom
              </label>
              {form.preset === 'custom' && (
                <input
                  className="ch-input"
                  style={{ flex: 1, minWidth: 180 }}
                  value={form.custom}
                  onChange={(e) => setForm((f) => ({ ...f, custom: e.target.value }))}
                  placeholder="0 12 * * *"
                />
              )}
            </div>
            <div
              style={{
                marginTop: 8,
                fontFamily: 'var(--font-jetbrains), monospace',
                fontSize: 11,
                color: 'var(--fg-3)',
              }}
            >
              resolved: <code>{cronExpr || '(empty)'}</code>
            </div>
          </fieldset>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ color: 'var(--fg-4)' }}>target persistent tab (cron_tag)</span>
            <select
              className="ch-select"
              value={form.targetCronTag}
              onChange={(e) => setForm((f) => ({ ...f, targetCronTag: e.target.value }))}
            >
              <option value="">— pick a tab —</option>
              {tabs?.filter((t) => t.cronTag).map((t) => (
                <option key={t.persistentId} value={t.cronTag}>
                  {t.cronTag} ({t.title})
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ color: 'var(--fg-4)' }}>prompt</span>
            <textarea
              className="ch-input"
              rows={6}
              value={form.prompt}
              onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
              placeholder="Research topic X and email me a summary..."
              style={{ fontFamily: 'var(--font-jetbrains), monospace' }}
            />
            <div style={{ fontSize: 10, color: 'var(--fg-4)' }}>
              Prompt is typed into Claude Code with your shell permissions. Do not include secrets.
            </div>
            {hasNewlines && (
              <div style={{ fontSize: 10, color: 'var(--gold-700)' }}>
                Multiline prompts are sent via bracketed paste — should work, but test
                with &ldquo;run now&rdquo; first.
              </div>
            )}
          </label>

          <fieldset style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 10 }}>
            <legend style={{ padding: '0 6px', color: 'var(--fg-4)' }}>advanced</legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label>
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                />{' '}
                enabled (will run on schedule)
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.readyCheckEnabled}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, readyCheckEnabled: e.target.checked }))
                  }
                />{' '}
                ready-check (only send when Claude is idle at prompt)
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.retryOnNotReady}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, retryOnNotReady: e.target.checked }))
                  }
                />{' '}
                retry if not ready
              </label>
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                retry delay (minutes):
                <input
                  className="ch-input"
                  style={{ width: 64 }}
                  value={form.retryDelayMinutes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, retryDelayMinutes: e.target.value }))
                  }
                />
              </label>
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                max retries:
                <input
                  className="ch-input"
                  style={{ width: 64 }}
                  value={form.maxRetries}
                  onChange={(e) => setForm((f) => ({ ...f, maxRetries: e.target.value }))}
                />
              </label>
            </div>
          </fieldset>

          {error && (
            <div style={{ fontSize: 11, color: 'var(--red-500, #ef4444)' }}>{error}</div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            paddingTop: 12,
          }}
        >
          <CHButton onClick={onClose} size="sm">
            cancel
          </CHButton>
          <CHButton
            variant="primary"
            size="sm"
            disabled={create.isPending || update.isPending}
            onClick={async () => {
              setError(null);
              if (!form.name || !form.targetCronTag || !form.prompt || !cronExpr) {
                setError('Fill in name, cron, target tab and prompt.');
                return;
              }
              const payload: CreateJobPayload = {
                name: form.name,
                cronExpression: cronExpr,
                targetCronTag: form.targetCronTag,
                prompt: form.prompt,
                enabled: form.enabled,
                readyCheckEnabled: form.readyCheckEnabled,
                retryOnNotReady: form.retryOnNotReady,
                retryDelayMinutes: Math.max(1, Number(form.retryDelayMinutes) || 5),
                maxRetries: Math.max(0, Number(form.maxRetries) || 0),
              };
              try {
                if (isEdit && jobId) {
                  await update.mutateAsync({ id: jobId, patch: payload });
                } else {
                  await create.mutateAsync(payload);
                }
                onClose();
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            {isEdit ? 'save' : 'create'}
          </CHButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
