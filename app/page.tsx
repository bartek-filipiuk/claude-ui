import { Search } from './(ui)/sidebar/Search';
import { ProjectList } from './(ui)/sidebar/ProjectList';
import { SessionList } from './(ui)/session-explorer/SessionList';

export default function Page() {
  return (
    <div className="grid h-screen grid-cols-[280px_minmax(0,1fr)] bg-neutral-950 text-neutral-100">
      <aside className="flex min-h-0 flex-col border-r border-neutral-800 bg-neutral-950">
        <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <h1 className="text-sm font-semibold tracking-tight">claude-ui</h1>
          <span className="text-[10px] uppercase tracking-wider text-neutral-500">local</span>
        </header>
        <Search />
        <div className="mt-2 min-h-0 flex-1">
          <ProjectList />
        </div>
      </aside>
      <main className="flex min-h-0 flex-col">
        <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <h2 className="text-sm font-medium">Sesje</h2>
          <span className="text-[10px] text-neutral-500">Wybierz projekt aby przeglądać</span>
        </header>
        <div className="min-h-0 flex-1">
          <SessionList />
        </div>
      </main>
    </div>
  );
}
