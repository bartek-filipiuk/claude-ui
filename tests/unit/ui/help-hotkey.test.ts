// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { shouldToggleHelp, isEditableTarget } from '@/lib/ui/help-hotkey';

function makeEvent(init: {
  key: string;
  target?: EventTarget | null;
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  defaultPrevented?: boolean;
}): KeyboardEvent {
  const ev = {
    key: init.key,
    altKey: init.alt ?? false,
    ctrlKey: init.ctrl ?? false,
    metaKey: init.meta ?? false,
    shiftKey: false,
    defaultPrevented: init.defaultPrevented ?? false,
    target: init.target ?? null,
  } as unknown as KeyboardEvent;
  return ev;
}

describe('isEditableTarget', () => {
  it('returns true for input elements', () => {
    const input = document.createElement('input');
    expect(isEditableTarget(input)).toBe(true);
  });

  it('returns true for textarea elements', () => {
    const ta = document.createElement('textarea');
    expect(isEditableTarget(ta)).toBe(true);
  });

  it('returns true for contentEditable elements', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    expect(isEditableTarget(div)).toBe(true);
  });

  it('returns true for role=textbox', () => {
    const div = document.createElement('div');
    div.setAttribute('role', 'textbox');
    expect(isEditableTarget(div)).toBe(true);
  });

  it('returns true for CodeMirror descendants', () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-editor', 'codemirror');
    const child = document.createElement('span');
    wrapper.appendChild(child);
    expect(isEditableTarget(child)).toBe(true);
  });

  it('returns false for plain body target', () => {
    expect(isEditableTarget(document.body)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('shouldToggleHelp', () => {
  it('returns true when "?" pressed on body', () => {
    expect(shouldToggleHelp(makeEvent({ key: '?', target: document.body }))).toBe(true);
  });

  it('returns false inside an input', () => {
    const input = document.createElement('input');
    expect(shouldToggleHelp(makeEvent({ key: '?', target: input }))).toBe(false);
  });

  it('returns false when a modifier is held', () => {
    expect(shouldToggleHelp(makeEvent({ key: '?', target: document.body, ctrl: true }))).toBe(
      false,
    );
    expect(shouldToggleHelp(makeEvent({ key: '?', target: document.body, meta: true }))).toBe(
      false,
    );
  });

  it('returns false for other keys', () => {
    expect(shouldToggleHelp(makeEvent({ key: '/', target: document.body }))).toBe(false);
  });

  it('returns false when event already defaultPrevented', () => {
    expect(
      shouldToggleHelp(makeEvent({ key: '?', target: document.body, defaultPrevented: true })),
    ).toBe(false);
  });
});
