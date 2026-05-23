// ──────────────────────────────────────────────
// Value Caught (Wave 21.5)
//
// Computes the monthly "value caught" amount per environment by
// summing the impactMidpoint of findings that transitioned to
// `status='resolved'` during the requested window.
//
// The data model is already in place: Wave 20.4 wired the Finding
// lifecycle (created/confirmed/stale/resolved/regressed) with a
// statusChangedAt timestamp and the
// `(environmentId, status, statusChangedAt)` composite index. This
// module is the consumer that turns that lifecycle data into the
// renewal narrative — "Vestigio caught R$ X this month."
//
// Why this matters: without an explicit "what did Vestigio do for me
// this month?" the product feels episodic (log in, review findings,
// log out). With it, the product feels like infrastructure (visible
// monthly ROI, sticky renewal trigger). The roadmap calls it "the
// stickiness lever" — see docs/ROADMAP.md Step 21.5.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";

export interface ValueCaughtSummary {
  /** The environment this summary covers. */
  environmentId: string;
  /** Window start (inclusive). */
  windowStart: Date;
  /** Window end (exclusive). */
  windowEnd: Date;
  /** Number of findings that transitioned to `resolved` in the window. */
  resolvedCount: number;
  /** Sum of impactMidpoint across resolved findings. */
  totalCaughtMidpoint: number;
  /** Sum of impactMin / impactMax for a range display. */
  totalCaughtMin: number;
  totalCaughtMax: number;
  /** Top 5 individual findings by impactMidpoint (most impressive wins first). */
  topResolved: Array<{
    inferenceKey: string;
    surface: string;
    impactMidpoint: number;
    pack: string;
    resolvedAt: Date;
  }>;
}

/**
 * Compute value caught for a single environment over the window.
 *
 * The query is a single `WHERE status='resolved' AND statusChangedAt
 * BETWEEN start AND end` against the (environmentId, status,
 * statusChangedAt) index — fast even at 100k+ findings per env.
 */
export async function computeValueCaught(
  prisma: PrismaClient,
  environmentId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<ValueCaughtSummary> {
  const resolved = await prisma.finding.findMany({
    where: {
      environmentId,
      status: "resolved",
      statusChangedAt: { gte: windowStart, lt: windowEnd },
    },
    select: {
      inferenceKey: true,
      surface: true,
      pack: true,
      impactMin: true,
      impactMax: true,
      impactMidpoint: true,
      statusChangedAt: true,
    },
    orderBy: { impactMidpoint: "desc" },
  });

  const totalCaughtMidpoint = resolved.reduce((s, f) => s + (f.impactMidpoint || 0), 0);
  const totalCaughtMin = resolved.reduce((s, f) => s + (f.impactMin || 0), 0);
  const totalCaughtMax = resolved.reduce((s, f) => s + (f.impactMax || 0), 0);

  return {
    environmentId,
    windowStart,
    windowEnd,
    resolvedCount: resolved.length,
    totalCaughtMidpoint,
    totalCaughtMin,
    totalCaughtMax,
    topResolved: resolved.slice(0, 5).map(f => ({
      inferenceKey: f.inferenceKey,
      surface: f.surface,
      impactMidpoint: f.impactMidpoint || 0,
      pack: f.pack,
      resolvedAt: f.statusChangedAt,
    })),
  };
}

/**
 * Convenience: compute the value-caught for the *previous calendar
 * month* relative to the supplied anchor. Used by the monthly cron.
 *
 * Example: called on 2026-06-01 with now=that date → covers
 * 2026-05-01T00:00:00 (inclusive) to 2026-06-01T00:00:00 (exclusive).
 */
export async function computeValueCaughtForPriorMonth(
  prisma: PrismaClient,
  environmentId: string,
  now: Date = new Date(),
): Promise<ValueCaughtSummary> {
  const windowEnd = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const windowStart = new Date(windowEnd.getFullYear(), windowEnd.getMonth() - 1, 1, 0, 0, 0, 0);
  return computeValueCaught(prisma, environmentId, windowStart, windowEnd);
}

/**
 * Convenience: compute the value-caught for the *current calendar
 * month so far*. Used by the dashboard widget so the customer can see
 * the tally in-flight (not just at month boundary).
 */
export async function computeValueCaughtForCurrentMonth(
  prisma: PrismaClient,
  environmentId: string,
  now: Date = new Date(),
): Promise<ValueCaughtSummary> {
  const windowStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const windowEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return computeValueCaught(prisma, environmentId, windowStart, windowEnd);
}
