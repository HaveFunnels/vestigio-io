import { VerificationType } from './enums';
import { Ref, Timestamped } from './common';

// ──────────────────────────────────────────────
// Verification Request — controlled additional verification
// ──────────────────────────────────────────────

export interface VerificationRequest extends Timestamped {
  id: string;
  verification_type: VerificationType;
  subject_ref: string;
  reason: string;
  requested_by: string;
  decision_ref: Ref | null;
  status: VerificationStatus;
  result_evidence_refs: Ref[];
  completed_at: Date | null;
}

export type VerificationStatus =
  | 'pending'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'refused';
