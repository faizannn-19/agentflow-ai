import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import type { AgentStatus, TaskStatus } from '../types/agentflow';

export function AgentStatusIndicator({ status }: { status: AgentStatus }) {
  switch (status) {
    case 'running':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-400 whitespace-nowrap">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          <span>Running</span>
        </span>
      );
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Completed</span>
        </span>
      );
    case 'revision_requested':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 whitespace-nowrap">
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Revision Requested</span>
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Failed</span>
        </span>
      );
    case 'queued':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Queued</span>
        </span>
      );
    case 'idle':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Idle</span>
        </span>
      );
  }
}

export function TaskStatusIndicator({ status }: { status: TaskStatus }) {
  switch (status) {
    case 'running':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-400 whitespace-nowrap">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          <span>Running</span>
        </span>
      );
    case 'awaiting_approval':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Awaiting Approval</span>
        </span>
      );
    case 'approved':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Published</span>
        </span>
      );
    case 'rejected':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Rejected</span>
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Failed</span>
        </span>
      );
    case 'draft':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Draft</span>
        </span>
      );
  }
}
