import {
  VerificationRequest,
  VerificationType,
  IdGenerator,
  Ref,
} from '../../packages/domain';
import { McpVerificationRequest } from './types';

// ──────────────────────────────────────────────
// Verification Request Bridge
//
// MCP can CREATE verification requests but
// NEVER executes collection directly.
// Requests are emitted for the orchestrator to handle.
// ──────────────────────────────────────────────

const ids = new IdGenerator('vr');

export function createVerificationRequest(
  request: McpVerificationRequest,
): VerificationRequest {
  const now = new Date();
  return {
    id: ids.next(),
    verification_type: request.verification_type,
    subject_ref: request.subject_ref,
    reason: request.reason,
    requested_by: request.requested_by,
    decision_ref: request.decision_ref,
    status: 'pending',
    result_evidence_refs: [],
    completed_at: null,
    created_at: now,
    updated_at: now,
  };
}

// Validates that a verification request is well-formed
export function validateVerificationRequest(request: McpVerificationRequest): string | null {
  if (!request.subject_ref || request.subject_ref.length === 0) {
    return 'subject_ref is required';
  }
  if (!request.reason || request.reason.length === 0) {
    return 'reason is required';
  }
  const validTypes: VerificationType[] = [
    VerificationType.ReuseOnly,
    VerificationType.LightProbe,
    VerificationType.BrowserVerification,
    VerificationType.IntegrationPull,
    VerificationType.AuthenticatedJourneyVerification,
    VerificationType.ExternalScan,
  ];
  if (!validTypes.includes(request.verification_type)) {
    return `Invalid verification_type: ${request.verification_type}`;
  }
  return null; // valid
}

// ──────────────────────────────────────────────
// Strategy → Dispatch plan
//
// Maps the projection's verification_strategy (7-value taxonomy in
// packages/domain/actions.ts) to one of three outcomes:
//
//   - dispatch: creates a VerificationRequest the orchestrator
//     eventually executes (http_static, browser_runtime,
//     integration_pull, external_scan)
//   - status: returns an immediate status message WITHOUT creating
//     a request (pixel_accumulation — session count report,
//     not_verifiable_explain — here's why)
//   - recompute: re-project in-process over existing evidence with
//     no new data (heuristic_recompute)
//
// Phase 3.2 is the UI wiring — this helper is the contract the UI
// consumes to know whether to show a spinner (dispatch), a status
// message (status), or a flash refresh (recompute).
// ──────────────────────────────────────────────

export type VerificationStrategyKey =
	| 'http_static'
	| 'browser_runtime'
	| 'integration_pull'
	| 'external_scan'
	| 'pixel_accumulation'
	| 'heuristic_recompute'
	| 'not_verifiable_explain'
	| null;

export type VerificationPlan =
	| {
			kind: 'dispatch';
			verification_type: VerificationType;
			expected_eta_seconds: number | null;
	  }
	| {
			kind: 'status';
			reason: 'pixel_accumulation' | 'not_verifiable_explain';
			message: string;
	  }
	| { kind: 'recompute'; message: string }
	| { kind: 'unclassified'; message: string };

export function planVerification(
	strategy: VerificationStrategyKey,
	notes: string | null,
	etaSeconds: number | null,
): VerificationPlan {
	switch (strategy) {
		case 'http_static':
			return {
				kind: 'dispatch',
				verification_type: VerificationType.LightProbe,
				expected_eta_seconds: etaSeconds,
			};
		case 'browser_runtime':
			return {
				kind: 'dispatch',
				verification_type: VerificationType.BrowserVerification,
				expected_eta_seconds: etaSeconds,
			};
		case 'integration_pull':
			return {
				kind: 'dispatch',
				verification_type: VerificationType.IntegrationPull,
				expected_eta_seconds: etaSeconds,
			};
		case 'external_scan':
			return {
				kind: 'dispatch',
				verification_type: VerificationType.ExternalScan,
				expected_eta_seconds: etaSeconds,
			};
		case 'pixel_accumulation':
			return {
				kind: 'status',
				reason: 'pixel_accumulation',
				message:
					notes ||
					'Behavioral findings are verified by session accumulation — no point-in-time re-check available.',
			};
		case 'not_verifiable_explain':
			return {
				kind: 'status',
				reason: 'not_verifiable_explain',
				message:
					notes ||
					'This finding cannot be re-verified from the public surface. See notes for manual review steps.',
			};
		case 'heuristic_recompute':
			return {
				kind: 'recompute',
				message:
					notes ||
					'Re-running the projection over current evidence — no new data fetch needed.',
			};
		case null:
		default:
			return {
				kind: 'unclassified',
				message:
					'Verification strategy not yet classified for this finding. Contact support if you need to re-verify this specific issue.',
			};
	}
}
