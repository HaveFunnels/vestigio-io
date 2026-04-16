import {
  Evidence,
  VerificationRequest,
  VerificationType,
  Scoping,
  IdGenerator,
  makeRef,
} from '../../packages/domain';
import { EvidenceStore } from '../../packages/evidence';
import { recomputeAll, MultiPackResult } from '../../packages/workspace';
import {
  VerificationResult,
  VerificationRun,
  VerificationExecutor,
  ExecutorInput,
  VerificationLog,
} from './types';
import {
  ReuseOnlyExecutor,
  LightProbeExecutor,
  BrowserVerificationExecutor,
  IntegrationPullExecutor,
  AuthenticatedJourneyExecutor,
  ExternalScanExecutor,
} from './executors';

// ──────────────────────────────────────────────
// Verification Orchestrator
//
// Manages the lifecycle:
//   request → queue → dispatch → execute → evidence → recompute
//
// Closes the loop: decision → action → verification → updated decision
// ──────────────────────────────────────────────

export interface OrchestratorConfig {
  max_retries: number;
  scoping: Scoping;
  cycle_ref: string;
  root_domain: string;
  landing_url: string;
  conversion_proximity: number;
  is_production: boolean;
}

export class VerificationOrchestrator {
  private executors: Map<VerificationType, VerificationExecutor>;
  private requests: Map<string, VerificationRequest> = new Map();
  private runs: Map<string, VerificationRun[]> = new Map();
  private results: Map<string, VerificationResult> = new Map();
  private evidenceStore: EvidenceStore;
  private config: OrchestratorConfig;
  private runIds = new IdGenerator('vrun');

  constructor(evidenceStore: EvidenceStore, config: OrchestratorConfig) {
    this.evidenceStore = evidenceStore;
    this.config = config;

    // Register executors — pluggable architecture
    this.executors = new Map();
    this.executors.set(VerificationType.ReuseOnly, new ReuseOnlyExecutor());
    this.executors.set(VerificationType.LightProbe, new LightProbeExecutor());
    this.executors.set(VerificationType.BrowserVerification, new BrowserVerificationExecutor());
    this.executors.set(VerificationType.IntegrationPull, new IntegrationPullExecutor());
    this.executors.set(VerificationType.AuthenticatedJourneyVerification, new AuthenticatedJourneyExecutor());
    this.executors.set(VerificationType.ExternalScan, new ExternalScanExecutor());
  }

  // Submit a verification request
  submit(request: VerificationRequest): void {
    // Idempotency: don't re-process completed requests
    if (this.requests.has(request.id)) return;
    this.requests.set(request.id, { ...request, status: 'pending' });
  }

  // Execute a single verification request
  async execute(requestId: string): Promise<VerificationResult> {
    const request = this.requests.get(requestId);
    if (!request) throw new Error(`Verification request not found: ${requestId}`);

    // Idempotency: return cached result if already completed
    const existing = this.results.get(requestId);
    if (existing) return existing;

    const executor = this.executors.get(request.verification_type);
    if (!executor) {
      return this.failResult(requestId, `No executor for type: ${request.verification_type}`);
    }

    // Track the run
    const existingRuns = this.runs.get(requestId) || [];
    if (existingRuns.length >= this.config.max_retries + 1) {
      return this.failResult(requestId, `Max retries (${this.config.max_retries}) exceeded`);
    }

    const run: VerificationRun = {
      id: this.runIds.next(),
      request_id: requestId,
      attempt: existingRuns.length + 1,
      status: 'running',
      started_at: new Date(),
      completed_at: null,
      result: null,
    };
    existingRuns.push(run);
    this.runs.set(requestId, existingRuns);

    // Update request status
    request.status = 'executing';
    request.updated_at = new Date();

    // Build executor input
    const existingEvidence = this.evidenceStore.query({
      workspace_ref: this.config.scoping.workspace_ref,
    });

    const input: ExecutorInput = {
      request,
      subject_url: request.subject_ref,
      scoping: this.config.scoping,
      cycle_ref: this.config.cycle_ref,
      existing_evidence: existingEvidence,
    };

    const startTime = Date.now();

    try {
      const output = await executor.execute(input);
      const duration = Date.now() - startTime;

      // Store new evidence
      if (output.evidence.length > 0) {
        this.evidenceStore.addMany(output.evidence);
      }

      const evidenceRefs = output.evidence.map(e => makeRef('evidence', e.id));

      const result: VerificationResult = {
        request_id: requestId,
        status: output.status,
        evidence: output.evidence,
        evidence_refs: evidenceRefs,
        logs: output.logs,
        duration_ms: duration,
        errors: output.errors,
        completed_at: new Date(),
      };

      // Update run
      run.status = output.status === 'completed' ? 'completed' : 'failed';
      run.completed_at = new Date();
      run.result = result;

      // Update request
      request.status = output.status === 'completed' ? 'completed' : 'failed';
      request.result_evidence_refs = evidenceRefs;
      request.completed_at = new Date();
      request.updated_at = new Date();

      this.results.set(requestId, result);
      return result;

    } catch (err) {
      const duration = Date.now() - startTime;
      const msg = err instanceof Error ? err.message : String(err);

      run.status = 'failed';
      run.completed_at = new Date();

      return this.failResult(requestId, msg, duration);
    }
  }

  // Execute and recompute — the closed loop
  async executeAndRecompute(requestId: string): Promise<{
    verification: VerificationResult;
    recomputation: MultiPackResult;
  }> {
    const verification = await this.execute(requestId);

    // Get all evidence (original + verification) and recompute
    const allEvidence = this.evidenceStore.query({
      workspace_ref: this.config.scoping.workspace_ref,
    });

    const recomputation = recomputeAll({
      evidence: allEvidence,
      scoping: this.config.scoping,
      cycle_ref: this.config.cycle_ref,
      root_domain: this.config.root_domain,
      landing_url: this.config.landing_url,
      conversion_proximity: this.config.conversion_proximity,
      is_production: this.config.is_production,
    });

    return { verification, recomputation };
  }

  // Query status
  getRequest(id: string): VerificationRequest | undefined {
    return this.requests.get(id);
  }

  getResult(requestId: string): VerificationResult | undefined {
    return this.results.get(requestId);
  }

  getRuns(requestId: string): VerificationRun[] {
    return this.runs.get(requestId) || [];
  }

  getAllRequests(): VerificationRequest[] {
    return Array.from(this.requests.values());
  }

  private failResult(requestId: string, error: string, durationMs: number = 0): VerificationResult {
    const request = this.requests.get(requestId);
    if (request) {
      request.status = 'failed';
      request.updated_at = new Date();
    }

    const result: VerificationResult = {
      request_id: requestId,
      status: 'failed',
      evidence: [],
      evidence_refs: [],
      logs: [{ timestamp: new Date(), level: 'error', message: error }],
      duration_ms: durationMs,
      errors: [error],
      completed_at: new Date(),
    };

    this.results.set(requestId, result);
    return result;
  }
}
