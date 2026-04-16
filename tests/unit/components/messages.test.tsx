import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { JsonlEvent } from '@/lib/jsonl/types';
import { renderEvent } from '@/components/conversation/messages';

afterEach(() => cleanup());

function make<T extends JsonlEvent['type']>(ev: Extract<JsonlEvent, { type: T }>): JsonlEvent {
  return ev;
}

describe('renderEvent', () => {
  it('renderuje user jako pre z treścią', () => {
    const ev = make({
      type: 'user',
      message: { role: 'user', content: 'Hello' },
    });
    render(renderEvent(ev, 0));
    expect(screen.getByText('Hello')).toBeDefined();
    expect(screen.getByText('user')).toBeDefined();
  });

  it('renderuje assistant (markdown)', () => {
    const ev = make({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hello world' }] as never },
    });
    render(renderEvent(ev, 0));
    expect(screen.getByText('hello world')).toBeDefined();
  });

  it('assistant XSS <script> pozostaje tekstem (rehype-sanitize)', () => {
    const payload = 'safe then <script>alert(1)</script> end';
    const ev = make({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: payload }] as never },
    });
    const { container } = render(renderEvent(ev, 0));
    // No literal <script> element in DOM.
    expect(container.querySelector('script')).toBeNull();
  });

  it('tool_use zwija input domyślnie, nazwa widoczna', () => {
    const ev = make({
      type: 'tool_use',
      name: 'Bash',
      input: { command: 'ls' },
    });
    render(renderEvent(ev, 0));
    expect(screen.getByText('Bash')).toBeDefined();
  });

  it('tool_result pokazuje exit', () => {
    const ev = make({
      type: 'tool_result',
      toolUseResult: { stdout: 'ok', stderr: '', exitCode: 0 },
    });
    render(renderEvent(ev, 0));
    expect(screen.getByText(/exit 0/)).toBeDefined();
  });

  it('system pokazuje slug', () => {
    const ev = make({ type: 'system', slug: 'hook-fired' });
    render(renderEvent(ev, 0));
    expect(screen.getByText('hook-fired')).toBeDefined();
  });

  it('attachment pokazuje hookName i exit', () => {
    const ev = make({
      type: 'attachment',
      hookName: 'PostToolUse',
      exitCode: 0,
      durationMs: 12,
    });
    render(renderEvent(ev, 0));
    expect(screen.getByText('PostToolUse')).toBeDefined();
  });

  it('permission-mode pokazuje mode', () => {
    const ev = make({ type: 'permission-mode', mode: 'plan' });
    render(renderEvent(ev, 0));
    expect(screen.getByText('plan')).toBeDefined();
  });

  it('queue-operation pokazuje operation', () => {
    const ev = make({ type: 'queue-operation', operation: 'enqueue' });
    render(renderEvent(ev, 0));
    expect(screen.getByText('enqueue')).toBeDefined();
  });

  it('file-history-snapshot renderuje placeholder', () => {
    const ev = make({ type: 'file-history-snapshot' });
    render(renderEvent(ev, 0));
    expect(screen.getByText(/file history/)).toBeDefined();
  });
});
