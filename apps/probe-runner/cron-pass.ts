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

      // For each URL whose hash changed, enqueue a targeted cycle.
      // Multiple URLs can change in one pass — emit one cycle per URL
      // so each gets its own focused engine.run({ scope: targeted }).
      // The audit-cycle queue is responsible for de-duping / coalescing
      // if too many fire too quickly (env-lock contention will queue
      // them naturally).
      for (const r of result.results) {
        if (r.changedFromPrior === true && r.statusCode >= 200 && r.statusCode < 400) {
          try {
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
