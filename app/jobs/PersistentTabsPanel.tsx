'use client';

import { useState } from 'react';
import {
  useCreatePersistentTab,
  useDeletePersistentTab,
  usePersistentTabs,
  useRespawnPersistentTab,
  useUpdatePersistentTab,
} from '@/hooks/use-cron-jobs';
import { CHButton } from '@/components/ui/ch-button';
import { Badge } from '@/components/ui/badge';

interface NewTabForm {
  title: string;
  cwd: string;
  initCommand: string;
  cronTag: string;
}

const EMPTY: NewTabForm = { title: '', cwd: '', initCommand: 'claude', cronTag: '' };

export function PersistentTabsPanel() {
  const { data: tabs, isLoading } = usePersistentTabs();
  const create = useCreatePersistentTab();
  const del = useDeletePersistentTab();
  const respawn = useRespawnPersistentTab();
  const update = useUpdatePersistentTab();
  const [form, setForm] = useState<NewTabForm>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<NewTabForm>>({});

  return (
    <section
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--line)',
        borderRadius: 8,
        padding: 16,
      }}
    >
      <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, marginBottom: 12 }}>
        Persistent tabs
      </h2>
      <p style={{ fontSize: 11, color: 'var(--fg-4)', marginTop: 0, marginBottom: 12 }}>
        Persistent PTYs spawn at server startup and survive browser reload. Jobs target them
        by <strong>cron_tag</strong>. Typical setup: <em>cwd</em>=project path,{' '}
        <em>initCommand</em>=<code>claude</code> or <code>claude --resume &lt;id&gt;</code>.
      </p>
      {isLoading && <div style={{ fontSize: 12, color: 'var(--fg-4)' }}>loading…</div>}
      {tabs && tabs.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--fg-4)' }}>
              <th style={{ padding: '6px 4px', fontWeight: 500 }}>title</th>
              <th style={{ padding: '6px 4px', fontWeight: 500 }}>cwd</th>
              <th style={{ padding: '6px 4px', fontWeight: 500 }}>init</th>
              <th style={{ padding: '6px 4px', fontWeight: 500 }}>cron_tag</th>
              <th style={{ padding: '6px 4px', fontWeight: 500 }}>status</th>
              <th style={{ padding: '6px 4px', fontWeight: 500, textAlign: 'right' }}>actions</th>
            </tr>
          </thead>
          <tbody>
            {tabs.map((t) => {
              const isEditing = editing === t.persistentId;
              return (
                <tr key={t.persistentId} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '8px 4px' }}>
                    {isEditing ? (
                      <input
                        className="ch-input"
                        defaultValue={t.title}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, title: e.target.value }))
                        }
                      />
                    ) : (
                      <strong>{t.title}</strong>
                    )}
                  </td>
                  <td
                    style={{
                      padding: '8px 4px',
                      fontFamily: 'var(--font-jetbrains), monospace',
                      color: 'var(--fg-2)',
                    }}
                  >
                    {t.cwd}
                  </td>
                  <td
                    style={{
                      padding: '8px 4px',
                      fontFamily: 'var(--font-jetbrains), monospace',
                      color: 'var(--fg-2)',
                    }}
                  >
                    {isEditing ? (
                      <input
                        className="ch-input"
                        defaultValue={t.initCommand ?? ''}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, initCommand: e.target.value }))
                        }
                      />
                    ) : (
                      (t.initCommand ?? '—')
                    )}
                  </td>
                  <td style={{ padding: '8px 4px', fontFamily: 'var(--font-jetbrains), monospace' }}>
                    {isEditing ? (
                      <input
                        className="ch-input"
                        defaultValue={t.cronTag ?? ''}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, cronTag: e.target.value }))
                        }
                        placeholder="lowercase-dashes"
                      />
                    ) : (
                      (t.cronTag ?? '—')
                    )}
                  </td>
                  <td style={{ padding: '8px 4px' }}>
                    <Badge variant={t.alive ? 'emerald' : 'red'}>
                      {t.alive ? 'alive' : 'dead'}
                    </Badge>
                  </td>
                  <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      {isEditing ? (
                        <>
                          <CHButton
                            size="sm"
                            variant="primary"
                            onClick={async () => {
                              const patch: {
                                title?: string;
                                initCommand?: string | null;
                                cronTag?: string | null;
                              } = {};
                              if (editForm.title !== undefined) patch.title = editForm.title;
                              if (editForm.initCommand !== undefined)
                                patch.initCommand = editForm.initCommand || null;
                              if (editForm.cronTag !== undefined)
                                patch.cronTag = editForm.cronTag || null;
                              await update.mutateAsync({
                                persistentId: t.persistentId,
                                patch,
                              });
                              setEditing(null);
                              setEditForm({});
                            }}
                          >
                            save
                          </CHButton>
                          <CHButton
                            size="sm"
                            onClick={() => {
                              setEditing(null);
                              setEditForm({});
                            }}
                          >
                            cancel
                          </CHButton>
                        </>
                      ) : (
                        <>
                          <CHButton
                            size="sm"
                            disabled={t.alive || respawn.isPending}
                            onClick={() => respawn.mutate(t.persistentId)}
                            title="Re-spawn PTY"
                          >
                            respawn
                          </CHButton>
                          <CHButton
                            size="sm"
                            onClick={() => {
                              setEditing(t.persistentId);
                              setEditForm({});
                            }}
                          >
                            edit
                          </CHButton>
                          <CHButton
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (confirm(`Delete persistent tab "${t.title}"?`))
                                del.mutate(t.persistentId);
                            }}
                          >
                            delete
                          </CHButton>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <form
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 2fr 1.6fr 1.2fr auto',
          gap: 8,
          marginTop: 16,
          alignItems: 'end',
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!form.cwd) return;
          const payload: {
            title: string;
            cwd: string;
            initCommand?: string;
            cronTag?: string;
          } = { title: form.title || form.cwd, cwd: form.cwd };
          if (form.initCommand) payload.initCommand = form.initCommand;
          if (form.cronTag) payload.cronTag = form.cronTag;
          try {
            await create.mutateAsync(payload);
            setForm(EMPTY);
          } catch (err) {
            alert(`Failed: ${(err as Error).message}`);
          }
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 11 }}>
          <span style={{ color: 'var(--fg-4)' }}>title</span>
          <input
            className="ch-input"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="daily research"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 11 }}>
          <span style={{ color: 'var(--fg-4)' }}>cwd (must be under $HOME)</span>
          <input
            className="ch-input"
            value={form.cwd}
            onChange={(e) => setForm((f) => ({ ...f, cwd: e.target.value }))}
            placeholder="/home/you/projects/example"
            required
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 11 }}>
          <span style={{ color: 'var(--fg-4)' }}>init command</span>
          <input
            className="ch-input"
            value={form.initCommand}
            onChange={(e) => setForm((f) => ({ ...f, initCommand: e.target.value }))}
            placeholder="claude"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 11 }}>
          <span style={{ color: 'var(--fg-4)' }}>cron_tag</span>
          <input
            className="ch-input"
            value={form.cronTag}
            onChange={(e) => setForm((f) => ({ ...f, cronTag: e.target.value }))}
            placeholder="daily-research"
          />
        </label>
        <CHButton type="submit" size="sm" variant="primary" disabled={create.isPending}>
          + add
        </CHButton>
      </form>
    </section>
  );
}
