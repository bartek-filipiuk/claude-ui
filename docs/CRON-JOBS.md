# Cron jobs — scheduled prompts to Claude Code

Write recurring prompts to an already-running Claude Code tab. Cron fires only
when Claude is at the input prompt; menus, fullscreen picker UIs and streaming
responses are excluded.

## Moving parts

| Layer | Location | Role |
| --- | --- | --- |
| Persistent tab store | `lib/pty/persistent-tabs-store.ts` | `~/.codehelm/persistent-tabs.json` — config of auto-spawned tabs |
| Registry | `lib/pty/persistent-tabs-registry.ts` | RAM map `persistentId → ptyId` |
| Service | `lib/pty/persistent-tabs-service.ts` | spawn + register + restart, used at startup and by API |
| Ring buffer + ready-check | `lib/pty/manager.ts`, `lib/pty/ready-check.ts` | 2 kB tail of stdout, marker regex OR idle &gt; 3 s |
| WS `attach` | `lib/ws/pty-channel.ts` | client can re-use an existing PTY instead of spawning |
| Jobs store | `lib/cron/jobs-store.ts` | `~/.codehelm/jobs.json` |
| Runs log | `lib/cron/runs-store.ts` | `~/.codehelm/job-runs.jsonl`, purged to 100/job hourly |
| Executor | `lib/cron/executor.ts` | resolves tab, validates ready, takes lock, writes prompt via bracketed paste |
| Scheduler | `lib/cron/scheduler.ts` | `croner` per job, reload on CRUD, retry scheduling |
| Tab lock | `lib/cron/tab-lock.ts` | in-memory mutex so two writes cannot collide |
| API | `app/api/cron/**`, `app/api/persistent-tabs/**` | CRUD + manual trigger + dashboard |
| UI | `app/jobs/**`, `components/dashboard/CronWidget.tsx` | `/jobs` page + sidebar widget |

## What a job does

```
cron tick
   → fetch job from jobs.json
   → find persistent tab with matching cron_tag
   → if Claude not at input prompt → log tab_not_ready (retry N× if enabled)
   → acquire mutex for that tab
   → pty.write(ESC[200~ + prompt + ESC[201~ + \r)
   → append job-runs.jsonl entry + audit.log `cron.cron_write`
```

The output lands in the terminal tab exactly as if the user typed it. We do
not capture or parse Claude's response.

## Storage

`~/.codehelm/jobs.json`:

```json
{ "version": 1, "jobs": [
  { "id": "uuid", "name": "daily research", "cronExpression": "0 12 * * *",
    "targetCronTag": "daily-research", "prompt": "...", "enabled": true,
    "readyCheckEnabled": true, "retryOnNotReady": true,
    "retryDelayMinutes": 5, "maxRetries": 3, "createdAt": 0, "updatedAt": 0 }
] }
```

`~/.codehelm/persistent-tabs.json`:

```json
{ "version": 1, "tabs": [
  { "persistentId": "uuid", "title": "daily research",
    "cwd": "/home/you/projects/research", "initCommand": "claude",
    "cronTag": "daily-research", "createdAt": 0, "updatedAt": 0 }
] }
```

`~/.codehelm/job-runs.jsonl` is append-only with one JSON object per line.

## Security

- Every persistent tab inherits the user's shell environment — do not set a
  `cron_tag` on tabs you would not trust to run a prompt unattended.
- `cron_tag` is `[a-z0-9][a-z0-9_-]{0,63}`.
- Prompt is capped at 16 KB.
- Audit log (`~/.codehelm/audit.log`) records every cron write with event
  `cron.cron_write` and fields: `jobId`, `persistentTabId`, `cronTag`,
  `promptLen`, `status`, `attempt`. The prompt **content** is never logged.
- CSRF double-submit applies to all `/api/cron/*` and `/api/persistent-tabs/*`
  mutating endpoints.

## Limits and escape hatches

- Persistent tabs count against the 16-PTY cap.
- `startup_respawn` runs after the HTTP server is bound. If a persistent tab
  fails to spawn (bad cwd, fs permission) the server keeps going and logs
  `persistent_restore_failed` — remove the bad entry from
  `persistent-tabs.json` or delete it via the UI.
- Scheduler runs `croner` in-process: jobs fire only while `codehelm` is
  running. For uptime use a systemd unit with `Restart=always`.
