import { describe, it, expect } from 'vitest';
import { buildToolUseRegistry, extractDiffFromInput } from '@/lib/jsonl/tool-pairs';
import type { JsonlEvent } from '@/lib/jsonl/types';

describe('extractDiffFromInput', () => {
  it('zwraca stary/nowy string dla Edit', () => {
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

  it('Write: oldText puste, newText to content', () => {
    const d = extractDiffFromInput('Write', {
      file_path: '/tmp/b.md',
      content: 'hello',
    });
    expect(d?.name).toBe('Write');
    expect(d?.oldText).toBe('');
    expect(d?.newText).toBe('hello');
  });

  it('NotebookEdit używa old_source/new_source', () => {
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

  it('zwraca null dla nieobsługiwanego narzędzia', () => {
    expect(extractDiffFromInput('Bash', { command: 'ls' })).toBeNull();
    expect(extractDiffFromInput('Read', { file_path: '/x' })).toBeNull();
  });

  it('zwraca null gdy Edit nie ma ani starego ani nowego', () => {
    expect(extractDiffFromInput('Edit', { file_path: '/x' })).toBeNull();
  });

  it('zwraca null dla niepoprawnego input', () => {
    expect(extractDiffFromInput('Edit', null)).toBeNull();
    expect(extractDiffFromInput('Edit', 'nope')).toBeNull();
  });
});

describe('buildToolUseRegistry', () => {
  it('zbiera tool_use Edit po id z assistant.message.content', () => {
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

  it('pomija tool_use dla narzędzi bez diff (np. Bash)', () => {
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

  it('obsługuje mieszane bloki i wiele zdarzeń', () => {
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

  it('ignoruje tool_use bez id', () => {
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
