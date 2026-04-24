import { Search } from './Search';
import { ProjectList } from './ProjectList';
import { Brand } from './Brand';
import { SidebarToolbar } from './SidebarToolbar';
import { SettingsDialog } from '@/components/SettingsDialog';
import { CronWidget } from '@/components/dashboard/CronWidget';

export function Sidebar() {
  return (
    <aside className="pane" style={{ background: 'var(--bg-0)' }}>
      <Brand />
      <div className="sidebar-toolbar">
        <Search />
        <SettingsDialog />
      </div>
      <SidebarToolbar />
      <ProjectList />
      <CronWidget />
    </aside>
  );
}
