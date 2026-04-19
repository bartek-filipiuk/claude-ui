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

## Manual test walkthrough

End-to-end smoke test for a fresh install. Assumes `pnpm build` and
`./bin/codehelm` already work.

### 1. Register a persistent target

1. Open the app. Click the `cron` widget in the sidebar (or navigate to
   `/jobs`).
2. Scroll to **Persistent tabs** and fill the form:
   - **title** — free text, e.g. `daily-research`
   - **cwd** — absolute path under `$HOME` (path-guard rejects anything
     else), e.g. `/home/you/projects/example`
   - **init command** — `claude` (or `claude --resume <session-id>` if
     you want cron to keep typing into a specific session)
   - **cron_tag** — unique, lowercase, e.g. `daily-research`
3. Click `+ add`. The row appears with badge `alive`. The PTY is already
   running in the background — verify with
   `cat ~/.codehelm/persistent-tabs.json | jq '.tabs | length'`.

### 2. Create a job

1. Still on `/jobs`, click `+ new job` (enabled once at least one
   persistent tab exists).
2. Fill the form:
   - **name** — `smoke test`
   - **schedule** — pick *custom* and enter `* * * * *` (fires every
     minute) for fast iteration.
   - **target persistent tab** — select `daily-research` from the
     dropdown.
   - **prompt** — keep it short for the smoke test: `say hello`.
   - Leave *ready-check* on so cron does not step over another response.
3. Click `create`. The row appears with `last: never_run` and a `next
   run` ETA.

### 3. Trigger once by hand

Click `run now` on the job row. Expected result in the table:

- `last: sent` (green badge) — the prompt was written into the PTY.
- `last: tab_not_ready` (gold) — Claude was streaming or not at a
  prompt. A retry is scheduled if you enabled it.
- `last: tab_not_found` / `pty_dead` — the persistent tab disappeared
  (server restart without respawn? `cron_tag` typo?).

Click the job name to open `/jobs/<id>`. The **Runs** tab shows one line
per fire with timestamp, attempt number, prompt size and error message.
The view auto-refreshes every 5 s.

### 4. Confirm the prompt reached Claude

Open the terminal tab (sidebar `manage` → Terminal mode or whichever tab
is attached to `daily-research`). You should see the prompt appear as if
you typed it, followed by Claude's streaming response.

```bash
# server-side receipts
grep cron_write ~/.codehelm/audit.log | tail
# → {ts, event:"cron.cron_write", jobId, persistentTabId, cronTag, promptLen, status, attempt}
tail -f ~/.codehelm/job-runs.jsonl
# → one JSON object per fire
```

### 5. Clean up

- Flip the `enabled` toggle on the job to stop firing without deleting.
- `delete` on the job row removes it from `jobs.json`; the scheduler
  drops its `croner` instance immediately.
- `delete` on the persistent tab row kills the PTY
  (`DELETE /api/persistent-tabs/:id`) and removes the `persistent-tabs.json`
  entry.

### Failure modes to probe

| Action | Expected |
| ------ | -------- |
| Type a long command in the persistent tab, click `run now` before it finishes | `tab_not_ready` (retry scheduled if enabled) |
| Rename the `cron_tag` on the persistent tab but not the job | `tab_not_found` on next fire |
| Kill the PTY with `Ctrl+D` / `exit` | Next fire `pty_dead`; the tab row badge flips to `dead`. Click `respawn` to bring it back |
| Enter a bad cron expression (`* * *`) in the form | Form refuses to submit, server returns `bad_cron` |
