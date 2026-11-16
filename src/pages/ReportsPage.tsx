import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  FileText,
  Loader2,
  Send,
} from 'lucide-react';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { TaskStatusIndicator } from '../components/StatusLabel';
import { useAgentFlow } from '../context/AgentFlowContext';
import type { ReviewerAssessment } from '../types/agentflow';
import {
  OUTPUT_FORMAT_LABELS,
  exportReportAsJson,
  exportReportAsText,
  formatTimestamp,
} from '../utils/taskHelpers';

type ReportFilter = 'all' | 'awaiting_approval' | 'approved' | 'rejected';

export function ReportsPage() {
  const {
    tasks,
    activeTask,
    setActiveTaskId,
    setCurrentPage,
    approveAndPublish,
    requestHumanRevision,
    rejectTask,
  } = useAgentFlow();

  const [filter, setFilter] = useState<ReportFilter>('all');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revisionInput, setRevisionInput] = useState('');
  const [showRevisionForm, setShowRevisionForm] = useState(false);

  const tasksWithReports = tasks.filter((t) => Boolean(t.finalReport));

  const filteredReports = tasksWithReports.filter((t) => {
    if (filter !== 'all' && t.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.finalReport?.title.toLowerCase().includes(q) ||
        t.prompt.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selectedTask =
    filteredReports.find((t) => t.id === activeTask?.id) ??
    filteredReports[0] ??
    null;

  const handleCopyMarkdown = async () => {
    if (!selectedTask?.finalReport) return;
    try {
      await navigator.clipboard.writeText(selectedTask.finalReport.markdownBody);
      setCopiedId(selectedTask.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore clipboard errors gracefully
    }
  };

  const handleRevisionSubmit = async () => {
    if (!selectedTask || !revisionInput.trim()) return;
    const fb = revisionInput.trim();
    setRevisionInput('');
    setShowRevisionForm(false);
    await requestHumanRevision(selectedTask.id, fb);
  };

  if (tasksWithReports.length === 0) {
    return (
      <div className="rounded-xl bg-[#111827] border border-white/8 p-10 text-center space-y-4">
        <div className="mx-auto w-11 h-11 rounded-xl bg-slate-800 border border-white/10 flex items-center justify-center">
          <FileText className="w-5 h-5 text-slate-400" aria-hidden="true" />
        </div>
        <div className="space-y-1.5 max-w-md mx-auto">
          <h2 className="text-base font-semibold text-white">No Reports Generated Yet</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Completed multi-agent workflows appear here for human approval, inspection, and export as JSON or plain text.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCurrentPage('new-task')}
          className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
        >
          Start a Workflow
        </button>
      </div>
    );
  }

  const reviewerData = selectedTask?.agents.reviewer.structuredData as
    | ReviewerAssessment
    | undefined;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Report List */}
      <aside className="lg:col-span-4 rounded-xl bg-[#111827] border border-white/8 overflow-hidden">
        <div className="p-4 border-b border-white/8 space-y-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reports..."
            aria-label="Search reports"
            className="w-full rounded-lg bg-[#0B0F17] border border-white/10 px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
          />
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0B0F17] border border-white/8 overflow-x-auto">
            {(
              [
                ['all', 'All'],
                ['awaiting_approval', 'Pending'],
                ['approved', 'Published'],
                ['rejected', 'Rejected'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setFilter(val)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  filter === val
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-white/6 max-h-[680px] overflow-y-auto">
          {filteredReports.length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-500">
              No reports match the current filter.
            </p>
          ) : (
            filteredReports.map((t) => {
              const isSelected = selectedTask?.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTaskId(t.id)}
                  className={`w-full text-left p-4 transition-colors ${
                    isSelected ? 'bg-[#162033]' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <p className="text-sm font-medium text-white line-clamp-1">
                    {t.finalReport?.title || t.title}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-slate-400">
                    <TaskStatusIndicator status={t.status} />
                    <span className="tabular-nums">
                      {formatTimestamp(t.finalReport?.generatedAt)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Report Viewer */}
      <div className="lg:col-span-8">
        {selectedTask && selectedTask.finalReport ? (
          <article className="rounded-xl bg-[#111827] border border-white/8 p-6 space-y-6">
            {/* Header & Exports */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-5 border-b border-white/8">
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <TaskStatusIndicator status={selectedTask.status} />
                  <span aria-hidden="true">·</span>
                  <span>{OUTPUT_FORMAT_LABELS[selectedTask.outputFormat]}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{selectedTask.model}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {selectedTask.revisionCount} revision
                    {selectedTask.revisionCount === 1 ? '' : 's'}
                  </span>
                </div>
                <h2 className="text-xl font-semibold text-white">
                  {selectedTask.finalReport.title}
                </h2>
                {selectedTask.publishedAt && (
                  <p className="text-xs text-emerald-400">
                    Published {formatTimestamp(selectedTask.publishedAt)}
                    {selectedTask.humanApprovalNote
                      ? ` — "${selectedTask.humanApprovalNote}"`
                      : ''}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyMarkdown}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-lg transition-colors whitespace-nowrap"
                >
                  {copiedId === selectedTask.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>{copiedId === selectedTask.id ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => exportReportAsText(selectedTask)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Export Text</span>
                </button>
                <button
                  type="button"
                  onClick={() => exportReportAsJson(selectedTask)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap"
                >
                  <FileJson className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Export JSON</span>
                </button>
              </div>
            </div>

            {/* Running Revision Notice inside Reports */}
            {selectedTask.status === 'running' && (
              <div className="rounded-lg bg-sky-500/10 border border-sky-500/25 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-sky-200">
                  <Loader2 className="w-4 h-4 animate-spin text-sky-400 shrink-0" aria-hidden="true" />
                  <span>
                    Revision in progress — Writer and Reviewer are updating this report.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentPage('workspace')}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg whitespace-nowrap self-start"
                >
                  Watch Live in Workspace
                </button>
              </div>
            )}

            {/* Human Approval Bar inside Reports */}
            {selectedTask.status === 'awaiting_approval' && (
              <div className="rounded-lg bg-amber-500/8 border border-amber-500/30 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-xs text-amber-100">
                    Approve this report to publish it, or send revision instructions back to the Writer Agent.
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowRevisionForm((v) => !v)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-lg whitespace-nowrap"
                    >
                      Request Revision
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectTask(selectedTask.id)}
                      className="px-3 py-1.5 text-xs font-medium text-rose-200 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 rounded-lg whitespace-nowrap"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => approveAndPublish(selectedTask.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Approve &amp; Publish</span>
                    </button>
                  </div>
                </div>
                {showRevisionForm && (
                  <div className="flex gap-2 pt-2 border-t border-white/10">
                    <input
                      type="text"
                      value={revisionInput}
                      onChange={(e) => setRevisionInput(e.target.value)}
                      placeholder="Describe changes for Writer Agent..."
                      className="flex-1 rounded-lg bg-[#0B0F17] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => void handleRevisionSubmit()}
                      disabled={!revisionInput.trim()}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Submit</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Report Content */}
            <div className="space-y-6">
              <MarkdownRenderer content={selectedTask.finalReport.markdownBody} />
            </div>

            {/* Verified Sources */}
            {selectedTask.finalReport.sources.length > 0 && (
              <section className="pt-5 border-t border-white/8 space-y-2">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Verified Grounding Sources
                </h3>
                <ul className="space-y-1.5">
                  {selectedTask.finalReport.sources.map((src) => (
                    <li key={src.uri}>
                      <a
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{src.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Reviewer Audit & Revision Trail */}
            {reviewerData && (
              <section className="pt-5 border-t border-white/8 space-y-3">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Automated Reviewer Audit &amp; Revision Trail
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {reviewerData.summary}
                </p>
                {selectedTask.revisions.length > 0 && (
                  <div className="divide-y divide-white/6 rounded-lg border border-white/8 bg-[#0B0F17]">
                    {selectedTask.revisions.map((rev, idx) => (
                      <div key={idx} className="p-3.5 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-white">
                            {rev.revisionNumber === 0
                              ? 'Initial Draft'
                              : `Revision #${rev.revisionNumber}`}
                          </span>
                          <span
                            className={`font-mono ${
                              rev.reviewerVerdict === 'APPROVED'
                                ? 'text-emerald-400'
                                : 'text-amber-400'
                            }`}
                          >
                            {rev.reviewerVerdict}
                          </span>
                        </div>
                        <p className="text-slate-400">{rev.reviewerSummary}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </article>
        ) : (
          <div className="rounded-xl bg-[#111827] border border-white/8 p-8 text-center text-sm text-slate-500">
            Select a report from the list to inspect or export it.
          </div>
        )}
      </div>
    </div>
  );
}
