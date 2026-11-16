import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  AgentInputSnapshot,
  AgentRole,
  AnalysisEvaluation,
  AppSettings,
  ExecuteAgentPayload,
  ExecuteAgentResponse,
  ExecutionLogEntry,
  HandleFailureResponse,
  OrchestratorPlan,
  OrchestratorRecoveryDecision,
  PageId,
  ResearchDossier,
  ReviewerAssessment,
  TaskRecord,
  WriterDraft,
} from '../types/agentflow';
import {
  AGENT_META,
  AGENT_ORDER,
  DEFAULT_SETTINGS,
  createInitialAgents,
} from '../utils/taskHelpers';

const STORAGE_TASKS_KEY = 'agentflow_tasks_v1';
const STORAGE_SETTINGS_KEY = 'agentflow_settings_v1';
const STORAGE_ACTIVE_TASK_KEY = 'agentflow_active_task_v1';

interface ServerHealth {
  checked: boolean;
  ok: boolean;
  geminiConfigured: boolean;
  availableModels: string[];
  error?: string;
}

interface AgentFlowContextValue {
  tasks: TaskRecord[];
  activeTaskId: string | null;
  activeTask: TaskRecord | null;
  settings: AppSettings;
  currentPage: PageId;
  serverHealth: ServerHealth;
  setCurrentPage: (page: PageId) => void;
  setActiveTaskId: (id: string | null) => void;
  createTask: (task: TaskRecord) => void;
  deleteTask: (taskId: string) => void;
  clearAllHistory: () => void;
  updateSettings: (partial: Partial<AppSettings>) => void;
  resetSettings: () => void;
  runPipeline: (taskId: string, startFrom?: AgentRole) => Promise<void>;
  retryAgent: (taskId: string, role: AgentRole) => Promise<void>;
  cancelPipeline: (taskId: string) => void;
  approveAndPublish: (taskId: string, note?: string) => void;
  requestHumanRevision: (taskId: string, feedback: string) => Promise<void>;
  rejectTask: (taskId: string, note?: string) => void;
  refreshHealth: () => Promise<void>;
}

const AgentFlowContext = createContext<AgentFlowContextValue | null>(null);

function makeLog(
  agentRole: ExecutionLogEntry['agentRole'],
  level: ExecutionLogEntry['level'],
  message: string,
  detail?: string
): ExecutionLogEntry {
  return {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    agentRole,
    level,
    message,
    detail,
  };
}

function buildClientInputSnapshot(
  task: TaskRecord,
  role: AgentRole,
  humanFeedback?: string,
  orchestratorDirective?: string
): AgentInputSnapshot {
  const plan = task.agents.orchestrator.structuredData as OrchestratorPlan | undefined;
  const dossier = task.agents.research.structuredData as ResearchDossier | undefined;
  const analysis = task.agents.analysis.structuredData as AnalysisEvaluation | undefined;
  const writer = task.agents.writer.structuredData as WriterDraft | undefined;
  const reviewer = task.agents.reviewer.structuredData as ReviewerAssessment | undefined;

  switch (role) {
    case 'orchestrator':
      return {
        fromSources: ['user'],
        summary: `User task brief (${task.prompt.length} chars), ${task.userContent.trim().length} chars attached content, ${task.sourceUrls.length} URLs, ${task.approvedTools.length} approved tools.`,
        payload: {
          prompt: task.prompt,
          userContentLength: task.userContent.trim().length,
          sourceUrls: task.sourceUrls,
          approvedTools: task.approvedTools,
          outputFormat: task.outputFormat,
        },
      };
    case 'research':
      return {
        fromSources: ['orchestrator', 'user'],
        summary: `Orchestrator plan (${plan?.researchQuestions.length ?? 0} research questions) + user content + ${task.approvedTools.length} approved tools.`,
        payload: {
          orchestratorPlan: plan ?? null,
          sourceUrls: task.sourceUrls,
          approvedTools: task.approvedTools,
          userContentPreview: task.userContent.trim().slice(0, 500),
          ...(orchestratorDirective ? { orchestratorRecoveryDirective: orchestratorDirective } : {}),
        },
      };
    case 'analysis':
      return {
        fromSources: ['orchestrator', 'research'],
        summary: `Orchestrator criteria (${plan?.analysisCriteria.length ?? 0}) + Research structured dossier (${dossier?.questionsAnswered.length ?? 0} answered questions, ${task.agents.research.citations.length} citations).`,
        payload: {
          analysisCriteria: plan?.analysisCriteria ?? [],
          researchDossier: dossier ?? null,
          researchCitationsCount: task.agents.research.citations.length,
          ...(orchestratorDirective ? { orchestratorRecoveryDirective: orchestratorDirective } : {}),
        },
      };
    case 'writer':
      return {
        fromSources: reviewer
          ? ['orchestrator', 'research', 'analysis', 'reviewer']
          : ['orchestrator', 'research', 'analysis'],
        summary: `Orchestrator outline (${plan?.reportOutline.length ?? 0} sections) + Research dossier + Analysis evaluation${reviewer ? ` + Reviewer revision #${task.revisionCount}` : ''}.`,
        payload: {
          reportOutline: plan?.reportOutline ?? [],
          outputFormat: task.outputFormat,
          researchDossier: dossier ?? null,
          analysisEvaluation: analysis ?? null,
          revisionNumber: task.revisionCount,
          reviewerFeedback: reviewer ?? null,
          humanFeedback: humanFeedback ?? null,
          ...(orchestratorDirective ? { orchestratorRecoveryDirective: orchestratorDirective } : {}),
        },
      };
    case 'reviewer':
      return {
        fromSources: ['orchestrator', 'research', 'analysis', 'writer'],
        summary: `Orchestrator checklist (${plan?.reviewerChecklist.length ?? 0}) + Research dossier + Analysis evaluation + Writer draft ("${writer?.title ?? 'Untitled'}").`,
        payload: {
          reviewerChecklist: plan?.reviewerChecklist ?? [],
          researchDossier: dossier ?? null,
          analysisEvaluation: analysis ?? null,
          writerDraft: writer ?? null,
          revisionNumber: task.revisionCount,
          maxRevisions: task.maxRevisions,
          ...(orchestratorDirective ? { orchestratorRecoveryDirective: orchestratorDirective } : {}),
        },
      };
  }
}

function loadTasksFromStorage(): TaskRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_TASKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((t: TaskRecord) => {
      const normalized = {
        ...t,
        recoveryDecisions: Array.isArray(t.recoveryDecisions) ? t.recoveryDecisions : [],
      };
      if (normalized.status === 'running') {
        const updatedAgents = { ...normalized.agents };
        for (const role of AGENT_ORDER) {
          if (updatedAgents[role]?.status === 'running') {
            updatedAgents[role] = {
              ...updatedAgents[role],
              status: 'error',
              completedAt: new Date().toISOString(),
              error: {
                code: 'INTERRUPTED',
                message: 'Session reloaded while agent was running. Click Retry to resume.',
                retryable: true,
              },
            };
          }
        }
        return {
          ...normalized,
          status: 'failed' as const,
          currentAgent: null,
          agents: updatedAgents,
        };
      }
      return normalized;
    });
  } catch {
    return [];
  }
}

function loadSettingsFromStorage(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function AgentFlowProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<TaskRecord[]>(() => loadTasksFromStorage());
  const [settings, setSettings] = useState<AppSettings>(() => loadSettingsFromStorage());
  const [activeTaskId, setActiveTaskId] = useState<string | null>(() => {
    try {
      const savedId = localStorage.getItem(STORAGE_ACTIVE_TASK_KEY);
      if (savedId) return savedId;
    } catch {
      // ignore
    }
    return null;
  });
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [serverHealth, setServerHealth] = useState<ServerHealth>({
    checked: false,
    ok: true,
    geminiConfigured: true,
    availableModels: ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
  });

  const tasksRef = useRef<TaskRecord[]>(tasks);
  tasksRef.current = tasks;
  const abortControllersRef = useRef<Record<string, AbortController>>({});

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TASKS_KEY, JSON.stringify(tasks));
    } catch {
      // ignore
    }
  }, [tasks]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  useEffect(() => {
    try {
      if (activeTaskId) {
        localStorage.setItem(STORAGE_ACTIVE_TASK_KEY, activeTaskId);
      } else {
        localStorage.removeItem(STORAGE_ACTIVE_TASK_KEY);
      }
    } catch {
      // ignore
    }
  }, [activeTaskId]);

  useEffect(() => {
    if (activeTaskId && !tasks.some((t) => t.id === activeTaskId)) {
      setActiveTaskId(tasks[0]?.id ?? null);
    } else if (!activeTaskId && tasks.length > 0) {
      setActiveTaskId(tasks[0].id);
    }
  }, [activeTaskId, tasks]);

  const refreshHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error(`Health check failed (${res.status})`);
      const data = await res.json();
      setServerHealth({
        checked: true,
        ok: Boolean(data.ok),
        geminiConfigured: Boolean(data.geminiConfigured),
        availableModels: Array.isArray(data.availableModels)
          ? data.availableModels
          : ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
      });
    } catch (err) {
      setServerHealth({
        checked: true,
        ok: false,
        geminiConfigured: false,
        availableModels: [],
        error: (err as Error).message,
      });
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  const mutateTask = useCallback(
    (taskId: string, updater: (prev: TaskRecord) => TaskRecord): TaskRecord | null => {
      let updatedRecord: TaskRecord | null = null;
      setTasks((prevList) =>
        prevList.map((item) => {
          if (item.id !== taskId) return item;
          updatedRecord = updater(item);
          return updatedRecord;
        })
      );
      tasksRef.current = tasksRef.current.map((item) => {
        if (item.id !== taskId) return item;
        const next = updater(item);
        updatedRecord = next;
        return next;
      });
      return updatedRecord;
    },
    []
  );

  const createTask = useCallback((task: TaskRecord) => {
    setTasks((prev) => [task, ...prev]);
    tasksRef.current = [task, ...tasksRef.current];
    setActiveTaskId(task.id);
  }, []);

  const deleteTask = useCallback((taskId: string) => {
    abortControllersRef.current[taskId]?.abort();
    delete abortControllersRef.current[taskId];
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const clearAllHistory = useCallback(() => {
    Object.values(abortControllersRef.current).forEach((ctrl) => ctrl.abort());
    abortControllersRef.current = {};
    setTasks([]);
    setActiveTaskId(null);
  }, []);

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const invokeServerAgent = useCallback(
    async (
      task: TaskRecord,
      role: AgentRole,
      signal: AbortSignal,
      humanFeedback?: string,
      orchestratorDirective?: string
    ): Promise<ExecuteAgentResponse> => {
      const payload: ExecuteAgentPayload = {
        role,
        taskId: task.id,
        prompt: task.prompt,
        userContent: task.userContent,
        sourceUrls: task.sourceUrls,
        approvedTools: task.approvedTools,
        outputFormat: task.outputFormat,
        model: task.model,
        thinkingLevel: task.thinkingLevel,
        revisionNumber: task.revisionCount,
        maxRevisions: task.maxRevisions,
        humanFeedback,
        orchestratorDirective,
        previousOutputs: {
          orchestrator: task.agents.orchestrator.structuredData as
            | OrchestratorPlan
            | undefined,
          research:
            task.agents.research.outputText
              ? {
                  text: task.agents.research.outputText,
                  dossier: task.agents.research.structuredData as
                    | ResearchDossier
                    | undefined,
                  citations: task.agents.research.citations,
                  toolsInvoked: task.agents.research.toolsInvoked,
                }
              : undefined,
          analysis: task.agents.analysis.structuredData as
            | AnalysisEvaluation
            | undefined,
          writer: task.agents.writer.structuredData as WriterDraft | undefined,
          reviewer: task.agents.reviewer.structuredData as
            | ReviewerAssessment
            | undefined,
        },
      };

      const res = await fetch('/api/agents/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });

      return (await res.json()) as ExecuteAgentResponse;
    },
    []
  );

  const invokeOrchestratorFailureHandler = useCallback(
    async (
      task: TaskRecord,
      failedRole: AgentRole,
      errorCode: string,
      errorMessage: string,
      attempt: number,
      signal: AbortSignal
    ): Promise<HandleFailureResponse> => {
      try {
        const res = await fetch('/api/orchestrator/handle-failure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: task.id,
            failedRole,
            errorCode,
            errorMessage,
            attempt,
            model: task.model,
            orchestratorPlan: task.agents.orchestrator.structuredData,
          }),
          signal,
        });
        return (await res.json()) as HandleFailureResponse;
      } catch {
        return {
          ok: true,
          action: 'PAUSE_FOR_OPERATOR',
          rationale: `Orchestrator paused workflow after ${failedRole} error (${errorCode}). Upstream outputs are preserved for manual retry.`,
        };
      }
    },
    []
  );

  const executeSingleStep = useCallback(
    async (
      taskId: string,
      role: AgentRole,
      signal: AbortSignal,
      humanFeedback?: string,
      orchestratorDirective?: string
    ): Promise<{ ok: boolean; response?: ExecuteAgentResponse; task?: TaskRecord }> => {
      const currentTask = tasksRef.current.find((t) => t.id === taskId);
      if (!currentTask) return { ok: false };

      const startedAt = new Date().toISOString();
      const preSnapshot = buildClientInputSnapshot(
        currentTask,
        role,
        humanFeedback,
        orchestratorDirective
      );

      mutateTask(taskId, (prev) => ({
        ...prev,
        status: 'running',
        currentAgent: role,
        updatedAt: startedAt,
        agents: {
          ...prev.agents,
          [role]: {
            ...prev.agents[role],
            status: 'running',
            attempt: prev.agents[role].attempt + 1,
            startedAt,
            completedAt: undefined,
            orchestratorDirective,
            inputSnapshot: preSnapshot,
            error: undefined,
          },
        },
        logs: [
          ...prev.logs,
          ...(role !== 'orchestrator'
            ? [
                makeLog(
                  'orchestrator',
                  'info',
                  `Dispatching ${AGENT_META[role].shortLabel} Agent with upstream structured handoff.`,
                  preSnapshot.summary
                ),
              ]
            : []),
          makeLog(
            role,
            'info',
            `Starting ${AGENT_META[role].label} (attempt ${prev.agents[role].attempt + 1}).`
          ),
        ],
      }));

      let response: ExecuteAgentResponse;
      try {
        const freshTask = tasksRef.current.find((t) => t.id === taskId)!;
        response = await invokeServerAgent(
          freshTask,
          role,
          signal,
          humanFeedback,
          orchestratorDirective
        );
      } catch (err) {
        const endedAt = new Date().toISOString();
        if ((err as Error).name === 'AbortError') {
          mutateTask(taskId, (prev) => ({
            ...prev,
            status: 'failed',
            currentAgent: null,
            updatedAt: endedAt,
            agents: {
              ...prev.agents,
              [role]: {
                ...prev.agents[role],
                status: 'error',
                completedAt: endedAt,
                error: {
                  code: 'CANCELLED',
                  message: 'Execution cancelled by operator.',
                  retryable: true,
                },
              },
            },
            logs: [
              ...prev.logs,
              makeLog(role, 'warning', `${AGENT_META[role].label} cancelled by operator.`),
            ],
          }));
          return { ok: false };
        }
        const netMsg = (err as Error).message || 'Network request failed.';
        mutateTask(taskId, (prev) => ({
          ...prev,
          status: 'failed',
          currentAgent: null,
          updatedAt: endedAt,
          agents: {
            ...prev.agents,
            [role]: {
              ...prev.agents[role],
              status: 'error',
              completedAt: endedAt,
              error: {
                code: 'NETWORK_ERROR',
                message: netMsg,
                retryable: true,
              },
            },
          },
          logs: [
            ...prev.logs,
            makeLog(role, 'error', `${AGENT_META[role].label} network error: ${netMsg}`),
          ],
        }));
        return { ok: false };
      }

      const completedAt = new Date().toISOString();
      const serverLogs = (response.logs || []).map((l) =>
        makeLog(role, l.level, l.message, l.detail)
      );

      if (!response.ok) {
        mutateTask(taskId, (prev) => ({
          ...prev,
          status: 'failed',
          currentAgent: null,
          updatedAt: completedAt,
          agents: {
            ...prev.agents,
            [role]: {
              ...prev.agents[role],
              status: 'error',
              completedAt,
              durationMs: response.durationMs,
              modelUsed: response.modelUsed,
              inputSnapshot: response.inputSnapshot ?? prev.agents[role].inputSnapshot,
              error: response.error ?? {
                code: 'AGENT_ERROR',
                message: 'Agent execution failed.',
                retryable: true,
              },
            },
          },
          logs: [...prev.logs, ...serverLogs],
        }));
        return { ok: false, response };
      }

      const maybeOrchestratorTitle =
        role === 'orchestrator' &&
        (response.structuredData as unknown as OrchestratorPlan | undefined)?.taskTitle;

      const updated = mutateTask(taskId, (prev) => {
        const isReviewerRevision =
          role === 'reviewer' &&
          (response.structuredData as unknown as ReviewerAssessment | undefined)
            ?.verdict === 'REVISION_REQUESTED' &&
          prev.revisionCount < prev.maxRevisions;

        return {
          ...prev,
          title: maybeOrchestratorTitle ? maybeOrchestratorTitle : prev.title,
          updatedAt: completedAt,
          agents: {
            ...prev.agents,
            [role]: {
              ...prev.agents[role],
              status: isReviewerRevision ? 'revision_requested' : 'completed',
              completedAt,
              durationMs: response.durationMs,
              modelUsed: response.modelUsed,
              tokenUsage: response.tokenUsage,
              toolsInvoked: response.toolsInvoked ?? [],
              citations: response.citations ?? [],
              inputSnapshot: response.inputSnapshot ?? prev.agents[role].inputSnapshot,
              outputText: response.outputText,
              structuredData: response.structuredData,
              error: undefined,
            },
          },
          logs: [...prev.logs, ...serverLogs],
        };
      });

      return { ok: true, response, task: updated ?? undefined };
    },
    [invokeServerAgent, mutateTask]
  );

  // Orchestrator-managed step runner with automatic failure evaluation & recovery
  const runStepManagedByOrchestrator = useCallback(
    async (
      taskId: string,
      role: AgentRole,
      signal: AbortSignal,
      humanFeedback?: string
    ): Promise<{ ok: boolean; response?: ExecuteAgentResponse; task?: TaskRecord }> => {
      const firstResult = await executeSingleStep(taskId, role, signal, humanFeedback);
      if (firstResult.ok || signal.aborted) {
        return firstResult;
      }

      const taskSnapshot = tasksRef.current.find((t) => t.id === taskId);
      const errInfo = taskSnapshot?.agents[role].error;
      if (!taskSnapshot || !errInfo || errInfo.code === 'CANCELLED') {
        return firstResult;
      }

      // Ask Orchestrator to evaluate the failure and decide recovery action
      const recovery = await invokeOrchestratorFailureHandler(
        taskSnapshot,
        role,
        errInfo.code,
        errInfo.message,
        taskSnapshot.agents[role].attempt,
        signal
      );

      const decisionRecord: OrchestratorRecoveryDecision = {
        failedRole: role,
        errorCode: errInfo.code,
        action: recovery.action,
        rationale: recovery.rationale,
        adjustedDirective: recovery.adjustedDirective,
        timestamp: new Date().toISOString(),
      };

      mutateTask(taskId, (prev) => ({
        ...prev,
        recoveryDecisions: [...prev.recoveryDecisions, decisionRecord],
        logs: [
          ...prev.logs,
          makeLog(
            'orchestrator',
            recovery.action === 'RETRY_WITH_ADJUSTMENT' ? 'warning' : 'error',
            `Orchestrator failure handler (${role}): ${recovery.action}`,
            recovery.rationale
          ),
        ],
      }));

      if (recovery.action === 'RETRY_WITH_ADJUSTMENT' && !signal.aborted) {
        return await executeSingleStep(
          taskId,
          role,
          signal,
          humanFeedback,
          recovery.adjustedDirective
        );
      }

      return firstResult;
    },
    [executeSingleStep, invokeOrchestratorFailureHandler, mutateTask]
  );

  const finalizeAwaitingApproval = useCallback(
    (taskId: string) => {
      const now = new Date().toISOString();
      mutateTask(taskId, (prev) => {
        const draft = prev.agents.writer.structuredData as WriterDraft | undefined;
        const citations = prev.agents.research.citations ?? [];
        return {
          ...prev,
          status: 'awaiting_approval',
          currentAgent: null,
          completedAt: now,
          updatedAt: now,
          finalReport: draft
            ? {
                title: draft.title,
                executiveSummary: draft.executiveSummary,
                markdownBody: prev.agents.writer.outputText,
                sections: draft.sections,
                recommendations: draft.recommendations,
                methodologyNote: draft.methodologyNote,
                sources: citations,
                generatedAt: now,
              }
            : {
                title: prev.title,
                executiveSummary: prev.agents.writer.outputText.slice(0, 320),
                markdownBody: prev.agents.writer.outputText,
                sections: [],
                recommendations: [],
                methodologyNote: '',
                sources: citations,
                generatedAt: now,
              },
          logs: [
            ...prev.logs,
            makeLog(
              'orchestrator',
              'success',
              'Orchestrator finalized multi-agent sequence. Report is ready for human publishing approval.'
            ),
          ],
        };
      });
    },
    [mutateTask]
  );

  const runPipeline = useCallback(
    async (taskId: string, startFrom: AgentRole = 'orchestrator') => {
      const existing = tasksRef.current.find((t) => t.id === taskId);
      if (!existing) return;

      abortControllersRef.current[taskId]?.abort();
      const controller = new AbortController();
      abortControllersRef.current[taskId] = controller;

      const startIndex = AGENT_ORDER.indexOf(startFrom);
      const freshAgents = createInitialAgents();

      mutateTask(taskId, (prev) => {
        const nextAgents = { ...prev.agents };
        for (let i = startIndex; i < AGENT_ORDER.length; i++) {
          const r = AGENT_ORDER[i];
          nextAgents[r] = {
            ...freshAgents[r],
            status: 'queued',
          };
        }
        return {
          ...prev,
          status: 'running',
          currentAgent: startFrom,
          updatedAt: new Date().toISOString(),
          ...(startFrom === 'orchestrator'
            ? { revisionCount: 0, revisions: [], recoveryDecisions: [], finalReport: undefined }
            : startFrom !== 'reviewer'
              ? { revisionCount: 0 }
              : {}),
          agents: nextAgents,
          logs: [
            ...prev.logs,
            makeLog(
              'orchestrator',
              'info',
              startFrom === 'orchestrator'
                ? 'Orchestrator initialized sequential 5-agent workflow.'
                : `Orchestrator resuming sequential workflow from ${AGENT_META[startFrom].label}.`
            ),
          ],
        };
      });

      for (let i = startIndex; i < AGENT_ORDER.length - 1; i++) {
        if (controller.signal.aborted) return;
        const role = AGENT_ORDER[i];
        const res = await runStepManagedByOrchestrator(taskId, role, controller.signal);
        if (!res.ok) return;
      }

      while (!controller.signal.aborted) {
        const reviewRes = await runStepManagedByOrchestrator(
          taskId,
          'reviewer',
          controller.signal
        );
        if (!reviewRes.ok) return;

        const latestTask = tasksRef.current.find((t) => t.id === taskId);
        if (!latestTask) return;

        const assessment = reviewRes.response?.structuredData as
          | ReviewerAssessment
          | undefined;
        const writerDraft = latestTask.agents.writer.structuredData as
          | WriterDraft
          | undefined;

        if (writerDraft && assessment) {
          mutateTask(taskId, (prev) => ({
            ...prev,
            revisions: [
              ...prev.revisions,
              {
                revisionNumber: prev.revisionCount,
                writerDraft,
                writerMarkdown: prev.agents.writer.outputText,
                reviewerVerdict: assessment.verdict,
                reviewerSummary: assessment.summary,
                reviewerInstructions: assessment.revisionInstructions,
                issues: assessment.issues,
                timestamp: new Date().toISOString(),
              },
            ],
          }));
        }

        const needsRevision =
          assessment?.verdict === 'REVISION_REQUESTED' &&
          latestTask.revisionCount < latestTask.maxRevisions;

        if (!needsRevision) {
          if (
            assessment?.verdict === 'REVISION_REQUESTED' &&
            latestTask.revisionCount >= latestTask.maxRevisions
          ) {
            mutateTask(taskId, (prev) => ({
              ...prev,
              logs: [
                ...prev.logs,
                makeLog(
                  'orchestrator',
                  'warning',
                  `Maximum automatic revisions (${prev.maxRevisions}) reached. Orchestrator escalating draft and reviewer notes to human approval.`
                ),
              ],
            }));
          }
          finalizeAwaitingApproval(taskId);
          return;
        }

        const nextRev = latestTask.revisionCount + 1;
        mutateTask(taskId, (prev) => ({
          ...prev,
          revisionCount: nextRev,
          agents: {
            ...prev.agents,
            writer: { ...prev.agents.writer, status: 'queued' },
            reviewer: { ...prev.agents.reviewer, status: 'queued' },
          },
          logs: [
            ...prev.logs,
            makeLog(
              'orchestrator',
              'warning',
              `Orchestrator routing Reviewer feedback back to Writer Agent (Revision #${nextRev} of ${prev.maxRevisions}).`
            ),
          ],
        }));

        const writerRes = await runStepManagedByOrchestrator(
          taskId,
          'writer',
          controller.signal
        );
        if (!writerRes.ok) return;
      }
    },
    [finalizeAwaitingApproval, mutateTask, runStepManagedByOrchestrator]
  );

  const retryAgent = useCallback(
    async (taskId: string, role: AgentRole) => {
      await runPipeline(taskId, role);
    },
    [runPipeline]
  );

  const cancelPipeline = useCallback((taskId: string) => {
    abortControllersRef.current[taskId]?.abort();
    delete abortControllersRef.current[taskId];
  }, []);

  const approveAndPublish = useCallback(
    (taskId: string, note?: string) => {
      const now = new Date().toISOString();
      mutateTask(taskId, (prev) => ({
        ...prev,
        status: 'approved',
        publishedAt: now,
        updatedAt: now,
        humanApprovalNote: note?.trim() || undefined,
        logs: [
          ...prev.logs,
          makeLog(
            'human',
            'success',
            'Human reviewer approved and published the final report.',
            note?.trim() || undefined
          ),
        ],
      }));
    },
    [mutateTask]
  );

  const requestHumanRevision = useCallback(
    async (taskId: string, feedback: string) => {
      const existing = tasksRef.current.find((t) => t.id === taskId);
      if (!existing || !feedback.trim()) return;

      abortControllersRef.current[taskId]?.abort();
      const controller = new AbortController();
      abortControllersRef.current[taskId] = controller;

      mutateTask(taskId, (prev) => ({
        ...prev,
        status: 'running',
        revisionCount: prev.revisionCount + 1,
        updatedAt: new Date().toISOString(),
        agents: {
          ...prev.agents,
          writer: { ...prev.agents.writer, status: 'queued' },
          reviewer: { ...prev.agents.reviewer, status: 'queued' },
        },
        logs: [
          ...prev.logs,
          makeLog(
            'human',
            'warning',
            'Human reviewer requested targeted revision before publishing.',
            feedback.trim()
          ),
        ],
      }));

      const writerRes = await runStepManagedByOrchestrator(
        taskId,
        'writer',
        controller.signal,
        feedback.trim()
      );
      if (!writerRes.ok) return;

      const reviewRes = await runStepManagedByOrchestrator(
        taskId,
        'reviewer',
        controller.signal
      );
      if (!reviewRes.ok) return;

      const latestTask = tasksRef.current.find((t) => t.id === taskId);
      const assessment = reviewRes.response?.structuredData as
        | ReviewerAssessment
        | undefined;
      const writerDraft = latestTask?.agents.writer.structuredData as
        | WriterDraft
        | undefined;
      if (latestTask && writerDraft && assessment) {
        mutateTask(taskId, (prev) => ({
          ...prev,
          revisions: [
            ...prev.revisions,
            {
              revisionNumber: prev.revisionCount,
              writerDraft,
              writerMarkdown: prev.agents.writer.outputText,
              reviewerVerdict: assessment.verdict,
              reviewerSummary: assessment.summary,
              reviewerInstructions: assessment.revisionInstructions,
              issues: assessment.issues,
              timestamp: new Date().toISOString(),
            },
          ],
        }));
      }
      finalizeAwaitingApproval(taskId);
    },
    [finalizeAwaitingApproval, mutateTask, runStepManagedByOrchestrator]
  );

  const rejectTask = useCallback(
    (taskId: string, note?: string) => {
      const now = new Date().toISOString();
      mutateTask(taskId, (prev) => ({
        ...prev,
        status: 'rejected',
        updatedAt: now,
        humanApprovalNote: note?.trim() || undefined,
        logs: [
          ...prev.logs,
          makeLog(
            'human',
            'error',
            'Human reviewer rejected publishing for this report.',
            note?.trim() || undefined
          ),
        ],
      }));
    },
    [mutateTask]
  );

  const activeTask = tasks.find((t) => t.id === activeTaskId) ?? null;

  return (
    <AgentFlowContext.Provider
      value={{
        tasks,
        activeTaskId,
        activeTask,
        settings,
        currentPage,
        serverHealth,
        setCurrentPage,
        setActiveTaskId,
        createTask,
        deleteTask,
        clearAllHistory,
        updateSettings,
        resetSettings,
        runPipeline,
        retryAgent,
        cancelPipeline,
        approveAndPublish,
        requestHumanRevision,
        rejectTask,
        refreshHealth,
      }}
    >
      {children}
    </AgentFlowContext.Provider>
  );
}

export function useAgentFlow() {
  const ctx = useContext(AgentFlowContext);
  if (!ctx) {
    throw new Error('useAgentFlow must be used inside AgentFlowProvider');
  }
  return ctx;
}
