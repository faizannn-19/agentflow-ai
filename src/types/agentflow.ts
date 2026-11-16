export type AgentRole =
  | 'orchestrator'
  | 'research'
  | 'analysis'
  | 'writer'
  | 'reviewer';

export type AgentStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'completed'
  | 'revision_requested'
  | 'error';

export type ApprovedToolId =
  | 'google_search'
  | 'url_context'
  | 'source_metrics'
  | 'fact_extractor';

export type ModelId = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';

export type ThinkingDepth = 'LOW' | 'MEDIUM' | 'HIGH';

export type OutputFormat =
  | 'executive_brief'
  | 'technical_report'
  | 'market_analysis'
  | 'action_plan';

export type TaskStatus =
  | 'draft'
  | 'running'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'failed';

export type PageId =
  | 'dashboard'
  | 'new-task'
  | 'workspace'
  | 'visualizer'
  | 'reports'
  | 'history'
  | 'settings';

export interface ExecutionLogEntry {
  id: string;
  timestamp: string;
  agentRole: AgentRole | 'system' | 'human';
  level: 'info' | 'tool' | 'warning' | 'error' | 'success';
  message: string;
  detail?: string;
}

export interface CitationItem {
  title: string;
  uri: string;
}

export interface TokenUsage {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AgentErrorInfo {
  code: string;
  message: string;
  retryable: boolean;
}

export interface AgentInputSnapshot {
  fromSources: Array<AgentRole | 'user'>;
  summary: string;
  payload: Record<string, unknown>;
}

export interface OrchestratorPlan {
  taskTitle: string;
  taskSummary: string;
  objectives: string[];
  researchQuestions: string[];
  analysisCriteria: string[];
  reportOutline: Array<{
    sectionTitle: string;
    purpose: string;
  }>;
  reviewerChecklist: string[];
  recommendedApproach: string;
}

export interface ResearchDossier {
  executiveOverview: string;
  questionsAnswered: Array<{
    question: string;
    findings: string;
    confidence: 'high' | 'medium' | 'low';
    sourcesUsed: string[];
  }>;
  keyFacts: Array<{
    fact: string;
    source: string;
  }>;
  evidenceGaps: string[];
  sourceMetricsSummary: string;
}

export interface AnalysisEvaluation {
  executiveSynthesis: string;
  keyFindings: Array<{
    finding: string;
    evidence: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
  patternsAndThemes: string[];
  gapsAndRisks: Array<{
    risk: string;
    severity: 'high' | 'medium' | 'low';
    mitigation: string;
  }>;
  strategicImplications: string[];
  dataCompletenessNote: string;
}

export interface WriterDraft {
  title: string;
  executiveSummary: string;
  sections: Array<{
    heading: string;
    content: string;
  }>;
  recommendations: string[];
  methodologyNote: string;
}

export interface ReviewerIssue {
  severity: 'critical' | 'moderate' | 'minor';
  section: string;
  description: string;
}

export interface ReviewerAssessment {
  verdict: 'APPROVED' | 'REVISION_REQUESTED';
  completenessCheck: { passed: boolean; notes: string };
  consistencyCheck: { passed: boolean; notes: string };
  groundingCheck: { passed: boolean; notes: string };
  issues: ReviewerIssue[];
  revisionInstructions: string;
  summary: string;
}

export interface OrchestratorRecoveryDecision {
  failedRole: AgentRole;
  errorCode: string;
  action: 'RETRY_WITH_ADJUSTMENT' | 'PAUSE_FOR_OPERATOR';
  rationale: string;
  adjustedDirective?: string;
  timestamp: string;
}

export interface AgentStepState {
  role: AgentRole;
  label: string;
  description: string;
  status: AgentStatus;
  attempt: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  modelUsed?: string;
  tokenUsage?: TokenUsage;
  toolsInvoked: string[];
  citations: CitationItem[];
  orchestratorDirective?: string;
  inputSnapshot?: AgentInputSnapshot;
  outputText: string;
  structuredData?: Record<string, unknown>;
  error?: AgentErrorInfo;
}

export interface RevisionRecord {
  revisionNumber: number;
  writerDraft: WriterDraft;
  writerMarkdown: string;
  reviewerVerdict: 'APPROVED' | 'REVISION_REQUESTED';
  reviewerSummary: string;
  reviewerInstructions: string;
  issues: ReviewerIssue[];
  timestamp: string;
}

export interface FinalReport {
  title: string;
  executiveSummary: string;
  markdownBody: string;
  sections: Array<{ heading: string; content: string }>;
  recommendations: string[];
  methodologyNote: string;
  sources: CitationItem[];
  generatedAt: string;
}

export interface TaskRecord {
  id: string;
  title: string;
  prompt: string;
  userContent: string;
  sourceUrls: string[];
  approvedTools: ApprovedToolId[];
  outputFormat: OutputFormat;
  model: ModelId;
  thinkingLevel: ThinkingDepth;
  status: TaskStatus;
  currentAgent: AgentRole | null;
  revisionCount: number;
  maxRevisions: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  publishedAt?: string;
  humanApprovalNote?: string;
  agents: Record<AgentRole, AgentStepState>;
  revisions: RevisionRecord[];
  recoveryDecisions: OrchestratorRecoveryDecision[];
  logs: ExecutionLogEntry[];
  finalReport?: FinalReport;
}

export interface AppSettings {
  defaultModel: ModelId;
  defaultThinkingLevel: ThinkingDepth;
  defaultApprovedTools: ApprovedToolId[];
  maxRevisions: 0 | 1 | 2;
  operatorName: string;
  workspaceName: string;
}

export interface ExecuteAgentPayload {
  role: AgentRole;
  taskId: string;
  prompt: string;
  userContent: string;
  sourceUrls: string[];
  approvedTools: ApprovedToolId[];
  outputFormat: OutputFormat;
  model: ModelId;
  thinkingLevel: ThinkingDepth;
  revisionNumber: number;
  maxRevisions: number;
  humanFeedback?: string;
  orchestratorDirective?: string;
  previousOutputs: {
    orchestrator?: OrchestratorPlan;
    research?: {
      text: string;
      dossier?: ResearchDossier;
      citations: CitationItem[];
      toolsInvoked: string[];
    };
    analysis?: AnalysisEvaluation;
    writer?: WriterDraft;
    reviewer?: ReviewerAssessment;
  };
}

export interface ExecuteAgentResponse {
  ok: boolean;
  role: AgentRole;
  inputSnapshot?: AgentInputSnapshot;
  outputText: string;
  structuredData?: Record<string, unknown>;
  toolsInvoked: string[];
  citations: CitationItem[];
  tokenUsage?: TokenUsage;
  durationMs: number;
  modelUsed: string;
  logs: Array<{
    level: 'info' | 'tool' | 'warning' | 'error' | 'success';
    message: string;
    detail?: string;
  }>;
  error?: AgentErrorInfo;
}

export interface HandleFailurePayload {
  taskId: string;
  failedRole: AgentRole;
  errorCode: string;
  errorMessage: string;
  attempt: number;
  model: ModelId;
  orchestratorPlan?: OrchestratorPlan;
}

export interface HandleFailureResponse {
  ok: boolean;
  action: 'RETRY_WITH_ADJUSTMENT' | 'PAUSE_FOR_OPERATOR';
  rationale: string;
  adjustedDirective?: string;
}
