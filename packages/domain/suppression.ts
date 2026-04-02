import { Timestamped } from './common';

// ──────────────────────────────────────────────
// Suppression Rule — false positive governance
// ──────────────────────────────────────────────

export interface SuppressionRule extends Timestamped {
  id: string;
  scope_ref: string;
  match_key: string;
  reason: string;
  created_by: string;
  expires_at: Date | null;
  review_policy: ReviewPolicy;
  is_active: boolean;
}

export type ReviewPolicy = 'manual' | 'auto_expire' | 'permanent';
