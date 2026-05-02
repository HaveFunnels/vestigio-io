import {
  Evidence,
  Signal,
  Inference,
  Decision,
  Action,
  RiskEvaluation,
  Scoping,
  Opportunity,
  SuppressionRule,
  BusinessProfile,
  makeRef,
} from '../domain';
import { buildGraph } from '../graph';
import { extractSignals } from '../signals';
import { computeInferences } from '../inference';
import { produceDecision, DecisionResult } from '../decision';
import { resolveDecisionConflicts, ConflictReport } from '../decision/conflict-resolver';
import { generateOpportunities, OpportunityGenerationResult } from '../decision/opportunity-gate';
import { deriveActions } from '../actions';
import { produceIntelligence, DecisionIntelligenceResult } from '../intelligence';
import { estimateImpact, summarizeImpact, QuantifiedValueCase, ImpactSummary, BusinessInputs, OperationalAmplifiers } from '../impact';
import { computeClassification, extractClassificationInput, ClassificationState } from '../classification';
import { computePackEligibility, PackEligibility } from '../classification/eligibility';
import { detectMaturityStage, MaturityStage } from '../classification/maturity';
import { extractSaasSignals } from '../signals/saas-signals';
import { computeSaasInferences } from '../inference/saas-inference';
import { assessAllEvidenceQuality, EvidenceQuality } from '../evidence/quality';
import { adjustConfidenceByQuality, QualityAdjustmentResult } from '../evidence/confidence-adjuster';
import { harmonizeSignals, HarmonizationResult } from '../truth';
import { guardTruthConsistency, TruthConsistencyResult } from '../truth/consistency-guard';
import { applySuppressionEffects, SuppressionApplicationResult } from '../suppression';
import { computeSuppressionGovernance, SuppressionGovernanceResult } from '../suppression/governance';
import { detectChanges, CycleSnapshot, CycleChangeReport } from '../change-detection';
import {
  createVersionedSnapshot,
  VersionedSnapshot,
} from '../change-detection/snapshot-store';
import {
  evaluateProfileFreshness,
  profileConfidencePenalty,
  ProfileFreshnessCheck,
  ProfileDriftSignal,
} from '../domain/business-profile-lifecycle';
import { buildConfidenceAudit, ConfidenceIntegrityResult, ConfidenceAdjustment } from './confidence-audit';
import { validateBehavior, BehavioralValidationResult } from './behavioral-validation';
import type { EngineTranslations } from '../projections/types';
import {
  computeTrustSurfaceScore,
  TrustSurfaceScore,
  detectBlastRadiusRegression,
  BlastRadiusAlert,
  compressOpportunities,
  OpportunityCompressionResult,
  CompressibleFinding,
  detectCompoundFindings,
  buildCompoundInputs,
  CompoundFinding,
} from '../composites';
import {
  IntegrationSnapshot,
  CommerceContext,
  DataProvenance,
  reconcileIntegrations,
  RevenueRecoveryResult,
  computeRevenueRecovery,
} from '../integrations';

// Phase 29: Cross-layer penalty budget
// Maximum total confidence reduction across all penalty layers (suppression, profile, coherence).
// Confidence cannot drop below PENALTY_BUDGET_FLOOR fraction of its pre-penalty value.
const PENALTY_BUDGET_FLOOR = 0.40; // max 60% total reduction
import { createPreflightWorkspace, WorkspaceResult } from './workspace';
import { createRevenueWorkspace, RevenueWorkspaceResult } from './revenue-workspace';
import { createChargebackWorkspace, ChargebackWorkspaceResult } from './chargeback-workspace';
import { createSecurityWorkspace, SecurityWorkspaceResult } from './security-workspace';
import { createBehavioralWorkspace, BehavioralWorkspaceResult, BehavioralWorkspaceType } from './behavioral-workspace';
import { EvidenceType } from '../domain';

export interface RecomputeInput {
  evidence: Evidence[];
  scoping: Scoping;
  cycle_ref: string;
  root_domain: string;
  landing_url: string;
  question_key: string;
  conversion_proximity: number;
  is_production: boolean;
}

export interface GraphStats {
  total_nodes: number;
  total_edges: number;
  external_nodes: number;
  internal_nodes: number;
  node_types: Record<string, number>;
  edge_types: Record<string, number>;
}

export interface RecomputeResult {
  graph_stats: GraphStats;
  signals: Signal[];
  inferences: Inference[];
  decision: Decision;
  risk_evaluation: RiskEvaluation;
  actions: Action[];
  workspace: WorkspaceResult;
}

export function recompute(input: RecomputeInput): RecomputeResult {
  const {
    evidence, scoping, cycle_ref, root_domain, landing_url,
    question_key, conversion_proximity, is_production,
  } = input;

  const graph = buildGraph(evidence, root_domain, cycle_ref);
  const graphStats = summarizeGraph(graph);
  const signals = extractSignals(evidence, graph, scoping, cycle_ref);
  const inferences = computeInferences(signals, scoping, cycle_ref);

  const { decision, risk_evaluation }: DecisionResult = produceDecision({
    question_key, scoping, cycle_ref, signals, inferences,
    conversion_proximity, is_production,
  });

  const actions = deriveActions(decision);

  const workspace = createPreflightWorkspace(
    { name: `recompute_${root_domain}`, type: 'analysis', scoping, landing_url, cycle_ref },
    decision, actions, inferences,
  );

  return { graph_stats: graphStats, signals, inferences, decision, risk_evaluation, actions, workspace };
}

// ──────────────────────────────────────────────
// Multi-pack recomputation
// ──────────────────────────────────────────────

export interface MultiPackInput {
  evidence: Evidence[];
  scoping: Scoping;
  cycle_ref: string;
  root_domain: string;
  landing_url: string;
  conversion_proximity: number;
  is_production: boolean;
  business_inputs?: BusinessInputs | null;
  /** Onboarding-declared business model (prior, not truth) */
  onboarding_business_model?: string | null;
  /** Onboarding-declared conversion model (prior) */
  onboarding_conversion_model?: string | null;

  // Phase 26: Systemic integration inputs
  /** Active suppression rules to apply to decisions */
  suppression_rules?: SuppressionRule[];
  /** Previous cycle snapshot for change detection */
  previous_snapshot?: CycleSnapshot | null;
  /** Current business profile for freshness/drift evaluation */
  business_profile?: BusinessProfile | null;
  /** Observed drift signals for business profile */
  profile_drift_signals?: ProfileDriftSignal[];
  /** Engine translations for i18n support */
  translations?: EngineTranslations;
  /** Integration snapshots from connected data sources */
  integration_snapshots?: IntegrationSnapshot[];
}

export interface MultiPackResult {
  graph_stats: GraphStats;
  signals: Signal[];
  inferences: Inference[];
  scale_readiness: {
    decision: Decision;
    risk_evaluation: RiskEvaluation;
    actions: Action[];
    workspace: WorkspaceResult;
  };
  revenue_integrity: {
    decision: Decision;
    risk_evaluation: RiskEvaluation;
    actions: Action[];
    workspace: RevenueWorkspaceResult;
  };
  chargeback_resilience: {
    decision: Decision;
    risk_evaluation: RiskEvaluation;
    actions: Action[];
    workspace: ChargebackWorkspaceResult;
  };
  saas_growth_readiness: {
    decision: Decision;
    risk_evaluation: RiskEvaluation;
    actions: Action[];
    workspace: WorkspaceResult;
  } | null; // null when SaaS pack not eligible
  money_moment_exposure: {
    decision: Decision;
    risk_evaluation: RiskEvaluation;
    actions: Action[];
    workspace: SecurityWorkspaceResult;
  };
  copy_alignment: {
    decision: Decision;
    risk_evaluation: RiskEvaluation;
    actions: Action[];
    workspace: WorkspaceResult;
  };
  intelligence: DecisionIntelligenceResult;
  impact: {
    value_cases: QuantifiedValueCase[];
    summary: ImpactSummary;
  };
  classification: ClassificationState;
  pack_eligibility: PackEligibility;
  // Phase 25: Systemic consistency layers
  conflict_report: ConflictReport;
  opportunities: OpportunityGenerationResult;
  evidence_quality: EvidenceQuality[];

  // Phase 26: Operationalized systemic layers
  /** Truth resolution applied to multi-source signals */
  truth_harmonization: HarmonizationResult | null;
  /** Truth consistency guard — contradiction metadata for explainability */
  truth_consistency: TruthConsistencyResult | null;
  /** Evidence quality → confidence adjustments */
  quality_adjustments: QualityAdjustmentResult | null;
  /** Suppression effects applied to decisions */
  suppression_result: SuppressionApplicationResult | null;
  /** Suppression governance — blind spots, escalations, explanations */
  suppression_governance: SuppressionGovernanceResult | null;
  /** Cycle-to-cycle change detection */
  change_report: CycleChangeReport | null;
  /** Versioned snapshot for persistence */
  current_snapshot: VersionedSnapshot | null;
  /** Business profile freshness evaluation */
  profile_freshness: ProfileFreshnessCheck | null;
  /** Confidence pipeline audit trail */
  confidence_audit: ConfidenceIntegrityResult | null;
  /** Behavioral validation results */
  behavioral_validation: BehavioralValidationResult | null;
  /** Wave 3.11: Maturity stage of this workspace */
  maturity_stage: MaturityStage;
  /** Behavioral workspaces (pixel-dependent) — null when no pixel data */
  behavioral_packs: {
    first_impression: { decision: Decision; risk_evaluation: RiskEvaluation; actions: Action[]; workspace: BehavioralWorkspaceResult } | null;
    action_value: { decision: Decision; risk_evaluation: RiskEvaluation; actions: Action[]; workspace: BehavioralWorkspaceResult } | null;
    acquisition_integrity: { decision: Decision; risk_evaluation: RiskEvaluation; actions: Action[]; workspace: BehavioralWorkspaceResult } | null;
    mobile_revenue: { decision: Decision; risk_evaluation: RiskEvaluation; actions: Action[]; workspace: BehavioralWorkspaceResult } | null;
    friction_tax: { decision: Decision; risk_evaluation: RiskEvaluation; actions: Action[]; workspace: BehavioralWorkspaceResult } | null;
    trust_gap: { decision: Decision; risk_evaluation: RiskEvaluation; actions: Action[]; workspace: BehavioralWorkspaceResult } | null;
    path_efficiency: { decision: Decision; risk_evaluation: RiskEvaluation; actions: Action[]; workspace: BehavioralWorkspaceResult } | null;
  };

  // Wave 3.4: Composite findings — enrichments computed after the core pipeline
  composites: {
    trust_surface_score: TrustSurfaceScore;
    blast_radius: BlastRadiusAlert;
    opportunity_compression: OpportunityCompressionResult;
    /** Wave 4.7: Cross-domain compound findings — causal chains spanning multiple packs */
    compound_findings: CompoundFinding[];
  } | null;

  // Integration data layer
  commerce_context: CommerceContext | null;
  data_provenance: DataProvenance | null;
  revenue_recovery: RevenueRecoveryResult | null;
}

export function recomputeAll(input: MultiPackInput): MultiPackResult {
  const {
    evidence, scoping, cycle_ref, root_domain, landing_url,
    conversion_proximity, is_production, translations,
  } = input;

  // ─── Phase 26: Evidence quality assessment (early, feeds confidence) ───
  const evidenceQuality = assessAllEvidenceQuality(evidence);

  // ─── Early integration reconciliation — needed before signal extraction ───
  let commerceContext: CommerceContext | null = null;
  let dataProvenance: DataProvenance | null = null;
  let reconciledBusinessInputs: BusinessInputs | null = input.business_inputs || null;
  let reconciledAmplifiers: OperationalAmplifiers | undefined;

  const integrationSnapshots = input.integration_snapshots || [];
  if (integrationSnapshots.length > 0) {
    const businessModel = input.onboarding_business_model || 'ecommerce';
    const reconciliation = reconcileIntegrations(integrationSnapshots, businessModel);
    reconciledBusinessInputs = reconciliation.business_inputs;
    commerceContext = reconciliation.commerce_context;
    reconciledAmplifiers = reconciliation.amplifiers;
    dataProvenance = reconciliation.provenance;
  }

  // ─── Shared pipeline: graph + signals + inferences ───
  const graph = buildGraph(evidence, root_domain, cycle_ref, integrationSnapshots);
  const graphStats = summarizeGraph(graph);
  const rawSignals = extractSignals(evidence, graph, scoping, cycle_ref, commerceContext);

  // ─── Phase 26: Truth resolution — harmonize multi-source signals ───
  const truthHarmonization = harmonizeSignals(rawSignals, evidence);
  const truthResolvedSignals = truthHarmonization.signals;

  // ─── Phase 27: Truth consistency guard — attach contradiction metadata ───
  const truthConsistency = guardTruthConsistency(rawSignals, truthResolvedSignals, truthHarmonization);

  // ─── Phase 26: Evidence quality → confidence adjustment ───
  // Use truth-resolved signals (consistency guard is observational, not mutating)
  const qualityAdjustment = adjustConfidenceByQuality(truthResolvedSignals, evidenceQuality);
  const signals = qualityAdjustment.signals;

  // ─── Inferences from quality-adjusted, truth-resolved signals ───
  const inferences = computeInferences(signals, scoping, cycle_ref);

  // Scale readiness decision
  const scaleResult: DecisionResult = produceDecision({
    question_key: 'is_it_safe_to_scale_traffic',
    scoping, cycle_ref, signals, inferences,
    conversion_proximity, is_production, translations,
  });
  const scaleActions = deriveActions(scaleResult.decision);
  const scaleWorkspace = createPreflightWorkspace(
    { name: 'Preflight', type: 'analysis', scoping, landing_url, cycle_ref },
    scaleResult.decision, scaleActions, inferences,
  );

  // Revenue integrity decision
  const revenueResult: DecisionResult = produceDecision({
    question_key: 'is_there_revenue_leakage_in_high_intent_paths',
    scoping, cycle_ref, signals, inferences,
    conversion_proximity, is_production, translations,
  });
  const revenueActions = deriveActions(revenueResult.decision);
  const revenueWorkspace = createRevenueWorkspace(
    { name: 'Revenue Analysis', scoping, landing_url, cycle_ref },
    revenueResult.decision, revenueActions, inferences,
  );

  // Chargeback resilience decision
  const chargebackResult: DecisionResult = produceDecision({
    question_key: 'is_chargeback_pressure_elevated',
    scoping, cycle_ref, signals, inferences,
    conversion_proximity, is_production, translations,
  });
  const chargebackActions = deriveActions(chargebackResult.decision);
  const chargebackWorkspace = createChargebackWorkspace(
    { name: 'Chargeback Analysis', scoping, landing_url, cycle_ref },
    chargebackResult.decision, chargebackActions, inferences,
  );

  // Wave 3.3: Security posture decision
  const securityResult: DecisionResult = produceDecision({
    question_key: 'is_visible_security_posture_creating_financial_risk',
    scoping, cycle_ref, signals, inferences,
    conversion_proximity, is_production, translations,
  });
  const securityActions = deriveActions(securityResult.decision);
  const securityWorkspace = createSecurityWorkspace(
    { name: 'Security Posture', scoping, landing_url, cycle_ref },
    securityResult.decision, securityActions, inferences,
  );

  // Wave 3.10: Copy alignment decision
  const copyAlignmentResult: DecisionResult = produceDecision({
    question_key: 'is_copy_aligned_with_commercial_intent',
    scoping, cycle_ref, signals, inferences,
    conversion_proximity, is_production, translations,
  });
  const copyAlignmentActions = deriveActions(copyAlignmentResult.decision);
  const copyAlignmentWorkspace = createPreflightWorkspace(
    { name: 'Copy Alignment', type: 'analysis', scoping, landing_url, cycle_ref },
    copyAlignmentResult.decision, copyAlignmentActions, inferences,
  );

  // Classification — probabilistic business model + surface hypotheses
  const classInput = extractClassificationInput(
    evidence,
    input.onboarding_business_model || null,
    input.onboarding_conversion_model || null,
  );
  const classification = computeClassification(classInput);

  // Detect behavioral evidence + session count for the eligibility gate.
  // The pack-eligibility result drives both the projection layer's
  // "is this pack greyed out?" path and the UI's pixel_status badge.
  // We accept either flavor of behavioral evidence (env-level
  // BehavioralSessionPayload or cohort-level BehavioralCohortPayload)
  // because Wave 0.3 emits both — see apps/audit-runner/process-behavioral.ts.
  let behavioralSessionCount = 0;
  let hasBehavioralEvidence = false;
  for (const e of evidence) {
    if (e.evidence_type !== EvidenceType.BehavioralSession) continue;
    const p = e.payload as { type?: string; session_count?: number; total_session_count?: number };
    if (p.type === 'behavioral_cohort' && typeof p.total_session_count === 'number') {
      behavioralSessionCount = Math.max(behavioralSessionCount, p.total_session_count);
      hasBehavioralEvidence = true;
    } else if (typeof p.session_count === 'number') {
      behavioralSessionCount = Math.max(behavioralSessionCount, p.session_count);
      hasBehavioralEvidence = true;
    }
  }

  const packEligibility = computePackEligibility(classification, null, null, {
    hasBehavioralEvidence,
    sessionCount: behavioralSessionCount,
  });

  // SaaS growth readiness (only if eligible)
  let saasGrowthReadiness: MultiPackResult['saas_growth_readiness'] = null;
  let saasSignals: Signal[] = [];
  let saasInferences: Inference[] = [];

  if (packEligibility.saas_pack.eligible) {
    saasSignals = extractSaasSignals(evidence, scoping, cycle_ref);
    saasInferences = computeSaasInferences([...signals, ...saasSignals], scoping, cycle_ref);

    if (saasInferences.length > 0) {
      const saasResult: DecisionResult = produceDecision({
        question_key: 'is_saas_growth_ready',
        scoping, cycle_ref, signals: [...signals, ...saasSignals], inferences: [...inferences, ...saasInferences],
        conversion_proximity, is_production, translations,
      });
      const saasActions = deriveActions(saasResult.decision);
      const saasWorkspace = createPreflightWorkspace(
        { name: 'SaaS Growth', type: 'analysis', scoping, landing_url, cycle_ref },
        saasResult.decision, saasActions, [...inferences, ...saasInferences],
      );
      saasGrowthReadiness = {
        decision: saasResult.decision,
        risk_evaluation: saasResult.risk_evaluation,
        actions: saasActions,
        workspace: saasWorkspace,
      };
    }
  }

  // ─── Behavioral workspaces (pixel-dependent) ───
  const BEHAVIORAL_QUESTIONS: { type: BehavioralWorkspaceType; question_key: string; name: string }[] = [
    { type: 'first_impression', question_key: 'is_first_session_conversion_leaking', name: 'First Impression Revenue' },
    { type: 'action_value', question_key: 'are_user_actions_driving_revenue', name: 'Action Value Map' },
    { type: 'acquisition_integrity', question_key: 'is_paid_traffic_reaching_conversion', name: 'Acquisition Integrity' },
    { type: 'mobile_revenue', question_key: 'is_mobile_experience_costing_revenue', name: 'Mobile Revenue Exposure' },
    { type: 'friction_tax', question_key: 'how_much_does_ux_friction_cost', name: 'Friction Tax' },
    { type: 'trust_gap', question_key: 'is_trust_deficit_blocking_revenue', name: 'Trust Revenue Gap' },
    { type: 'path_efficiency', question_key: 'are_visitors_on_shortest_conversion_path', name: 'Path to Purchase Efficiency' },
  ];

  const behavioralPacks: MultiPackResult['behavioral_packs'] = {
    first_impression: null,
    action_value: null,
    acquisition_integrity: null,
    mobile_revenue: null,
    friction_tax: null,
    trust_gap: null,
    path_efficiency: null,
  };

  // Check for behavioral evidence with sufficient sessions
  const hasBehavioralData = evidence.some(e => {
    if (e.evidence_type !== EvidenceType.BehavioralSession) return false;
    const p = e.payload as any;
    return (p.session_count >= 20) || (p.type === 'behavioral_cohort' && p.total_session_count >= 20);
  });

  if (hasBehavioralData) {
    for (const bq of BEHAVIORAL_QUESTIONS) {
      const bResult: DecisionResult = produceDecision({
        question_key: bq.question_key,
        scoping, cycle_ref, signals, inferences,
        conversion_proximity, is_production, translations,
      });
      const bActions = deriveActions(bResult.decision);
      const bWorkspace = createBehavioralWorkspace(
        bq.type,
        { name: bq.name, scoping, landing_url, cycle_ref },
        bResult.decision, bActions, inferences,
        translations?.behavioral_issues,
      );
      (behavioralPacks as any)[bq.type] = {
        decision: bResult.decision,
        risk_evaluation: bResult.risk_evaluation,
        actions: bActions,
        workspace: bWorkspace,
      };
    }
  }

  // Merge SaaS signals/inferences into main arrays
  const allSignals = [...signals, ...saasSignals];
  const allInferences = [...inferences, ...saasInferences];

  // Collect all decisions and risk evaluations
  let allDecisions = [scaleResult.decision, revenueResult.decision, chargebackResult.decision, securityResult.decision, copyAlignmentResult.decision];
  let allRiskEvals = [scaleResult.risk_evaluation, revenueResult.risk_evaluation, chargebackResult.risk_evaluation, securityResult.risk_evaluation, copyAlignmentResult.risk_evaluation];
  if (saasGrowthReadiness) {
    allDecisions.push(saasGrowthReadiness.decision);
    allRiskEvals.push(saasGrowthReadiness.risk_evaluation);
  }
  // Add behavioral workspace decisions
  for (const bp of Object.values(behavioralPacks)) {
    if (bp) {
      allDecisions.push(bp.decision);
      allRiskEvals.push(bp.risk_evaluation);
    }
  }

  // ─── Phase 29: Instrumented confidence adjustment tracking ───
  const instrumentedAdjustments: ConfidenceAdjustment[] = [];

  // Capture pre-penalty confidence for penalty budget enforcement
  const prePenaltyConfidence = new Map<string, number>();
  for (const d of allDecisions) {
    prePenaltyConfidence.set(makeRef('decision', d.id), d.confidence_score);
  }

  // ─── Phase 26: Suppression effects → confidence adjustment ───
  let suppressionResult: SuppressionApplicationResult | null = null;
  const suppressionRules = input.suppression_rules || [];
  if (suppressionRules.length > 0) {
    // Snapshot before suppression for instrumentation
    const preSuppressionConf = new Map(allDecisions.map(d => [makeRef('decision', d.id), d.confidence_score]));

    suppressionResult = applySuppressionEffects(allDecisions, allRiskEvals, suppressionRules);
    allDecisions = suppressionResult.decisions;
    allRiskEvals = suppressionResult.risk_evaluations;

    // Record instrumented suppression adjustments
    for (const d of allDecisions) {
      const ref = makeRef('decision', d.id);
      const before = preSuppressionConf.get(ref) ?? d.confidence_score;
      if (before !== d.confidence_score) {
        const wasCapped = d.confidence_score === 5 && (before - d.confidence_score) < (before - 5);
        instrumentedAdjustments.push({
          layer: 'suppression',
          subject_type: 'decision',
          subject_ref: ref,
          adjustment_type: 'penalty',
          value: d.confidence_score - before,
          before,
          after: d.confidence_score,
          reason: `Suppression reduced confidence by ${before - d.confidence_score} points.`,
          capped: d.confidence_score === 5,
          cap_type: d.confidence_score === 5 ? 'floor' : null,
        });
      }
    }
  }

  // ─── Phase 27: Suppression governance — blind spots, escalations ───
  let suppressionGovernance: SuppressionGovernanceResult | null = null;
  if (suppressionResult) {
    suppressionGovernance = computeSuppressionGovernance(
      suppressionResult, allDecisions, suppressionRules,
    );
  }

  // ─── Phase 26+29: Business profile freshness → graduated confidence penalty ───
  let profileFreshness: ProfileFreshnessCheck | null = null;
  let profilePenalty = 1.0;
  if (input.business_profile) {
    const driftSignals = input.profile_drift_signals || [];
    profileFreshness = evaluateProfileFreshness(input.business_profile, driftSignals);
    profilePenalty = profileConfidencePenalty(profileFreshness);

    // Phase 29: Apply graduated profile penalty directly (no dead zone cap)
    if (profilePenalty < 1.0) {
      allDecisions = allDecisions.map(d => {
        const ref = makeRef('decision', d.id);
        const before = d.confidence_score;
        const after = Math.max(5, Math.round(before * profilePenalty));
        if (before !== after) {
          instrumentedAdjustments.push({
            layer: 'profile_freshness',
            subject_type: 'decision',
            subject_ref: ref,
            adjustment_type: 'multiplier',
            value: after - before,
            before,
            after,
            reason: `Profile ${profileFreshness!.staleness_days}d old` +
              (profileFreshness!.drift_detected ? ` + ${profileFreshness!.drift_signals.length} drift signal(s)` : '') +
              `. Penalty: ${profilePenalty}x.`,
            capped: after === 5,
            cap_type: after === 5 ? 'floor' : null,
          });
        }
        return { ...d, confidence_score: after };
      });
      allRiskEvals = allRiskEvals.map(r => {
        const before = r.confidence_score;
        const after = Math.max(5, Math.round(before * profilePenalty));
        return {
          ...r,
          confidence_score: after,
          rationale: {
            ...r.rationale,
            penalties: [
              ...r.rationale.penalties,
              {
                type: 'business_context' as const,
                description: `Business profile is ${profileFreshness!.staleness_days} days old. ` +
                  `Decision confidence reduced by ${Math.round((1 - profilePenalty) * 100)}% (${profilePenalty}x multiplier).`,
                adjustment: after - before,
              },
            ],
          },
        };
      });
    }
  }

  // Intelligence layer — populated here, called AFTER all penalties below (E7 fix).
  const actionsByDecision = new Map<string, Action[]>();
  actionsByDecision.set(makeRef('decision', allDecisions[0].id), scaleActions);
  actionsByDecision.set(makeRef('decision', allDecisions[1].id), revenueActions);
  actionsByDecision.set(makeRef('decision', allDecisions[2].id), chargebackActions);
  actionsByDecision.set(makeRef('decision', allDecisions[3].id), securityActions);
  actionsByDecision.set(makeRef('decision', allDecisions[4].id), copyAlignmentActions);
  if (saasGrowthReadiness && allDecisions.length > 5) {
    actionsByDecision.set(makeRef('decision', allDecisions[5].id), saasGrowthReadiness.actions);
  }

  // Impact estimation — with profile freshness penalty and reconciled inputs/amplifiers
  const valueCases = estimateImpact(allInferences, reconciledBusinessInputs, profilePenalty, reconciledAmplifiers);
  const impactSummary = summarizeImpact(valueCases);

  // Phase 25: Decision conflict resolution
  const conflictReport = resolveDecisionConflicts(allDecisions);

  // ─── Phase 29: Coherence consequences — graduated penalty for incoherence ───
  const coherenceScore = conflictReport.resolved_decisions?.coherence_score ?? 100;
  if (coherenceScore < 70) {
    // Phase 29: Lowered floor from 0.85 to 0.65 for meaningful severe-incoherence penalties
    const coherencePenalty = Math.max(0.65, coherenceScore / 100);
    allDecisions = allDecisions.map(d => {
      const resolved = conflictReport.resolved_decisions?.decisions.find(
        rd => rd.decision_ref === makeRef('decision', d.id),
      );
      // Only penalize decisions involved in conflicts, but NOT winners of precedence-resolved conflicts.
      // A decision that won every precedence conflict it's involved in should not be penalized for incoherence.
      const decisionRef = makeRef('decision', d.id);
      const isWinnerInAllConflicts = resolved && resolved.conflict_refs.length > 0 &&
        conflictReport.conflicts
          .filter(c => c.decision_a_ref === decisionRef || c.decision_b_ref === decisionRef)
          .every(c => {
            if (c.resolution.method !== 'precedence') return false; // non-precedence conflicts still get penalty
            return c.resolution.winning_decision_ref === decisionRef;
          });
      if (resolved && resolved.conflict_refs.length > 0 && !isWinnerInAllConflicts) {
        const ref = makeRef('decision', d.id);
        const before = d.confidence_score;
        const after = Math.max(5, Math.round(before * coherencePenalty));
        if (before !== after) {
          instrumentedAdjustments.push({
            layer: 'coherence',
            subject_type: 'decision',
            subject_ref: ref,
            adjustment_type: 'multiplier',
            value: after - before,
            before,
            after,
            reason: `Coherence score ${coherenceScore}/100. Penalty: ${coherencePenalty}x (applied to conflicting decisions only).`,
            capped: after === 5,
            cap_type: after === 5 ? 'floor' : null,
          });
        }
        return { ...d, confidence_score: after };
      }
      return d;
    });
  }

  // ─── Phase 29: Cross-layer penalty budget enforcement ───
  // Prevent combined penalties (suppression + profile + coherence) from exceeding
  // the budget limit. Each decision's confidence cannot drop below PENALTY_BUDGET_FLOOR
  // of its pre-penalty value.
  allDecisions = allDecisions.map(d => {
    const ref = makeRef('decision', d.id);
    const original = prePenaltyConfidence.get(ref);
    if (original === undefined || original === d.confidence_score) return d;

    const budgetFloor = Math.max(5, Math.round(original * PENALTY_BUDGET_FLOOR));
    if (d.confidence_score < budgetFloor) {
      instrumentedAdjustments.push({
        layer: 'penalty_budget',
        subject_type: 'decision',
        subject_ref: ref,
        adjustment_type: 'budget_cap',
        value: budgetFloor - d.confidence_score,
        before: d.confidence_score,
        after: budgetFloor,
        reason: `Cross-layer penalty budget: total reduction capped at ${Math.round((1 - PENALTY_BUDGET_FLOOR) * 100)}%. ` +
          `Original: ${original}, uncapped: ${d.confidence_score}, budget floor: ${budgetFloor}.`,
        capped: true,
        cap_type: 'budget',
      });
      return { ...d, confidence_score: budgetFloor };
    }
    return d;
  });

  // Apply penalty budget to risk evaluations as well
  allRiskEvals = allRiskEvals.map((r, i) => {
    const d = allDecisions[i];
    if (!d) return r;
    // Risk evals track the matching decision's confidence
    const ref = makeRef('decision', d.id);
    const original = prePenaltyConfidence.get(ref);
    if (original === undefined) return r;
    const budgetFloor = Math.max(5, Math.round(original * PENALTY_BUDGET_FLOOR));
    if (r.confidence_score < budgetFloor) {
      return { ...r, confidence_score: budgetFloor };
    }
    return r;
  });

  // ─── E7 fix: Remove actions from decisions whose confidence dropped below threshold ───
  // All penalties (suppression, profile, coherence, budget) are now applied.
  // Filter out actions from severely penalized decisions before intelligence engine.
  const MIN_CONFIDENCE_FOR_ACTIONS = 20;
  for (const [ref] of actionsByDecision) {
    const decision = allDecisions.find(d => makeRef('decision', d.id) === ref);
    if (decision && decision.confidence_score < MIN_CONFIDENCE_FOR_ACTIONS) {
      actionsByDecision.delete(ref);
    }
  }

  const intelligence = produceIntelligence({
    inferences: allInferences,
    decisions: allDecisions,
    actions_by_decision: actionsByDecision,
    translations,
  });

  // Phase 25: Rigorous opportunity generation with gates
  const opportunityResult = generateOpportunities(
    allDecisions, allInferences, valueCases, scoping, cycle_ref,
  );

  // ─── Phase 26+27: Change detection — always produce a snapshot ───
  let changeReport: CycleChangeReport | null = null;

  // Wave 7.11: Collect source_kinds from evidence for source expansion detection
  const evidenceSourceKinds = new Set<string>();
  for (const ev of evidence) {
    if (ev.source_kind) evidenceSourceKinds.add(ev.source_kind);
  }

  const cycleSnapshot: CycleSnapshot = {
    cycle_ref,
    decisions: allDecisions,
    signals: allSignals,
    source_kinds: [...evidenceSourceKinds],
  };
  if (input.previous_snapshot) {
    changeReport = detectChanges(input.previous_snapshot, cycleSnapshot);
  }

  // ─── Integration: Revenue recovery estimation ───
  let revenueRecovery: RevenueRecoveryResult | null = null;
  if (changeReport && (reconciledBusinessInputs?.monthly_revenue ?? 0) > 0 && dataProvenance) {
    // Resolved findings from change detection
    const resolvedFindings = changeReport.resolved_issues.map(ri => {
      // Find matching value case for impact range
      const vc = valueCases.find(v => v.inference_key === ri.decision_key);
      return {
        key: ri.decision_key,
        cycle_ref: ri.previous_cycle_ref,
        impact_range: vc
          ? { min: vc.estimated_impact.range.min, max: vc.estimated_impact.range.max }
          : { min: 0, max: 0 },
      };
    });

    if (resolvedFindings.length > 0 && input.previous_snapshot) {
      // Previous revenue is approximated from the previous cycle's business inputs
      // In a real implementation this would come from stored integration snapshots
      const previousRevenue = input.business_inputs?.monthly_revenue ?? null;
      revenueRecovery = computeRevenueRecovery(
        resolvedFindings,
        reconciledBusinessInputs!.monthly_revenue,
        previousRevenue,
        dataProvenance.monthly_revenue_source || 'unknown',
      );
    }
  }

  // ─── Phase 30B: Inject regression inference from change detection ───
  // Regressions are composite interpretations of cycle-to-cycle state,
  // injected as inferences so they flow canonically through impact/projections.
  // Wave 7.11: Filter out regressions caused by data source expansion (false regressions).
  if (changeReport && changeReport.regressions.length > 0) {
    const materialRegressions = changeReport.regressions.filter(
      r => (r.severity === 'notable' || r.severity === 'significant' || r.severity === 'critical')
        && r.reason !== 'data_source_expanded',
    );
    if (materialRegressions.length > 0) {
      const regressedKeys = materialRegressions.map(r => r.decision_key);
      const worstSeverity = materialRegressions.some(r => r.severity === 'critical' || r.severity === 'significant') ? 'high' : 'medium';
      const now = new Date();
      const regressionInference: Inference = {
        id: `inf_regression_${cycle_ref}`,
        inference_key: 'revenue_path_regressed',
        category: 'revenue_path' as any,
        scoping,
        cycle_ref,
        freshness: { observed_at: now, fresh_until: new Date(now.getTime() + 86400000), freshness_state: 'fresh' as any, staleness_reason: null },
        conclusion: 'revenue_path_regressed',
        conclusion_value: worstSeverity,
        severity_hint: worstSeverity,
        confidence: 75,
        signal_refs: [],
        evidence_refs: [],
        reasoning: `${materialRegressions.length} material regression(s) detected since last audit. Worsened decisions: ${regressedKeys.slice(0, 3).join(', ')}. This is a confirmed degradation of a previously better state.`,
        description: null,
        created_at: now,
        updated_at: now,
      };
      allInferences.push(regressionInference);
    }
  }

  // ─── Phase 27: Create versioned snapshot for persistence ───
  const versionedSnapshot = createVersionedSnapshot(
    cycle_ref,
    scoping.workspace_ref,
    scoping.environment_ref,
    allDecisions,
    allSignals,
  );

  // ─── Wave 3.11: Maturity stage detection ───
  const resolvedCount = changeReport ? changeReport.resolved_issues.length : 0;
  const hasIntegrations = evidence.some(
    e => e.evidence_type === EvidenceType.IntegrationSnapshot ||
         (e.evidence_type as string) === 'shopify_store_metrics',
  );
  const maturityStage = detectMaturityStage({
    evidence,
    pack_eligibility: packEligibility,
    cycle_count: input.previous_snapshot ? 2 : 1, // at least 2 if we have a previous snapshot
    resolved_count: resolvedCount,
    has_integrations: hasIntegrations,
  });

  // Reassemble pack results with possibly-adjusted decisions and risk evaluations
  const assembledResult: MultiPackResult = {
    graph_stats: graphStats,
    signals: allSignals,
    inferences: allInferences,
    scale_readiness: {
      decision: allDecisions[0],
      risk_evaluation: allRiskEvals[0],
      actions: scaleActions,
      workspace: scaleWorkspace,
    },
    revenue_integrity: {
      decision: allDecisions[1],
      risk_evaluation: allRiskEvals[1],
      actions: revenueActions,
      workspace: revenueWorkspace,
    },
    chargeback_resilience: {
      decision: allDecisions[2],
      risk_evaluation: allRiskEvals[2],
      actions: chargebackActions,
      workspace: chargebackWorkspace,
    },
    money_moment_exposure: {
      decision: allDecisions[3],
      risk_evaluation: allRiskEvals[3],
      actions: securityActions,
      workspace: securityWorkspace,
    },
    copy_alignment: {
      decision: allDecisions[4],
      risk_evaluation: allRiskEvals[4],
      actions: copyAlignmentActions,
      workspace: copyAlignmentWorkspace,
    },
    saas_growth_readiness: saasGrowthReadiness ? {
      decision: allDecisions[5] || saasGrowthReadiness.decision,
      risk_evaluation: allRiskEvals[5] || saasGrowthReadiness.risk_evaluation,
      actions: saasGrowthReadiness.actions,
      workspace: saasGrowthReadiness.workspace,
    } : null,
    intelligence,
    impact: {
      value_cases: valueCases,
      summary: impactSummary,
    },
    classification,
    pack_eligibility: packEligibility,
    conflict_report: conflictReport,
    opportunities: opportunityResult,
    evidence_quality: evidenceQuality,

    // Phase 26: Operationalized systemic layers
    truth_harmonization: truthHarmonization,
    truth_consistency: truthConsistency,
    quality_adjustments: qualityAdjustment,
    suppression_result: suppressionResult,
    suppression_governance: suppressionGovernance,
    change_report: changeReport,
    current_snapshot: versionedSnapshot,
    profile_freshness: profileFreshness,

    // Phase 27: Confidence audit and behavioral validation (computed post-assembly)
    confidence_audit: null,       // set below
    behavioral_validation: null,  // set below
    // Wave 3.11: Maturity stage
    maturity_stage: maturityStage,
    behavioral_packs: behavioralPacks,

    // Wave 3.4: Composite findings (computed post-assembly)
    composites: null,

    // Integration data layer
    commerce_context: commerceContext,
    data_provenance: dataProvenance,
    revenue_recovery: revenueRecovery,
  };

  // ─── Phase 29: Confidence audit — instrumented with real before/after values ───
  assembledResult.confidence_audit = buildConfidenceAudit(assembledResult, instrumentedAdjustments);

  // ─── Phase 27: Behavioral validation — edge case checks ───
  assembledResult.behavioral_validation = validateBehavior(assembledResult, assembledResult.confidence_audit);

  // ─── Wave 3.4: Composite findings — enrich from completed pipeline results ───
  const trustSurfaceScore = computeTrustSurfaceScore(allInferences);
  const blastRadius = detectBlastRadiusRegression(changeReport);

  // Build CompressibleFinding[] from value cases (available without circular dep on projections)
  const compressibleFindings: CompressibleFinding[] = valueCases.map(vc => ({
    inference_key: vc.inference_key,
    impact_range: { min: vc.estimated_impact.range.min, max: vc.estimated_impact.range.max },
  }));
  const opportunityCompression = compressOpportunities(compressibleFindings);

  // Wave 4.7: Cross-domain compound findings detection
  const compoundInputs = buildCompoundInputs(allInferences, valueCases);

  // Wave 7.11 Bug B: Extract behavioral context from evidence for compound findings.
  // This upgrades compound findings like `ad_promise_reality_behavior` from 'heuristic'
  // to 'confirmed' confidence when behavioral data is available.
  let behavioralContext: { bounce_rate: number; avg_session_duration: number } | null = null;
  for (const e of evidence) {
    if (e.evidence_type !== EvidenceType.BehavioralSession) continue;
    const payload = e.payload as { type?: string; checkout_reached_rate?: number; avg_session_duration_ms?: number };
    if (payload.type === 'behavioral_cohort') continue; // use env-level payload
    behavioralContext = {
      bounce_rate: (1 - (payload.checkout_reached_rate || 0)) * 100,
      avg_session_duration: (payload.avg_session_duration_ms || 0) / 1000,
    };
    break;
  }

  const compoundFindings = detectCompoundFindings(compoundInputs, commerceContext, behavioralContext);

  assembledResult.composites = {
    trust_surface_score: trustSurfaceScore,
    blast_radius: blastRadius,
    opportunity_compression: opportunityCompression,
    compound_findings: compoundFindings,
  };

  return assembledResult;
}

function summarizeGraph(graph: ReturnType<typeof buildGraph>): GraphStats {
  let externalNodes = 0;
  let internalNodes = 0;
  const nodeTypes: Record<string, number> = {};
  const edgeTypes: Record<string, number> = {};

  for (const node of graph.nodes.values()) {
    if (node.is_external) externalNodes++;
    else internalNodes++;
    nodeTypes[node.node_type] = (nodeTypes[node.node_type] || 0) + 1;
  }

  for (const edge of graph.edges) {
    edgeTypes[edge.edge_type] = (edgeTypes[edge.edge_type] || 0) + 1;
  }

  return {
    total_nodes: graph.nodes.size,
    total_edges: graph.edges.length,
    external_nodes: externalNodes,
    internal_nodes: internalNodes,
    node_types: nodeTypes,
    edge_types: edgeTypes,
  };
}
