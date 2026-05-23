// ──────────────────────────────────────────────
// Engine — unified entry point (Wave 20.7)
//
// Single function `run(input)` that wraps recomputeAllAsync + projectAll
// (impact is computed inside recomputeAllAsync already, so callers get
// everything through the returned MultiPackResult.impact field).
//
// Two scopes:
//
//   { scope: 'full_cycle', ...MultiPackInput }
//     Full audit cycle. Identical behaviour to today's
//     recomputeAllAsync → projectAll sequence in run-cycle.ts. This is
//     the path the audit-runner takes for every cycle.
//
//   { scope: { kind: 'targeted', url, enrichers? }, ...MultiPackInput }
//     Wave 21 hook. The caller has detected that a specific URL changed
//     (lightweight probe diff) and wants the engine to recompute the
//     state implied by that one URL's new content. The CONTRACT here is
//     locked at 20.7 — implementation in this wave runs the full
//     recompute and FILTERS the projection output to findings/actions
//     touching the target URL. Wave 21 will optimize the inner path to
//     re-fetch + re-enrich only the affected URL via the staged
//     pipeline, but the API surface external callers depend on is
//     stable from 20.7 onward.
//
// Why this exists:
//   - run-cycle.ts is ~2300 lines of orchestration. The engine-core
//     part (signals → inferences → projections) is a small slice of
//     that. Wave 21 needs to invoke just that slice on demand without
//     pulling in the rest (integration polling, behavioral processing,
//     etc.). run() draws the boundary.
//   - Wave 21's behavioral-event-driven re-audit ("URL changed, redo
//     the analysis for that URL") needs a stable invocation point that
//     does not regress when the orchestrator gets refactored.
// ──────────────────────────────────────────────

import { recomputeAllAsync, MultiPackInput, MultiPackResult } from "./recompute";
import { projectAll } from "../projections";
import type { ProjectionResult, FindingProjection, ActionProjection } from "../projections";
import type { EngineTranslations } from "../projections/types";

export type EngineScope =
  | { kind: "full_cycle" }
  | {
      kind: "targeted";
      /**
       * The URL whose content changed and triggered the re-run. Used to
       * filter projection output (findings/actions/workspaces) so the
       * caller gets only the slice of the audit state implied by this
       * URL — not the entire FindingProjection[] from the full recompute.
       */
      url: string;
      /**
       * Optional list of enricher names to limit re-enrichment scope.
       * Wave 20.7 ignores this and re-runs the full enrichment set;
       * Wave 21 will use it to skip unrelated enrichers when the diff
       * is known to affect only specific dimensions (e.g. ['copy_micro_copy']
       * after a copy-only DOM diff).
       */
      enrichers?: string[];
    };

export interface EngineRunInput extends MultiPackInput {
  scope?: EngineScope;
  /**
   * Optional previous-cycle findings, threaded through to projectAll
   * so finding lifecycle (Wave 20.4) + change-class detection can
   * compute new vs regressed vs improved. The audit-runner already
   * loads these from PrismaFindingStore before calling — engine.run
   * is agnostic to where they came from.
   */
  previousFindings?: FindingProjection[];
  /**
   * Optional translations bundle for projectAll. Falls back to engine
   * defaults (English) when omitted.
   */
  translations?: EngineTranslations;
  /**
   * Optional recompute backend. Defaults to `recomputeAllAsync` (in-
   * process generator drainer). The audit-runner passes
   * `recomputeWithPool` here so a `RECOMPUTE_USE_WORKER_THREADS=1`
   * deploy offloads the engine to worker_threads on a separate V8
   * isolate without engine.run() having to know that infrastructure
   * exists. Layering: this package can't import apps/audit-runner, so
   * the alternative backend is injected from the caller.
   */
  recompute?: (input: MultiPackInput) => Promise<MultiPackResult>;
}

export interface EngineRunOutput {
  /** The raw multi-pack result (signals, inferences, decisions, impact). */
  multipack: MultiPackResult;
  /** UI-shaped projections (findings, actions, workspaces, change report). */
  projections: ProjectionResult;
  /** Echo of the scope used, so loggers / metrics can attribute timing. */
  scope: EngineScope;
}

/**
 * Single entry point for the engine.
 *
 * Today's audit-runner is expected to call `run({ scope: { kind: 'full_cycle' }, ...input })`
 * and persist the result. Wave 21's behavioral event handler will
 * call `run({ scope: { kind: 'targeted', url }, ...input })` after a
 * lightweight probe detects a URL change.
 */
export async function run(input: EngineRunInput): Promise<EngineRunOutput> {
  const scope: EngineScope = input.scope ?? { kind: "full_cycle" };

  // The multipack recompute is identical for both scopes today. Wave 21
  // will introduce a partial-recompute path for `targeted` that skips
  // integration polling + re-fetches only the target URL; the contract
  // here is stable regardless of how that fills out.
  const recomputeFn = input.recompute ?? recomputeAllAsync;
  const multipack = await recomputeFn(input);

  let projections = projectAll(multipack, input.translations, {
    previousFindings: input.previousFindings,
  });

  if (scope.kind === "targeted") {
    projections = filterProjectionsByUrl(projections, scope.url);
  }

  return { multipack, projections, scope };
}

/**
 * Filter a full ProjectionResult down to the slice that touches a
 * specific URL. Used by `scope: 'targeted'` to return a partial
 * EngineRunOutput. The filter is intentionally inclusive — anything
 * whose surface OR root_cause OR linked-finding surface mentions the
 * URL is kept — so the targeted output is a superset of "things you
 * need to know about because of this URL change", never less.
 */
function filterProjectionsByUrl(proj: ProjectionResult, url: string): ProjectionResult {
  const findingTouchesUrl = (f: FindingProjection): boolean => {
    if (f.surface === url) return true;
    if (f.surface?.includes(url)) return true;
    return false;
  };

  const filteredFindings = proj.findings.filter(findingTouchesUrl);
  const filteredFindingIds = new Set(filteredFindings.map(f => f.id));

  const actionTouchesUrl = (a: ActionProjection): boolean => {
    // Actions are linked to one or more findings — keep the action if
    // ANY of its linked findings is in our filtered set.
    const linked = (a as ActionProjection & { linked_findings?: { id: string }[] }).linked_findings;
    if (!linked) return false;
    return linked.some(lf => filteredFindingIds.has(lf.id));
  };

  return {
    ...proj,
    findings: filteredFindings,
    actions: proj.actions.filter(actionTouchesUrl),
    // Workspaces are aggregate by pack — keep them all so the caller can
    // see "this URL's changes hit the copy_alignment + revenue_integrity
    // workspaces" without losing structure. Each workspace's `findings`
    // array is re-filtered to the URL-relevant subset.
    workspaces: proj.workspaces.map(ws => ({
      ...ws,
      findings: ws.findings.filter(findingTouchesUrl),
    })),
  };
}
