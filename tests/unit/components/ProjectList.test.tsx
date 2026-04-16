import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import { afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';
import { ProjectList } from '@/app/(ui)/sidebar/ProjectList';
import { useUiStore } from '@/stores/ui-slice';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

const sampleProjects = [
  {
    slug: '-home-bartek-alpha',
    displayPath: '/home/bartek/alpha',
    resolvedCwd: '/home/bartek/alpha',
    sessionCount: 3,
    lastActivity: new Date().toISOString(),
    totalBytes: 1024,
  },
  {
    slug: '-home-bartek-beta',
    displayPath: '/home/bartek/beta',
    resolvedCwd: '/home/bartek/beta',
    sessionCount: 1,
    lastActivity: new Date().toISOString(),
    totalBytes: 2048,
  },
  {
    slug: '-tmp-xss',
    displayPath: '<script>alert(1)</script>',
    resolvedCwd: null,
    sessionCount: 1,
    lastActivity: null,
    totalBytes: 0,
  },
];

beforeEach(() => {
  useUiStore.setState({ selectedProjectSlug: null, selectedSessionId: null, search: '' });
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () =>
      Response.json(
        { projects: sampleProjects },
        { headers: { 'cache-control': 'no-store' } },
      ) as Response,
  );
});

afterEach(() => {
  cleanup();
});

describe('<ProjectList />', () => {
  it('renderuje 3 projekty', async () => {
    render(<ProjectList />, { wrapper });
    expect(await screen.findByText('/home/bartek/alpha')).toBeDefined();
    expect(screen.getByText('/home/bartek/beta')).toBeDefined();
  });

  it('renderuje nazwę z <script> jako tekst (XSS safe)', async () => {
    render(<ProjectList />, { wrapper });
    const xssText = await screen.findByText('<script>alert(1)</script>');
    expect(xssText).toBeDefined();
    // Nie powinno być <script> w DOM-ie z wynikiem parsowania.
    expect(document.querySelector('script[data-xss]')).toBeNull();
  });

  it('filtruje po substring', async () => {
    render(<ProjectList />, { wrapper });
    await screen.findByText('/home/bartek/alpha');
    act(() => {
      useUiStore.setState({ search: 'beta' });
    });
    await waitFor(() => {
      expect(screen.queryByText('/home/bartek/alpha')).toBeNull();
    });
    expect(screen.getByText('/home/bartek/beta')).toBeDefined();
  });
});
