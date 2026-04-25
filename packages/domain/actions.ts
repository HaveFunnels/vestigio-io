import { DecisionImpact, EffectiveSeverity } from './enums';
import { Ref, Scoping, Timestamped } from './common';

// ──────────────────────────────────────────────
// Action — derived from decisions
// ──────────────────────────────────────────────

export interface Action extends Timestamped {
  id: string;
  action_key: string;
  scoping: Scoping;
  cycle_ref: string;
  decision_ref: Ref;
  action_type: ActionType;
  title: string;
  description: string;
  priority: number;
  severity: EffectiveSeverity;
  decision_impact: DecisionImpact;
  effort_hint: string | null;
  evidence_refs: Ref[];
  status: ActionStatus;

  /**
   * Ordered, actionable remediation steps. Phase 1 ships the field
   * null-default; Phase 2 backfills content per action_key (see
   * docs/REMEDIATION_FORMAT.md). Each step is a short verb-led
   * sentence ("Add a 200-word refund policy covering window, process,
   * and contact info"). Avoid sequencing words like "first" / "then"
   * — the array order is the sequence.
   */
  remediation_steps: string[] | null;

  /**
   * Rough effort estimate in dev-hours (median scenario). Null when
   * we don't have enough signal to calibrate. Surfaced on cards so
   * users can triage quick-wins vs. bigger projects. Separate from
   * `effort_hint` (a qualitative "small"/"medium"/"large" string) —
   * this one is quantitative.
   */
  estimated_effort_hours: number | null;

  /**
   * How this action / finding can be re-verified when the user
   * clicks "Verify" or asks the MCP chat to check. Null means we
   * haven't classified yet — Phase 2.5 backfills per action_key.
   *
   * Phase 3.2 extends the MCP verification tool to dispatch the
   * right worker based on this strategy. See VerificationStrategy
   * for the taxonomy.
   */
  verification_strategy: VerificationStrategy | null;

  /**
   * Human-readable note describing what the verification will do
   * when the user clicks Verify ("Vamos re-fetchar /checkout e
   * rechecar o selo SSL" / "Precisamos de 8 sessões a mais — temos
   * 12/20"). MCP reads this directly when answering "can I verify
   * this?" so the user never gets a silent "no".
   *
   * For strategy=pixel_accumulation this string should include the
   * current / required session numbers; Phase 3.2 resolves the
   * progress placeholders at render time.
   */
  verification_notes: string | null;

  /**
   * Approximate time the verification will take, in seconds. Drives
   * the UI's "verification in ~3s / ~30s / ~2min" hint so users don't
   * wait blind. Null for strategies where there's no meaningful ETA
   * (pixel_accumulation has a session-count hint instead).
   */
  verification_eta_seconds: number | null;
}

/**
 * How a finding can be re-checked. Each strategy maps to a worker
 * or evaluation path inside apps/mcp/verification.ts (Phase 3.2
 * expands the handlers). Picked per action_key during Phase 2.5
 * content backfill.
 */
export type VerificationStrategy =
  /**
   * Re-fetch the target URL(s), re-parse HTML, re-check the heuristic
   * that produced the finding. Cheap — seconds. Works for trust,
   * policy, checkout integrity, copy, discoverability findings.
   */
  | 'http_static'
  /**
   * Spin up a headless browser, execute JS, capture DOM + network.
   * Slower (30-60s). Needed for runtime findings — script hijack,
   * mixed content in loaded resources, mobile rendering, consent
   * banner behavior, runtime error interrupting purchase.
   */
  | 'browser_runtime'
  /**
   * Re-query a connected integration (Shopify, Nuvemshop). Fast-
   * medium. Only usable when an IntegrationConnection exists and
   * is fresh; otherwise falls back to `not_verifiable_explain`.
   */
  | 'integration_pull'
  /**
   * Re-dispatch a heavy external scanner (Katana deep discovery,
   * Nuclei vuln scan, brand-intel lookup). Minutes, not seconds.
   * Used for findings that depend on coverage those scanners
   * produce.
   */
  | 'external_scan'
  /**
   * Behavioral findings need more sessions to accumulate. Not
   * point-in-time verifiable — the "verification" is reporting
   * current session count vs the eligibility floor, and hinting
   * when the next natural re-check will happen.
   */
  | 'pixel_accumulation'
  /**
   * No new data needed; the finding can be re-derived by re-running
   * the projection layer on existing evidence. Instant.
   */
  | 'heuristic_recompute'
  /**
   * Genuinely cannot be point-in-time verified (e.g. a historical
   * regression claim, an external brand-impersonation finding that
   * needs manual review). The MCP surfaces the `verification_notes`
   * string as the user-facing explanation so nobody clicks Verify
   * and gets a silent no-op.
   */
  | 'reuse_only'
  | 'not_verifiable_explain';

export type ActionType = 'risk_mitigation' | 'opportunity_capture' | 'verification' | 'observation';

export type ActionStatus = 'pending' | 'in_progress' | 'completed' | 'dismissed';
