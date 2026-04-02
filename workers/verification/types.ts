import {
  Evidence,
  VerificationType,
  VerificationRequest,
  Ref,
  Scoping,
} from '../../packages/domain';

// ──────────────────────────────────────────────
// Verification Execution Types
// ──────────────────────────────────────────────

export type VerificationExecutionStatus =
  | 'created'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface VerificationResult {
  request_id: string;
  status: 'completed' | 'failed';
  evidence: Evidence[];
  evidence_refs: Ref[];
  logs: VerificationLog[];
  duration_ms: number;
  errors: string[];
  completed_at: Date;
}

export interface VerificationLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface VerificationRun {
  id: string;
  request_id: string;
  attempt: number;
  status: VerificationExecutionStatus;
  started_at: Date;
  completed_at: Date | null;
  result: VerificationResult | null;
}

// ──────────────────────────────────────────────
// Executor Interface — pluggable for future tools
// ──────────────────────────────────────────────

export interface VerificationExecutor {
  type: VerificationType;
  execute(input: ExecutorInput): Promise<ExecutorOutput>;
}

export interface ExecutorInput {
  request: VerificationRequest;
  subject_url: string;
  scoping: Scoping;
  cycle_ref: string;
  existing_evidence: Evidence[];
}

export interface ExecutorOutput {
  status: 'completed' | 'failed';
  evidence: Evidence[];
  logs: VerificationLog[];
  errors: string[];
}
