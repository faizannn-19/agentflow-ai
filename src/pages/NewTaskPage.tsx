import React, { useState } from 'react';
import {
  AlertCircle,
  Link as LinkIcon,
  Play,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAgentFlow } from '../context/AgentFlowContext';
import type {
  ApprovedToolId,
  ModelId,
  OutputFormat,
  ThinkingDepth,
} from '../types/agentflow';
import {
  APPROVED_TOOL_META,
  OUTPUT_FORMAT_LABELS,
  TASK_STARTER_PRESETS,
  createNewTaskRecord,
} from '../utils/taskHelpers';

export function NewTaskPage() {
  const { settings, createTask, runPipeline, setCurrentPage, serverHealth } =
    useAgentFlow();

  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [userContent, setUserContent] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [sourceUrls, setSourceUrls] = useState<string[]>([]);
  const [approvedTools, setApprovedTools] = useState<ApprovedToolId[]>(
    settings.defaultApprovedTools
  );
  const [outputFormat, setOutputFormat] =
    useState<OutputFormat>('executive_brief');
  const [model, setModel] = useState<ModelId>(settings.defaultModel);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingDepth>(
    settings.defaultThinkingLevel
  );
  const [maxRevisions, setMaxRevisions] = useState<0 | 1 | 2>(
    settings.maxRevisions
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);

  const toggleTool = (toolId: ApprovedToolId) => {
    setApprovedTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]
    );
  };

  const handleAddUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setFormError('Reference URLs must start with http:// or https://.');
        return;
      }
      if (!sourceUrls.includes(trimmed)) {
        setSourceUrls((prev) => [...prev, trimmed]);
      }
      setUrlInput('');
      setFormError(null);
    } catch {
      setFormError('Please enter a valid URL (e.g. https://example.com/report).');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 250 * 1024) {
      setFormError('Uploaded text file must be 250 KB or smaller.');
      return;
    }
    try {
      const text = await file.text();
      setUserContent((prev) =>
        prev.trim() ? `${prev.trim()}\n\n--- ${file.name} ---\n${text}` : text
      );
      setFormError(null);
    } catch {
      setFormError('Failed to read the selected file.');
    }
    e.target.value = '';
  };

  const loadPreset = (presetIndex: number) => {
    const preset = TASK_STARTER_PRESETS[presetIndex];
    if (!preset) return;
    setTitle(preset.label);
    setPrompt(preset.prompt);
    setUserContent(preset.userContent);
    setOutputFormat(preset.outputFormat);
    setApprovedTools(preset.approvedTools);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim().length < 5) {
      setFormError('Please enter a task prompt of at least 5 characters.');
      return;
    }
    setFormError(null);
    setIsLaunching(true);

    const newTask = createNewTaskRecord({
      title,
      prompt,
      userContent,
      sourceUrls,
      approvedTools,
      outputFormat,
      settings,
      model,
      thinkingLevel,
      maxRevisions,
    });

    createTask(newTask);
    setCurrentPage('workspace');
    setIsLaunching(false);
    void runPipeline(newTask.id);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {serverHealth.checked && !serverHealth.geminiConfigured && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs text-amber-100 leading-relaxed">
            Gemini API key not detected on server. Ensure <code className="font-mono">GEMINI_API_KEY</code> is set in AI Studio{' '}
            <strong className="font-semibold text-white">Settings &gt; Secrets</strong> so agents can run live calls.
          </p>
        </div>
      )}

      {/* Starter Briefs */}
      <div className="rounded-xl bg-[#111827] border border-white/8 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-200">
            Load an example brief to populate fields
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            All runs execute live Gemini API calls across the 5-agent workflow.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {TASK_STARTER_PRESETS.map((preset, idx) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => loadPreset(idx)}
              className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-800 border border-white/10 rounded-lg transition-colors whitespace-nowrap"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl bg-[#111827] border border-white/8 p-6 space-y-6"
      >
        {formError && (
          <div
            role="alert"
            className="rounded-lg bg-rose-500/10 border border-rose-500/25 px-4 py-3 text-xs text-rose-200 flex items-center gap-2.5"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" aria-hidden="true" />
            <span>{formError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label
              htmlFor="task-title"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Task Title (optional)
            </label>
            <input
              id="task-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Auto-derived from prompt if left blank"
              className="w-full rounded-lg bg-[#0B0F17] border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="output-format"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Report Output Format
            </label>
            <select
              id="output-format"
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
              className="w-full rounded-lg bg-[#0B0F17] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              {Object.entries(OUTPUT_FORMAT_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="task-prompt"
            className="block text-xs font-medium text-slate-300 mb-1.5"
          >
            Task Prompt <span className="text-rose-400">*</span>
          </label>
          <textarea
            id="task-prompt"
            required
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the objective, questions to answer, audience, and constraints for the multi-agent team..."
            className="w-full rounded-lg bg-[#0B0F17] border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 leading-relaxed"
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-4 mb-1.5">
            <label
              htmlFor="user-content"
              className="block text-xs font-medium text-slate-300"
            >
              User-Provided Content &amp; Source Materials (optional)
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 cursor-pointer">
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Attach .txt / .md / .csv / .json</span>
              <input
                type="file"
                accept=".txt,.md,.csv,.json,.log"
                onChange={handleFileUpload}
                className="sr-only"
              />
            </label>
          </div>
          <textarea
            id="user-content"
            rows={6}
            value={userContent}
            onChange={(e) => setUserContent(e.target.value)}
            placeholder="Paste notes, transcripts, specifications, metrics, or raw data. The Research Agent will inspect this content directly using your approved tools."
            className="w-full rounded-lg bg-[#0B0F17] border border-white/10 px-3.5 py-2.5 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 leading-relaxed"
          />
        </div>

        {/* Reference URLs */}
        <div>
          <label
            htmlFor="source-url-input"
            className="block text-xs font-medium text-slate-300 mb-1.5"
          >
            Reference URLs for URL Context Tool (optional)
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon
                className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                id="source-url-input"
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddUrl();
                  }
                }}
                placeholder="https://example.com/documentation"
                className="w-full rounded-lg bg-[#0B0F17] border border-white/10 pl-9 pr-3.5 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={handleAddUrl}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Add URL</span>
            </button>
          </div>
          {sourceUrls.length > 0 && (
            <ul className="mt-2.5 space-y-1.5">
              {sourceUrls.map((url) => (
                <li
                  key={url}
                  className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg bg-[#0B0F17] border border-white/8 text-xs text-slate-300"
                >
                  <span className="font-mono truncate">{url}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setSourceUrls((prev) => prev.filter((u) => u !== url))
                    }
                    className="text-slate-500 hover:text-rose-400 p-1"
                    aria-label={`Remove ${url}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Approved Tools */}
        <div>
          <p className="text-xs font-medium text-slate-300 mb-2">
            Approved Research Agent Tools
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(Object.keys(APPROVED_TOOL_META) as ApprovedToolId[]).map((toolId) => {
              const meta = APPROVED_TOOL_META[toolId];
              const checked = approvedTools.includes(toolId);
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
                    onChange={() => toggleTool(toolId)}
                    className="mt-0.5 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white">{meta.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                      {meta.description}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Execution Configuration */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-white/8">
          <div>
            <label
              htmlFor="model-select"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Gemini Model (Free Tier)
            </label>
            <select
              id="model-select"
              value={model}
              onChange={(e) => setModel(e.target.value as ModelId)}
              className="w-full rounded-lg bg-[#0B0F17] border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="gemini-4-hydrogen">gemini-4-hydrogen (Balanced)</option>
              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Fast)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="thinking-select"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Reasoning Depth
            </label>
            <select
              id="thinking-select"
              value={thinkingLevel}
              onChange={(e) => setThinkingLevel(e.target.value as ThinkingDepth)}
              className="w-full rounded-lg bg-[#0B0F17] border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="LOW">Low (Fastest)</option>
              <option value="MEDIUM">Medium (Recommended)</option>
              <option value="HIGH">High (Deep Reasoning)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="max-rev-select"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Max Reviewer Revisions
            </label>
            <select
              id="max-rev-select"
              value={maxRevisions}
              onChange={(e) => setMaxRevisions(Number(e.target.value) as 0 | 1 | 2)}
              className="w-full rounded-lg bg-[#0B0F17] border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value={2}>Up to 2 revisions (Recommended)</option>
              <option value={1}>Up to 1 revision</option>
              <option value={0}>0 revisions (Single pass)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 pt-2">
          <p className="text-xs text-slate-400">
            Pipeline pauses at the Human Approval gate before publishing.
          </p>
          <button
            type="submit"
            disabled={isLaunching}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Run Multi-Agent Workflow</span>
          </button>
        </div>
      </form>
    </div>
  );
}
