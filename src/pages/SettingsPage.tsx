import { useState } from 'react';
import {
  CheckCircle2,
  Download,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAgentFlow } from '../context/AgentFlowContext';
import type {
  ApprovedToolId,
  ModelId,
  ThinkingDepth,
} from '../types/agentflow';
import { APPROVED_TOOL_META } from '../utils/taskHelpers';

export function SettingsPage() {
  const {
    settings,
    tasks,
    serverHealth,
    updateSettings,
    resetSettings,
    refreshHealth,
  } = useAgentFlow();

  const [checkingHealth, setCheckingHealth] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleToggleDefaultTool = (toolId: ApprovedToolId) => {
    const next = settings.defaultApprovedTools.includes(toolId)
      ? settings.defaultApprovedTools.filter((t) => t !== toolId)
      : [...settings.defaultApprovedTools, toolId];
    updateSettings({ defaultApprovedTools: next });
    flashSaved();
  };

  const flashSaved = () => {
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 1800);
  };

  const handleRefreshHealth = async () => {
    setCheckingHealth(true);
    await refreshHealth();
    setCheckingHealth(false);
  };

  const handleExportWorkspaceBackup = () => {
    const backup = {
      exportedAt: new Date().toISOString(),
      settings,
      tasks,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentflow-workspace-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const estimatedBytes = new Blob([JSON.stringify(tasks)]).size;
  const estimatedKb = (estimatedBytes / 1024).toFixed(1);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Server & Gemini Runtime Status */}
      <section className="rounded-xl bg-[#111827] border border-white/8 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Server &amp; Gemini API Runtime
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              All multi-agent Gemini API calls execute exclusively on the Node.js backend.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRefreshHealth()}
            disabled={checkingHealth}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-lg transition-colors whitespace-nowrap self-start"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${checkingHealth ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Verify Server Status</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="rounded-lg bg-[#0B0F17] border border-white/8 p-4 space-y-1.5">
            <p className="text-xs text-slate-400">Backend API Endpoint</p>
            <div className="flex items-center gap-2 text-sm font-medium">
              {serverHealth.ok ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                  <span className="text-emerald-300">Reachable</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-rose-400" aria-hidden="true" />
                  <span className="text-rose-300">Unavailable</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-lg bg-[#0B0F17] border border-white/8 p-4 space-y-1.5">
            <p className="text-xs text-slate-400">Server-Side Gemini Secret</p>
            <div className="flex items-center gap-2 text-sm font-medium">
              {serverHealth.geminiConfigured ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                  <span className="text-emerald-300">Configured via Environment</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-amber-400" aria-hidden="true" />
                  <span className="text-amber-300">Not Detected</span>
                </>
              )}
            </div>
            {!serverHealth.geminiConfigured && (
              <p className="text-xs text-slate-400 pt-1 leading-relaxed">
                Configure <code className="font-mono">GEMINI_API_KEY</code> in the{' '}
                <strong className="text-slate-200">Settings &gt; Secrets</strong> panel in AI Studio.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Workspace Profile & Pipeline Defaults */}
      <section className="rounded-xl bg-[#111827] border border-white/8 p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Workspace &amp; Pipeline Defaults
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Changes save automatically to browser local storage.
            </p>
          </div>
          {savedNotice && (
            <span className="text-xs font-medium text-emerald-400">Saved</span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="workspace-name"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Workspace Name
            </label>
            <input
              id="workspace-name"
              type="text"
              value={settings.workspaceName}
              onChange={(e) => {
                updateSettings({ workspaceName: e.target.value });
                flashSaved();
              }}
              className="w-full rounded-lg bg-[#0B0F17] border border-white/10 px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="operator-name"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Operator Name
            </label>
            <input
              id="operator-name"
              type="text"
              value={settings.operatorName}
              onChange={(e) => {
                updateSettings({ operatorName: e.target.value });
                flashSaved();
              }}
              className="w-full rounded-lg bg-[#0B0F17] border border-white/10 px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-white/8">
          <div>
            <label
              htmlFor="default-model"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Default Gemini Model
            </label>
            <select
              id="default-model"
              value={settings.defaultModel}
              onChange={(e) => {
                updateSettings({ defaultModel: e.target.value as ModelId });
                flashSaved();
              }}
              className="w-full rounded-lg bg-[#0B0F17] border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="gemini-4-hydrogen">gemini-4-hydrogen (Balanced)</option>
              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Fast)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="default-thinking"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Default Reasoning Depth
            </label>
            <select
              id="default-thinking"
              value={settings.defaultThinkingLevel}
              onChange={(e) => {
                updateSettings({
                  defaultThinkingLevel: e.target.value as ThinkingDepth,
                });
                flashSaved();
              }}
              className="w-full rounded-lg bg-[#0B0F17] border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="default-revisions"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Default Max Revisions
            </label>
            <select
              id="default-revisions"
              value={settings.maxRevisions}
              onChange={(e) => {
                updateSettings({
                  maxRevisions: Number(e.target.value) as 0 | 1 | 2,
                });
                flashSaved();
              }}
              className="w-full rounded-lg bg-[#0B0F17] border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value={2}>Up to 2 revisions</option>
              <option value={1}>Up to 1 revision</option>
              <option value={0}>0 revisions</option>
            </select>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-300 mb-2">
            Default Approved Tools for Research Agent
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(Object.keys(APPROVED_TOOL_META) as ApprovedToolId[]).map((toolId) => {
              const meta = APPROVED_TOOL_META[toolId];
              const checked = settings.defaultApprovedTools.includes(toolId);
              return (
                <label
                  key={toolId}
                  className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${
                    checked
                      ? 'bg-blue-600/10 border-blue-500/35'
                      : 'bg-[#0B0F17] border-white/8 hover:border-white/15'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleToggleDefaultTool(toolId)}
                    className="mt-0.5 rounded border-slate-600 bg-slate-900 text-blue-600"
                  />
                  <div>
                    <p className="text-xs font-medium text-white">{meta.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{meta.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </section>

      {/* Browser Storage & Backup */}
      <section className="rounded-xl bg-[#111827] border border-white/8 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-white">
            Browser Local Storage &amp; Data Export
          </h2>
          <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
            {tasks.length} stored task{tasks.length === 1 ? '' : 's'} · {estimatedKb} KB used
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportWorkspaceBackup}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export Workspace JSON</span>
          </button>
          <button
            type="button"
            onClick={() => setConfirmResetOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-300 bg-slate-800/70 hover:bg-slate-800 border border-white/10 rounded-lg transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reset Defaults</span>
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmResetOpen}
        title="Reset workspace settings to defaults?"
        description="This restores default model, reasoning depth, approved tools, and operator names without deleting your task history."
        confirmLabel="Reset Settings"
        onConfirm={() => {
          resetSettings();
          setConfirmResetOpen(false);
          flashSaved();
        }}
        onCancel={() => setConfirmResetOpen(false)}
      />
    </div>
  );
}
