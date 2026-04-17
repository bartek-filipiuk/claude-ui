# `codehelm` architecture

## Big picture

```
┌────────────────────────────────────────────────────────┐
│  bin/codehelm  (launcher)                             │
│  1. find ephemeral port (49152-65535)                  │
│  2. gen 32B token (crypto.randomBytes)                 │
│  3. spawn `tsx server.ts` with PORT + TOKEN in env     │
│  4. poll /healthz (auth-exempt) until ready            │
│  5. mkdir -m 0700 $XDG_RUNTIME_DIR/codehelm/<uuid>    │
│  6. spawn chromium --app=http://127.0.0.1:PORT/?k=TOK  │
│       --user-data-dir=<profile>                        │
│  7. SIGTERM/SIGINT trap → kill children + rm profile   │
└───────────┬────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│  server.ts  (Node HTTP + custom upgrade)               │
│                                                         │
│  HTTP path:                                             │
│    req → middleware (Host check, auth cookie, CSRF)     │
│        → app.getRequestHandler() (Next App Router)      │
│                                                         │
│  WS upgrade path:                                       │
│    req.url.startsWith('/_next/webpack-hmr')             │
│      → Next HMR ws.Server                               │
│    req.url === '/api/ws/pty'                            │
│      → lib/ws/pty-channel (Origin check, cookie auth)   │
│    req.url === '/api/ws/watch'                          │
│      → lib/ws/watch-channel                             │
└───────────┬────────────────────────────────────────────┘
            │
    ┌───────┴────────┬───────────────┬──────────────┐
    ▼                ▼               ▼              ▼
 REST API       WebSocket         fs watcher    PTY manager
 (App Router)   (ws lib)          (chokidar)    (node-pty)
    │                │               │              │
    └──── lib/ ──────┴───────────────┴──────────────┘
         (security, jsonl, pty, watcher, ws, server)
```

## Layers

### Frontend (Next.js 15 App Router + React 19)

- `app/layout.tsx` — CSP nonce (from `headers()`), providers (TanStack Query + Zustand), global shadcn theme.
- `app/page.tsx` — main shell (sidebar + main, resizable panels).
- `app/(ui)/*` — UI components per module.
- Data from REST via TanStack Query; local UI state in Zustand slices.
- Streaming JSONL: `fetch` + `ReadableStream` with progressive parsing in a hook.
- Virtualisation: react-virtuoso for the message list and long session lists.

### Backend (custom server.ts + Next handler)

- Node 20 LTS, TypeScript strict, `tsx` in dev, standalone build in prod.
- A single `http.Server` instance handles Next HTTP plus WS upgrades.
- Middleware stack (before the Next handler):
  1. Host allowlist (`127.0.0.1:PORT` or `localhost:PORT` with redirect).
  2. Auth cookie check (except `/api/auth`, `/healthz`, `_next/*`).
  3. CSRF double-submit for unsafe methods (POST/PUT/DELETE/PATCH).

### REST API (App Router route handlers)

- `/api/auth` — token → HttpOnly+SameSite=Strict cookie + redirect.
- `/api/projects` — GET, discovery of `~/.claude/projects/`.
- `/api/projects/[slug]/sessions` — GET, JSONL list for a project.
- `/api/sessions/[id]` — GET, chunked streaming.
- `/api/sessions/[id]/export` — GET, Markdown download.
- `/api/sessions/new` — POST, spawn `claude` inside the project's cwd (with cwd validation).
- `/api/claude-md` — GET/PUT for the global CLAUDE.md.
- `/api/claude-md/[slug]` — GET/PUT per-project.
- `/healthz` — GET, auth-exempt, used by the launcher smoke test.

### WebSocket channels

- `/api/ws/pty` — bidirectional PTY protocol (spawn, data, resize, kill, ack).
- `/api/ws/watch` — server-pushed events from the fs watcher (project-added, session-added, session-updated).

### Internal libraries (`lib/`)

- `lib/security/*` — pure functions, zero IO, trivially testable.
  - `token.ts` — `generateToken()`, `safeCompare(a, b)`.
  - `csrf.ts` — `issueCsrf()`, `verifyCsrf(cookie, header)`.
  - `host-check.ts` — `isHostAllowed(req)`, `isOriginAllowed(req)`.
  - `path-guard.ts` — `assertInside(root, candidate)` → realpath + prefix check.
  - `csp.ts` — `makeCsp(nonce)` → header value.
- `lib/jsonl/*`
  - `types.ts` — Zod schemas for the 8 event types.
  - `parser.ts` — `parseJsonlStream(readable) → AsyncIterable<Event>`.
  - `index.ts` — `listProjects()`, `listSessions(slug)`, `decodeSlug(slug)`.
  - `export-md.ts` — `sessionToMarkdown(events) → string`.
  - `search.ts` — `searchInSession(events, query)`.
- `lib/pty/*`
  - `manager.ts` — singleton, `Map<id, PtyHandle>`, cap 16, rate limit 10/min.
  - `spawn.ts` — node-pty wrapper, resolves `$SHELL` with per-OS fallbacks.
  - `audit.ts` — appends `~/.codehelm/audit.log`.
- `lib/watcher/chokidar.ts` — singleton watcher + EventEmitter.
- `lib/ws/*`
  - `server.ts` — upgrade router and handshake auth.
  - `pty-channel.ts` — PTY protocol with client-ACK flow control.
  - `watch-channel.ts` — server-pushed events.
- `lib/server/*`
  - `port.ts` — `findEphemeralPort()` with TOCTOU retry.
  - `config.ts` — constants: `HOME`, `CLAUDE_DIR`, `AUDIT_PATH`, `PROFILE_DIR`.
  - `platform.ts` — OS helpers: `defaultShell`, `runtimeRootDir`, `chromiumCandidates`, `findChromium`.
  - `logger.ts` — pino instance with `redact: ['token', 'authorization', 'cookie', '*.env']`.

## Data flows

### Opening a session in read-only mode

1. User clicks a project in the sidebar → `GET /api/projects/[slug]/sessions`.
2. Click a session → `GET /api/sessions/[id]` (streaming JSONL).
3. The `use-session-stream` hook iterates over chunks and feeds react-virtuoso.
4. Shiki is lazy-loaded per code-block language.

### Opening a terminal in a project

1. User clicks "terminal" on a project → client opens the WS `/api/ws/pty`.
2. Handshake: cookie auth + Origin check + CSRF in the first message.
3. Client sends `{type:"spawn", shell:"/bin/bash", cwd:"/home/bartek/project", cols:80, rows:24}`.
4. Server: path-guard cwd, rate-limit check, `pty.spawn(...)`, audit append.
5. Bidirectional data stream with flow control (client ACK every 64 kB, server pauses at 1 MB unacked).

### Live update when the Claude CLI writes to a JSONL

1. chokidar detects a `change` on `~/.claude/projects/<slug>/<sessionId>.jsonl`.
2. Debounce 200 ms per file → emit event.
3. `watch-channel` pushes `{type:"session-updated", slug, sessionId}` to every client with an active WS.
4. Client → `queryClient.invalidateQueries(['session', sessionId])` → reload.
5. If the session is open in the viewer, the hook attaches a new streaming tail instead of doing a full reload.

## Standalone build

- `next build` with `output: 'standalone'` → `.next/standalone/` contains a minimal runtime.
- Postbuild: `cp server.ts .next/standalone/` + `cp -r bin .next/standalone/`.
- Prod start: `node .next/standalone/server.js` (dev uses `tsx` + `server.ts`; prod ships `server.js` produced by tsx build).

## Performance targets

- First byte of a session stream: < 50 ms (locally).
- Scroll 2000 messages: FPS > 30.
- PTY echo RTT: < 20 ms.
- Memory: < 300 MB with 5 active terminal tabs and 2 open JSONL sessions.

## Observability

- Logger: pino with a redact list (`token`, `authorization`, `cookie`, `env.*`).
- Audit log: structural facts only, no content (see `SECURITY.md`).
- Health: `/healthz` → `{status:"ok", uptime, pty_count, memory_mb}` (auth-exempt for launcher + systemd probe).
