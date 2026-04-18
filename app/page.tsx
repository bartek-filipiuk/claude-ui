import { Sidebar } from './(ui)/sidebar/Sidebar';
import { SessionExplorer } from './(ui)/session-explorer/SessionExplorer';
import { MainPanel } from './(ui)/conversation/MainPanel';
import { ResizableColumns } from '@/components/layout/ResizableColumns';

export default function Page() {
  return (
    <ResizableColumns
      sidebar={<Sidebar />}
      sessions={<SessionExplorer />}
      viewer={
        <main className="pane min-h-0">
          <MainPanel />
        </main>
      }
    />
  );
}
