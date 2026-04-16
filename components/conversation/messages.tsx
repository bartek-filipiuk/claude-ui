'use client';

import { useState } from 'react';
import type { JsonlEvent } from '@/lib/jsonl/types';
import { Markdown } from './Markdown';
import { CodeBlock } from './CodeBlock';

const MAX_RENDER_BYTES = 10_000_000;

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (
          c &&
          typeof c === 'object' &&
          'text' in c &&
          typeof (c as { text: unknown }).text === 'string'
        ) {
          return (c as { text: string }).text;
        }
        if (c && typeof c === 'object' && 'type' in c) {
          return `[${(c as { type: string }).type}]`;
        }
        return '';
      })
      .join('\n');
  }
  return '';
}

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_RENDER_BYTES) return { text, truncated: false };
  return { text: text.slice(0, MAX_RENDER_BYTES), truncated: true };
}

function Wrapper({
  role,
  color,
  children,
}: {
  role: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-2 flex w-16 shrink-0 items-start justify-end">
        <span className={`text-[10px] uppercase tracking-wider ${color}`}>{role}</span>
      </div>
      <div className="min-w-0 flex-1 rounded-md border border-neutral-800 bg-neutral-900/60 p-3">
        {children}
      </div>
    </div>
  );
}

export function UserMsg({ ev }: { ev: Extract<JsonlEvent, { type: 'user' }> }) {
  const raw = extractText(ev.message.content);
  const { text, truncated } = truncate(raw);
  return (
    <Wrapper role="user" color="text-blue-400">
      <pre className="whitespace-pre-wrap break-words font-mono text-sm text-neutral-100">
        {text}
      </pre>
      {truncated && <TruncatedHint />}
    </Wrapper>
  );
}

export function AssistantMsg({ ev }: { ev: Extract<JsonlEvent, { type: 'assistant' }> }) {
  const raw = extractText(ev.message.content);
  const { text, truncated } = truncate(raw);
  return (
    <Wrapper role="assistant" color="text-emerald-400">
      <Markdown text={text} />
      {truncated && <TruncatedHint />}
    </Wrapper>
  );
}

export function ToolUseMsg({ ev }: { ev: Extract<JsonlEvent, { type: 'tool_use' }> }) {
  const [open, setOpen] = useState(false);
  const name = ev.name ?? 'unknown';
  const inputStr = ev.input ? JSON.stringify(ev.input, null, 2) : '{}';
  const preview = inputStr.slice(0, 200);
  return (
    <Wrapper role="tool_use" color="text-amber-400">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded px-1 text-xs text-neutral-400 hover:bg-neutral-800"
          aria-label={open ? 'Zwiń' : 'Rozwiń'}
        >
          {open ? '▼' : '▶'}
        </button>
        <span className="font-mono text-sm font-semibold text-amber-300">{name}</span>
        {!open && <span className="truncate font-mono text-xs text-neutral-500">{preview}</span>}
      </div>
      {open && <CodeBlock code={inputStr} lang="json" />}
    </Wrapper>
  );
}

export function ToolResultMsg({ ev }: { ev: Extract<JsonlEvent, { type: 'tool_result' }> }) {
  const [open, setOpen] = useState(false);
  const r = ev.toolUseResult;
  const exit = r?.exitCode;
  const stdout = r?.stdout ?? '';
  const stderr = r?.stderr ?? '';
  const hasOutput = stdout || stderr;
  return (
    <Wrapper role="tool_result" color="text-sky-400">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded px-1 text-xs text-neutral-400 hover:bg-neutral-800"
          aria-label={open ? 'Zwiń' : 'Rozwiń'}
          disabled={!hasOutput}
        >
          {open ? '▼' : hasOutput ? '▶' : ' '}
        </button>
        <span className="text-xs text-neutral-400">
          exit {typeof exit === 'number' ? exit : '—'}
        </span>
        {r?.interrupted && (
          <span className="rounded bg-red-900/50 px-1.5 py-0.5 text-[10px] text-red-300">
            interrupted
          </span>
        )}
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          {stdout && (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">stdout</p>
              <CodeBlock code={truncate(stdout).text} lang="text" />
            </div>
          )}
          {stderr && (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-red-400">stderr</p>
              <CodeBlock code={truncate(stderr).text} lang="text" />
            </div>
          )}
        </div>
      )}
    </Wrapper>
  );
}

export function SystemMsg({ ev }: { ev: Extract<JsonlEvent, { type: 'system' }> }) {
  return (
    <Wrapper role="system" color="text-neutral-500">
      <p className="text-xs text-neutral-400">
        <span className="font-mono">{ev.slug ?? ev.subtype ?? 'event'}</span>
        {typeof ev.hookCount === 'number' && (
          <span className="ml-2 text-neutral-600">hooks: {ev.hookCount}</span>
        )}
      </p>
    </Wrapper>
  );
}

export function AttachmentMsg({ ev }: { ev: Extract<JsonlEvent, { type: 'attachment' }> }) {
  return (
    <Wrapper role="attachment" color="text-purple-400">
      <p className="text-xs text-neutral-300">
        <span className="font-mono">{ev.hookName ?? ev.command ?? 'hook'}</span>
        <span className="ml-2 text-neutral-500">
          exit {ev.exitCode ?? '—'} · {ev.durationMs ?? '—'} ms
        </span>
      </p>
    </Wrapper>
  );
}

export function PermissionMsg({ ev }: { ev: Extract<JsonlEvent, { type: 'permission-mode' }> }) {
  return (
    <Wrapper role="permission" color="text-yellow-400">
      <p className="text-xs text-neutral-300">
        mode: <span className="font-mono text-yellow-200">{ev.mode ?? '—'}</span>
      </p>
    </Wrapper>
  );
}

export function QueueMsg({ ev }: { ev: Extract<JsonlEvent, { type: 'queue-operation' }> }) {
  return (
    <Wrapper role="queue" color="text-neutral-600">
      <p className="text-xs text-neutral-500">
        op: <span className="font-mono">{ev.operation ?? '—'}</span>
      </p>
    </Wrapper>
  );
}

export function FileHistoryMsg(_props: {
  ev: Extract<JsonlEvent, { type: 'file-history-snapshot' }>;
}) {
  return (
    <Wrapper role="snapshot" color="text-neutral-600">
      <p className="text-xs text-neutral-500">file history snapshot</p>
    </Wrapper>
  );
}

export function renderEvent(ev: JsonlEvent, key: number) {
  switch (ev.type) {
    case 'user':
      return <UserMsg key={key} ev={ev} />;
    case 'assistant':
      return <AssistantMsg key={key} ev={ev} />;
    case 'tool_use':
      return <ToolUseMsg key={key} ev={ev} />;
    case 'tool_result':
      return <ToolResultMsg key={key} ev={ev} />;
    case 'system':
      return <SystemMsg key={key} ev={ev} />;
    case 'attachment':
      return <AttachmentMsg key={key} ev={ev} />;
    case 'permission-mode':
      return <PermissionMsg key={key} ev={ev} />;
    case 'queue-operation':
      return <QueueMsg key={key} ev={ev} />;
    case 'file-history-snapshot':
      return <FileHistoryMsg key={key} ev={ev} />;
  }
}

function TruncatedHint() {
  return <p className="mt-2 text-xs text-amber-400">Treść przycięta do 10 MB (render limit).</p>;
}
