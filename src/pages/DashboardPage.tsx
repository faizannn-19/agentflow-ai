import {
  AlertCircle,
  ArrowRight,
  Cpu,
  FileText,
  GitBranch,
  Play,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { AgentStatusIndicator, TaskStatusIndicator } from '../components/StatusLabel';
import { useAgentFlow } from '../context/AgentFlowContext';
import {
  AGENT_META,
  AGENT_ORDER,
  OUTPUT_FORMAT_LABELS,
  computeTaskProgress,
  formatDuration,
  formatTimestamp,
  getTaskTotalDurationMs,
} from '../utils/taskHelpers';

export function DashboardPage() {
  const {
    tasks,
    activeTask,
    serverHealth,
    setCurrentPage,
    setActiveTaskId,
    retryAgent,
  } = useAgentFlow();

  const totalTasks = tasks.length;
  const publishedCount = tasks.filter((t) => t.status === 'approved').length;
  const awaitingApprovalCount = tasks.filter(
    (t) => t.status === 'awaiting_approval'
  ).length;
  const completedDurations = tasks
    .filter((t) => t.status === 'approved' || t.status === 'awaiting_approval')
    .map((t) => getTaskTotalDurationMs(t))
    .filter((d) => d > 0);
  const avgDurationMs =
    completedDurations.length > 0
      ? Math.round(
          completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length
        )
      : undefined;

  const latestTask = activeTask ?? tasks[0] ?? null;

  const openTaskInPage = (
    taskId: string,
    page: 'workspace' | 'visualizer' | 'reports'
  ) => {
    setActiveTaskId(taskId);
    setCurrentPage(page);
  };

  const findFailedAgent = (task: typeof latestTask) => {
    if (!task) return null;
    return AGENT_ORDER.find((r) => task.agents[r].status === 'error') ?? null;
  };

  return (
    <div className="space-y-6">
      {serverHealth.checked && !serverHealth.geminiConfigured && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm text-amber-100 space-y-1">
            <p className="font-medium">Gemini API key setup required</p>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              The backend did not detect an active <code className="font-mono">GEMINI_API_KEY</code>. Open{' '}
              <strong className="font-semibold text-white">Settings &gt; Secrets</strong> in the AI Studio interface to attach your Gemini API key before running workflows.
            </p>
          </div>
        </div>
      )}

      {/* KPI Strip */}
      <section aria-label="Workspace metrics" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl bg-[#111827] border border-white/8 p-4">
          <p className="text-xs text-slate-400">Total Workflow Runs</p>
          <p className="mt-2 text-2xl font-semibold text-white tabular-nums">
            {totalTasks}
          </p>
          <p className="mt-1 text-xs text-slate-500">Saved in browser storage</p>
        </div>

        <div className="rounded-xl bg-[#111827] border border-white/8 p-4">
          <p className="text-xs text-slate-400">Awaiting Human Approval</p>
          <p className="mt-2 text-2xl font-semibold text-amber-400 tabular-nums">
            {awaitingApprovalCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">Ready for review gate</p>
        </div>

        <div className="rounded-xl bg-[#111827] border border-white/8 p-4">
          <p className="text-xs text-slate-400">Published Reports</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-400 tabular-nums">
            {publishedCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">Approved &amp; exportable</p>
        </div>

        <div className="rounded-xl bg-[#111827] border border-white/8 p-4">
          <p className="text-xs text-slate-400">Average Pipeline Time</p>
          <p className="mt-2 text-2xl font-semibold text-white tabular-nums">
            {formatDuration(avgDurationMs)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Across 5 coordinated agents</p>
        </div>
      </section>

      {/* Active / Latest Workflow Spotlight */}
      {latestTask ? (
        <section className="rounded-xl bg-[#111827] border border-white/8 p-5 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2.5 text-xs text-slate-400">
                <span>Active Pipeline</span>
                <span aria-hidden="true">·</span>
                <span>{OUTPUT_FORMAT_LABELS[latestTask.outputFormat]}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{latestTask.model}</span>
                <span aria-hidden="true">·</span>
                <TaskStatusIndicator status={latestTask.status} />
              </div>
              <h2 className="text-lg font-semibold text-white truncate">
                {latestTask.title}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {findFailedAgent(latestTask) && (
                <button
                  type="button"
                  onClick={() =>
                    void retryAgent(latestTask.id, findFailedAgent(latestTask)!)
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-lg transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Retry Failed Step</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => openTaskInPage(latestTask.id, 'visualizer')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-lg transition-colors whitespace-nowrap"
              >
                <GitBranch className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Visualizer</span>
              </button>
              <button
                type="button"
                onClick={() => openTaskInPage(latestTask.id, 'workspace')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap"
              >
                <Cpu className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Open Workspace</span>
              </button>
            </div>
          </div>

          {/* 5-Agent Horizontal Status Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {AGENT_ORDER.map((role, idx) => {
              const step = latestTask.agents[role];
              return (
                <div
                  key={role}
                  className="rounded-lg bg-[#0B0F17] border border-white/8 p-3.5 flex flex-col justify-between gap-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-200 truncate">
                      {idx + 1}. {AGENT_META[role].shortLabel}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500">
                      {formatDuration(step.durationMs)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <AgentStatusIndicator status={step.status} />
                    {step.attempt > 0 && (
                      <span className="text-[11px] font-mono tabular-nums text-slate-500">
                        Run #{step.attempt}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="rounded-xl bg-[#111827] border border-white/8 p-8 text-center space-y-4">
          <div className="mx-auto w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center">
            <Play className="w-5 h-5 text-blue-400" aria-hidden="true" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="text-base font-semibold text-white">
              Launch your first multi-agent workflow
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Submit a task brief and optional source documents. Five Gemini-powered agents will plan, research, analyze, draft, and review your report before human approval.
            </p>
          </div>
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setCurrentPage('new-task')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Create First Task</span>
            </button>
          </div>
        </section>
      )}

      {/* Recent Workflow Runs Table */}
      <section className="rounded-xl bg-[#111827] border border-white/8 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Recent Workflow Runs</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Inspect live agent outputs, review drafts, or resume failed runs.
            </p>
          </div>
          {tasks.length > 0 && (
            <button
              type="button"
              onClick={() => setCurrentPage('history')}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 whitespace-nowrap"
            >
              <span>View All History</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {tasks.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No workflow runs recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/8 text-xs font-medium text-slate-400">
                  <th className="py-3 px-5">Task</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Progress</th>
                  <th className="py-3 px-4 text-right">Revisions</th>
                  <th className="py-3 px-4 text-right">Duration</th>
                  <th className="py-3 px-4">Updated</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6 text-sm">
                {tasks.slice(0, 6).map((task) => {
                  const pct = computeTaskProgress(task);
                  return (
                    <tr
                      key={task.id}
                      className="hover:bg-white/[0.02] transition-colors h-11"
                    >
                      <td className="py-2.5 px-5 max-w-[280px]">
                        <button
                          type="button"
                          onClick={() => openTaskInPage(task.id, 'workspace')}
                          className="text-left font-medium text-slate-100 hover:text-blue-400 transition-colors truncate block w-full"
                        >
                          {task.title}
                        </button>
                      </td>
                      <td className="py-2.5 px-4">
                        <TaskStatusIndicator status={task.status} />
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-slate-300">
                        {pct}%
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-slate-300">
                        {task.revisionCount}/{task.maxRevisions}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-slate-400">
                        {formatDuration(getTaskTotalDurationMs(task))}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-400 whitespace-nowrap">
                        {formatTimestamp(task.updatedAt)}
                      </td>
                      <td className="py-2.5 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => openTaskInPage(task.id, 'workspace')}
                            className="text-xs font-medium text-blue-400 hover:text-blue-300"
                          >
                            Workspace
                          </button>
                          {task.finalReport && (
                            <button
                              type="button"
                              onClick={() => openTaskInPage(task.id, 'reports')}
                              className="inline-flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-white"
                            >
                              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Report</span>
                            </button>
                          )}
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
    </div>
  );
}
