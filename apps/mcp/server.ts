import { Evidence, VerificationType, makeRef } from '../../packages/domain';
import { EvidenceStore } from '../../packages/evidence';
import { assembleContext, EngineContext } from './context';
import { executeTool, TOOL_DEFINITIONS, ToolResult, VerificationStatusView } from './tools';
import { createVerificationRequest, validateVerificationRequest } from './verification';
import {
  McpRequestScope,
  McpToolRequest,
  McpResourceDefinition,
  McpVerificationRequest,
  McpSessionContext,
} from './types';
import {
  VerificationOrchestrator,
  OrchestratorConfig,
} from '../../workers/verification';
import { createEmptySession, markPackExplored, markMapExplored, setActiveWorkspace, setSelectedFindings } from './session';
import { evaluateVerificationEconomics, VerificationEconomicDecision } from '../../packages/verification-economics';
import {
  evaluateVerificationPolicy,
  createDefaultPolicyConfig,
  recordVerificationCompletion,
  VerificationPolicyConfig,
  VerificationPolicyDecision,
  VerificationPolicyRequest,
} from '../../packages/verification-economics/policy';

// ──────────────────────────────────────────────
// MCP Server — bootstrap and request handling
//
// Handles engine context, tool dispatch, and
// verification orchestration. The server is the
// single entry point for the UI layer.
// ──────────────────────────────────────────────

export interface McpServerConfig {
  default_conversion_proximity: number;
  default_is_production: boolean;
  max_verification_retries: number;
  /** Remaining verification budget (abstract cost units). null = unlimited. */
  verification_budget: number | null;
  /** Whether continuous/incremental audits are enabled */
  continuous_audit_enabled: boolean;
}

const DEFAULT_CONFIG: McpServerConfig = {
  default_conversion_proximity: 2,
  default_is_production: true,
  max_verification_retries: 2,
  verification_budget: null,
  continuous_audit_enabled: false,
};

export class McpServer {
  private config: McpServerConfig;
  private context: EngineContext | null = null;
  private evidenceStore: EvidenceStore = new EvidenceStore();
  private orchestrator: VerificationOrchestrator | null = null;
  private scope: McpRequestScope | null = null;
  private cycleRef: string = '';
  private rootDomain: string = '';
  private landingUrl: string = '';
  private session: McpSessionContext = createEmptySession();
  /** Phase 27: Global verification policy config */
  private verificationPolicy: VerificationPolicyConfig;

  constructor(config: Partial<McpServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.verificationPolicy = createDefaultPolicyConfig({
      cycle_budget: this.config.verification_budget,
      continuous_audit_enabled: this.config.continuous_audit_enabled,
    });
  }

  loadContext(
    evidence: Evidence[],
    scope: McpRequestScope,
    cycle_ref: string,
    root_domain: string,
    landing_url: string,
  ): void {
    this.scope = scope;
    this.cycleRef = cycle_ref;
    this.rootDomain = root_domain;
    this.landingUrl = landing_url;

    // Store evidence for verification access
    this.evidenceStore.clear();
    this.evidenceStore.addMany(evidence);

    // Assemble engine context
    this.context = assembleContext(
      evidence,
      scope,
      cycle_ref,
      root_domain,
      landing_url,
      this.config.default_conversion_proximity,
      this.config.default_is_production,
    );

    // Initialize verification orchestrator
    const orchConfig: OrchestratorConfig = {
      max_retries: this.config.max_verification_retries,
      scoping: {
        workspace_ref: scope.workspace_ref,
        environment_ref: scope.environment_ref,
        subject_ref: scope.subject_ref || `website:${root_domain}`,
        path_scope: scope.path_scope || null,
      },
      cycle_ref,
      root_domain,
      landing_url,
      conversion_proximity: this.config.default_conversion_proximity,
      is_production: this.config.default_is_production,
    };
    this.orchestrator = new VerificationOrchestrator(this.evidenceStore, orchConfig);
  }

  callTool(toolName: string, params: Record<string, unknown> = {}): ToolResult {
    if (!this.context) {
      return { type: 'error', data: { message: 'No context loaded. Call loadContext() first.' } };
    }

    // Handle verification tools that need the orchestrator
    switch (toolName) {
      case 'get_verification_status': {
        if (!this.orchestrator) {
          return { type: 'error', data: { message: 'Orchestrator not initialized.' } };
        }
        const id = params.request_id as string;
        if (!id) return { type: 'error', data: { message: 'request_id is required' } };
        const request = this.orchestrator.getRequest(id);
        if (!request) return { type: 'verification_status', data: null };
        const result = this.orchestrator.getResult(id);
        const view: VerificationStatusView = {
          request_id: id,
          type: request.verification_type,
          subject_ref: request.subject_ref,
          status: request.status,
          evidence_count: result?.evidence.length || 0,
          duration_ms: result?.duration_ms || null,
          errors: result?.errors || [],
          completed_at: request.completed_at,
        };
        return { type: 'verification_status', data: view };
      }

      case 'list_verifications': {
        if (!this.orchestrator) {
          return { type: 'error', data: { message: 'Orchestrator not initialized.' } };
        }
        const allRequests = this.orchestrator.getAllRequests();
        const views: VerificationStatusView[] = allRequests.map(req => {
          const result = this.orchestrator!.getResult(req.id);
          return {
            request_id: req.id,
            type: req.verification_type,
            subject_ref: req.subject_ref,
            status: req.status,
            evidence_count: result?.evidence.length || 0,
            duration_ms: result?.duration_ms || null,
            errors: result?.errors || [],
            completed_at: req.completed_at,
          };
        });
        return { type: 'verification_list', data: views };
      }
    }

    // All other tools go through the standard executor
    return executeTool(toolName, params, this.context);
  }

  // Execute a verification and recompute — the closed loop
  async executeVerification(requestId: string): Promise<ToolResult> {
    if (!this.orchestrator || !this.scope) {
      return { type: 'error', data: { message: 'No context loaded.' } };
    }

    try {
      const { verification, recomputation } = await this.orchestrator.executeAndRecompute(requestId);

      // Update engine context with recomputed results
      this.context = assembleContext(
        this.evidenceStore.query({ workspace_ref: this.scope.workspace_ref }),
        this.scope,
        this.cycleRef,
        this.rootDomain,
        this.landingUrl,
        this.config.default_conversion_proximity,
        this.config.default_is_production,
      );

      const view: VerificationStatusView = {
        request_id: requestId,
        type: this.orchestrator.getRequest(requestId)?.verification_type || '',
        subject_ref: this.orchestrator.getRequest(requestId)?.subject_ref || '',
        status: verification.status,
        evidence_count: verification.evidence.length,
        duration_ms: verification.duration_ms,
        errors: verification.errors,
        completed_at: verification.completed_at,
      };
      return { type: 'verification_status', data: view };

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { type: 'error', data: { message: msg } };
    }
  }

  // Submit + execute + recompute in one step (convenience)
  // Phase 27: Routes through global verification policy for consistent governance.
  async verify(params: {
    verification_type: string;
    subject_ref: string;
    reason: string;
    decision_ref?: string;
    requested_by?: 'mcp' | 'continuous_audit' | 'manual' | 'system';
  }): Promise<ToolResult> {
    if (!this.context) {
      return { type: 'error', data: { message: 'No context loaded.' } };
    }

    // Phase 27: Route ALL verification decisions through global policy
    const policyRequest = this.buildPolicyRequest(params);
    const policyDecision = evaluateVerificationPolicy(policyRequest, this.verificationPolicy);

    if (!policyDecision.approved) {
      // Policy denied — return advisory with full explainability
      return {
        type: 'verification_skipped',
        data: {
          requested_type: params.verification_type,
          recommended_type: policyDecision.effective_type,
          reasoning: policyDecision.reasoning,
          value_to_cost_ratio: 0,
          alternatives: policyDecision.alternatives,
        },
      };
    }

    // Use policy-approved type (may differ from requested)
    const effectiveType = policyDecision.effective_type;

    // Create request with policy-adjusted type
    const createResult = this.callTool('request_verification', {
      ...params,
      verification_type: effectiveType,
    });
    if (createResult.type !== 'verification_request') return createResult;

    const request = createResult.data;
    if (!this.orchestrator) {
      return { type: 'error', data: { message: 'Orchestrator not initialized.' } };
    }

    // Track verification in policy state
    this.verificationPolicy.active_count++;
    this.orchestrator.submit(request);

    const result = await this.executeVerification(request.id);

    // Record completion in policy state
    this.verificationPolicy.active_count = Math.max(0, this.verificationPolicy.active_count - 1);
    recordVerificationCompletion(
      this.verificationPolicy,
      params.subject_ref,
      policyDecision.estimated_cost,
    );

    return result;
  }

  /**
   * Build a policy request from verify() params.
   */
  private buildPolicyRequest(params: {
    verification_type: string;
    subject_ref: string;
    reason: string;
    decision_ref?: string;
    requested_by?: 'mcp' | 'continuous_audit' | 'manual' | 'system';
  }): VerificationPolicyRequest {
    const allDecisions = this.context ? [
      this.context.result.scale_readiness.decision,
      this.context.result.revenue_integrity.decision,
      this.context.result.chargeback_resilience.decision,
      ...(this.context.result.saas_growth_readiness
        ? [this.context.result.saas_growth_readiness.decision]
        : []),
    ] : [];

    const decision = params.decision_ref
      ? allDecisions.find(d => makeRef('decision', d.id) === params.decision_ref) || null
      : allDecisions[0] || null;

    return {
      requested_type: params.verification_type as VerificationType,
      subject_ref: params.subject_ref,
      decision,
      value_cases: this.context?.result.impact.value_cases ?? [],
      reason: params.reason,
      requested_by: params.requested_by || 'mcp',
    };
  }

  listTools(): typeof TOOL_DEFINITIONS { return TOOL_DEFINITIONS; }
  listResources(): McpResourceDefinition[] { return RESOURCE_DEFINITIONS; }
  getContext(): EngineContext | null { return this.context; }
  getOrchestrator(): VerificationOrchestrator | null { return this.orchestrator; }
  getSession(): McpSessionContext { return this.session; }

  // Session context management
  updateSession(updates: Partial<McpSessionContext>): void {
    if (updates.active_workspace !== undefined) setActiveWorkspace(this.session, updates.active_workspace);
    if (updates.selected_findings) setSelectedFindings(this.session, updates.selected_findings);
    if (updates.last_viewed_map !== undefined) markMapExplored(this.session, updates.last_viewed_map);
    if (updates.exploration_state) {
      for (const pack of updates.exploration_state.explored_packs || []) {
        markPackExplored(this.session, pack);
      }
    }
  }

  resetSession(): void {
    this.session = createEmptySession();
  }
}

const RESOURCE_DEFINITIONS: McpResourceDefinition[] = [
  { name: 'workspace_summary', description: 'High-level workspace summary with all packs, root causes, and actions.', uri_template: 'vestigio://workspace/{workspace_ref}/summary' },
  { name: 'decision_pack', description: 'Decision pack result with full explainability.', uri_template: 'vestigio://workspace/{workspace_ref}/pack/{pack_key}' },
  { name: 'root_causes', description: 'Root causes connecting problems across packs.', uri_template: 'vestigio://workspace/{workspace_ref}/root-causes' },
  { name: 'global_actions', description: 'Globally prioritized and deduplicated actions.', uri_template: 'vestigio://workspace/{workspace_ref}/actions' },
  { name: 'preflight_view', description: 'Preflight readiness status for traffic scaling.', uri_template: 'vestigio://workspace/{workspace_ref}/preflight' },
  { name: 'revenue_view', description: 'Revenue integrity assessment with leakage points.', uri_template: 'vestigio://workspace/{workspace_ref}/revenue' },
  { name: 'graph_summary', description: 'Evidence graph structure summary.', uri_template: 'vestigio://workspace/{workspace_ref}/graph' },
  { name: 'verifications', description: 'Verification requests and their results.', uri_template: 'vestigio://workspace/{workspace_ref}/verifications' },
];
