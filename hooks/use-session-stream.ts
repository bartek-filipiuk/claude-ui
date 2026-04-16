'use client';

import { useEffect, useRef, useState } from 'react';
import type { JsonlEvent } from '@/lib/jsonl/types';
import { JsonlEvent as JsonlEventSchema } from '@/lib/jsonl/types';

export interface SessionStreamState {
  events: JsonlEvent[];
  loading: boolean;
  error: string | null;
  done: boolean;
  bytes: number;
}

const INITIAL: SessionStreamState = {
  events: [],
  loading: false,
  error: null,
  done: false,
  bytes: 0,
};

/**
 * Progressive JSONL parser that feeds events to state as they arrive.
 * Malformed lines are silently skipped (matches server behaviour).
 */
export function useSessionStream(
  slug: string | null,
  sessionId: string | null,
): SessionStreamState {
  const [state, setState] = useState<SessionStreamState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!slug || !sessionId) {
      setState(INITIAL);
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setState({ ...INITIAL, loading: true });

    (async () => {
      try {
        const res = await fetch(
          `/api/sessions/${encodeURIComponent(sessionId)}?slug=${encodeURIComponent(slug)}`,
          { credentials: 'include', signal: controller.signal },
        );
        if (!res.ok) throw new Error(`status ${res.status}`);
        if (!res.body) throw new Error('no body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let bytes = 0;
        const accum: JsonlEvent[] = [];
        let lastFlush = 0;

        const flush = () => {
          lastFlush = Date.now();
          setState((s) => ({ ...s, events: [...accum], bytes }));
        };

        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            bytes += value.byteLength;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const raw of lines) {
              const line = raw.trim();
              if (!line) continue;
              try {
                const parsed = JSON.parse(line);
                const out = JsonlEventSchema.safeParse(parsed);
                if (out.success) accum.push(out.data);
              } catch {
                // skip
              }
            }
            if (Date.now() - lastFlush > 60) flush();
          }
        }
        // Tail line (if file ends without trailing newline).
        const tail = buffer.trim();
        if (tail) {
          try {
            const parsed = JSON.parse(tail);
            const out = JsonlEventSchema.safeParse(parsed);
            if (out.success) accum.push(out.data);
          } catch {
            // skip
          }
        }
        if (!controller.signal.aborted) {
          setState({
            events: accum,
            loading: false,
            error: null,
            done: true,
            bytes,
          });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({
          events: [],
          loading: false,
          error: (err as Error).message,
          done: false,
          bytes: 0,
        });
      }
    })();

    return () => controller.abort();
  }, [slug, sessionId]);

  return state;
}
