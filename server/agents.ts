import {
  GoogleGenAI,
  ThinkingLevel,
  Type,
  type Content,
  type FunctionDeclaration,
  type GenerateContentResponse,
  type Tool,
} from '@google/genai';
import type {
  AgentInputSnapshot,
  AnalysisEvaluation,
  ApprovedToolId,
  CitationItem,
  ExecuteAgentPayload,
  ExecuteAgentResponse,
  HandleFailurePayload,
  HandleFailureResponse,
  OrchestratorPlan,
  OutputFormat,
  ResearchDossier,
  ReviewerAssessment,
  TokenUsage,
  WriterDraft,
} from '../src/types/agentflow.ts';

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const err = new Error(
      'GEMINI_API_KEY is not configured. Open Settings > Secrets in AI Studio to attach a valid Gemini API key.'
    ) as Error & { code?: string; retryable?: boolean; status?: number };
    err.code = 'API_KEY_MISSING';
    err.retryable = false;
    err.status = 400;
    throw err;
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function toThinkingLevel(depth: ExecuteAgentPayload['thinkingLevel']): ThinkingLevel {
  switch (depth) {
    case 'LOW':
      return ThinkingLevel.LOW;
    case 'MEDIUM':
      return ThinkingLevel.MEDIUM;
    case 'HIGH':
    default:
      return ThinkingLevel.HIGH;
  }
}

function extractUsage(res: GenerateContentResponse): TokenUsage | undefined {
  const meta = res.usageMetadata;
  if (!meta) return undefined;
  return {
    promptTokens: meta.promptTokenCount ?? 0,
    outputTokens: meta.candidatesTokenCount ?? 0,
    totalTokens: meta.totalTokenCount ?? 0,
  };
}

function extractCitations(res: GenerateContentResponse): CitationItem[] {
  const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const seen = new Set<string>();
  const citations: CitationItem[] = [];
  for (const chunk of chunks) {
    const web = (chunk as { web?: { uri?: string; title?: string } }).web;
    if (web?.uri && !seen.has(web.uri)) {
      seen.add(web.uri);
      citations.push({
        title: web.title?.trim() || web.uri,
        uri: web.uri,
      });
    }
  }
  return citations;
}

function safeJsonParse<T>(raw: string | undefined, contextLabel: string): T {
  const text = (raw ?? '').trim();
  if (!text) {
    throw new Error(`${contextLabel} returned an empty response.`);
  }
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch (parseErr) {
    throw new Error(
      `${contextLabel} produced malformed JSON output: ${(parseErr as Error).message}`
    );
  }
}

function classifyGeminiError(err: unknown): {
  status: number;
  code: string;
  message: string;
  retryable: boolean;
} {
  const e = err as {
    status?: number;
    code?: string;
    message?: string;
  };
  const msg = e?.message || 'Unexpected error calling Gemini API.';
  const lower = msg.toLowerCase();

  if (e?.code === 'API_KEY_MISSING') {
    return {
      status: 400,
      code: 'API_KEY_MISSING',
      message: msg,
      retryable: false,
    };
  }
  if (
    e?.status === 403 ||
    lower.includes('permission_denied') ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid')
  ) {
    return {
      status: 403,
      code: 'API_KEY_INVALID',
      message:
        'Gemini API rejected the key (PERMISSION_DENIED / API_KEY_INVALID). Check your GEMINI_API_KEY in Settings > Secrets.',
      retryable: false,
    };
  }
  if (e?.status === 404 || lower.includes('not_found')) {
    return {
      status: 404,
      code: 'MODEL_NOT_FOUND',
      message:
        'Requested Gemini model was not found or is unsupported. Switch model in Settings or task config.',
      retryable: false,
    };
  }
  if (e?.status === 429 || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return {
      status: 429,
      code: 'RATE_LIMITED',
      message:
        'Gemini API rate limit or quota reached (429 RESOURCE_EXHAUSTED). Wait a moment and click Retry.',
      retryable: true,
    };
  }
  if (e?.status === 400) {
    return {
      status: 400,
      code: 'BAD_REQUEST',
      message: msg,
      retryable: false,
    };
  }
  return {
    status: 502,
    code: 'UPSTREAM_ERROR',
    message: msg,
    retryable: true,
  };
}

async function withBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 2
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const classified = classifyGeminiError(err);
      if (!classified.retryable || attempt === maxRetries) {
        throw err;
      }
      const delayMs = 800 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function executeAnalyzeSourceMetrics(userContent: string) {
  const trimmed = userContent.trim();
  if (!trimmed) {
    return {
      hasUserContent: false,
      note: 'No user-provided text content was attached to this task.',
    };
  }
  const lines = trimmed.split(/\r?\n/);
  const words = trimmed.split(/\s+/).filter(Boolean);
  const numericMatches = trimmed.match(/[$€£]?\d+(?:[.,]\d+)?%?/g) ?? [];
  const urlMatches = trimmed.match(/https?:\/\/[^\s)>\]]+/g) ?? [];

  const stopWords = new Set([
    'about', 'above', 'after', 'again', 'against', 'between', 'could',
    'every', 'first', 'found', 'great', 'other', 'should', 'since',
    'still', 'their', 'there', 'these', 'thing', 'think', 'those',
    'through', 'under', 'using', 'where', 'which', 'while', 'would',
  ]);
  const freq = new Map<string, number>();
  for (const w of words) {
    const clean = w.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (clean.length > 4 && !stopWords.has(clean)) {
      freq.set(clean, (freq.get(clean) ?? 0) + 1);
    }
  }
  const topTerms = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([term, count]) => ({ term, count }));

  return {
    hasUserContent: true,
    characterCount: trimmed.length,
    wordCount: words.length,
    lineCount: lines.length,
    numericFiguresSample: numericMatches.slice(0, 25),
    totalNumericFiguresFound: numericMatches.length,
    detectedUrls: [...new Set(urlMatches)].slice(0, 15),
    topRecurringTerms: topTerms,
  };
}

function executeSearchUserContent(userContent: string, keywords: string[]) {
  const trimmed = userContent.trim();
  if (!trimmed) {
    return {
      matches: [],
      note: 'No user-provided source content is available to search.',
    };
  }
  const lines = trimmed.split(/\r?\n/);
  const normalizedKeywords = keywords
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10);

  const matches: Array<{ lineNumber: number; matchedKeyword: string; excerpt: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    for (const kw of normalizedKeywords) {
      if (lower.includes(kw)) {
        matches.push({
          lineNumber: i + 1,
          matchedKeyword: kw,
          excerpt: line.slice(0, 320),
        });
        break;
      }
    }
    if (matches.length >= 20) break;
  }
  return {
    searchedKeywords: normalizedKeywords,
    matchCount: matches.length,
    matches,
  };
}

const analyzeSourceMetricsDecl: FunctionDeclaration = {
  name: 'analyze_source_metrics',
  description:
    'Inspects the user-provided source text and returns exact counts (words, lines, characters), extracted numeric figures/percentages, detected URLs, and top recurring terms.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      reason: {
        type: Type.STRING,
        description: 'Brief explanation of why metrics are being extracted.',
      },
    },
    required: ['reason'],
  },
};

const searchUserContentDecl: FunctionDeclaration = {
  name: 'search_user_content',
  description:
    'Searches the user-provided source text for exact lines and excerpts containing specific keywords or phrases.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      keywords: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'List of up to 10 keywords or short phrases to locate in the user content.',
      },
    },
    required: ['keywords'],
  },
};

function formatOutputStyleGuide(format: OutputFormat): string {
  switch (format) {
    case 'executive_brief':
      return 'Concise, decision-oriented Executive Brief with crisp bulleted takeaways, strategic impact, and prioritized next steps.';
    case 'technical_report':
      return 'Rigorous Technical Report with architectural precision, methodology, evidence attribution, trade-offs, and implementation specifics.';
    case 'market_analysis':
      return 'Structured Market & Competitive Analysis covering landscape dynamics, quantitative signals, risks, and strategic positioning.';
    case 'action_plan':
      return 'Operational Action Plan with phased milestones, owners/roles, dependencies, risk mitigations, and measurable checkpoints.';
  }
}

function buildMarkdownFromWriterDraft(draft: WriterDraft, citations: CitationItem[]): string {
  const parts: string[] = [];
  parts.push(`# ${draft.title}`);
  parts.push('');
  parts.push('## Executive Summary');
  parts.push(draft.executiveSummary);
  parts.push('');
  for (const sec of draft.sections) {
    parts.push(`## ${sec.heading}`);
    parts.push(sec.content);
    parts.push('');
  }
  if (draft.recommendations.length > 0) {
    parts.push('## Key Recommendations');
    for (const rec of draft.recommendations) {
      parts.push(`- ${rec}`);
    }
    parts.push('');
  }
  if (draft.methodologyNote) {
    parts.push('## Methodology & Evidence Scope');
    parts.push(draft.methodologyNote);
    parts.push('');
  }
  if (citations.length > 0) {
    parts.push('## Verified Sources');
    for (const c of citations) {
      parts.push(`- [${c.title}](${c.uri})`);
    }
  }
  return parts.join('\n').trim();
}

export function buildInputSnapshot(payload: ExecuteAgentPayload): AgentInputSnapshot {
  switch (payload.role) {
    case 'orchestrator':
      return {
        fromSources: ['user'],
        summary: `User task brief (${payload.prompt.length} chars), ${payload.userContent.trim().length} chars attached content, ${payload.sourceUrls.length} URLs, ${payload.approvedTools.length} approved tools.`,
        payload: {
          prompt: payload.prompt,
          hasUserContent: Boolean(payload.userContent.trim()),
          userContentLength: payload.userContent.trim().length,
          sourceUrls: payload.sourceUrls,
          approvedTools: payload.approvedTools,
          outputFormat: payload.outputFormat,
        },
      };
    case 'research':
      return {
        fromSources: ['orchestrator', 'user'],
        summary: `Orchestrator plan (${payload.previousOutputs.orchestrator?.researchQuestions?.length ?? 0} research questions) + user content + ${payload.approvedTools.length} approved tools.`,
        payload: {
          orchestratorPlan: payload.previousOutputs.orchestrator ?? null,
          sourceUrls: payload.sourceUrls,
          approvedTools: payload.approvedTools,
          userContentPreview: payload.userContent.trim().slice(0, 500),
          ...(payload.orchestratorDirective
            ? { orchestratorRecoveryDirective: payload.orchestratorDirective }
            : {}),
        },
      };
    case 'analysis':
      return {
        fromSources: ['orchestrator', 'research'],
        summary: `Orchestrator criteria (${payload.previousOutputs.orchestrator?.analysisCriteria?.length ?? 0}) + Research structured dossier (${payload.previousOutputs.research?.dossier?.questionsAnswered?.length ?? 0} answered questions, ${payload.previousOutputs.research?.citations?.length ?? 0} citations).`,
        payload: {
          orchestratorObjectives: payload.previousOutputs.orchestrator?.objectives ?? [],
          analysisCriteria: payload.previousOutputs.orchestrator?.analysisCriteria ?? [],
          researchDossier: payload.previousOutputs.research?.dossier ?? null,
          researchCitationsCount: payload.previousOutputs.research?.citations?.length ?? 0,
          ...(payload.orchestratorDirective
            ? { orchestratorRecoveryDirective: payload.orchestratorDirective }
            : {}),
        },
      };
    case 'writer':
      return {
        fromSources: payload.previousOutputs.reviewer
          ? ['orchestrator', 'research', 'analysis', 'reviewer']
          : ['orchestrator', 'research', 'analysis'],
        summary: `Orchestrator outline (${payload.previousOutputs.orchestrator?.reportOutline?.length ?? 0} sections) + Research dossier + Analysis evaluation${payload.previousOutputs.reviewer ? ` + Reviewer revision #${payload.revisionNumber}` : ''}.`,
        payload: {
          reportOutline: payload.previousOutputs.orchestrator?.reportOutline ?? [],
          outputFormat: payload.outputFormat,
          researchDossier: payload.previousOutputs.research?.dossier ?? null,
          analysisEvaluation: payload.previousOutputs.analysis ?? null,
          revisionNumber: payload.revisionNumber,
          reviewerFeedback: payload.previousOutputs.reviewer ?? null,
          humanFeedback: payload.humanFeedback ?? null,
          ...(payload.orchestratorDirective
            ? { orchestratorRecoveryDirective: payload.orchestratorDirective }
            : {}),
        },
      };
    case 'reviewer':
      return {
        fromSources: ['orchestrator', 'research', 'analysis', 'writer'],
        summary: `Orchestrator checklist (${payload.previousOutputs.orchestrator?.reviewerChecklist?.length ?? 0}) + Research dossier + Analysis evaluation + Writer draft ("${payload.previousOutputs.writer?.title ?? 'Untitled'}").`,
        payload: {
          reviewerChecklist: payload.previousOutputs.orchestrator?.reviewerChecklist ?? [],
          researchDossier: payload.previousOutputs.research?.dossier ?? null,
          analysisEvaluation: payload.previousOutputs.analysis ?? null,
          writerDraft: payload.previousOutputs.writer ?? null,
          revisionNumber: payload.revisionNumber,
          maxRevisions: payload.maxRevisions,
          ...(payload.orchestratorDirective
            ? { orchestratorRecoveryDirective: payload.orchestratorDirective }
            : {}),
        },
      };
  }
}

export async function executeAgentStep(
  payload: ExecuteAgentPayload
): Promise<ExecuteAgentResponse> {
  const startMs = Date.now();
  const logs: ExecuteAgentResponse['logs'] = [];
  const toolsInvoked: string[] = [];
  let citations: CitationItem[] = [];
  const inputSnapshot = buildInputSnapshot(payload);

  try {
    const ai = getGenAIClient();
    const thinkingLevel = toThinkingLevel(payload.thinkingLevel);

    if (payload.role === 'orchestrator') {
      logs.push({
        level: 'info',
        message: 'Orchestrator decomposing task scope, constraints, and sequential handoff plan.',
        detail: `Model: ${payload.model} · Thinking: ${payload.thinkingLevel}`,
      });

      const response = await withBackoff(() =>
        ai.models.generateContent({
          model: payload.model,
          contents: [
            `Task Prompt:\n${payload.prompt}`,
            payload.userContent.trim()
              ? `\nUser-Provided Reference Content (${payload.userContent.trim().length} chars):\n${payload.userContent.trim().slice(0, 12000)}`
              : '\nUser-Provided Reference Content: None provided.',
            payload.sourceUrls.length > 0
              ? `\nUser-Provided URLs:\n${payload.sourceUrls.join('\n')}`
              : '',
            `\nApproved Tools Enabled: ${payload.approvedTools.length > 0 ? payload.approvedTools.join(', ') : 'None (user content & model reasoning only)'}`,
            `\nRequested Output Format: ${payload.outputFormat}`,
          ]
            .filter(Boolean)
            .join('\n'),
          config: {
            systemInstruction:
              'You are the Orchestrator Agent in AgentFlow AI. Your role is to decompose the user task into a clear, sequential multi-agent workflow plan for four downstream agents: Research -> Analysis -> Writer -> Reviewer. Be specific, grounded in the prompt and any user-provided materials, and avoid vague filler.',
            thinkingConfig: { thinkingLevel },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                taskTitle: { type: Type.STRING, description: 'Concise 4-8 word title for the task.' },
                taskSummary: { type: Type.STRING, description: '2-3 sentence executive framing of the goal.' },
                objectives: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '3 to 5 concrete objectives this workflow must achieve.',
                },
                researchQuestions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '3 to 6 specific questions for the Research Agent to investigate.',
                },
                analysisCriteria: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '3 to 5 criteria for the Analysis Agent to evaluate findings against.',
                },
                reportOutline: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      sectionTitle: { type: Type.STRING },
                      purpose: { type: Type.STRING },
                    },
                    required: ['sectionTitle', 'purpose'],
                  },
                  description: '3 to 6 planned sections for the Writer Agent report.',
                },
                reviewerChecklist: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '3 to 5 verification checks for the Reviewer Agent.',
                },
                recommendedApproach: {
                  type: Type.STRING,
                  description: 'Brief coordination guidance across agents.',
                },
              },
              required: [
                'taskTitle',
                'taskSummary',
                'objectives',
                'researchQuestions',
                'analysisCriteria',
                'reportOutline',
                'reviewerChecklist',
                'recommendedApproach',
              ],
            },
          },
        })
      );

      const plan = safeJsonParse<OrchestratorPlan>(response.text, 'Orchestrator');
      const outputText = [
        `Plan: ${plan.taskTitle}`,
        plan.taskSummary,
        '',
        'Objectives:',
        ...plan.objectives.map((o, i) => `${i + 1}. ${o}`),
        '',
        'Research Questions:',
        ...plan.researchQuestions.map((q) => `- ${q}`),
      ].join('\n');

      logs.push({
        level: 'success',
        message: `Task decomposed into ${plan.objectives.length} objectives, ${plan.researchQuestions.length} research questions, and ${plan.reportOutline.length} report sections.`,
      });

      return {
        ok: true,
        role: 'orchestrator',
        inputSnapshot,
        outputText,
        structuredData: plan as unknown as Record<string, unknown>,
        toolsInvoked,
        citations,
        tokenUsage: extractUsage(response),
        durationMs: Date.now() - startMs,
        modelUsed: payload.model,
        logs,
      };
    }

    if (payload.role === 'research') {
      const plan = payload.previousOutputs.orchestrator;
      if (!plan) {
        throw new Error('Research Agent requires Orchestrator structured output first.');
      }

      const approved = new Set<ApprovedToolId>(payload.approvedTools);
      const tools: Tool[] = [];
      const customDecls: FunctionDeclaration[] = [];

      const hasBuiltInSearch = approved.has('google_search');
      const hasBuiltInUrlContext = approved.has('url_context') && payload.sourceUrls.length > 0;
      const hasSourceMetrics = approved.has('source_metrics');
      const hasFactExtractor = approved.has('fact_extractor');

      if (hasBuiltInSearch) {
        tools.push({ googleSearch: {} });
        toolsInvoked.push('google_search');
        logs.push({ level: 'tool', message: 'Approved tool enabled: Google Search grounding.' });
      }
      if (hasBuiltInUrlContext) {
        tools.push({ urlContext: {} });
        toolsInvoked.push('url_context');
        logs.push({
          level: 'tool',
          message: `Approved tool enabled: URL Context (${payload.sourceUrls.length} URL${payload.sourceUrls.length === 1 ? '' : 's'}).`,
        });
      }
      if (hasSourceMetrics) {
        customDecls.push(analyzeSourceMetricsDecl);
      }
      if (hasFactExtractor) {
        customDecls.push(searchUserContentDecl);
      }
      if (customDecls.length > 0) {
        tools.push({ functionDeclarations: customDecls });
      }

      const useHybridToolConfig =
        (hasBuiltInSearch || hasBuiltInUrlContext) && customDecls.length > 0;

      const researchQuestions = plan.researchQuestions ?? [];
      const objectives = plan.objectives ?? [];

      logs.push({
        level: 'info',
        message: `Research Agent received OrchestratorPlan (${researchQuestions.length} research questions) and started investigation.`,
      });

      const userPromptText = [
        `Orchestrator Task Framing:\n${plan.taskSummary ?? payload.prompt}`,
        objectives.length > 0
          ? `\nOrchestrator Objectives:\n${objectives.map((o, i) => `${i + 1}. ${o}`).join('\n')}`
          : '',
        researchQuestions.length > 0
          ? `\nResearch Questions Assigned by Orchestrator:\n${researchQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
          : '',
        payload.orchestratorDirective
          ? `\nOrchestrator Recovery Directive:\n${payload.orchestratorDirective}`
          : '',
        payload.sourceUrls.length > 0
          ? `\nReference URLs to Inspect:\n${payload.sourceUrls.join('\n')}`
          : '',
        payload.userContent.trim()
          ? `\nUser-Provided Source Content:\n${payload.userContent.trim().slice(0, 18000)}`
          : '\nUser-Provided Source Content: None attached.',
        `\nOriginal User Prompt (context):\n${payload.prompt}`,
        `\nInstructions:\nGather thorough, factual findings addressing every research question assigned by the Orchestrator. Use ONLY the provided content and approved tools available to you. Clearly separate verified evidence from gaps or unknowns.`,
      ]
        .filter(Boolean)
        .join('\n');

      const conversation: Content[] = [
        { role: 'user', parts: [{ text: userPromptText }] },
      ];

      let totalPromptTokens = 0;
      let totalOutputTokens = 0;
      let finalRes: GenerateContentResponse | null = null;

      let activeTools = [...tools];
      let activeHybrid = useHybridToolConfig;

      for (let round = 0; round < 3; round++) {
        let res: GenerateContentResponse;
        try {
          res = await withBackoff(() =>
            ai.models.generateContent({
              model: payload.model,
              contents: conversation,
              config: {
                systemInstruction:
                  'You are the Research Agent in AgentFlow AI. Follow the Orchestrator research questions strictly using user-provided content and approved tools. Never fabricate citations, statistics, or URLs.',
                thinkingConfig: { thinkingLevel },
                ...(activeTools.length > 0 ? { tools: activeTools } : {}),
                ...(activeHybrid
                  ? { toolConfig: { includeServerSideToolInvocations: true } }
                  : {}),
              },
            })
          );
        } catch (toolErr) {
          const classified = classifyGeminiError(toolErr);
          if (
            classified.code === 'RATE_LIMITED' &&
            hasBuiltInSearch &&
            payload.userContent.trim().length > 0
          ) {
            logs.push({
              level: 'warning',
              message:
                'Google Search grounding reached quota limit (429); continuing Research strictly with attached user content and local approved tools.',
            });
            const gsIdx = toolsInvoked.indexOf('google_search');
            if (gsIdx !== -1) toolsInvoked.splice(gsIdx, 1);
            activeTools = customDecls.length > 0 ? [{ functionDeclarations: customDecls }] : [];
            activeHybrid = false;
            res = await withBackoff(() =>
              ai.models.generateContent({
                model: payload.model,
                contents: conversation,
                config: {
                  systemInstruction:
                    'You are the Research Agent in AgentFlow AI. Follow the Orchestrator research questions strictly using user-provided content and local approved tools. Never fabricate citations, statistics, or URLs.',
                  thinkingConfig: { thinkingLevel },
                  ...(activeTools.length > 0 ? { tools: activeTools } : {}),
                },
              })
            );
          } else {
            throw toolErr;
          }
        }

        const usage = extractUsage(res);
        if (usage) {
          totalPromptTokens += usage.promptTokens;
          totalOutputTokens += usage.outputTokens;
        }
        citations = [...citations, ...extractCitations(res)];
        finalRes = res;

        const fnCalls = res.functionCalls;
        const modelContent = res.candidates?.[0]?.content;
        if (!fnCalls || fnCalls.length === 0 || !modelContent) {
          break;
        }

        conversation.push(modelContent);

        const responseParts = fnCalls.map((call) => {
          const callName = call.name ?? 'unknown_tool';
          if (!toolsInvoked.includes(callName)) {
            toolsInvoked.push(callName);
          }

          let resultObj: Record<string, unknown>;
          if (callName === 'analyze_source_metrics') {
            resultObj = executeAnalyzeSourceMetrics(payload.userContent);
            logs.push({
              level: 'tool',
              message: 'Executed approved tool: analyze_source_metrics',
              detail: JSON.stringify(resultObj).slice(0, 180),
            });
          } else if (callName === 'search_user_content') {
            const kwArg = Array.isArray((call.args as { keywords?: unknown })?.keywords)
              ? ((call.args as { keywords: string[] }).keywords)
              : [];
            resultObj = executeSearchUserContent(payload.userContent, kwArg);
            logs.push({
              level: 'tool',
              message: `Executed approved tool: search_user_content (${kwArg.join(', ')})`,
              detail: `Matches: ${(resultObj.matchCount as number) ?? 0}`,
            });
          } else {
            resultObj = { error: `Tool ${callName} is not approved or unavailable.` };
          }

          return {
            functionResponse: {
              id: call.id,
              name: callName,
              response: resultObj,
            },
          };
        });

        conversation.push({ role: 'user', parts: responseParts });
      }

      const uniqueCitations = Array.from(
        new Map(citations.map((c) => [c.uri, c])).values()
      );

      const rawResearchText = (finalRes?.text ?? '').trim();
      if (!rawResearchText) {
        throw new Error('Research Agent produced an empty research dossier.');
      }

      // Structure the tool-grounded research findings into a formal ResearchDossier JSON handoff for Analysis
      const structRes = await withBackoff(() =>
        ai.models.generateContent({
          model: payload.model,
          contents: [
            `Orchestrator Research Questions:\n${(plan.researchQuestions ?? []).map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
            `\nTool-Grounded Research Notes:\n${rawResearchText}`,
            uniqueCitations.length > 0
              ? `\nVerified Citations:\n${uniqueCitations.map((c) => `- ${c.title}: ${c.uri}`).join('\n')}`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
          config: {
            systemInstruction:
              'Convert the research notes into a clean, faithful ResearchDossier JSON structure for the Analysis Agent. Preserve every verified fact, source attribution, and evidence gap without inventing new facts.',
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                executiveOverview: { type: Type.STRING },
                questionsAnswered: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      question: { type: Type.STRING },
                      findings: { type: Type.STRING },
                      confidence: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
                      sourcesUsed: { type: Type.ARRAY, items: { type: Type.STRING } },
                    },
                    required: ['question', 'findings', 'confidence', 'sourcesUsed'],
                  },
                },
                keyFacts: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      fact: { type: Type.STRING },
                      source: { type: Type.STRING },
                    },
                    required: ['fact', 'source'],
                  },
                },
                evidenceGaps: { type: Type.ARRAY, items: { type: Type.STRING } },
                sourceMetricsSummary: { type: Type.STRING },
              },
              required: [
                'executiveOverview',
                'questionsAnswered',
                'keyFacts',
                'evidenceGaps',
                'sourceMetricsSummary',
              ],
            },
          },
        })
      );

      const structUsage = extractUsage(structRes);
      if (structUsage) {
        totalPromptTokens += structUsage.promptTokens;
        totalOutputTokens += structUsage.outputTokens;
      }

      const dossier = safeJsonParse<ResearchDossier>(structRes.text, 'Research Dossier');

      logs.push({
        level: 'success',
        message: `Research dossier structured (${dossier.questionsAnswered.length} questions answered, ${dossier.keyFacts.length} facts, ${uniqueCitations.length} citations).`,
      });

      return {
        ok: true,
        role: 'research',
        inputSnapshot,
        outputText: rawResearchText,
        structuredData: dossier as unknown as Record<string, unknown>,
        toolsInvoked,
        citations: uniqueCitations,
        tokenUsage: {
          promptTokens: totalPromptTokens,
          outputTokens: totalOutputTokens,
          totalTokens: totalPromptTokens + totalOutputTokens,
        },
        durationMs: Date.now() - startMs,
        modelUsed: payload.model,
        logs,
      };
    }

    if (payload.role === 'analysis') {
      const plan = payload.previousOutputs.orchestrator;
      const research = payload.previousOutputs.research;
      if (!plan || !research) {
        throw new Error('Analysis Agent requires structured Orchestrator and Research outputs first.');
      }

      const analysisCriteria = plan.analysisCriteria ?? [];
      logs.push({
        level: 'info',
        message: `Analysis Agent evaluating ResearchDossier (${research.dossier?.questionsAnswered?.length ?? 0} questions) against ${analysisCriteria.length} Orchestrator criteria.`,
      });

      const response = await withBackoff(() =>
        ai.models.generateContent({
          model: payload.model,
          contents: [
            `Orchestrator Plan (Structured Handoff):\n${JSON.stringify(
              {
                taskTitle: plan.taskTitle,
                taskSummary: plan.taskSummary,
                objectives: plan.objectives,
                analysisCriteria: plan.analysisCriteria,
              },
              null,
              2
            )}`,
            payload.orchestratorDirective
              ? `\nOrchestrator Recovery Directive:\n${payload.orchestratorDirective}`
              : '',
            `\nResearch Agent Structured Dossier (Previous Agent Output):\n${
              research.dossier
                ? JSON.stringify(research.dossier, null, 2)
                : research.text
            }`,
            research.citations.length > 0
              ? `\nVerified Citations:\n${research.citations.map((c) => `- ${c.title}: ${c.uri}`).join('\n')}`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
          config: {
            systemInstruction:
              'You are the Analysis Agent in AgentFlow AI. Critically evaluate the Research Agent structured dossier strictly against the Orchestrator analysis criteria and objectives. Surface patterns, evidence-backed conclusions, confidence levels, contradictions, data gaps, risks, and strategic implications. Do not invent facts outside the supplied structured handoffs.',
            thinkingConfig: { thinkingLevel },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                executiveSynthesis: { type: Type.STRING },
                keyFindings: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      finding: { type: Type.STRING },
                      evidence: { type: Type.STRING },
                      confidence: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
                    },
                    required: ['finding', 'evidence', 'confidence'],
                  },
                },
                patternsAndThemes: { type: Type.ARRAY, items: { type: Type.STRING } },
                gapsAndRisks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      risk: { type: Type.STRING },
                      severity: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
                      mitigation: { type: Type.STRING },
                    },
                    required: ['risk', 'severity', 'mitigation'],
                  },
                },
                strategicImplications: { type: Type.ARRAY, items: { type: Type.STRING } },
                dataCompletenessNote: { type: Type.STRING },
              },
              required: [
                'executiveSynthesis',
                'keyFindings',
                'patternsAndThemes',
                'gapsAndRisks',
                'strategicImplications',
                'dataCompletenessNote',
              ],
            },
          },
        })
      );

      const evaluation = safeJsonParse<AnalysisEvaluation>(response.text, 'Analysis');
      const outputText = [
        evaluation.executiveSynthesis,
        '',
        'Key Findings:',
        ...evaluation.keyFindings.map(
          (f, i) => `${i + 1}. [${f.confidence.toUpperCase()}] ${f.finding} — Evidence: ${f.evidence}`
        ),
        '',
        'Risks & Gaps:',
        ...evaluation.gapsAndRisks.map(
          (r) => `- [${r.severity.toUpperCase()}] ${r.risk} (Mitigation: ${r.mitigation})`
        ),
      ].join('\n');

      logs.push({
        level: 'success',
        message: `Analysis complete: ${evaluation.keyFindings.length} key findings and ${evaluation.gapsAndRisks.length} risks/gaps identified.`,
      });

      return {
        ok: true,
        role: 'analysis',
        inputSnapshot,
        outputText,
        structuredData: evaluation as unknown as Record<string, unknown>,
        toolsInvoked,
        citations,
        tokenUsage: extractUsage(response),
        durationMs: Date.now() - startMs,
        modelUsed: payload.model,
        logs,
      };
    }

    if (payload.role === 'writer') {
      const plan = payload.previousOutputs.orchestrator;
      const research = payload.previousOutputs.research;
      const analysis = payload.previousOutputs.analysis;
      if (!plan || !research || !analysis) {
        throw new Error('Writer Agent requires structured Orchestrator, Research, and Analysis outputs first.');
      }

      const isRevision = payload.revisionNumber > 0 || Boolean(payload.humanFeedback);
      if (isRevision) {
        logs.push({
          level: 'warning',
          message: `Writer Agent generating Revision #${payload.revisionNumber} using Reviewer feedback + upstream structured outputs.`,
        });
      } else {
        logs.push({
          level: 'info',
          message: `Writer Agent drafting ${payload.outputFormat.replace('_', ' ')} from AnalysisEvaluation and Orchestrator outline (${plan.reportOutline?.length ?? 0} sections).`,
        });
      }

      const revisionContext = isRevision
        ? [
            '\n--- REVISION REQUEST ---',
            payload.humanFeedback
              ? `Human Reviewer Feedback:\n${payload.humanFeedback}`
              : '',
            payload.previousOutputs.reviewer
              ? `Reviewer Structured Assessment:\n${JSON.stringify(payload.previousOutputs.reviewer, null, 2)}`
              : '',
            payload.previousOutputs.writer
              ? `Previous Writer Draft:\n${JSON.stringify(payload.previousOutputs.writer, null, 2)}`
              : '',
          ]
            .filter(Boolean)
            .join('\n')
        : '';

      const response = await withBackoff(() =>
        ai.models.generateContent({
          model: payload.model,
          contents: [
            `Format Style Guide:\n${formatOutputStyleGuide(payload.outputFormat)}`,
            `\nOrchestrator Plan & Report Outline:\n${JSON.stringify(
              {
                taskTitle: plan.taskTitle,
                objectives: plan.objectives,
                reportOutline: plan.reportOutline,
              },
              null,
              2
            )}`,
            payload.orchestratorDirective
              ? `\nOrchestrator Recovery Directive:\n${payload.orchestratorDirective}`
              : '',
            `\nResearch Structured Dossier:\n${
              research.dossier
                ? JSON.stringify(research.dossier, null, 2)
                : research.text
            }`,
            research.citations.length > 0
              ? `\nVerified Citations (cite inline where applicable):\n${research.citations.map((c) => `- ${c.title}: ${c.uri}`).join('\n')}`
              : '',
            `\nAnalysis Structured Evaluation (Previous Agent Output):\n${JSON.stringify(analysis, null, 2)}`,
            revisionContext,
          ]
            .filter(Boolean)
            .join('\n'),
          config: {
            systemInstruction:
              'You are the Writer Agent in AgentFlow AI. Synthesize the structured Orchestrator outline, structured Research dossier, and structured Analysis evaluation into a polished, publication-ready report. Ground every factual claim in the upstream structured outputs. If revision instructions are present, explicitly resolve every cited issue.',
            thinkingConfig: { thinkingLevel },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                executiveSummary: { type: Type.STRING },
                sections: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      heading: { type: Type.STRING },
                      content: {
                        type: Type.STRING,
                        description: 'Well-structured Markdown content for this section.',
                      },
                    },
                    required: ['heading', 'content'],
                  },
                },
                recommendations: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                methodologyNote: { type: Type.STRING },
              },
              required: [
                'title',
                'executiveSummary',
                'sections',
                'recommendations',
                'methodologyNote',
              ],
            },
          },
        })
      );

      const draft = safeJsonParse<WriterDraft>(response.text, 'Writer');
      const markdownBody = buildMarkdownFromWriterDraft(draft, research.citations);

      logs.push({
        level: 'success',
        message: `Writer completed "${draft.title}" (${draft.sections.length} sections, ${markdownBody.length} chars).`,
      });

      return {
        ok: true,
        role: 'writer',
        inputSnapshot,
        outputText: markdownBody,
        structuredData: draft as unknown as Record<string, unknown>,
        toolsInvoked,
        citations: research.citations,
        tokenUsage: extractUsage(response),
        durationMs: Date.now() - startMs,
        modelUsed: payload.model,
        logs,
      };
    }

    if (payload.role === 'reviewer') {
      const plan = payload.previousOutputs.orchestrator;
      const research = payload.previousOutputs.research;
      const analysis = payload.previousOutputs.analysis;
      const writer = payload.previousOutputs.writer;
      if (!plan || !research || !analysis || !writer) {
        throw new Error(
          'Reviewer Agent requires structured Orchestrator, Research, Analysis, and Writer outputs first.'
        );
      }

      logs.push({
        level: 'info',
        message: `Reviewer Agent auditing WriterDraft ("${writer.title}") against Orchestrator checklist (${plan.reviewerChecklist?.length ?? 0} checks).`,
      });

      const response = await withBackoff(() =>
        ai.models.generateContent({
          model: payload.model,
          contents: [
            `Orchestrator Objectives & Checklist:\n${JSON.stringify(
              {
                objectives: plan.objectives,
                reviewerChecklist: plan.reviewerChecklist,
              },
              null,
              2
            )}`,
            payload.orchestratorDirective
              ? `\nOrchestrator Recovery Directive:\n${payload.orchestratorDirective}`
              : '',
            `\nResearch Structured Dossier:\n${
              research.dossier
                ? JSON.stringify(research.dossier, null, 2)
                : research.text.slice(0, 14000)
            }`,
            `\nAnalysis Structured Evaluation:\n${JSON.stringify(analysis, null, 2)}`,
            `\nWriter Structured Draft Under Review (Revision #${payload.revisionNumber}):\n${JSON.stringify(writer, null, 2)}`,
            `\nRevision Budget Info:\nCurrent revision count is ${payload.revisionNumber} out of maximum ${payload.maxRevisions} allowed automatic revisions. Request a revision (verdict: REVISION_REQUESTED) ONLY if there are genuine consistency, completeness, or factual grounding flaws that the Writer can fix. If the draft substantially satisfies all objectives and accurately reflects the research/analysis without contradictions, return verdict: APPROVED.`,
          ]
            .filter(Boolean)
            .join('\n'),
          config: {
            systemInstruction:
              'You are the Reviewer Agent in AgentFlow AI. Audit the Writer structured draft against the Orchestrator checklist, Research dossier, and Analysis evaluation. Provide concrete, actionable feedback.',
            thinkingConfig: { thinkingLevel },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                verdict: {
                  type: Type.STRING,
                  enum: ['APPROVED', 'REVISION_REQUESTED'],
                },
                completenessCheck: {
                  type: Type.OBJECT,
                  properties: {
                    passed: { type: Type.BOOLEAN },
                    notes: { type: Type.STRING },
                  },
                  required: ['passed', 'notes'],
                },
                consistencyCheck: {
                  type: Type.OBJECT,
                  properties: {
                    passed: { type: Type.BOOLEAN },
                    notes: { type: Type.STRING },
                  },
                  required: ['passed', 'notes'],
                },
                groundingCheck: {
                  type: Type.OBJECT,
                  properties: {
                    passed: { type: Type.BOOLEAN },
                    notes: { type: Type.STRING },
                  },
                  required: ['passed', 'notes'],
                },
                issues: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      severity: { type: Type.STRING, enum: ['critical', 'moderate', 'minor'] },
                      section: { type: Type.STRING },
                      description: { type: Type.STRING },
                    },
                    required: ['severity', 'section', 'description'],
                  },
                },
                revisionInstructions: { type: Type.STRING },
                summary: { type: Type.STRING },
              },
              required: [
                'verdict',
                'completenessCheck',
                'consistencyCheck',
                'groundingCheck',
                'issues',
                'revisionInstructions',
                'summary',
              ],
            },
          },
        })
      );

      const assessment = safeJsonParse<ReviewerAssessment>(response.text, 'Reviewer');
      const outputText = [
        `Verdict: ${assessment.verdict}`,
        assessment.summary,
        '',
        `Completeness: ${assessment.completenessCheck.passed ? 'PASS' : 'FAIL'} — ${assessment.completenessCheck.notes}`,
        `Consistency: ${assessment.consistencyCheck.passed ? 'PASS' : 'FAIL'} — ${assessment.consistencyCheck.notes}`,
        `Grounding: ${assessment.groundingCheck.passed ? 'PASS' : 'FAIL'} — ${assessment.groundingCheck.notes}`,
        assessment.issues.length > 0
          ? `\nIssues (${assessment.issues.length}):\n` +
            assessment.issues
              .map((i) => `- [${i.severity.toUpperCase()}] ${i.section}: ${i.description}`)
              .join('\n')
          : '\nNo blocking issues detected.',
      ].join('\n');

      logs.push({
        level: assessment.verdict === 'APPROVED' ? 'success' : 'warning',
        message:
          assessment.verdict === 'APPROVED'
            ? 'Reviewer approved the draft for human publishing review.'
            : `Reviewer requested revision (${assessment.issues.length} issue${assessment.issues.length === 1 ? '' : 's'} flagged).`,
      });

      return {
        ok: true,
        role: 'reviewer',
        inputSnapshot,
        outputText,
        structuredData: assessment as unknown as Record<string, unknown>,
        toolsInvoked,
        citations,
        tokenUsage: extractUsage(response),
        durationMs: Date.now() - startMs,
        modelUsed: payload.model,
        logs,
      };
    }

    throw new Error(`Unsupported agent role: ${String(payload.role)}`);
  } catch (err) {
    const classified = classifyGeminiError(err);
    logs.push({
      level: 'error',
      message: `${payload.role.toUpperCase()} failed (${classified.code}): ${classified.message}`,
    });

    return {
      ok: false,
      role: payload.role,
      inputSnapshot,
      outputText: '',
      toolsInvoked,
      citations,
      durationMs: Date.now() - startMs,
      modelUsed: payload.model,
      logs,
      error: {
        code: classified.code,
        message: classified.message,
        retryable: classified.retryable,
      },
    };
  }
}

export async function handleAgentFailureWithOrchestrator(
  payload: HandleFailurePayload
): Promise<HandleFailureResponse> {
  // Non-retryable configuration/auth errors always pause immediately for operator
  if (
    payload.errorCode === 'API_KEY_MISSING' ||
    payload.errorCode === 'API_KEY_INVALID' ||
    payload.errorCode === 'MODEL_NOT_FOUND' ||
    payload.errorCode === 'VALIDATION_ERROR' ||
    payload.errorCode === 'CANCELLED'
  ) {
    return {
      ok: true,
      action: 'PAUSE_FOR_OPERATOR',
      rationale: `Orchestrator halted workflow because ${payload.errorCode} requires operator configuration before retrying ${payload.failedRole}.`,
    };
  }

  // Only allow 1 automatic Orchestrator-directed adjustment retry before escalating to operator
  if (payload.attempt >= 2) {
    return {
      ok: true,
      action: 'PAUSE_FOR_OPERATOR',
      rationale: `Orchestrator escalated ${payload.failedRole} failure to operator after ${payload.attempt} attempts (${payload.errorCode}). Upstream outputs remain preserved for manual retry.`,
    };
  }

  try {
    const ai = getGenAIClient();
    const res = await ai.models.generateContent({
      model: payload.model,
      contents: [
        `Failed Agent: ${payload.failedRole}`,
        `Attempt Number: ${payload.attempt}`,
        `Error Code: ${payload.errorCode}`,
        `Error Message: ${payload.errorMessage}`,
        payload.orchestratorPlan
          ? `Original Plan Summary: ${payload.orchestratorPlan.taskSummary}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
      config: {
        systemInstruction:
          'You are the Orchestrator Failure Recovery Manager in AgentFlow AI. Decide whether to automatically retry the failed downstream agent with a simpler/safer directive (RETRY_WITH_ADJUSTMENT) or pause for the human operator (PAUSE_FOR_OPERATOR).',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: {
              type: Type.STRING,
              enum: ['RETRY_WITH_ADJUSTMENT', 'PAUSE_FOR_OPERATOR'],
            },
            rationale: { type: Type.STRING },
            adjustedDirective: { type: Type.STRING },
          },
          required: ['action', 'rationale', 'adjustedDirective'],
        },
      },
    });

    const parsed = safeJsonParse<{
      action: 'RETRY_WITH_ADJUSTMENT' | 'PAUSE_FOR_OPERATOR';
      rationale: string;
      adjustedDirective: string;
    }>(res.text, 'Orchestrator Recovery');

    return {
      ok: true,
      action: parsed.action,
      rationale: parsed.rationale,
      adjustedDirective: parsed.adjustedDirective || undefined,
    };
  } catch {
    return {
      ok: true,
      action: 'PAUSE_FOR_OPERATOR',
      rationale: `Orchestrator paused workflow after ${payload.failedRole} error (${payload.errorCode}). Upstream outputs are preserved; click Retry to resume from ${payload.failedRole}.`,
    };
  }
}
