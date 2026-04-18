'use client';

import { useState } from 'react';
import type { JsonlEvent } from '@/lib/jsonl/types';
import type { DiffToolUse, ParentToolUseRegistry } from '@/lib/jsonl/tool-pairs';
import { Markdown } from './Markdown';
import { CodeBlock } from './CodeBlock';
import { DiffView } from './DiffView';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSettings } from '@/hooks/use-settings';
import { formatTimestamp } from '@/lib/jsonl/format-timestamp';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';

export type ToolUseRegistry = ReadonlyMap<string, DiffToolUse>;

const POPOVER_INPUT_MAX_BYTES = 10_000;
const MAX_RENDER_BYTES = 10_000_000;

type ContentBlock =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool_use'; name: string; input: unknown; id: string | null }
  | { kind: 'tool_result'; text: string; toolUseId: string | null; isError: boolean };

function toolResultToText(raw: unknown): { text: string; isError: boolean } {
  let text = '';
  if (typeof raw === 'string') text = raw;
  else if (Array.isArray(raw)) {
    text = raw
      .map((c) => {
        if (c && typeof c === 'object' && 'text' in c) {
          return String((c as { text: unknown }).text ?? '');
        }
        return '';
      })
      .join('\n');
  } else if (raw && typeof raw === 'object') {
    try {
      text = JSON.stringify(raw, null, 2);
    } catch {
      text = '[unserialisable]';
    }
  }
  return { text, isError: false };
}

function splitBlocks(content: unknown): ContentBlock[] {
  if (typeof content === 'string') return [{ kind: 'text', text: content }];
  if (!Array.isArray(content)) return [];
  const out: ContentBlock[] = [];
  for (const c of content) {
    if (!c || typeof c !== 'object') continue;
    const item = c as Record<string, unknown>;
    const t = item['type'];
    if (t === 'text' && typeof item['text'] === 'string') {
      out.push({ kind: 'text', text: item['text'] as string });
    } else if (t === 'thinking' && typeof item['thinking'] === 'string') {
      out.push({ kind: 'thinking', text: item['thinking'] as string });
    } else if (t === 'tool_use') {
      out.push({
        kind: 'tool_use',
        name: typeof item['name'] === 'string' ? (item['name'] as string) : 'unknown',
        input: item['input'],
        id: typeof item['id'] === 'string' ? (item['id'] as string) : null,
      });
    } else if (t === 'tool_result') {
      const { text } = toolResultToText(item['content']);
      out.push({
        kind: 'tool_result',
        text,
        toolUseId: typeof item['tool_use_id'] === 'string' ? (item['tool_use_id'] as string) : null,
        isError: item['is_error'] === true,
      });
    }
  }
  return out;
}

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_RENDER_BYTES) return { text, truncated: false };
  return { text: text.slice(0, MAX_RENDER_BYTES), truncated: true };
}

/**
 * Role rail wrapper: left gutter shows event number + timestamp, right side
 * renders the role label + body. Visual variants are driven by `.ev.<role>`
 * selectors in globals.css (assistant = gold, tool_result = sky, etc.).
 */
function Wrapper({
  role,
  eventNumber,
  error,
  timestamp,
  children,
}: {
  role: string;
  eventNumber: number;
  error?: boolean;
  timestamp?: string | undefined;
  children: React.ReactNode;
}) {
  const roleLabel = role.replace('_', ' ').toUpperCase();
  const roleClass = role === 'tool_result' && error ? 'tool_result error' : role;
  return (
    <div className={`ev ${roleClass}`} data-event-index={eventNumber}>
      <div className="gutter">
        <span className="num">#{eventNumber + 1}</span>
        {timestamp && <TimestampBadge iso={timestamp} />}
      </div>
      <div className="body">
        <div className="role">
          <span className="sq" />
          {roleLabel}
        </div>
        {children}
      </div>
    </div>
  );
}

function TimestampBadge({ iso }: { iso: string }) {
  const { data: settings } = useSettings();
  const mode = settings?.timestampFormat ?? DEFAULT_SETTINGS.timestampFormat;
  const text = formatTimestamp(iso, mode);
  if (!text) return null;
  return (
    <time dateTime={iso} className="ts" title={iso}>
      {text}
    </time>
  );
}

function Blocks({
  blocks,
  markdown,
  registry,
  parentRegistry,
}: {
  blocks: ContentBlock[];
  markdown: boolean;
  registry?: ToolUseRegistry | undefined;
  parentRegistry?: ParentToolUseRegistry | undefined;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {blocks.map((b, i) => {
        if (b.kind === 'text') {
          const { text, truncated } = truncate(b.text);
          return (
            <div key={i} className="md">
              {markdown ? (
                <Markdown text={text} />
              ) : (
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'var(--font-jetbrains), monospace',
                    fontSize: 12,
                    color: 'var(--fg-0)',
                  }}
                >
                  {text}
                </pre>
              )}
              {truncated && <TruncatedHint />}
            </div>
          );
        }
        if (b.kind === 'thinking') {
          const { text, truncated } = truncate(b.text);
          return (
            <details
              key={i}
              style={{
                background: 'var(--bg-1)',
                border: '1px solid var(--line-2)',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 11,
                color: 'var(--fg-2)',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  userSelect: 'none',
                  fontSize: 10,
                  color: 'var(--fg-3)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                thinking
              </summary>
              <pre
                style={{
                  marginTop: 6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'var(--font-jetbrains), monospace',
                  fontSize: 11,
                  color: 'var(--fg-2)',
                }}
              >
                {text}
              </pre>
              {truncated && <TruncatedHint />}
            </details>
          );
        }
        if (b.kind === 'tool_use') {
          return <ToolUseBlock key={i} name={b.name} input={b.input} />;
        }
        const diff = b.toolUseId ? registry?.get(b.toolUseId) : undefined;
        const parent = b.toolUseId ? parentRegistry?.get(b.toolUseId) : undefined;
        return (
          <ToolResultBlock
            key={i}
            text={b.text}
            isError={b.isError}
            diff={diff ?? null}
            parent={parent ?? null}
          />
        );
      })}
    </div>
  );
}

function ToolUseBlock({ name, input }: { name: string; input: unknown }) {
  const [open, setOpen] = useState(false);
  const inputStr = input !== undefined ? JSON.stringify(input, null, 2) : '{}';
  const oneLine = inputStr.replace(/\s+/g, ' ').slice(0, 180);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`tool-row ${open ? 'open' : ''}`}
        style={{ width: '100%', textAlign: 'left' }}
        aria-expanded={open}
      >
        <span className="chev">▸</span>
        <span className="name">{name}</span>
        {!open && <span className="args">{oneLine}</span>}
      </button>
      {open && (
        <div className="tool-body">
          <CodeBlock code={inputStr} lang="json" />
        </div>
      )}
    </div>
  );
}

function ToolResultBlock({
  text,
  isError,
  diff,
  parent,
}: {
  text: string;
  isError: boolean;
  diff: DiffToolUse | null;
  parent: { name: string; input: unknown } | null;
}) {
  const [open, setOpen] = useState(diff !== null && !isError);
  const { text: safe, truncated } = truncate(text);
  const oneLine = safe.replace(/\s+/g, ' ').slice(0, 180);
  const showDiff = diff !== null && !isError;
  const summary = showDiff ? `${diff.name}${diff.filePath ? ` · ${diff.filePath}` : ''}` : oneLine;

  return (
    <div>
      <div
        className={`tool-row ${open ? 'open' : ''}`}
        style={{ cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        <span className="chev" style={{ color: isError ? 'var(--red)' : 'var(--sky)' }}>
          ◂
        </span>
        <span className="name" style={{ color: isError ? 'var(--red)' : 'var(--sky)' }}>
          {isError ? 'tool_result · error' : 'tool_result'}
        </span>
        <span className="args">{summary}</span>
        <ParentToolUseTrigger parent={parent} />
      </div>
      {open && (
        <div className="tool-body">
          {showDiff ? (
            <DiffView
              oldText={diff.oldText}
              newText={diff.newText}
              filePath={diff.filePath}
              label={diff.name}
            />
          ) : (
            <>
              <CodeBlock code={safe} lang="text" />
              {truncated && <TruncatedHint />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ParentToolUseTrigger({ parent }: { parent: { name: string; input: unknown } | null }) {
  const hasParent = parent !== null;
  return (
    <Popover>
      <PopoverTrigger
        aria-label={hasParent ? `Show parent tool_use (${parent.name})` : 'No parent tool_use'}
        title={hasParent ? `Parent: ${parent.name}` : 'No linked tool_use'}
        className="badge"
        disabled={!hasParent}
        onClick={(e) => e.stopPropagation()}
      >
        parent
      </PopoverTrigger>
      <PopoverContent>
        {hasParent ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-mono">
              <span className="text-[10px] uppercase tracking-wider text-[color:var(--fg-3)]">
                parent
              </span>
              <span className="text-sm font-semibold text-[color:var(--gold-300)]">
                {parent.name}
              </span>
            </div>
            <PopoverInput input={parent.input} />
          </div>
        ) : (
          <div className="text-[color:var(--fg-3)]">No linked tool_use event in this session.</div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function PopoverInput({ input }: { input: unknown }) {
  if (input === undefined || input === null) {
    return <div className="text-[color:var(--fg-3)]">No input.</div>;
  }
  let raw: string;
  try {
    raw = JSON.stringify(input, null, 2);
  } catch {
    raw = '[unserialisable]';
  }
  const truncated = raw.length > POPOVER_INPUT_MAX_BYTES;
  const shown = truncated ? raw.slice(0, POPOVER_INPUT_MAX_BYTES) : raw;
  return (
    <>
      <pre className="mono max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-[color:var(--bg-2)] p-2 text-[11px] text-[color:var(--fg-1)]">
        {shown}
      </pre>
      {truncated && <TruncatedHint />}
    </>
  );
}

export function UserMsg({
  ev,
  idx,
  registry,
  parentRegistry,
}: {
  ev: Extract<JsonlEvent, { type: 'user' }>;
  idx: number;
  registry?: ToolUseRegistry | undefined;
  parentRegistry?: ParentToolUseRegistry | undefined;
}) {
  const blocks = splitBlocks(ev.message.content);
  return (
    <Wrapper role="user" eventNumber={idx} timestamp={ev.timestamp}>
      <Blocks
        blocks={blocks}
        markdown={false}
        registry={registry}
        parentRegistry={parentRegistry}
      />
    </Wrapper>
  );
}

export function AssistantMsg({
  ev,
  idx,
  registry,
  parentRegistry,
}: {
  ev: Extract<JsonlEvent, { type: 'assistant' }>;
  idx: number;
  registry?: ToolUseRegistry | undefined;
  parentRegistry?: ParentToolUseRegistry | undefined;
}) {
  const blocks = splitBlocks(ev.message.content);
  return (
    <Wrapper role="assistant" eventNumber={idx} timestamp={ev.timestamp}>
      <Blocks blocks={blocks} markdown={true} registry={registry} parentRegistry={parentRegistry} />
    </Wrapper>
  );
}

export function ToolUseMsg({
  ev,
  idx,
}: {
  ev: Extract<JsonlEvent, { type: 'tool_use' }>;
  idx: number;
}) {
  const [open, setOpen] = useState(false);
  const name = ev.name ?? 'unknown';
  const inputStr = ev.input ? JSON.stringify(ev.input, null, 2) : '{}';
  const preview = inputStr.replace(/\s+/g, ' ').slice(0, 200);
  return (
    <Wrapper role="tool_use" eventNumber={idx} timestamp={ev.timestamp}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`tool-row ${open ? 'open' : ''}`}
        style={{ width: '100%', textAlign: 'left' }}
        aria-expanded={open}
      >
        <span className="chev">▸</span>
        <span className="name">{name}</span>
        {!open && <span className="args">{preview}</span>}
      </button>
      {open && (
        <div className="tool-body">
          <CodeBlock code={inputStr} lang="json" />
        </div>
      )}
    </Wrapper>
  );
}

export function ToolResultMsg({
  ev,
  idx,
}: {
  ev: Extract<JsonlEvent, { type: 'tool_result' }>;
  idx: number;
}) {
  const [open, setOpen] = useState(false);
  const r = ev.toolUseResult;
  const exit = r?.exitCode;
  const stdout = r?.stdout ?? '';
  const stderr = r?.stderr ?? '';
  const hasOutput = stdout || stderr;
  const isError = typeof exit === 'number' && exit !== 0;
  return (
    <Wrapper role="tool_result" error={isError} eventNumber={idx} timestamp={ev.timestamp}>
      <div
        className={`tool-row ${open && hasOutput ? 'open' : ''}`}
        style={{ cursor: hasOutput ? 'pointer' : 'default' }}
        role="button"
        tabIndex={hasOutput ? 0 : -1}
        aria-expanded={open}
        onClick={() => hasOutput && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!hasOutput) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        <span className="chev">◂</span>
        <span className="name">exit {typeof exit === 'number' ? exit : '—'}</span>
        {r?.interrupted && (
          <span className="badge red" style={{ marginLeft: 6 }}>
            interrupted
          </span>
        )}
      </div>
      {open && hasOutput && (
        <div className="tool-body">
          {stdout && (
            <>
              <div
                className="kvline"
                style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10 }}
              >
                <span className="k">stdout</span>
                <span />
              </div>
              <CodeBlock code={truncate(stdout).text} lang="text" />
            </>
          )}
          {stderr && (
            <>
              <div
                className="kvline"
                style={{
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontSize: 10,
                  color: 'var(--red)',
                }}
              >
                <span className="k">stderr</span>
                <span />
              </div>
              <CodeBlock code={truncate(stderr).text} lang="text" />
            </>
          )}
        </div>
      )}
    </Wrapper>
  );
}

export function SystemMsg({
  ev,
  idx,
}: {
  ev: Extract<JsonlEvent, { type: 'system' }>;
  idx: number;
}) {
  return (
    <Wrapper role="system" eventNumber={idx} timestamp={ev.timestamp}>
      <p className="mono" style={{ margin: 0, fontSize: 11, color: 'var(--fg-2)' }}>
        {ev.slug ?? ev.subtype ?? 'event'}
        {typeof ev.hookCount === 'number' && (
          <span style={{ marginLeft: 8, color: 'var(--fg-4)' }}>hooks: {ev.hookCount}</span>
        )}
      </p>
    </Wrapper>
  );
}

export function AttachmentMsg({
  ev,
  idx,
}: {
  ev: Extract<JsonlEvent, { type: 'attachment' }>;
  idx: number;
}) {
  return (
    <Wrapper role="attachment" eventNumber={idx} timestamp={ev.timestamp}>
      <p className="mono" style={{ margin: 0, fontSize: 11, color: 'var(--fg-1)' }}>
        {ev.hookName ?? ev.command ?? 'hook'}
        <span style={{ marginLeft: 8, color: 'var(--fg-3)' }}>
          exit {ev.exitCode ?? '—'} · {ev.durationMs ?? '—'} ms
        </span>
      </p>
    </Wrapper>
  );
}

export function PermissionMsg({
  ev,
  idx,
}: {
  ev: Extract<JsonlEvent, { type: 'permission-mode' }>;
  idx: number;
}) {
  return (
    <Wrapper role="permission" eventNumber={idx} timestamp={ev.timestamp}>
      <p className="mono" style={{ margin: 0, fontSize: 11, color: 'var(--fg-1)' }}>
        mode: <span style={{ color: 'var(--gold-300)' }}>{ev.mode ?? '—'}</span>
      </p>
    </Wrapper>
  );
}

export function QueueMsg({
  ev,
  idx,
}: {
  ev: Extract<JsonlEvent, { type: 'queue-operation' }>;
  idx: number;
}) {
  return (
    <Wrapper role="system" eventNumber={idx} timestamp={ev.timestamp}>
      <p className="mono" style={{ margin: 0, fontSize: 11, color: 'var(--fg-3)' }}>
        op: <span style={{ color: 'var(--fg-1)' }}>{ev.operation ?? '—'}</span>
      </p>
    </Wrapper>
  );
}

export function FileHistoryMsg({
  ev,
  idx,
}: {
  ev: Extract<JsonlEvent, { type: 'file-history-snapshot' }>;
  idx: number;
}) {
  return (
    <Wrapper role="system" eventNumber={idx} timestamp={ev.timestamp}>
      <p className="mono" style={{ margin: 0, fontSize: 11, color: 'var(--fg-3)' }}>
        file history snapshot
      </p>
    </Wrapper>
  );
}

export function renderEvent(
  ev: JsonlEvent,
  key: number,
  registry?: ToolUseRegistry,
  parentRegistry?: ParentToolUseRegistry,
) {
  switch (ev.type) {
    case 'user':
      return (
        <UserMsg key={key} ev={ev} idx={key} registry={registry} parentRegistry={parentRegistry} />
      );
    case 'assistant':
      return (
        <AssistantMsg
          key={key}
          ev={ev}
          idx={key}
          registry={registry}
          parentRegistry={parentRegistry}
        />
      );
    case 'tool_use':
      return <ToolUseMsg key={key} ev={ev} idx={key} />;
    case 'tool_result':
      return <ToolResultMsg key={key} ev={ev} idx={key} />;
    case 'system':
      return <SystemMsg key={key} ev={ev} idx={key} />;
    case 'attachment':
      return <AttachmentMsg key={key} ev={ev} idx={key} />;
    case 'permission-mode':
      return <PermissionMsg key={key} ev={ev} idx={key} />;
    case 'queue-operation':
      return <QueueMsg key={key} ev={ev} idx={key} />;
    case 'file-history-snapshot':
      return <FileHistoryMsg key={key} ev={ev} idx={key} />;
  }
}

function TruncatedHint() {
  return (
    <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--gold-400)' }}>
      Content truncated at 10 MB (render limit).
    </p>
  );
}
