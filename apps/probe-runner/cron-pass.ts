// ──────────────────────────────────────────────
// Probe cron pass — Wave 21.2
//
// One scan over every probe-eligible environment. The cron in
// instrumentation-node.ts fires this every PROBE_TICK_MS (currently
// 60s) gated by withLeadership("probe"). Each env's actual cadence is
// enforced inside runProbePassForEnv via the probeLastRunAt debounce,
// so this loop's job is just "for each env, check whether it's due
// and run if so".
//
// On change detection (probesChanged > 0), this module enqueues a
// targeted audit cycle via apps/platform/audit-cycle-queue. The
// audit-runner picks it up, reads AuditCycle.scopeJson, and routes
// to engine.run({ scope: { kind: 'targeted', url } }) — Wave 20.7's
// stable contract.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { cadenceForPlan, runProbePassForEnv, type ProbeResult } from "./index";
import { assessSiteLiveness, pauseForDeadSite } from "./site-liveness";
import { assessUrlVolatility, VOLATILITY_WINDOW_HOURS } from "./volatility";

export interface ProbeCronPassResult {
  /** Total envs the cron considered eligible. */
  envsScanned: number;
  /** Envs whose cadence debounce skipped them this tick. */
  envsSkipped: number;
  /** Envs where at least one probe was actually persisted this tick. */
  envsProbed: number;
  /** Aggregate count of probes that detected a content change. */
  changesDetected: number;
  /** Aggregate count of targeted audit cycles enqueued. */
  cyclesEnqueued: number;
  /** Aggregate per-URL fetch errors across all envs. */
  errors: number;
  /** Envs paused this tick because their site stopped existing. */
  envsPausedDead: number;
  /** Targeted cycles not enqueued because the URL is dynamic content. */
  volatileSkips: number;
  durationMs: number;
}

/**
 * Run a single probe-cron pass.
 *
 * Iterates ACTIVE, non-paused, probe-enabled envs. Per env: looks up
 * the org's plan to pick cadence, calls runProbePassForEnv (which
 * itself enforces the per-env debounce). On change detection, calls
 * enqueueTargetedCycle for the affected URL.
 *
 * Best-effort everywhere: a failure on one env doesn't stop the rest
 * of the pass. Returns aggregate counts for telemetry / log.
 */
export async function runProbeCronPass(
  prisma: PrismaClient,
  options: { now?: Date } = {},
): Promise<ProbeCronPassResult> {
  const start = Date.now();
  const now = options.now ?? new Date();

  let envsSkipped = 0;
  let envsProbed = 0;
  let changesDetected = 0;
  let cyclesEnqueued = 0;
  let errors = 0;
  let envsPausedDead = 0;
  let volatileSkips = 0;

  // One indexed scan: envs that are eligible to be probed at all. The
  // per-env debounce happens inside runProbePassForEnv so we don't
  // need to filter by probeLastRunAt at the SQL layer.
  const envs = await prisma.environment.findMany({
    where: {
      probeEnabled: true,
      activated: true,
      continuousPaused: false,
    },
    select: {
      id: true,
      organizationId: true,
      landingUrl: true,
      probeUrlsJson: true,
      probeEnabled: true,
      probeLastRunAt: true,
      activated: true,
      continuousPaused: true,
      organization: { select: { plan: true } },
    },
  });

  for (const env of envs) {
    const plan = env.organization?.plan ?? "vestigio";
    const cadence = cadenceForPlan(plan);

    try {
      const result = await runProbePassForEnv(
        prisma,
        {
          id: env.id,
          landingUrl: env.landingUrl,
          probeUrlsJson: env.probeUrlsJson,
          probeEnabled: env.probeEnabled,
          probeLastRunAt: env.probeLastRunAt,
          activated: env.activated,
          continuousPaused: env.continuousPaused,
        },
        {
          minIntervalMinutes: cadence.intervalMinutes,
          now,
        },
      );

      if (!result) {
        envsSkipped++;
        continue;
      }

      envsProbed++;
      changesDetected += result.probesChanged;
      errors += result.errors;

      // Dead-site check. Only runs when THIS pass saw the landing URL
      // fail — a healthy pass can't possibly end a 7-day dead streak,
      // so there's no reason to pay for the history query. The
      // assessment itself re-reads the full window and is the sole
      // authority on the verdict.
      const landingResult = result.results.find((r) => r.url === env.landingUrl);
      const landingLooksDown =
        landingResult !== undefined &&
        !(landingResult.statusCode >= 200 && landingResult.statusCode < 400);

      if (landingLooksDown) {
        try {
          const assessment = await assessSiteLiveness(
            prisma,
            env.id,
            env.landingUrl,
            now,
          );
          if (assessment.verdict === "dead") {
            const paused = await pauseForDeadSite(prisma, env.id, assessment);
            if (paused) {
              envsPausedDead++;
              console.warn(
                `[probe-cron] env ${env.id} (${env.landingUrl}) PAUSED — site gone: ${assessment.summary}`,
              );
            }
          }
        } catch (err) {
          // Never let liveness bookkeeping break the probe pass.
          console.error(
            `[probe-cron] liveness check failed for env ${env.id}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }

      // For each URL whose hash changed, enqueue a targeted cycle.
      // Multiple URLs can change in one pass — emit one cycle per URL
      // so each gets its own focused engine.run({ scope: targeted }).
      // The audit-cycle queue is responsible for de-duping / coalescing
      // if too many fire too quickly (env-lock contention will queue
      // them naturally).
      for (const r of result.results) {
        if (r.changedFromPrior === true && r.statusCode >= 200 && r.statusCode < 400) {
          try {
            // Suppress URLs whose hash changes on essentially every
            // probe. A rotating storefront banner is not a deploy, and
            // treating it as one cost ~8,400 targeted cycles in a month
            // on a single homepage. The scheduled cold cycle still
            // covers the page, so nothing stops being analysed.
            const vol = await assessUrlVolatility(prisma, env.id, r.url, now);
            if (vol.volatile) {
              volatileSkips++;
              console.log(
                `[probe-cron] skipping targeted cycle for ${r.url} — dynamic content ` +
                  `(${Math.round(vol.changeRate * 100)}% of ${vol.observations} probes changed in ` +
                  `the last ${VOLATILITY_WINDOW_HOURS}h); cold cycle still covers it`,
              );
              continue;
            }
            await enqueueTargetedCycle(prisma, env.organizationId, env.id, r);
            cyclesEnqueued++;
          } catch (err) {
            errors++;
            console.warn(
              `[probe-cron] enqueue targeted cycle failed env=${env.id} url=${r.url}:`,
              err instanceof Error ? err.message : err,
            );
          }
        }
      }
    } catch (err) {
      errors++;
      console.warn(
        `[probe-cron] pass failed env=${env.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    envsScanned: envs.length,
    envsSkipped,
    envsProbed,
    changesDetected,
    cyclesEnqueued,
    errors,
    envsPausedDead,
    volatileSkips,
    durationMs: Date.now() - start,
  };
}

/**
 * Enqueue a targeted audit cycle for a changed URL.
 *
 * Creates an AuditCycle row with cycleType='targeted' and scopeJson
 * holding the engine.run scope. The Redis queue receives the cycleId
 * with priority='warm' (one tier above cold — targeted reruns should
 * land faster than scheduled cycles but not preempt user-initiated
 * 'hot' cycles).
 *
 * If the Redis queue isn't available, the cycle row is still created
 * so the heal cron / next worker boot can pick it up. We do NOT do
 * in-process dispatch here — the probe cron runs inside the Next
 * server, not the audit-worker process, and there's no engine pool
 * available in this context.
 */
async function enqueueTargetedCycle(
  prisma: PrismaClient,
  organizationId: string,
  environmentId: string,
  probe: ProbeResult,
): Promise<void> {
  const { enqueueAuditCycle } = await import("../platform/audit-cycle-queue");

  const scopeJson = {
    kind: "targeted" as const,
    url: probe.url,
    // Reason carried for explainability — admin can answer "why did
    // this cycle fire?" without correlating with PageProbe rows.
    triggered_by: "probe_diff",
    prior_hash: probe.priorHash,
    current_hash: probe.contentHash,
  };

  const cycle = await prisma.auditCycle.create({
    data: {
      organizationId,
      environmentId,
      status: "pending",
      cycleType: "targeted",
      scopeJson,
    },
    select: { id: true },
  });

  // Best-effort Redis enqueue. The worker loop already polls for
  // pending cycles on boot + via the heal cron, so a Redis miss here
  // means the cycle still runs — just slightly later.
  await enqueueAuditCycle({
    cycleId: cycle.id,
    organizationId,
    environmentId,
    priority: "warm",
  });
}
