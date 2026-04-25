// ──────────────────────────────────────────────
// Verification plan templates — keyed by verification_strategy
//
// When the user clicks "Verify" on a finding, the chat opens in
// verify-intent mode. The island that appears immediately is
// seeded from one of these templates (keyed by the finding's
// verification_strategy). The template's `goal_key` and each
// step's `label_key` resolve against dictionary entries under
// `console.chat.verify.plan.*`.
//
// The MCP can still refine the plan during conversation — the
// template just gives the user an instant, predictable roadmap
// instead of a blank island while the LLM thinks.
// ──────────────────────────────────────────────

export type VerificationStrategyKey =
	| 'http_static'
	| 'browser_runtime'
	| 'integration_pull'
	| 'external_scan'
	| 'pixel_accumulation'
	| 'heuristic_recompute'
	| 'reuse_only'
	| 'not_verifiable_explain'
	| null;

export interface VerificationPlanStep {
	id: string;
	label_key: string;
}

export interface VerificationPlanTemplate {
	goal_key: string;
	steps: VerificationPlanStep[];
}

const TERMINAL_STEP: VerificationPlanStep = {
	id: 'create_action',
	label_key: 'console.chat.verify.plan.steps.create_action',
};

const TEMPLATES: Record<Exclude<VerificationStrategyKey, null>, VerificationPlanTemplate> = {
	http_static: {
		goal_key: 'console.chat.verify.plan.goals.http_static',
		steps: [
			{ id: 'fetch_html', label_key: 'console.chat.verify.plan.steps.fetch_html' },
			{ id: 'confirm_signal', label_key: 'console.chat.verify.plan.steps.confirm_signal' },
			{ id: 'measure_radius', label_key: 'console.chat.verify.plan.steps.measure_radius' },
			{ id: 'draft_remediation', label_key: 'console.chat.verify.plan.steps.draft_remediation' },
			TERMINAL_STEP,
		],
	},
	browser_runtime: {
		goal_key: 'console.chat.verify.plan.goals.browser_runtime',
		steps: [
			{ id: 'launch_browser', label_key: 'console.chat.verify.plan.steps.launch_browser' },
			{ id: 'execute_scenario', label_key: 'console.chat.verify.plan.steps.execute_scenario' },
			{ id: 'confirm_rendering', label_key: 'console.chat.verify.plan.steps.confirm_rendering' },
			{ id: 'draft_remediation', label_key: 'console.chat.verify.plan.steps.draft_remediation' },
			TERMINAL_STEP,
		],
	},
	integration_pull: {
		goal_key: 'console.chat.verify.plan.goals.integration_pull',
		steps: [
			{ id: 'pull_data', label_key: 'console.chat.verify.plan.steps.pull_data' },
			{ id: 'verify_metric', label_key: 'console.chat.verify.plan.steps.verify_metric' },
			{ id: 'diagnose_cause', label_key: 'console.chat.verify.plan.steps.diagnose_cause' },
			{ id: 'draft_remediation', label_key: 'console.chat.verify.plan.steps.draft_remediation' },
			TERMINAL_STEP,
		],
	},
	external_scan: {
		goal_key: 'console.chat.verify.plan.goals.external_scan',
		steps: [
			{ id: 'kickoff_scan', label_key: 'console.chat.verify.plan.steps.kickoff_scan' },
			{ id: 'review_findings', label_key: 'console.chat.verify.plan.steps.review_findings' },
			{ id: 'assess_severity', label_key: 'console.chat.verify.plan.steps.assess_severity' },
			{ id: 'draft_remediation', label_key: 'console.chat.verify.plan.steps.draft_remediation' },
			TERMINAL_STEP,
		],
	},
	pixel_accumulation: {
		goal_key: 'console.chat.verify.plan.goals.pixel_accumulation',
		steps: [
			{ id: 'check_sessions', label_key: 'console.chat.verify.plan.steps.check_sessions' },
			{ id: 'evaluate_confidence', label_key: 'console.chat.verify.plan.steps.evaluate_confidence' },
			{ id: 'decide_wait_or_act', label_key: 'console.chat.verify.plan.steps.decide_wait_or_act' },
			{ id: 'draft_remediation', label_key: 'console.chat.verify.plan.steps.draft_remediation' },
			TERMINAL_STEP,
		],
	},
	heuristic_recompute: {
		goal_key: 'console.chat.verify.plan.goals.heuristic_recompute',
		steps: [
			{ id: 'recompute', label_key: 'console.chat.verify.plan.steps.recompute' },
			{ id: 'compare_baseline', label_key: 'console.chat.verify.plan.steps.compare_baseline' },
			{ id: 'diagnose_drift', label_key: 'console.chat.verify.plan.steps.diagnose_drift' },
			{ id: 'draft_remediation', label_key: 'console.chat.verify.plan.steps.draft_remediation' },
			TERMINAL_STEP,
		],
	},
	reuse_only: {
		goal_key: 'console.chat.verify.plan.goals.reuse_only',
		steps: [
			{ id: 'reuse_existing', label_key: 'console.chat.verify.plan.steps.reuse_existing' },
			TERMINAL_STEP,
		],
	},
	not_verifiable_explain: {
		goal_key: 'console.chat.verify.plan.goals.not_verifiable_explain',
		steps: [
			{ id: 'explain_no_auto', label_key: 'console.chat.verify.plan.steps.explain_no_auto' },
			{ id: 'map_manual_path', label_key: 'console.chat.verify.plan.steps.map_manual_path' },
			{ id: 'confirm_intent', label_key: 'console.chat.verify.plan.steps.confirm_intent' },
			{ id: 'draft_remediation', label_key: 'console.chat.verify.plan.steps.draft_remediation' },
			TERMINAL_STEP,
		],
	},
};

const FALLBACK: VerificationPlanTemplate = {
	goal_key: 'console.chat.verify.plan.goals.fallback',
	steps: [
		{ id: 'understand_hypothesis', label_key: 'console.chat.verify.plan.steps.understand_hypothesis' },
		{ id: 'gather_evidence', label_key: 'console.chat.verify.plan.steps.gather_evidence' },
		{ id: 'draft_remediation', label_key: 'console.chat.verify.plan.steps.draft_remediation' },
		TERMINAL_STEP,
	],
};

export function buildBaseVerificationPlan(
	strategy: VerificationStrategyKey,
): VerificationPlanTemplate {
	if (!strategy) return FALLBACK;
	return TEMPLATES[strategy] ?? FALLBACK;
}

export function isTerminalStep(stepId: string): boolean {
	return stepId === TERMINAL_STEP.id;
}
