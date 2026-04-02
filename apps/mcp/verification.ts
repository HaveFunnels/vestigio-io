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
  ];
  if (!validTypes.includes(request.verification_type)) {
    return `Invalid verification_type: ${request.verification_type}`;
  }
  return null; // valid
}
