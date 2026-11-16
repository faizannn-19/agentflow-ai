import { Menu, Plus, Square } from 'lucide-react';
import { useAgentFlow } from '../context/AgentFlowContext';
import type { PageId } from '../types/agentflow';

const PAGE_TITLES: Record<PageId, string> = {
  dashboard: 'Dashboard',
  'new-task': 'New Task',
  workspace: 'Agent Workspace',
  visualizer: 'Workflow Visualizer',
  reports: 'Reports',
  history: 'Task History',
  settings: 'Settings',
};

interface TopBarProps {
  onOpenMobileMenu: () => void;
}

export function TopBar({ onOpenMobileMenu }: TopBarProps) {
  const {
    currentPage,
    setCurrentPage,
    activeTask,
    settings,
    cancelPipeline,
  } = useAgentFlow();

  return (
    <header className="h-16 px-4 sm:px-6 border-b border-white/8 bg-[#0B0F17]/95 backdrop-blur-xs flex items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 text-slate-400 hover:text-white rounded-lg border border-white/10"
          aria-label="Open navigation menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="text-slate-500 hidden sm:inline whitespace-nowrap">
            {settings.workspaceName}
          </span>
          <span className="text-slate-600 hidden sm:inline" aria-hidden="true">
            /
          </span>
          <h1 className="text-sm font-semibold text-white whitespace-nowrap truncate">
            {PAGE_TITLES[currentPage]}
          </h1>
          {activeTask &&
            (currentPage === 'workspace' || currentPage === 'visualizer') && (
              <>
                <span className="text-slate-600 hidden md:inline" aria-hidden="true">
                  /
                </span>
                <span className="text-xs text-slate-400 truncate max-w-[260px] hidden md:inline">
                  {activeTask.title}
                </span>
              </>
            )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {activeTask?.status === 'running' && (
          <button
            type="button"
            onClick={() => cancelPipeline(activeTask.id)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Square className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Stop Run</span>
          </button>
        )}
        {currentPage !== 'new-task' && (
          <button
            type="button"
            onClick={() => setCurrentPage('new-task')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>New Task</span>
          </button>
        )}
      </div>
    </header>
  );
}
