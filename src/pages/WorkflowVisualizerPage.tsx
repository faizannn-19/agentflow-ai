import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  Terminal,
  Wrench,
  XCircle,
} from 'lucide-react';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { TaskStatusIndicator } from '../components/StatusLabel';
import { useAgentFlow } from '../context/AgentFlowContext';
import type { AgentRole, AgentStatus } from '../types/agentflow';
import {
  AGENT_META,
  AGENT_ORDER,
  computeTaskProgress,
  formatDuration,
  formatTimeOnly,
  getTaskTotalDurationMs,
  getTaskTotalTokens,
} from '../utils/taskHelpers';

function getVisualStateMeta(status: AgentStatus) {
  switch (status) {
    case 'running':
      return {
        label: 'Running',
        cardClass: 'bg-[#0F1E34] border-sky-400/70',
        barClass: 'bg-sky-400',
        textClass: 'text-sky-300',
        icon: Loader2,
        spin: true,
      };
    case 'completed':
      return {
        label: 'Completed',
        cardClass: 'bg-[#0E1A18] border-emerald-500/45',
        barClass: 'bg-emerald-500',
        textClass: 'text-emerald-400',
        icon: CheckCircle2,
        spin: false,
      };
    case 'revision_requested':
      return {
        label: 'Revision Requested',
        cardClass: 'bg-[#1D180F] border-amber-500/50',
        barClass: 'bg-amber-400',
        textClass: 'text-amber-300',
        icon: RotateCcw,
        spin: false,
      };
    case 'error':
      return {
        label: 'Failed',
        cardClass: 'bg-[#201116] border-rose-500/60',
        barClass: 'bg-rose-500',
        textClass: 'text-rose-400',
        icon: XCircle,
        spin: false,
      };
    case 'queued':
      return {
        label: 'Pending (Queued)',
        cardClass: 'bg-[#111827] border-slate-600/50',
        barClass: 'bg-slate-600',
        textClass: 'text-slate-300',
        icon: Clock,
        spin: false,
      };
    case 'idle':
    default:
      return {
        label: 'Pending',
        cardClass: 'bg-[#0E1420] border-white/10',
        barClass: 'bg-slate-700',
        textClass: 'text-slate-400',
        icon: Clock,
        spin: false,
      };
  }
}

export function WorkflowVisualizerPage() {
  const {
    tasks,
    activeTask,
    setActiveTaskId,
    setCurrentPage,
    runPipeline,
    retryAgent,
    cancelPipeline,
    approveAndPublish,
  } = useAgentFlow();

  const shouldReduceMotion = useReducedMotion();
  const [selectedNode, setSelectedNode] = useState<AgentRole>('orchestrator');
  const [panelViewMode, setPanelViewMode] = useState<'all' | 'focused'>('all');
  const [expandedInputs, setExpandedInputs] = useState<Record<AgentRole, boolean>>({
    orchestrator: false,
    research: false,
    analysis: false,
    writer: false,
    reviewer: false,
  });
  const [logFilter, setLogFilter] = useState<string>('all');
  const [nowTick, setNowTick] = useState(() => Date.now());
  const panelRefs = useRef<Partial<Record<AgentRole, HTMLElement | null>>>({});

  // Live elapsed timer tick while any agent is running
  useEffect(() => {
    if (activeTask?.status !== 'running') return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeTask?.status]);

  if (!activeTask) {
    return (
      <div className="rounded-xl bg-[#111827] border border-white/8 p-10 text-center space-y-4">
        <h2 className="text-base font-semibold text-white">No Workflow Selected</h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          Create a task to watch the five connected agent nodes, animated progress indicators, live execution logs, and individual agent output panels.
        </p>
        <button
          type="button"
          onClick={() => setCurrentPage('new-task')}
          className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
        >
          Create New Task
        </button>
      </div>
    );
  }

  const overallProgress = computeTaskProgress(activeTask);
  const failedRole = AGENT_ORDER.find((r) => activeTask.agents[r].status === 'error');
  const visiblePanels = panelViewMode === 'all' ? AGENT_ORDER : [selectedNode];

  const filteredLogs = activeTask.logs.filter((log) => {
    if (logFilter === 'all') return true;
    if (logFilter === 'error') return log.level === 'error';
    if (logFilter === 'tool') return log.level === 'tool';
    return log.agentRole === logFilter;
  });

  const handleSelectNode = (role: AgentRole) => {
    setSelectedNode(role);
    if (panelViewMode === 'all') {
      panelRefs.current[role]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const toggleInputDrawer = (role: AgentRole) => {
    setExpandedInputs((prev) => ({ ...prev, [role]: !prev[role] }));
  };

  const getLiveDuration = (role: AgentRole) => {
    const step = activeTask.agents[role];
    if (step.durationMs !== undefined) return formatDuration(step.durationMs);
    if (step.status === 'running' && step.startedAt) {
      const elapsed = Math.max(0, nowTick - new Date(step.startedAt).getTime());
      return formatDuration(elapsed);
    }
    return '—';
  };

  return (
    <div className="space-y-6">
      {/* Header & Overall Progress */}
      <section className="rounded-xl bg-[#111827] border border-white/8 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <select
              aria-label="Select workflow task"
              value={activeTask.id}
              onChange={(e) => setActiveTaskId(e.target.value)}
              className="bg-[#0B0F17] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 max-w-[260px] focus:outline-none focus:border-blue-500"
            >
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <TaskStatusIndicator status={activeTask.status} />
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {overallProgress}% complete
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-500 hidden sm:inline">
              · {formatDuration(getTaskTotalDurationMs(activeTask))} ·{' '}
              {getTaskTotalTokens(activeTask).toLocaleString()} tokens
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {activeTask.status === 'running' ? (
              <button
                type="button"
                onClick={() => cancelPipeline(activeTask.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-200 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 rounded-lg transition-colors whitespace-nowrap"
              >
                <Square className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Stop Run</span>
              </button>
            ) : (
              <>
                {failedRole && (
                  <button
                    type="button"
                    onClick={() => void retryAgent(activeTask.id, failedRole)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Retry {AGENT_META[failedRole].shortLabel}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void runPipeline(activeTask.id, 'orchestrator')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Re-run Workflow</span>
                </button>
              </>
            )}

            {activeTask.finalReport && (
              <button
                type="button"
                onClick={() => setCurrentPage('reports')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                <span>View Report</span>
              </button>
            )}
          </div>
        </div>

        {/* Overall Pipeline Progress Bar */}
        <div className="h-1.5 w-full rounded-full bg-slate-800/90 overflow-hidden">
          <motion.div
            className={`h-full origin-left ${
              activeTask.status === 'failed'
                ? 'bg-rose-500'
                : activeTask.status === 'approved'
                  ? 'bg-emerald-500'
                  : activeTask.status === 'awaiting_approval'
                    ? 'bg-amber-400'
                    : 'bg-blue-500'
            }`}
            initial={false}
            animate={{ scaleX: Math.max(0.02, overallProgress / 100) }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </section>

      {/* Connected 5-Agent Pipeline Graph */}
      <section
        aria-label="Connected five-agent workflow graph"
        className="rounded-xl bg-[#0D121C] border border-white/8 p-4 sm:p-6 space-y-5"
      >
        {/* State Legend (unboxed, clean semantic markers) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/8 text-xs">
          <p className="font-medium text-slate-200">
            Five-Agent Sequential Workflow Graph
          </p>
          <div className="flex flex-wrap items-center gap-4 text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <span>Pending</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
              <span className="text-sky-300">Running</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
              <span className="text-emerald-300">Completed</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
              <span className="text-rose-300">Failed</span>
            </span>
          </div>
        </div>

        {/* Responsive Connected Nodes: Vertical on mobile/tablet, Horizontal 5-node + Gate on lg+ */}
        <div className="flex flex-col lg:flex-row lg:items-stretch gap-2 lg:gap-0">
          {AGENT_ORDER.map((role, idx) => {
            const step = activeTask.agents[role];
            const meta = getVisualStateMeta(step.status);
            const StatusIcon = meta.icon;
            const isSelected = selectedNode === role;
            const nextRole = AGENT_ORDER[idx + 1];
            const nextStatus = nextRole ? activeTask.agents[nextRole].status : null;
            const connectorActive =
              step.status === 'completed' && nextStatus === 'running';
            const connectorCompleted =
              step.status === 'completed' &&
              (nextStatus === 'completed' ||
                nextStatus === 'revision_requested' ||
                nextStatus === 'error');

            return (
              <div
                key={role}
                className="flex flex-col lg:flex-row lg:items-center lg:flex-1 min-w-0"
              >
                <button
                  type="button"
                  onClick={() => handleSelectNode(role)}
                  className={`w-full text-left rounded-xl border p-3.5 transition-colors relative overflow-hidden focus-visible:outline-2 focus-visible:outline-blue-500 ${
                    meta.cardClass
                  } ${isSelected ? 'ring-1 ring-blue-400/80' : 'hover:border-white/25'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-slate-400">
                      0{idx + 1} · {AGENT_META[role].shortLabel}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-400">
                      {getLiveDuration(role)}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-1.5">
                    <StatusIcon
                      className={`w-4 h-4 shrink-0 ${meta.textClass} ${
                        meta.spin ? 'animate-spin' : ''
                      }`}
                      aria-hidden="true"
                    />
                    <span className={`text-xs font-semibold truncate ${meta.textClass}`}>
                      {meta.label}
                    </span>
                  </div>

                  {/* Per-Node Animated Progress Bar */}
                  <div className="mt-3 h-1 w-full rounded-full bg-black/40 overflow-hidden relative">
                    {step.status === 'running' ? (
                      shouldReduceMotion ? (
                        <div className="h-full w-2/3 bg-sky-400 rounded-full" />
                      ) : (
                        <motion.div
                          className="h-full w-1/2 bg-sky-400 rounded-full"
                          animate={{ x: ['-100%', '220%'] }}
                          transition={{
                            repeat: Infinity,
                            duration: 1.25,
                            ease: 'easeInOut',
                          }}
                        />
                      )
                    ) : (
                      <div
                        className={`h-full transition-all duration-300 ${meta.barClass}`}
                        style={{
                          width:
                            step.status === 'completed' ||
                            step.status === 'revision_requested'
                              ? '100%'
                              : step.status === 'error'
                                ? '100%'
                                : step.status === 'queued'
                                  ? '15%'
                                  : '0%',
                        }}
                      />
                    )}
                  </div>

                  <div className="mt-2.5 flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-500">
                    <span>S: {formatTimeOnly(step.startedAt)}</span>
                    <span>E: {formatTimeOnly(step.completedAt)}</span>
                  </div>
                </button>

                {/* Animated Connector Between Nodes */}
                {idx < AGENT_ORDER.length - 1 && (
                  <>
                    {/* Mobile/Tablet vertical connector */}
                    <div className="flex lg:hidden items-center justify-center py-1">
                      <div className="flex flex-col items-center">
                        <div
                          className={`w-0.5 h-3 ${
                            connectorActive
                              ? 'bg-sky-400'
                              : connectorCompleted
                                ? 'bg-emerald-500/70'
                                : 'bg-slate-700'
                          }`}
                        />
                        <ArrowDown
                          className={`w-3.5 h-3.5 -mt-1 ${
                            connectorActive
                              ? 'text-sky-400'
                              : connectorCompleted
                                ? 'text-emerald-400'
                                : 'text-slate-600'
                          }`}
                          aria-hidden="true"
                        />
                      </div>
                    </div>

                    {/* Desktop horizontal animated connector */}
                    <div className="hidden lg:flex items-center px-1.5 w-8 shrink-0">
                      <div className="relative w-full flex items-center">
                        <div
                          className={`h-0.5 w-full rounded-full overflow-hidden ${
                            connectorCompleted
                              ? 'bg-emerald-500/70'
                              : connectorActive
                                ? 'bg-sky-500/30'
                                : 'bg-slate-800'
                          }`}
                        >
                          {connectorActive && !shouldReduceMotion && (
                            <motion.div
                              className="h-full w-1/2 bg-sky-400"
                              animate={{ x: ['-100%', '200%'] }}
                              transition={{
                                repeat: Infinity,
                                duration: 0.9,
                                ease: 'linear',
                              }}
                            />
                          )}
                        </div>
                        <ArrowRight
                          className={`w-3.5 h-3.5 -ml-1 shrink-0 ${
                            connectorActive
                              ? 'text-sky-400'
                              : connectorCompleted
                                ? 'text-emerald-400'
                                : 'text-slate-700'
                          }`}
                          aria-hidden="true"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Revision Loop + Human Approval Gate Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          <div
            className={`rounded-lg border px-4 py-3 flex items-center justify-between gap-3 text-xs ${
              activeTask.revisionCount > 0 ||
              activeTask.agents.reviewer.status === 'revision_requested'
                ? 'border-amber-500/40 bg-amber-500/8 text-amber-200'
                : 'border-white/8 bg-[#111827] text-slate-400'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                Reviewer → Writer Automatic Revision Loop
              </span>
            </div>
            <span className="font-mono tabular-nums shrink-0">
              {activeTask.revisionCount}/{activeTask.maxRevisions} revisions
            </span>
          </div>

          <div
            className={`rounded-lg border px-4 py-3 flex items-center justify-between gap-3 text-xs ${
              activeTask.status === 'approved'
                ? 'border-emerald-500/40 bg-emerald-500/8 text-emerald-200'
                : activeTask.status === 'awaiting_approval'
                  ? 'border-amber-500/45 bg-amber-500/10 text-amber-100'
                  : 'border-white/8 bg-[#111827] text-slate-400'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {activeTask.status === 'approved'
                  ? 'Human Approval Gate: Published'
                  : activeTask.status === 'awaiting_approval'
                    ? 'Human Approval Gate: Ready for sign-off'
                    : 'Human Approval Gate: Pending completion'}
              </span>
            </div>
            {activeTask.status === 'awaiting_approval' && (
              <button
                type="button"
                onClick={() => approveAndPublish(activeTask.id)}
                className="px-3 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                Approve &amp; Publish
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Individual Agent Output Panels + Live Execution Logs */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Individual Agent Output Panels */}
        <div className="xl:col-span-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-white">
              Individual Agent Output Panels
            </h2>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#111827] border border-white/8">
              <button
                type="button"
                onClick={() => setPanelViewMode('all')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  panelViewMode === 'all'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All 5 Agents
              </button>
              <button
                type="button"
                onClick={() => setPanelViewMode('focused')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  panelViewMode === 'focused'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Selected Only ({AGENT_META[selectedNode].shortLabel})
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {visiblePanels.map((role) => {
              const step = activeTask.agents[role];
              const meta = getVisualStateMeta(step.status);
              const StatusIcon = meta.icon;
              const isSelected = selectedNode === role;
              const inputExpanded = expandedInputs[role];
              const idx = AGENT_ORDER.indexOf(role);

              return (
                <article
                  key={role}
                  ref={(el) => {
                    panelRefs.current[role] = el;
                  }}
                  className={`rounded-xl border p-5 space-y-4 transition-colors ${
                    isSelected
                      ? 'bg-[#131C2E] border-blue-500/45'
                      : 'bg-[#111827] border-white/8'
                  }`}
                >
                  {/* Panel Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/8">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="text-sm font-semibold text-white">
                          0{idx + 1}. {step.label}
                        </h3>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.textClass}`}>
                          <StatusIcon
                            className={`w-3.5 h-3.5 ${meta.spin ? 'animate-spin' : ''}`}
                            aria-hidden="true"
                          />
                          <span>{meta.label}</span>
                        </span>
                      </div>
                      <p className="text-xs font-mono tabular-nums text-slate-400">
                        Start: {formatTimeOnly(step.startedAt)} · End:{' '}
                        {formatTimeOnly(step.completedAt)} · Duration:{' '}
                        {getLiveDuration(role)}
                        {step.tokenUsage
                          ? ` · ${step.tokenUsage.totalTokens.toLocaleString()} tok`
                          : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {step.inputSnapshot && (
                        <button
                          type="button"
                          onClick={() => toggleInputDrawer(role)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-800 border border-white/10 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <span>Inputs</span>
                          {inputExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                        </button>
                      )}
                      {activeTask.status !== 'running' && (
                        <button
                          type="button"
                          onClick={() => void retryAgent(activeTask.id, role)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-300 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>
                            {step.status === 'idle' ? 'Run From Here' : 'Retry'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Collapsible Upstream Structured Input */}
                  {inputExpanded && step.inputSnapshot && (
                    <div className="rounded-lg bg-[#0B0F17] border border-white/8 p-3.5 space-y-2">
                      <p className="text-xs font-medium text-slate-300">
                        Received Handoff ({step.inputSnapshot.fromSources.join(', ')})
                      </p>
                      <p className="text-xs text-slate-400">
                        {step.inputSnapshot.summary}
                      </p>
                      <pre className="p-2.5 rounded bg-[#080B12] border border-white/6 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-52 overflow-y-auto whitespace-pre-wrap">
                        {JSON.stringify(step.inputSnapshot.payload, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Failure State */}
                  {step.error && (
                    <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3.5 flex items-start gap-2.5 text-xs text-rose-200">
                      <AlertTriangle
                        className="w-4 h-4 text-rose-400 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="font-semibold">{step.error.code}</p>
                        <p className="mt-0.5 text-rose-200/85">{step.error.message}</p>
                      </div>
                    </div>
                  )}

                  {/* Tools & Citations */}
                  {(step.toolsInvoked.length > 0 || step.citations.length > 0) && (
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
                      {step.toolsInvoked.length > 0 && (
                        <span className="inline-flex items-center gap-1.5 font-mono text-sky-300">
                          <Wrench className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{step.toolsInvoked.join(' · ')}</span>
                        </span>
                      )}
                      {step.citations.slice(0, 3).map((c) => (
                        <a
                          key={c.uri}
                          href={c.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 max-w-[240px] truncate"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">{c.title}</span>
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Agent Output */}
                  {step.outputText ? (
                    <div className="rounded-lg bg-[#0B0F17] border border-white/6 p-4 max-h-72 overflow-y-auto">
                      <MarkdownRenderer content={step.outputText} />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 py-3">
                      {step.status === 'running'
                        ? 'Executing live Gemini API call...'
                        : step.status === 'queued'
                          ? 'Queued — waiting for upstream agent handoff.'
                          : 'Waiting to run.'}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        {/* Live Execution Logs Panel */}
        <aside className="xl:col-span-4 rounded-xl bg-[#111827] border border-white/8 overflow-hidden xl:sticky xl:top-6">
          <div className="px-4 py-3.5 border-b border-white/8 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-slate-400" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-white">
                  Execution Logs ({filteredLogs.length})
                </h2>
              </div>
              {activeTask.status === 'running' && (
                <span className="text-[11px] font-mono text-sky-400">LIVE</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#0B0F17] border border-white/8">
              {['all', 'orchestrator', 'research', 'analysis', 'writer', 'reviewer', 'error'].map(
                (f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setLogFilter(f)}
                    className={`px-2 py-1 text-[11px] font-medium rounded capitalize transition-colors whitespace-nowrap ${
                      logFilter === f
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {f}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="max-h-[680px] overflow-y-auto divide-y divide-white/5 font-mono text-[11px]">
            {filteredLogs.length === 0 ? (
              <div className="p-6 text-center text-slate-500">
                No logs match the selected filter.
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div key={log.id} className="px-4 py-2.5 space-y-1 hover:bg-white/[0.02]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="uppercase text-slate-400 font-medium">
                      {log.agentRole}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`uppercase ${
                          log.level === 'error'
                            ? 'text-rose-400'
                            : log.level === 'warning'
                              ? 'text-amber-400'
                              : log.level === 'success'
                                ? 'text-emerald-400'
                                : log.level === 'tool'
                                  ? 'text-sky-400'
                                  : 'text-slate-500'
                        }`}
                      >
                        {log.level}
                      </span>
                      <span className="text-slate-500 tabular-nums">
                        {formatTimeOnly(log.timestamp)}
                      </span>
                    </div>
                  </div>
                  <p className="text-slate-200 leading-relaxed">{log.message}</p>
                  {log.detail && (
                    <p className="text-slate-500 break-words leading-relaxed">
                      {log.detail}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
