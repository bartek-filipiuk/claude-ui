import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { HelpOverlay } from '@/components/HelpOverlay';

afterEach(() => cleanup());

function dispatchQuestionKey(target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', {
    key: '?',
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, 'target', { value: target });
  window.dispatchEvent(event);
  return event;
}

describe('<HelpOverlay />', () => {
  it('registers and removes a keydown listener on window', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<HelpOverlay />);
    const registered = addSpy.mock.calls.find(([ev]) => ev === 'keydown');
    expect(registered).toBeDefined();
    unmount();
    const removed = removeSpy.mock.calls.find(([ev]) => ev === 'keydown');
    expect(removed).toBeDefined();
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('opens on "?" pressed outside inputs and closes on second press', () => {
    render(<HelpOverlay />);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => {
      dispatchQuestionKey();
    });
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getAllByText('Keyboard shortcuts').length).toBeGreaterThan(0);
    act(() => {
      dispatchQuestionKey();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ignores "?" when focus is inside an input', () => {
    render(<HelpOverlay />);
    const input = document.createElement('input');
    document.body.appendChild(input);
    act(() => {
      dispatchQuestionKey(input);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    input.remove();
  });

  it('renders the command-palette shortcut row', () => {
    render(<HelpOverlay />);
    act(() => {
      dispatchQuestionKey();
    });
    expect(screen.getByText('Open command palette')).toBeDefined();
  });
});
