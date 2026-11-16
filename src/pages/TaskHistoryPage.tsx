import { useState } from 'react';
import {
  Cpu,
  Download,
  FileText,
  GitBranch,
  Trash2,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TaskStatusIndicator } from '../components/StatusLabel';
import { useAgentFlow } from '../context/AgentFlowContext';
import type { TaskStatus } from '../types/agentflow';
import {
  OUTPUT_FORMAT_LABELS,
  computeTaskProgress,
  exportReportAsJson,
  formatDuration,
  formatTimestamp,
  getTaskTotalDurationMs,
  getTaskTotalTokens,
} from '../utils/taskHelpers';

export function TaskHistoryPage() {
  const {
    tasks,
    setActiveTaskId,
    setCurrentPage,
    deleteTask,
    clearAllHistory,
  } = useAgentFlow();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);

  const filteredTasks = tasks.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.prompt.toLowerCase().includes(q) ||
        t.model.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const openPage = (
    taskId: string,
    page: 'workspace' | 'visualizer' | 'reports'
  ) => {
    setActiveTaskId(taskId);
    setCurrentPage(page);
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="rounded-xl bg-[#111827] border border-white/8 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search task history by title, prompt, or model..."
            aria-label="Search task history"
            className="w-full sm:max-w-xs rounded-lg bg-[#0B0F17] border border-white/10 px-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
          />

          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0B0F17] border border-white/8 overflow-x-auto">
            {(
              [
                ['all', 'All'],
                ['running', 'Running'],
                ['awaiting_approval', 'Pending'],
                ['approved', 'Published'],
                ['failed', 'Failed'],
                ['rejected', 'Rejected'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setStatusFilter(val)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === val
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {tasks.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmClearOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {/* History Table */}
      <section className="rounded-xl bg-[#111827] border border-white/8 overflow-hidden">
        {filteredTasks.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-medium text-white">
              {tasks.length === 0
                ? 'No tasks in history yet'
                : 'No tasks match your filters'}
            </p>
            <p className="text-xs text-slate-400">
              {tasks.length === 0
                ? 'Tasks and multi-agent logs are saved automatically in browser local storage.'
                : 'Try clearing the search query or selecting All status.'}
            </p>
            {tasks.length === 0 && (
              <button
                type="button"
                onClick={() => setCurrentPage('new-task')}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
              >
                Create First Task
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/8 text-xs font-medium text-slate-400">
                  <th className="py-3 px-5">Task</th>
                  <th className="py-3 px-4">Format</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Progress</th>
                  <th className="py-3 px-4 text-right">Revisions</th>
                  <th className="py-3 px-4 text-right">Tokens</th>
                  <th className="py-3 px-4 text-right">Duration</th>
                  <th className="py-3 px-4">Updated</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6 text-xs">
                {filteredTasks.map((task) => {
                  const pct = computeTaskProgress(task);
                  return (
                    <tr
                      key={task.id}
                      className="hover:bg-white/[0.02] transition-colors h-11"
                    >
                      <td className="py-2.5 px-5 max-w-[240px]">
                        <button
                          type="button"
                          onClick={() => openPage(task.id, 'workspace')}
                          className="text-left font-medium text-slate-100 hover:text-blue-400 truncate block w-full"
                        >
                          {task.title}
                        </button>
                      </td>
                      <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap">
                        {OUTPUT_FORMAT_LABELS[task.outputFormat]}
                      </td>
                      <td className="py-2.5 px-4">
                        <TaskStatusIndicator status={task.status} />
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-300">
                        {pct}%
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-300">
                        {task.revisionCount}/{task.maxRevisions}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-400">
                        {getTaskTotalTokens(task).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-400">
                        {formatDuration(getTaskTotalDurationMs(task))}
                      </td>
                      <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap">
                        {formatTimestamp(task.updatedAt)}
                      </td>
                      <td className="py-2.5 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openPage(task.id, 'workspace')}
                            title="Open Agent Workspace"
                            aria-label={`Open ${task.title} in Agent Workspace`}
                            className="p-1.5 text-slate-400 hover:text-blue-400 rounded"
                          >
                            <Cpu className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openPage(task.id, 'visualizer')}
                            title="Open Workflow Visualizer"
                            aria-label={`Open ${task.title} in Workflow Visualizer`}
                            className="p-1.5 text-slate-400 hover:text-white rounded"
                          >
                            <GitBranch className="w-3.5 h-3.5" />
                          </button>
                          {task.finalReport && (
                            <>
                              <button
                                type="button"
                                onClick={() => openPage(task.id, 'reports')}
                                title="View Report"
                                aria-label={`View report for ${task.title}`}
                                className="p-1.5 text-slate-400 hover:text-emerald-400 rounded"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => exportReportAsJson(task)}
                                title="Export Report JSON"
                                aria-label={`Export JSON for ${task.title}`}
                                className="p-1.5 text-slate-400 hover:text-white rounded"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => setTaskToDelete(task.id)}
                            title="Delete Task"
                            aria-label={`Delete ${task.title}`}
                            className="p-1.5 text-slate-500 hover:text-rose-400 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmClearOpen}
        title="Clear all task history?"
        description="This removes all saved tasks, agent outputs, execution logs, and reports from your browser local storage. This action cannot be undone."
        confirmLabel="Clear All History"
        destructive
        onConfirm={() => {
          clearAllHistory();
          setConfirmClearOpen(false);
        }}
        onCancel={() => setConfirmClearOpen(false)}
      />

      <ConfirmDialog
        open={taskToDelete !== null}
        title="Delete this task?"
        description="This will permanently remove the selected workflow run and its generated report from browser local storage."
        confirmLabel="Delete Task"
        destructive
        onConfirm={() => {
          if (taskToDelete) deleteTask(taskToDelete);
          setTaskToDelete(null);
        }}
        onCancel={() => setTaskToDelete(null)}
      />
    </div>
  );
}
