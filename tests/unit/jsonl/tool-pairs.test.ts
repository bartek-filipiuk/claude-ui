import { describe, it, expect } from 'vitest';
import { buildToolUseRegistry, extractDiffFromInput } from '@/lib/jsonl/tool-pairs';
import type { JsonlEvent } from '@/lib/jsonl/types';

describe('extractDiffFromInput', () => {
  it('returns old/new strings for Edit', () => {
    const d = extractDiffFromInput('Edit', {
      file_path: '/tmp/a.ts',
      old_string: 'foo',
      new_string: 'bar',
    });
    expect(d).not.toBeNull();
    expect(d?.name).toBe('Edit');
    expect(d?.filePath).toBe('/tmp/a.ts');
    expect(d?.oldText).toBe('foo');
    expect(d?.newText).toBe('bar');
  });

  it('Write: oldText is empty, newText is the content', () => {
    const d = extractDiffFromInput('Write', {
      file_path: '/tmp/b.md',
      content: 'hello',
    });
    expect(d?.name).toBe('Write');
    expect(d?.oldText).toBe('');
    expect(d?.newText).toBe('hello');
  });

  it('NotebookEdit reads old_source / new_source', () => {
    const d = extractDiffFromInput('NotebookEdit', {
      notebook_path: '/n.ipynb',
      old_source: 'print(1)',
      new_source: 'print(2)',
    });
    expect(d?.name).toBe('NotebookEdit');
    expect(d?.filePath).toBe('/n.ipynb');
    expect(d?.oldText).toBe('print(1)');
    expect(d?.newText).toBe('print(2)');
  });

  it('returns null for an unsupported tool', () => {
    expect(extractDiffFromInput('Bash', { command: 'ls' })).toBeNull();
    expect(extractDiffFromInput('Read', { file_path: '/x' })).toBeNull();
  });

  it('returns null when Edit has neither old nor new string', () => {
    expect(extractDiffFromInput('Edit', { file_path: '/x' })).toBeNull();
  });

  it('returns null for invalid input', () => {
    expect(extractDiffFromInput('Edit', null)).toBeNull();
    expect(extractDiffFromInput('Edit', 'nope')).toBeNull();
  });
});

describe('buildToolUseRegistry', () => {
  it('collects Edit tool_use entries keyed by id from assistant content', () => {
    const events: JsonlEvent[] = [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'Edit',
              input: { file_path: '/a.ts', old_string: 'a', new_string: 'b' },
            },
          ],
        },
      } as unknown as JsonlEvent,
    ];
    const reg = buildToolUseRegistry(events);
    expect(reg.size).toBe(1);
    const entry = reg.get('toolu_1');
    expect(entry?.name).toBe('Edit');
    expect(entry?.oldText).toBe('a');
    expect(entry?.newText).toBe('b');
  });

  it('skips tool_use for tools without a diff (e.g. Bash)', () => {
    const events: JsonlEvent[] = [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_bash',
              name: 'Bash',
              input: { command: 'ls' },
            },
          ],
        },
      } as unknown as JsonlEvent,
    ];
    const reg = buildToolUseRegistry(events);
    expect(reg.size).toBe(0);
  });

  it('handles mixed blocks across multiple events', () => {
    const events: JsonlEvent[] = [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'hi' },
            {
              type: 'tool_use',
              id: 'toolu_write',
              name: 'Write',
              input: { file_path: '/b.txt', content: 'new file' },
            },
          ],
        },
      } as unknown as JsonlEvent,
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_edit',
              name: 'Edit',
              input: { file_path: '/c.txt', old_string: 'x', new_string: 'y' },
            },
          ],
        },
      } as unknown as JsonlEvent,
    ];
    const reg = buildToolUseRegistry(events);
    expect(reg.size).toBe(2);
    expect(reg.get('toolu_write')?.name).toBe('Write');
    expect(reg.get('toolu_edit')?.name).toBe('Edit');
  });

  it('ignores tool_use without an id', () => {
    const events: JsonlEvent[] = [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'Edit',
              input: { file_path: '/a', old_string: 'a', new_string: 'b' },
            },
          ],
        },
      } as unknown as JsonlEvent,
    ];
    expect(buildToolUseRegistry(events).size).toBe(0);
  });
});
