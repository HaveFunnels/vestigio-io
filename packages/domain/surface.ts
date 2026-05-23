import { SurfaceKind, EvidenceType } from "./enums";
import type { Scoping } from "./common";
import type { Evidence } from "./evidence";

// ──────────────────────────────────────────────
// Surface helpers — Wave 22.5
//
// Centralized helpers for deriving + comparing SurfaceKind. Keep them
// here so the evidence collector, signal extractors, inference layer,
// and projection layer all use the same logic instead of each layer
// re-deriving surface from URLs.
// ──────────────────────────────────────────────

/**
 * Resolve an effective SurfaceKind for downstream logic. Treats the
 * absence of the field (legacy data) as Public — matches the
 * pre-Wave-22.5 behavior where every signal was implicitly public.
 *
 * Use this when reading surface_kind from any consumer that needs a
 * definitive value. Do NOT use it when persisting — store the original
 * value (including undefined / Unknown) so the migration path stays
 * observable.
 */
export function effectiveSurfaceKind(
  kind: SurfaceKind | undefined | null,
): SurfaceKind {
  if (!kind || kind === SurfaceKind.Unknown) return SurfaceKind.Public;
  return kind;
}

/**
 * Compute the SurfaceKind for a Scoping. Convenience wrapper around
 * effectiveSurfaceKind that accepts the Scoping directly.
 */
export function scopeSurface(scoping: Pick<Scoping, "surface_kind">): SurfaceKind {
  return effectiveSurfaceKind(scoping.surface_kind);
}

/**
 * Aggregate surfaces from a list of signals into a single SurfaceKind
 * for an inference. Rules:
 *
 *   - If ANY signal is Mixed → result is Mixed.
 *   - If all signals agree on a single non-Unknown kind → that kind.
 *   - If signals split between Public + Authenticated → Mixed.
 *   - Otherwise → Public (Unknown rolled up to Public via
 *     effectiveSurfaceKind).
 *
 * This is intentionally permissive on the Public side: when in doubt
 * the inference is treated as public-surface, which matches the
 * pre-Wave-22.5 default and avoids accidentally hiding findings
 * during the migration window.
 */
export function aggregateSurfaceKind(
  surfaceKinds: Array<SurfaceKind | undefined | null>,
): SurfaceKind {
  if (surfaceKinds.length === 0) return SurfaceKind.Public;

  const effective = surfaceKinds.map(effectiveSurfaceKind);

  if (effective.some((k) => k === SurfaceKind.Mixed)) {
    return SurfaceKind.Mixed;
  }

  const hasPublic = effective.includes(SurfaceKind.Public);
  const hasAuth = effective.includes(SurfaceKind.Authenticated);

  if (hasPublic && hasAuth) return SurfaceKind.Mixed;
  if (hasAuth) return SurfaceKind.Authenticated;
  return SurfaceKind.Public;
}

/**
 * Heuristic URL classifier — used as a fallback when no explicit
 * surface_kind is set on the upstream evidence. Matches the URL
 * patterns the engine has historically used in funnel-moment-inference
 * and similar inference rules. Returns Unknown when neither pattern
 * fires; callers should default to Public via effectiveSurfaceKind.
 *
 * NOT authoritative — the right path is for evidence collectors to
 * stamp surface_kind explicitly (e.g. authenticated session crawls
 * → Authenticated; static HTTP fetches → Public). This helper exists
 * for the migration window when not every evidence row has the field.
 */
export function classifySurfaceByUrl(url: string | undefined | null): SurfaceKind {
  if (!url) return SurfaceKind.Unknown;
  const u = url.toLowerCase();
  // Common authenticated-app URL signatures across BR + global stacks.
  if (
    u.includes("/app/") ||
    u.includes("/app?") ||
    u.endsWith("/app") ||
    u.includes("/dashboard") ||
    u.includes("/admin/") ||
    u.includes("/account") ||
    u.includes("/painel") || // pt-BR
    u.includes("/conta") ||  // pt-BR
    u.includes("/onboarding") ||
    u.includes("/settings/")
  ) {
    return SurfaceKind.Authenticated;
  }
  // Subdomain hints — app.*, dashboard.*, admin.*, member.*, customer.*.
  // These are heuristic; a real Surface model (Tier 3) replaces this
  // with operator-declared URL patterns per subdomain.
  if (/^https?:\/\/(app|dashboard|admin|member|customer|portal|painel)\./i.test(url)) {
    return SurfaceKind.Authenticated;
  }
  return SurfaceKind.Public;
}

// Evidence types that are ALWAYS authenticated by construction. The
// saas-access collector + authenticated-crawl pipeline are the only
// sources of these — they capture pages behind a login.
const AUTHENTICATED_EVIDENCE_TYPES: ReadonlySet<EvidenceType> = new Set([
  EvidenceType.AuthenticatedPageView,
  EvidenceType.AuthenticatedSessionAttempt,
  EvidenceType.ActivationStepObserved,
  EvidenceType.EmptyStateObserved,
  EvidenceType.UpgradeSurfaceObserved,
  EvidenceType.FeatureUsageSurface,
  EvidenceType.NavigationStructureObserved,
  EvidenceType.AuthenticationBlockedEvent,
  EvidenceType.PrerequisiteMissingEvent,
]);

/**
 * Derive the SurfaceKind of a single Evidence row.
 *
 * Priority:
 *   1. If the evidence's Scoping already carries surface_kind
 *      (collector stamped it explicitly), trust that — collectors are
 *      authoritative.
 *   2. If the evidence_type is in AUTHENTICATED_EVIDENCE_TYPES, it's
 *      Authenticated by construction.
 *   3. Otherwise, try classifying by the URL embedded in the payload
 *      (different payload shapes carry the URL under different keys —
 *      url, final_url, target_url, page_url, source_url). When none
 *      of those exist or the URL doesn't match a known pattern, fall
 *      back to Public.
 *
 * Tier 3 (Surface as first-class) replaces step 3 with an exact match
 * against the env's operator-declared Surface URL patterns. Until
 * then this URL-substring fallback is good enough for the common case.
 */
export function inferEvidenceSurfaceKind(evidence: Evidence): SurfaceKind {
  if (evidence.scoping?.surface_kind) {
    return evidence.scoping.surface_kind;
  }
  if (AUTHENTICATED_EVIDENCE_TYPES.has(evidence.evidence_type)) {
    return SurfaceKind.Authenticated;
  }
  const url = extractUrlFromPayload(evidence.payload);
  if (url) {
    const guess = classifySurfaceByUrl(url);
    if (guess !== SurfaceKind.Unknown) return guess;
  }
  return SurfaceKind.Public;
}

/**
 * Extract a URL from an evidence payload. Different evidence types use
 * different field names for the URL — this helper inspects the common
 * candidates without branching on the payload's discriminator.
 */
function extractUrlFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  for (const key of ["url", "final_url", "target_url", "page_url", "source_url", "request_url"]) {
    const value = p[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

/**
 * Build a Map of evidence id → SurfaceKind for fast signal-time lookup.
 * Call once per recompute pass with the full evidence array, then pass
 * the map into stampSignalSurfaceKind for the per-signal stamping.
 */
export function buildEvidenceSurfaceIndex(
  evidence: readonly Evidence[],
): Map<string, SurfaceKind> {
  const index = new Map<string, SurfaceKind>();
  for (const e of evidence) {
    index.set(e.id, inferEvidenceSurfaceKind(e));
  }
  return index;
}

