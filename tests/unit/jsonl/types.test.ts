import { describe, it, expect } from 'vitest';
import { JsonlEvent, KNOWN_EVENT_TYPES } from '@/lib/jsonl/types';

describe('JsonlEvent schema', () => {
  it('accepts a user event', () => {
    const ok = JsonlEvent.safeParse({
      type: 'user',
      sessionId: 'abc',
      message: { role: 'user', content: 'hello' },
    });
    expect(ok.success).toBe(true);
  });

  it('accepts an assistant event with content array', () => {
    const ok = JsonlEvent.safeParse({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
    });
    expect(ok.success).toBe(true);
  });

  it('accepts all 9 known event types', () => {
    for (const t of KNOWN_EVENT_TYPES) {
      const base: Record<string, unknown> = { type: t };
      if (t === 'user') base['message'] = { role: 'user', content: 'x' };
      if (t === 'assistant') base['message'] = { role: 'assistant', content: [] };
      const ok = JsonlEvent.safeParse(base);
      expect(ok.success, `type ${t}`).toBe(true);
    }
  });

  it('rejects events without a type field', () => {
    const ok = JsonlEvent.safeParse({ message: { role: 'user', content: 'x' } });
    expect(ok.success).toBe(false);
  });

  it('rejects an unknown type', () => {
    const ok = JsonlEvent.safeParse({ type: 'voodoo' });
    expect(ok.success).toBe(false);
  });

  it('accepts tool_result with stdout/stderr/exitCode', () => {
    const ok = JsonlEvent.safeParse({
      type: 'tool_result',
      toolUseResult: { stdout: 'x', stderr: '', exitCode: 0 },
    });
    expect(ok.success).toBe(true);
  });
});
