import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Search } from '@/app/(ui)/sidebar/Search';
import { useUiStore } from '@/stores/ui-slice';

beforeEach(() => {
  useUiStore.setState({ selectedProjectSlug: null, selectedSessionId: null, search: '' });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('<Search />', () => {
  it('debounce 150ms przed ustawieniem searcha', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = render(<Search />);
    const input = container.querySelector('input')!;
    await user.type(input, 'alfa');
    // Jeszcze przed debounce store jest pusty
    expect(useUiStore.getState().search).toBe('');
    // Przelatujemy 200 ms
    vi.advanceTimersByTime(200);
    expect(useUiStore.getState().search).toBe('alfa');
  });
});
