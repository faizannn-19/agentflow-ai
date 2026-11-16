import { useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  FileText,
  Play,
  RotateCcw,
  Send,
  ShieldAlert,
  Square,
  Wrench,
  XCircle,
} from 'lucide-react';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { AgentStatusIndicator, TaskStatusIndicator } from '../components/StatusLabel';
import { useAgentFlow } from '../context/AgentFlowContext';
import type {
  AgentRole,
  AnalysisEvaluation,
  OrchestratorPlan,
  ResearchDossier,
  ReviewerAssessment,
  WriterDraft,
} from '../types/agentflow';
import {
  AGENT_META,
  AGENT_ORDER,
  OUTPUT_FORMAT_LABELS,
  computeTaskProgress,
  formatDuration,
  formatTimeOnly,
  getTaskTotalDurationMs,
  getTaskTotalTokens,
} from '../utils/taskHelpers';

export function AgentWorkspacePage() {
  const {
    tasks,
    activeTask,
    setActiveTaskId,
    setCurrentPage,
    runPipeline,
    retryAgent,
    cancelPipeline,
    approveAndPublish,
    requestHumanRevision,
    rejectTask,
  } = useAgentFlow();

  const [selectedRole, setSelectedRole] = useState<AgentRole>('orchestrator');
  const [inspectorTab, setInspectorTab] = useState<'output' | 'input' | 'raw'>('output');
  const [logFilter, setLogFilter] = useState<string>('all');
  const [approvalNote, setApprovalNote] = useState('');
  const [showRevisionBox, setShowRevisionBox] = useState(false);
  const [humanFeedback, setHumanFeedback] = useState('');

  if (!activeTask) {
    return (
      <div className="rounded-xl bg-[#111827] border border-white/8 p-10 text-center space-y-4">
        <h2 className="text-base font-semibold text-white">No Active Task Selected</h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          Create a new multi-agent task or pick an existing run from Task History to inspect agent inputs, outputs, timings, and execution logs.
        </p>
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => setCurrentPage('new-task')}
            className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
          >
            Create New Task
          </button>
        </div>
      </div>
    );
  }

  const progressPct = computeTaskProgress(activeTask);
  const activeStep = activeTask.agents[selectedRole];
  const failedRole = AGENT_ORDER.find(
    (r) => activeTask.agents[r].status === 'error'
  );

  const filteredLogs = activeTask.logs.filter((log) => {
    if (logFilter === 'all') return true;
    if (logFilter === 'error') return log.level === 'error';
    if (logFilter === 'tool') return log.level === 'tool';
    return log.agentRole === logFilter;
  });

  const handleSendHumanRevision = async () => {
    if (!humanFeedback.trim()) return;
    const msg = humanFeedback.trim();
    setHumanFeedback('');
    setShowRevisionBox(false);
    await requestHumanRevision(activeTask.id, msg);
  };

  return (
    <div className="space-y-6">
      {/* Task Control Bar */}
      <section className="rounded-xl bg-[#111827] border border-white/8 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-400">
              <select
                aria-label="Select task"
                value={activeTask.id}
                onChange={(e) => setActiveTaskId(e.target.value)}
                className="bg-[#0B0F17] border border-white/10 rounded-md px-2.5 py-1 text-xs text-slate-200 max-w-[260px] focus:outline-none focus:border-blue-500"
              >
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <TaskStatusIndicator status={activeTask.status} />
              <span aria-hidden="true">·</span>
              <span>{OUTPUT_FORMAT_LABELS[activeTask.outputFormat]}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{activeTask.model}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Revisions {activeTask.revisionCount}/{activeTask.maxRevisions}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-white">{activeTask.title}</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {activeTask.status === 'running' ? (
              <button
                type="button"
                onClick={() => cancelPipeline(activeTask.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-200 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 rounded-lg transition-colors whitespace-nowrap"
              >
                <Square className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Stop Execution</span>
              </button>
            ) : (
              <>
                {failedRole && (
                  <button
                    type="button"
                    onClick={() => void retryAgent(activeTask.id, failedRole)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Retry {AGENT_META[failedRole].shortLabel}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void runPipeline(activeTask.id, 'orchestrator')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Re-run All</span>
                </button>
              </>
            )}

            {activeTask.finalReport && (
              <button
                type="button"
                onClick={() => setCurrentPage('reports')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Open Report</span>
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              {activeTask.currentAgent
                ? `Orchestrator executing ${AGENT_META[activeTask.currentAgent].label}...`
                : activeTask.status === 'awaiting_approval'
                  ? 'All agents finished — awaiting human publishing approval'
                  : activeTask.status === 'approved'
                    ? 'Approved and published'
                    : activeTask.status === 'failed'
                      ? 'Orchestrator paused workflow after an agent failure'
                      : 'Ready'}
            </span>
            <span className="font-mono tabular-nums text-slate-300">
              {progressPct}% · {formatDuration(getTaskTotalDurationMs(activeTask))} ·{' '}
              {getTaskTotalTokens(activeTask).toLocaleString()} tokens
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                activeTask.status === 'failed'
                  ? 'bg-rose-500'
                  : activeTask.status === 'approved'
                    ? 'bg-emerald-500'
                    : activeTask.status === 'awaiting_approval'
                      ? 'bg-amber-500'
                      : 'bg-blue-500'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </section>

      {/* Orchestrator Failure Recovery Decisions */}
      {(activeTask.recoveryDecisions?.length ?? 0) > 0 && (
        <section className="rounded-xl bg-[#111827] border border-amber-500/25 p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
            <ShieldAlert className="w-4 h-4" aria-hidden="true" />
            <span>Orchestrator Failure Management</span>
          </div>
          <div className="divide-y divide-white/6 rounded-lg border border-white/8 bg-[#0B0F17]">
            {activeTask.recoveryDecisions.map((dec, idx) => (
              <div key={idx} className="p-3 text-xs space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-white">
                    {AGENT_META[dec.failedRole].label} ({dec.errorCode}) →{' '}
                    <span className="font-mono text-amber-300">{dec.action}</span>
                  </span>
                  <span className="font-mono tabular-nums text-slate-500">
                    {formatTimeOnly(dec.timestamp)}
                  </span>
                </div>
                <p className="text-slate-300 leading-relaxed">{dec.rationale}</p>
                {dec.adjustedDirective && (
                  <p className="text-sky-300 font-mono text-[11px]">
                    Adjusted directive: {dec.adjustedDirective}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Human Approval Gate */}
      {activeTask.status === 'awaiting_approval' && (
        <section className="rounded-xl bg-amber-500/8 border border-amber-500/30 p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
                <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                <span>Human Approval Required Before Publishing</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                The Reviewer Agent completed its audit ({activeTask.revisionCount} automatic{' '}
                {activeTask.revisionCount === 1 ? 'revision' : 'revisions'} performed). Review the report and Reviewer notes before publishing.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowRevisionBox((v) => !v)}
                className="px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-lg transition-colors whitespace-nowrap"
              >
                Request Revision
              </button>
              <button
                type="button"
                onClick={() => rejectTask(activeTask.id, approvalNote)}
                className="px-3.5 py-2 text-xs font-medium text-rose-200 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 rounded-lg transition-colors whitespace-nowrap"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => approveAndPublish(activeTask.id, approvalNote)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors whitespace-nowrap"
              >
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Approve &amp; Publish</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              value={approvalNote}
              onChange={(e) => setApprovalNote(e.target.value)}
              placeholder="Optional sign-off note for audit log..."
              className="rounded-lg bg-[#0B0F17] border border-white/10 px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          {showRevisionBox && (
            <div className="pt-2 border-t border-white/10 space-y-2.5">
              <label
                htmlFor="human-rev-feedback"
                className="block text-xs font-medium text-slate-200"
              >
                Targeted revision instructions for Writer &amp; Reviewer
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  id="human-rev-feedback"
                  type="text"
                  value={humanFeedback}
                  onChange={(e) => setHumanFeedback(e.target.value)}
                  placeholder="e.g. Expand the risk mitigation table with specific rollback timings..."
                  className="flex-1 rounded-lg bg-[#0B0F17] border border-white/10 px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => void handleSendHumanRevision()}
                  disabled={!humanFeedback.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Send to Writer</span>
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Sequential Execution Schedule & Status Table */}
      <section className="rounded-xl bg-[#111827] border border-white/8 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/8 flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold text-white">
            Sequential Agent Execution Matrix
          </h3>
          <span className="text-xs text-slate-400">
            Click any row to inspect full structured inputs and outputs
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/8 text-xs font-medium text-slate-400">
                <th className="py-2.5 px-5">Agent</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Start Time</th>
                <th className="py-2.5 px-4">Completion Time</th>
                <th className="py-2.5 px-4 text-right">Duration</th>
                <th className="py-2.5 px-4">Received Input</th>
                <th className="py-2.5 px-5">Produced Output</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6 text-xs">
              {AGENT_ORDER.map((role, idx) => {
                const step = activeTask.agents[role];
                const isSelected = selectedRole === role;
                return (
                  <tr
                    key={role}
                    onClick={() => setSelectedRole(role)}
                    className={`cursor-pointer transition-colors h-11 ${
                      isSelected ? 'bg-[#162033]' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <td className="py-2.5 px-5 font-medium text-white whitespace-nowrap">
                      {idx + 1}. {AGENT_META[role].shortLabel}
                    </td>
                    <td className="py-2.5 px-4">
                      <AgentStatusIndicator status={step.status} />
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      {formatTimeOnly(step.startedAt)}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      {formatTimeOnly(step.completedAt)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                      {formatDuration(step.durationMs)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400 max-w-[220px] truncate">
                      {step.inputSnapshot?.summary || 'Pending upstream handoff'}
                    </td>
                    <td className="py-2.5 px-5 text-slate-300 max-w-[240px] truncate">
                      {step.error
                        ? `Error: ${step.error.code}`
                        : step.outputText
                          ? step.outputText.slice(0, 80)
                          : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5 Agent Tabs + Detailed Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-4 space-y-2.5">
          {AGENT_ORDER.map((role, idx) => {
            const step = activeTask.agents[role];
            const selected = selectedRole === role;
            return (
              <button
                key={role}
                type="button"
                onClick={() => setSelectedRole(role)}
                className={`w-full text-left rounded-xl p-4 border transition-colors ${
                  selected
                    ? 'bg-[#162033] border-blue-500/40'
                    : 'bg-[#111827] border-white/8 hover:border-white/15'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white">
                    {idx + 1}. {AGENT_META[role].label}
                  </span>
                  <AgentStatusIndicator status={step.status} />
                </div>
                <p className="mt-1.5 text-xs text-slate-400 line-clamp-2">
                  {AGENT_META[role].description}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-mono tabular-nums text-slate-500 pt-2 border-t border-white/6">
                  <span>Start: {formatTimeOnly(step.startedAt)}</span>
                  <span className="text-right">
                    End: {formatTimeOnly(step.completedAt)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Agent Detail Panel */}
        <div className="xl:col-span-8 rounded-xl bg-[#111827] border border-white/8 p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/8">
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-semibold text-white">
                  {activeStep.label}
                </h3>
                <AgentStatusIndicator status={activeStep.status} />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {activeStep.modelUsed ? `Model: ${activeStep.modelUsed}` : `Configured: ${activeTask.model}`}
                {' · '}
                Attempt #{activeStep.attempt}
                {activeStep.tokenUsage
                  ? ` · ${activeStep.tokenUsage.totalTokens.toLocaleString()} tokens`
                  : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0B0F17] border border-white/8">
                {(
                  [
                    ['output', 'Output'],
                    ['input', 'Inputs'],
                    ['raw', 'Raw JSON'],
                  ] as const
                ).map(([tabId, label]) => (
                  <button
                    key={tabId}
                    type="button"
                    onClick={() => setInspectorTab(tabId)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      inspectorTab === tabId
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {activeTask.status !== 'running' && (
                <button
                  type="button"
                  onClick={() => void retryAgent(activeTask.id, selectedRole)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-300 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 rounded-lg transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {activeStep.status === 'idle' ? 'Run From Here' : 'Retry From Here'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Dedicated Start / Completion / Duration / Status Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-[#0B0F17] border border-white/8 p-3">
              <p className="text-[11px] text-slate-500">Status</p>
              <div className="mt-1">
                <AgentStatusIndicator status={activeStep.status} />
              </div>
            </div>
            <div className="rounded-lg bg-[#0B0F17] border border-white/8 p-3">
              <p className="text-[11px] text-slate-500">Start Time</p>
              <p className="mt-1 text-xs font-mono tabular-nums text-slate-200">
                {formatTimeOnly(activeStep.startedAt)}
              </p>
            </div>
            <div className="rounded-lg bg-[#0B0F17] border border-white/8 p-3">
              <p className="text-[11px] text-slate-500">Completion Time</p>
              <p className="mt-1 text-xs font-mono tabular-nums text-slate-200">
                {formatTimeOnly(activeStep.completedAt)}
              </p>
            </div>
            <div className="rounded-lg bg-[#0B0F17] border border-white/8 p-3">
              <p className="text-[11px] text-slate-500">Duration</p>
              <p className="mt-1 text-xs font-mono tabular-nums text-slate-200">
                {formatDuration(activeStep.durationMs)}
              </p>
            </div>
          </div>

          {/* Error Box */}
          {activeStep.error && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-rose-200">
                    {activeStep.error.code}
                  </p>
                  <p className="text-xs text-rose-200/85 leading-relaxed">
                    {activeStep.error.message}
                  </p>
                </div>
              </div>
              {activeTask.status !== 'running' && (
                <button
                  type="button"
                  onClick={() => void retryAgent(activeTask.id, selectedRole)}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-500 rounded-lg whitespace-nowrap shrink-0"
                >
                  Retry Step
                </button>
              )}
            </div>
          )}

          {/* Tools & Citations Metadata */}
          {(activeStep.toolsInvoked.length > 0 || activeStep.citations.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-white/8">
              {activeStep.toolsInvoked.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Tools Invoked</span>
                  </p>
                  <p className="font-mono text-xs text-slate-200">
                    {activeStep.toolsInvoked.join(' · ')}
                  </p>
                </div>
              )}
              {activeStep.citations.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-400 mb-1.5">
                    Verified Grounding Sources ({activeStep.citations.length})
                  </p>
                  <ul className="space-y-1 max-h-28 overflow-y-auto">
                    {activeStep.citations.map((c) => (
                      <li key={c.uri}>
                        <a
                          href={c.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 truncate max-w-full"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">{c.title}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Inspector Body */}
          {inspectorTab === 'input' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <ArrowDownLeft className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                <span>
                  Upstream Structured Handoff Inputs (
                  {activeStep.inputSnapshot?.fromSources.join(', ') || 'pending'})
                </span>
              </div>
              {activeStep.inputSnapshot ? (
                <>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {activeStep.inputSnapshot.summary}
                  </p>
                  <pre className="p-4 rounded-lg bg-[#0B0F17] border border-white/8 text-xs font-mono text-slate-300 whitespace-pre-wrap overflow-x-auto max-h-[460px] overflow-y-auto leading-relaxed">
                    {JSON.stringify(activeStep.inputSnapshot.payload, null, 2)}
                  </pre>
                </>
              ) : (
                <p className="text-xs text-slate-500 py-8 text-center">
                  Inputs will be recorded when the Orchestrator dispatches this agent.
                </p>
              )}
            </div>
          ) : inspectorTab === 'raw' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                <span>Raw Structured Output JSON</span>
              </div>
              {activeStep.structuredData || activeStep.outputText ? (
                <pre className="p-4 rounded-lg bg-[#0B0F17] border border-white/8 text-xs font-mono text-slate-300 whitespace-pre-wrap overflow-x-auto max-h-[520px] overflow-y-auto leading-relaxed">
                  {activeStep.structuredData
                    ? JSON.stringify(activeStep.structuredData, null, 2)
                    : activeStep.outputText}
                </pre>
              ) : (
                <p className="text-xs text-slate-500 py-8 text-center">
                  No raw output recorded yet.
                </p>
              )}
            </div>
          ) : !activeStep.outputText && !activeStep.error ? (
            <div className="py-12 text-center text-sm text-slate-500">
              {activeStep.status === 'running'
                ? `${activeStep.label} is executing on Gemini...`
                : 'No output produced yet.'}
            </div>
          ) : (
            <AgentStructuredOutput
              role={selectedRole}
              outputText={activeStep.outputText}
              structuredData={activeStep.structuredData}
            />
          )}
        </div>
      </div>

      {/* Execution Logs Console */}
      <section className="rounded-xl bg-[#111827] border border-white/8 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/8 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white">
            Execution Logs ({filteredLogs.length})
          </h3>
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#0B0F17] border border-white/8">
            {['all', 'orchestrator', 'research', 'analysis', 'writer', 'reviewer', 'tool', 'error'].map(
              (f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setLogFilter(f)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap ${
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

        <div className="max-h-72 overflow-y-auto divide-y divide-white/5 font-mono text-xs">
          {filteredLogs.length === 0 ? (
            <div className="p-6 text-center text-slate-500">
              No execution logs match the selected filter.
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="px-5 py-2.5 flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4 hover:bg-white/[0.02]"
              >
                <span className="text-slate-500 tabular-nums shrink-0">
                  {formatTimeOnly(log.timestamp)}
                </span>
                <span className="text-slate-400 uppercase w-24 shrink-0">
                  {log.agentRole}
                </span>
                <span
                  className={`shrink-0 w-16 uppercase ${
                    log.level === 'error'
                      ? 'text-rose-400'
                      : log.level === 'warning'
                        ? 'text-amber-400'
                        : log.level === 'success'
                          ? 'text-emerald-400'
                          : log.level === 'tool'
                            ? 'text-sky-400'
                            : 'text-slate-400'
                  }`}
                >
                  {log.level}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-slate-200">{log.message}</p>
                  {log.detail && (
                    <p className="text-slate-500 mt-0.5 break-all">{log.detail}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function AgentStructuredOutput({
  role,
  outputText,
  structuredData,
}: {
  role: AgentRole;
  outputText: string;
  structuredData?: Record<string, unknown>;
}) {
  if (role === 'orchestrator' && structuredData) {
    const plan = structuredData as unknown as OrchestratorPlan;
    return (
      <div className="space-y-5 text-sm">
        <div>
          <h4 className="text-xs font-medium text-slate-400 mb-1">Task Framing</h4>
          <p className="text-slate-200 leading-relaxed">{plan.taskSummary}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <h4 className="text-xs font-medium text-slate-400 mb-2">Objectives</h4>
            <ul className="space-y-1.5 list-disc pl-4 text-xs text-slate-300 leading-relaxed">
              {plan.objectives?.map((o, i) => <li key={i}>{o}</li>)}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-medium text-slate-400 mb-2">
              Research Questions Assigned
            </h4>
            <ul className="space-y-1.5 list-disc pl-4 text-xs text-slate-300 leading-relaxed">
              {plan.researchQuestions?.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-medium text-slate-400 mb-2">
            Planned Report Outline
          </h4>
          <div className="divide-y divide-white/6 rounded-lg border border-white/8 bg-[#0B0F17]">
            {plan.reportOutline?.map((sec, i) => (
              <div key={i} className="px-4 py-2.5">
                <p className="text-xs font-medium text-white">
                  {i + 1}. {sec.sectionTitle}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{sec.purpose}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-xs font-medium text-slate-400 mb-1.5">
            Reviewer Checklist
          </h4>
          <ul className="space-y-1 list-disc pl-4 text-xs text-slate-300">
            {plan.reviewerChecklist?.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      </div>
    );
  }

  if (role === 'research' && structuredData && 'questionsAnswered' in structuredData) {
    const dossier = structuredData as unknown as ResearchDossier;
    return (
      <div className="space-y-5 text-sm">
        <div>
          <h4 className="text-xs font-medium text-slate-400 mb-1">
            Structured Research Overview
          </h4>
          <p className="text-slate-200 leading-relaxed">{dossier.executiveOverview}</p>
        </div>

        <div>
          <h4 className="text-xs font-medium text-slate-400 mb-2">
            Orchestrator Questions Investigated
          </h4>
          <div className="divide-y divide-white/6 rounded-lg border border-white/8 bg-[#0B0F17]">
            {dossier.questionsAnswered?.map((qa, i) => (
              <div key={i} className="p-3.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-white">{qa.question}</p>
                  <span className="text-[11px] font-mono uppercase text-slate-400 shrink-0">
                    {qa.confidence}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{qa.findings}</p>
                {qa.sourcesUsed?.length > 0 && (
                  <p className="text-[11px] text-slate-500">
                    Sources: {qa.sourcesUsed.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {dossier.keyFacts?.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-slate-400 mb-2">
              Extracted Facts ({dossier.keyFacts.length})
            </h4>
            <ul className="space-y-1.5 list-disc pl-4 text-xs text-slate-300">
              {dossier.keyFacts.map((kf, i) => (
                <li key={i}>
                  {kf.fact}{' '}
                  <span className="text-slate-500">({kf.source})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {dossier.evidenceGaps?.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-slate-400 mb-1.5">
              Evidence Gaps
            </h4>
            <ul className="space-y-1 list-disc pl-4 text-xs text-amber-300/90">
              {dossier.evidenceGaps.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (role === 'analysis' && structuredData) {
    const analysis = structuredData as unknown as AnalysisEvaluation;
    return (
      <div className="space-y-5 text-sm">
        <div>
          <h4 className="text-xs font-medium text-slate-400 mb-1">
            Executive Synthesis
          </h4>
          <p className="text-slate-200 leading-relaxed">
            {analysis.executiveSynthesis}
          </p>
        </div>

        <div>
          <h4 className="text-xs font-medium text-slate-400 mb-2">
            Evaluated Findings
          </h4>
          <div className="divide-y divide-white/6 rounded-lg border border-white/8 bg-[#0B0F17]">
            {analysis.keyFindings?.map((f, i) => (
              <div key={i} className="p-3.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-white">{f.finding}</p>
                  <span className="text-[11px] font-mono uppercase text-slate-400 shrink-0">
                    {f.confidence} confidence
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{f.evidence}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-xs font-medium text-slate-400 mb-2">
            Identified Gaps &amp; Risks
          </h4>
          <div className="divide-y divide-white/6 rounded-lg border border-white/8 bg-[#0B0F17]">
            {analysis.gapsAndRisks?.map((r, i) => (
              <div key={i} className="p-3.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-white">{r.risk}</p>
                  <span
                    className={`text-[11px] font-mono uppercase shrink-0 ${
                      r.severity === 'high'
                        ? 'text-rose-400'
                        : r.severity === 'medium'
                          ? 'text-amber-400'
                          : 'text-slate-400'
                    }`}
                  >
                    {r.severity}
                  </span>
                </div>
                <p className="text-xs text-slate-400">Mitigation: {r.mitigation}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-xs font-medium text-slate-400 mb-1">
            Data Completeness Note
          </h4>
          <p className="text-xs text-slate-300 leading-relaxed">
            {analysis.dataCompletenessNote}
          </p>
        </div>
      </div>
    );
  }

  if (role === 'reviewer' && structuredData) {
    const rev = structuredData as unknown as ReviewerAssessment;
    return (
      <div className="space-y-5 text-sm">
        <div className="flex items-center justify-between gap-4 pb-3 border-b border-white/8">
          <div>
            <p className="text-xs text-slate-400">Reviewer Verdict</p>
            <p
              className={`mt-0.5 text-sm font-semibold ${
                rev.verdict === 'APPROVED' ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {rev.verdict === 'APPROVED'
                ? 'Approved for Human Review'
                : 'Revision Requested'}
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-200 leading-relaxed">{rev.summary}</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { label: 'Completeness', data: rev.completenessCheck },
            { label: 'Consistency', data: rev.consistencyCheck },
            { label: 'Grounding', data: rev.groundingCheck },
          ].map((chk) => (
            <div
              key={chk.label}
              className="rounded-lg bg-[#0B0F17] border border-white/8 p-3 space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-white">{chk.label}</span>
                <span
                  className={`text-[11px] font-mono ${
                    chk.data?.passed ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {chk.data?.passed ? 'PASS' : 'FLAG'}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {chk.data?.notes}
              </p>
            </div>
          ))}
        </div>

        {rev.issues?.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-slate-400 mb-2">
              Flagged Issues ({rev.issues.length})
            </h4>
            <div className="divide-y divide-white/6 rounded-lg border border-white/8 bg-[#0B0F17]">
              {rev.issues.map((iss, idx) => (
                <div key={idx} className="p-3 space-y-0.5">
                  <p className="text-xs font-medium text-slate-200">
                    <span className="font-mono uppercase text-amber-400 mr-2">
                      [{iss.severity}]
                    </span>
                    {iss.section}
                  </p>
                  <p className="text-xs text-slate-400">{iss.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {rev.revisionInstructions && (
          <div>
            <h4 className="text-xs font-medium text-slate-400 mb-1">
              Revision Instructions
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              {rev.revisionInstructions}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (role === 'writer' && structuredData) {
    const draft = structuredData as unknown as WriterDraft;
    return (
      <div className="space-y-4">
        <MarkdownRenderer content={outputText} />
        {draft.methodologyNote && (
          <p className="text-xs text-slate-500 pt-2 border-t border-white/8">
            Methodology: {draft.methodologyNote}
          </p>
        )}
      </div>
    );
  }

  return <MarkdownRenderer content={outputText} />;
}
