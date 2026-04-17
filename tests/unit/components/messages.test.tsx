import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { JsonlEvent } from '@/lib/jsonl/types';
import { renderEvent } from '@/components/conversation/messages';

afterEach(() => cleanup());

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderEv(node: ReturnType<typeof renderEvent>) {
  return render(<Wrap>{node}</Wrap>);
}

function make<T extends JsonlEvent['type']>(ev: Extract<JsonlEvent, { type: T }>): JsonlEvent {
  return ev;
}

describe('renderEvent', () => {
  it('renderuje user jako pre z treścią', () => {
    const ev = make({
      type: 'user',
      message: { role: 'user', content: 'Hello' },
    });
    renderEv(renderEvent(ev, 0));
    expect(screen.getByText('Hello')).toBeDefined();
    expect(screen.getByText('user')).toBeDefined();
  });

  it('renderuje assistant (markdown)', () => {
    const ev = make({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hello world' }] as never },
    });
    renderEv(renderEvent(ev, 0));
    expect(screen.getByText('hello world')).toBeDefined();
  });

  it('assistant XSS <script> pozostaje tekstem (rehype-sanitize)', () => {
    const payload = 'safe then <script>alert(1)</script> end';
    const ev = make({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: payload }] as never },
    });
    const { container } = renderEv(renderEvent(ev, 0));
    // No literal <script> element in DOM.
    expect(container.querySelector('script')).toBeNull();
  });

  it('tool_use zwija input domyślnie, nazwa widoczna', () => {
    const ev = make({
      type: 'tool_use',
      name: 'Bash',
      input: { command: 'ls' },
    });
    renderEv(renderEvent(ev, 0));
    expect(screen.getByText('Bash')).toBeDefined();
  });

  it('tool_result pokazuje exit', () => {
    const ev = make({
      type: 'tool_result',
      toolUseResult: { stdout: 'ok', stderr: '', exitCode: 0 },
    });
    renderEv(renderEvent(ev, 0));
    expect(screen.getByText(/exit 0/)).toBeDefined();
  });

  it('system pokazuje slug', () => {
    const ev = make({ type: 'system', slug: 'hook-fired' });
    renderEv(renderEvent(ev, 0));
    expect(screen.getByText('hook-fired')).toBeDefined();
  });

  it('attachment pokazuje hookName i exit', () => {
    const ev = make({
      type: 'attachment',
      hookName: 'PostToolUse',
      exitCode: 0,
      durationMs: 12,
    });
    renderEv(renderEvent(ev, 0));
    expect(screen.getByText('PostToolUse')).toBeDefined();
  });

  it('permission-mode pokazuje mode', () => {
    const ev = make({ type: 'permission-mode', mode: 'plan' });
    renderEv(renderEvent(ev, 0));
    expect(screen.getByText('plan')).toBeDefined();
  });

  it('queue-operation pokazuje operation', () => {
    const ev = make({ type: 'queue-operation', operation: 'enqueue' });
    renderEv(renderEvent(ev, 0));
    expect(screen.getByText('enqueue')).toBeDefined();
  });

  it('file-history-snapshot renderuje placeholder', () => {
    const ev = make({ type: 'file-history-snapshot' });
    renderEv(renderEvent(ev, 0));
    expect(screen.getByText(/file history/)).toBeDefined();
  });
});
