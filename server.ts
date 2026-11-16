import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import {
  executeAgentStep,
  handleAgentFailureWithOrchestrator,
} from './server/agents.ts';
import type {
  ExecuteAgentPayload,
  HandleFailurePayload,
} from './src/types/agentflow.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ExecuteAgentSchema = z.object({
  role: z.enum(['orchestrator', 'research', 'analysis', 'writer', 'reviewer']),
  taskId: z.string().min(1).max(128),
  prompt: z.string().trim().min(5, 'Task prompt must be at least 5 characters.').max(12000),
  userContent: z.string().max(100000).default(''),
  sourceUrls: z
    .array(
      z
        .string()
        .trim()
        .url('Each source URL must be a valid http/https URL.')
        .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
          message: 'Only http:// and https:// URLs are supported.',
        })
    )
    .max(10)
    .default([]),
  approvedTools: z
    .array(z.enum(['google_search', 'url_context', 'source_metrics', 'fact_extractor']))
    .default([]),
  outputFormat: z
    .enum(['executive_brief', 'technical_report', 'market_analysis', 'action_plan'])
    .default('executive_brief'),
  model: z.enum(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']).default('gemini-4-hydrogen'),
  thinkingLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  revisionNumber: z.number().int().min(0).max(5).default(0),
  maxRevisions: z.number().int().min(0).max(2).default(2),
  humanFeedback: z.string().max(4000).optional(),
  orchestratorDirective: z.string().max(2000).optional(),
  previousOutputs: z
    .object({
      orchestrator: z.any().optional(),
      research: z
        .object({
          text: z.string(),
          dossier: z.any().optional(),
          citations: z.array(z.object({ title: z.string(), uri: z.string() })),
          toolsInvoked: z.array(z.string()),
        })
        .optional(),
      analysis: z.any().optional(),
      writer: z.any().optional(),
      reviewer: z.any().optional(),
    })
    .default({}),
});

const HandleFailureSchema = z.object({
  taskId: z.string().min(1).max(128),
  failedRole: z.enum(['orchestrator', 'research', 'analysis', 'writer', 'reviewer']),
  errorCode: z.string().min(1).max(64),
  errorMessage: z.string().min(1).max(2000),
  attempt: z.number().int().min(1).max(10),
  model: z.enum(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']).default('gemini-4-hydrogen'),
  orchestratorPlan: z.any().optional(),
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    const rawKey = process.env.GEMINI_API_KEY?.trim();
    const geminiConfigured = Boolean(rawKey && rawKey !== 'MY_GEMINI_API_KEY');
    res.json({
      ok: true,
      geminiConfigured,
      availableModels: ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/agents/execute', async (req, res) => {
    const parsed = ExecuteAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      res.status(400).json({
        ok: false,
        role: req.body?.role ?? 'orchestrator',
        outputText: '',
        toolsInvoked: [],
        citations: [],
        durationMs: 0,
        modelUsed: req.body?.model ?? 'gemini-4-hydrogen',
        logs: [
          {
            level: 'error',
            message: `Input validation failed: ${firstIssue?.path.join('.') || 'payload'} — ${firstIssue?.message || 'Invalid input'}`,
          },
        ],
        error: {
          code: 'VALIDATION_ERROR',
          message: firstIssue?.message || 'Invalid request payload.',
          retryable: false,
        },
      });
      return;
    }

    const result = await executeAgentStep(parsed.data as ExecuteAgentPayload);
    if (!result.ok) {
      const statusCode =
        result.error?.code === 'API_KEY_MISSING' || result.error?.code === 'BAD_REQUEST'
          ? 400
          : result.error?.code === 'API_KEY_INVALID'
            ? 403
            : result.error?.code === 'MODEL_NOT_FOUND'
              ? 404
              : result.error?.code === 'RATE_LIMITED'
                ? 429
                : 502;
      res.status(statusCode).json(result);
      return;
    }

    res.json(result);
  });

  app.post('/api/orchestrator/handle-failure', async (req, res) => {
    const parsed = HandleFailureSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        action: 'PAUSE_FOR_OPERATOR',
        rationale: 'Invalid failure-handling payload.',
      });
      return;
    }
    const decision = await handleAgentFailureWithOrchestrator(
      parsed.data as HandleFailurePayload
    );
    res.json(decision);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AgentFlow AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AgentFlow AI server:', err);
  process.exit(1);
});
