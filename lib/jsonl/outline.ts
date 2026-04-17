import type { JsonlEvent } from './types';

export const EVENT_CATEGORIES = ['user', 'assistant', 'tools', 'system'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

function contentHasTool(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  for (const c of content) {
    if (c && typeof c === 'object' && 'type' in c) {
      const t = (c as { type: unknown }).type;
      if (t === 'tool_use' || t === 'tool_result') return true;
    }
  }
  return false;
}

export function categorizeEvent(ev: JsonlEvent): EventCategory {
  if (ev.type === 'tool_use') return 'tools';
  if (ev.type === 'tool_result') return 'tools';
  if (ev.type === 'user') {
    return contentHasTool(ev.message.content) ? 'tools' : 'user';
  }
  if (ev.type === 'assistant') {
    return contentHasTool(ev.message.content) ? 'tools' : 'assistant';
  }
  return 'system';
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const c of content) {
    if (!c || typeof c !== 'object') continue;
    const item = c as Record<string, unknown>;
    const t = item['type'];
    if (t === 'text' && typeof item['text'] === 'string') {
      parts.push(item['text'] as string);
    } else if (t === 'thinking' && typeof item['thinking'] === 'string') {
      parts.push(item['thinking'] as string);
    } else if (t === 'tool_use') {
      if (typeof item['name'] === 'string') parts.push(item['name'] as string);
      if (item['input'] !== undefined) {
        try {
          parts.push(JSON.stringify(item['input']));
        } catch {
          // ignore
        }
      }
    } else if (t === 'tool_result') {
      const raw = item['content'];
      if (typeof raw === 'string') parts.push(raw);
      else if (Array.isArray(raw)) {
        for (const r of raw) {
          if (r && typeof r === 'object' && 'text' in r) {
            parts.push(String((r as { text: unknown }).text ?? ''));
          }
        }
      }
    }
  }
  return parts.join(' ');
}

/**
 * Approximate byte size of an event's renderable content. Used by the outline
 * to scale marker heights proportionally to how much the event will occupy.
 */
export function eventBytes(ev: JsonlEvent): number {
  if (ev.type === 'user' || ev.type === 'assistant') {
    return textFromContent(ev.message.content).length;
  }
  if (ev.type === 'tool_use') {
    let n = typeof ev.name === 'string' ? ev.name.length : 0;
    if (ev.input !== undefined) {
      try {
        n += JSON.stringify(ev.input).length;
      } catch {
        // ignore
      }
    }
    return n;
  }
  if (ev.type === 'tool_result') {
    const r = ev.toolUseResult;
    let n = 0;
    if (r) {
      if (typeof r.stdout === 'string') n += r.stdout.length;
      if (typeof r.stderr === 'string') n += r.stderr.length;
    }
    if (ev.message !== undefined) {
      try {
        n += JSON.stringify(ev.message).length;
      } catch {
        // ignore
      }
    }
    return n;
  }
  return 0;
}

const CONTROL_CHARS = /[\u0000-\u001F\u007F]+/g;

/**
 * First `maxLen` characters of the event's textual content, collapsed to a
 * single line for tooltip display.
 */
export function eventPreview(ev: JsonlEvent, maxLen = 60): string {
  let raw = '';
  if (ev.type === 'user' || ev.type === 'assistant') {
    raw = textFromContent(ev.message.content);
  } else if (ev.type === 'tool_use') {
    raw = `${ev.name ?? 'tool'} ${ev.input !== undefined ? safeJson(ev.input) : ''}`;
  } else if (ev.type === 'tool_result') {
    const r = ev.toolUseResult;
    raw = [r?.stdout, r?.stderr].filter(Boolean).join(' ');
    if (!raw && ev.message !== undefined) raw = safeJson(ev.message);
  } else if (ev.type === 'system') {
    raw = ev.slug ?? ev.subtype ?? 'system';
  } else if (ev.type === 'attachment') {
    raw = ev.hookName ?? ev.command ?? 'attachment';
  } else if (ev.type === 'permission-mode') {
    raw = `permission: ${ev.mode ?? ''}`;
  } else if (ev.type === 'queue-operation') {
    raw = `queue: ${ev.operation ?? ''}`;
  } else if (ev.type === 'file-history-snapshot') {
    raw = 'file history snapshot';
  }
  const collapsed = raw.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLen) return collapsed;
  return collapsed.slice(0, maxLen);
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
}

/**
 * Compute marker pixel height from byte size using log scale. The tallest
 * events stop growing past `max` px; empties floor at `min` px so they remain
 * clickable. `min_height` of 2 px matches the T07 spec.
 */
export function markerHeightPx(bytes: number, opts?: { min?: number; max?: number }): number {
  const min = opts?.min ?? 2;
  const max = opts?.max ?? 24;
  if (bytes <= 0) return min;
  // log10(1) = 0, log10(10) = 1, log10(10_000) = 4.
  const scaled = Math.log10(bytes + 1) * 4;
  const h = Math.round(min + scaled);
  if (h < min) return min;
  if (h > max) return max;
  return h;
}

export const CATEGORY_MARKER_CLASS: Record<EventCategory, string> = {
  user: 'bg-blue-500',
  assistant: 'bg-emerald-500',
  tools: 'bg-amber-500',
  system: 'bg-neutral-500',
};
