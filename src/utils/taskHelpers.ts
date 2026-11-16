import type {
  AgentRole,
  AgentStepState,
  AppSettings,
  ApprovedToolId,
  OutputFormat,
  TaskRecord,
} from '../types/agentflow';

export const AGENT_ORDER: AgentRole[] = [
  'orchestrator',
  'research',
  'analysis',
  'writer',
  'reviewer',
];

export const AGENT_META: Record<
  AgentRole,
  { label: string; shortLabel: string; description: string }
> = {
  orchestrator: {
    label: 'Orchestrator Agent',
    shortLabel: 'Orchestrator',
    description: 'Decomposes task goals, research questions, and report outline.',
  },
  research: {
    label: 'Research Agent',
    shortLabel: 'Research',
    description: 'Investigates user-provided sources and approved tools.',
  },
  analysis: {
    label: 'Analysis Agent',
    shortLabel: 'Analysis',
    description: 'Evaluates evidence, surfaces patterns, risks, and gaps.',
  },
  writer: {
    label: 'Writer Agent',
    shortLabel: 'Writer',
    description: 'Synthesizes findings into a structured, cited report.',
  },
  reviewer: {
    label: 'Reviewer Agent',
    shortLabel: 'Reviewer',
    description: 'Audits completeness & consistency; requests up to 2 revisions.',
  },
};

export const APPROVED_TOOL_META: Record<
  ApprovedToolId,
  { label: string; description: string; category: string }
> = {
  google_search: {
    label: 'Google Search Grounding',
    description: 'Live web search via Gemini grounding (requires Search Grounding quota on your API key).',
    category: 'Web Grounding',
  },
  url_context: {
    label: 'URL Context Reader',
    description: 'Reads content directly from the reference URLs attached to the task.',
    category: 'Web Reader',
  },
  source_metrics: {
    label: 'Source Metrics Analyzer',
    description: 'Computes exact word counts, numeric figures, and term frequencies on attached content.',
    category: 'Content Tool',
  },
  fact_extractor: {
    label: 'Source Passage Search',
    description: 'Queries specific keywords and line excerpts inside attached user content.',
    category: 'Content Tool',
  },
};

export const OUTPUT_FORMAT_LABELS: Record<OutputFormat, string> = {
  executive_brief: 'Executive Brief',
  technical_report: 'Technical Report',
  market_analysis: 'Market Analysis',
  action_plan: 'Operational Action Plan',
};

export const DEFAULT_SETTINGS: AppSettings = {
  defaultModel: 'gemini-4-hydrogen',
  defaultThinkingLevel: 'MEDIUM',
  defaultApprovedTools: ['source_metrics', 'fact_extractor'],
  maxRevisions: 2,
  operatorName: 'Workspace Operator',
  workspaceName: 'AgentFlow Studio',
};

export function createInitialAgents(): Record<AgentRole, AgentStepState> {
  return {
    orchestrator: {
      role: 'orchestrator',
      label: AGENT_META.orchestrator.label,
      description: AGENT_META.orchestrator.description,
      status: 'idle',
      attempt: 0,
      toolsInvoked: [],
      citations: [],
      outputText: '',
    },
    research: {
      role: 'research',
      label: AGENT_META.research.label,
      description: AGENT_META.research.description,
      status: 'idle',
      attempt: 0,
      toolsInvoked: [],
      citations: [],
      outputText: '',
    },
    analysis: {
      role: 'analysis',
      label: AGENT_META.analysis.label,
      description: AGENT_META.analysis.description,
      status: 'idle',
      attempt: 0,
      toolsInvoked: [],
      citations: [],
      outputText: '',
    },
    writer: {
      role: 'writer',
      label: AGENT_META.writer.label,
      description: AGENT_META.writer.description,
      status: 'idle',
      attempt: 0,
      toolsInvoked: [],
      citations: [],
      outputText: '',
    },
    reviewer: {
      role: 'reviewer',
      label: AGENT_META.reviewer.label,
      description: AGENT_META.reviewer.description,
      status: 'idle',
      attempt: 0,
      toolsInvoked: [],
      citations: [],
      outputText: '',
    },
  };
}

export function createNewTaskRecord(input: {
  title?: string;
  prompt: string;
  userContent: string;
  sourceUrls: string[];
  approvedTools: ApprovedToolId[];
  outputFormat: OutputFormat;
  settings: AppSettings;
  model?: AppSettings['defaultModel'];
  thinkingLevel?: AppSettings['defaultThinkingLevel'];
  maxRevisions?: 0 | 1 | 2;
}): TaskRecord {
  const now = new Date().toISOString();
  const derivedTitle =
    input.title?.trim() ||
    input.prompt
      .trim()
      .split(/\s+/)
      .slice(0, 7)
      .join(' ')
      .replace(/[.,:;!?]+$/, '') ||
    'Untitled Multi-Agent Task';

  return {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: derivedTitle,
    prompt: input.prompt.trim(),
    userContent: input.userContent,
    sourceUrls: input.sourceUrls,
    approvedTools: input.approvedTools,
    outputFormat: input.outputFormat,
    model: input.model ?? input.settings.defaultModel,
    thinkingLevel: input.thinkingLevel ?? input.settings.defaultThinkingLevel,
    status: 'draft',
    currentAgent: null,
    revisionCount: 0,
    maxRevisions: input.maxRevisions ?? input.settings.maxRevisions,
    createdAt: now,
    updatedAt: now,
    agents: createInitialAgents(),
    revisions: [],
    recoveryDecisions: [],
    logs: [
      {
        id: `log_${Date.now()}`,
        timestamp: now,
        agentRole: 'system',
        level: 'info',
        message: 'Task initialized and queued for multi-agent execution.',
      },
    ],
  };
}

export function computeTaskProgress(task: TaskRecord): number {
  if (task.status === 'approved' || task.status === 'awaiting_approval') {
    return 100;
  }
  let score = 0;
  for (const role of AGENT_ORDER) {
    const st = task.agents[role].status;
    if (st === 'completed') score += 20;
    else if (st === 'running') score += 10;
    else if (st === 'revision_requested') score += 16;
  }
  return Math.min(100, score);
}

export function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const mins = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${mins}m ${rem}s`;
}

export function getTaskTotalDurationMs(task: TaskRecord): number {
  return AGENT_ORDER.reduce((sum, role) => sum + (task.agents[role].durationMs ?? 0), 0);
}

export function getTaskTotalTokens(task: TaskRecord): number {
  return AGENT_ORDER.reduce(
    (sum, role) => sum + (task.agents[role].tokenUsage?.totalTokens ?? 0),
    0
  );
}

export function formatTimestamp(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeOnly(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function slugifyFilename(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'agentflow-report'
  );
}

export function exportReportAsJson(task: TaskRecord) {
  const payload = {
    exportedAt: new Date().toISOString(),
    taskId: task.id,
    title: task.finalReport?.title || task.title,
    status: task.status,
    publishedAt: task.publishedAt ?? null,
    humanApprovalNote: task.humanApprovalNote ?? null,
    model: task.model,
    thinkingLevel: task.thinkingLevel,
    outputFormat: task.outputFormat,
    approvedTools: task.approvedTools,
    revisionCount: task.revisionCount,
    report: task.finalReport ?? null,
    reviewerAudit: task.agents.reviewer.structuredData ?? null,
    revisions: task.revisions,
    metrics: {
      totalDurationMs: getTaskTotalDurationMs(task),
      totalTokens: getTaskTotalTokens(task),
    },
  };
  triggerDownload(
    `${slugifyFilename(payload.title)}.json`,
    JSON.stringify(payload, null, 2),
    'application/json;charset=utf-8'
  );
}

export function exportReportAsText(task: TaskRecord) {
  const report = task.finalReport;
  const lines: string[] = [];
  lines.push(report?.title || task.title);
  lines.push('='.repeat((report?.title || task.title).length));
  lines.push('');
  lines.push(`Status: ${task.status.replace('_', ' ').toUpperCase()}`);
  lines.push(`Model: ${task.model} | Format: ${OUTPUT_FORMAT_LABELS[task.outputFormat]}`);
  lines.push(`Revisions Performed: ${task.revisionCount}`);
  if (task.publishedAt) {
    lines.push(`Approved & Published: ${new Date(task.publishedAt).toISOString()}`);
  }
  if (task.humanApprovalNote) {
    lines.push(`Human Approval Note: ${task.humanApprovalNote}`);
  }
  lines.push('');
  lines.push('--- REPORT CONTENT ---');
  lines.push('');
  lines.push(report?.markdownBody || task.agents.writer.outputText || 'No report generated.');
  lines.push('');
  if (task.agents.reviewer.outputText) {
    lines.push('--- REVIEWER AUDIT ---');
    lines.push('');
    lines.push(task.agents.reviewer.outputText);
  }
  triggerDownload(
    `${slugifyFilename(report?.title || task.title)}.txt`,
    lines.join('\n'),
    'text/plain;charset=utf-8'
  );
}

export const TASK_STARTER_PRESETS: Array<{
  label: string;
  outputFormat: OutputFormat;
  prompt: string;
  userContent: string;
  approvedTools: ApprovedToolId[];
}> = [
  {
    label: 'SaaS Architecture Audit',
    outputFormat: 'technical_report',
    prompt:
      'Evaluate the following migration notes for moving a monolithic Node.js billing service to an event-driven architecture. Identify reliability bottlenecks, data consistency risks, and produce a phased migration report.',
    userContent: `Service: Core Billing & Invoicing API
Current Stack: Express monolith + PostgreSQL 15 + synchronous Stripe webhook handlers
Traffic: 420 req/sec peak, 1.8M invoices/month
Observed Pain Points:
- Webhook timeouts (504s) occur during end-of-month batch renewal spikes (~95,000 renewals in 40 mins).
- Duplicate invoice generation reported 14 times in Q3 due to retry storms without idempotency keys.
- Reporting queries lock the primary ledger table for 8-12 seconds during peak billing windows.
Constraints:
- Zero-downtime migration required; financial ledger must remain strongly consistent.
- Team size: 4 backend engineers, 1 SRE.`,
    approvedTools: ['source_metrics', 'fact_extractor'],
  },
  {
    label: 'AI Agent Market Brief',
    outputFormat: 'market_analysis',
    prompt:
      'Analyze the attached 2026 enterprise AI agent adoption brief, focusing on human-in-the-loop governance, auditability, and cost control.',
    userContent: `Enterprise AI Operations Benchmark Notes (2026):
- 68% of surveyed mid-market engineering teams require human sign-off before automated workflows publish external reports or mutate production data.
- Top adoption blockers: unpredictable token spend (54%), opaque multi-step failures without step-level retry (49%), and lack of citation/source audit trails (43%).
- Teams using bounded revision loops (max 2 automated review cycles) reduced manual editing time by 41% compared to single-pass generation.`,
    approvedTools: ['source_metrics', 'fact_extractor'],
  },
  {
    label: 'Product Launch Readiness',
    outputFormat: 'action_plan',
    prompt:
      'Synthesize our beta customer feedback notes below into a concrete 30-day pre-GA launch readiness plan with prioritized fixes, messaging updates, and risk mitigations.',
    userContent: `Beta Cohort Summary (28 Design Partners, 6 weeks):
1. Onboarding Drop-off: 36% of teams stalled at SSO / role mapping setup (avg time 45 mins).
2. Search Latency: p95 query latency hit 2.4s on workspaces exceeding 50k documents.
3. Top Requested Feature: Exportable compliance audit logs (requested by 19/28 accounts).
4. Praise: 91% rated the workflow visualizer and approval checkpoints as "very clear" or "essential".
Target GA Date: 30 days from today.`,
    approvedTools: ['source_metrics', 'fact_extractor'],
  },
];
