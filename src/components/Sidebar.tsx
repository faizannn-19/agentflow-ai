import {
  Cpu,
  FileText,
  GitBranch,
  History,
  LayoutDashboard,
  PlusSquare,
  Settings,
  X,
} from 'lucide-react';
import { useAgentFlow } from '../context/AgentFlowContext';
import type { PageId } from '../types/agentflow';

const NAV_ITEMS: Array<{
  id: PageId;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'new-task', label: 'New Task', icon: PlusSquare },
  { id: 'workspace', label: 'Agent Workspace', icon: Cpu },
  { id: 'visualizer', label: 'Workflow Visualizer', icon: GitBranch },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'history', label: 'Task History', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const { currentPage, setCurrentPage, tasks, settings } = useAgentFlow();

  const awaitingCount = tasks.filter((t) => t.status === 'awaiting_approval').length;
  const runningCount = tasks.filter((t) => t.status === 'running').length;

  const handleNav = (id: PageId) => {
    setCurrentPage(id);
    onCloseMobile();
  };

  const navContent = (
    <div className="flex flex-col h-full bg-[#0E131D] border-r border-white/8 w-[248px] select-none">
      <div className="h-16 px-5 flex items-center justify-between border-b border-white/8 shrink-0">
        <button
          type="button"
          onClick={() => handleNav('dashboard')}
          className="text-base font-semibold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-500 rounded"
        >
          AgentFlow AI
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-md"
          aria-label="Close navigation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = currentPage === item.id;
          let countHint: string | null = null;
          if (item.id === 'reports' && awaitingCount > 0) {
            countHint = String(awaitingCount);
          } else if (item.id === 'workspace' && runningCount > 0) {
            countHint = String(runningCount);
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNav(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-500 ${
                active
                  ? 'bg-blue-600/15 text-white border border-blue-500/25'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? 'text-blue-400' : 'text-slate-500'
                  }`}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </span>
              {countHint && (
                <span className="text-xs font-mono tabular-nums text-amber-400 ml-2">
                  {countHint}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/8 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center text-xs font-semibold text-slate-200 shrink-0">
            {settings.operatorName
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase() || '')
              .join('') || 'OP'}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-200 truncate">
              {settings.operatorName}
            </p>
            <p className="text-xs text-slate-500 truncate">
              {settings.workspaceName}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{navContent}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-50 h-full">{navContent}</aside>
        </div>
      )}
    </>
  );
}
