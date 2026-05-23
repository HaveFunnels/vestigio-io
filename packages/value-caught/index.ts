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

  // Wave 20.6 — retention snapshot. While `caught` is a window-bounded
  // historical win ("we recovered R$ X this month"), `retention` is a
  // current-state snapshot ("you're holding R$ Y/mo right now via
  // controls that ARE working"). Together they roughly double the
  // perceived magnitude of what Vestigio is doing on a renewal touch.
  //
  // Sourced from polarity='positive' AND status IN ('created','confirmed')
  // — i.e. active positive findings. NOT bounded by the window: this is
  // the value being kept safe today, regardless of when each control
  // was first observed.
  retentionInForceMidpoint: number;
  retentionInForceMin: number;
  retentionInForceMax: number;
  retentionInForceCount: number;
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
  // Both queries are issued in parallel against indexed columns —
  // (environmentId, status, statusChangedAt) for the caught query and
  // (environmentId, status) for the retention snapshot.
  const [resolved, retentionActive] = await Promise.all([
    prisma.finding.findMany({
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
    }),
    prisma.finding.findMany({
      where: {
        environmentId,
        polarity: "positive",
        status: { in: ["created", "confirmed"] },
      },
      select: {
        impactMin: true,
        impactMax: true,
        impactMidpoint: true,
      },
    }),
  ]);

  const totalCaughtMidpoint = resolved.reduce((s, f) => s + (f.impactMidpoint || 0), 0);
  const totalCaughtMin = resolved.reduce((s, f) => s + (f.impactMin || 0), 0);
  const totalCaughtMax = resolved.reduce((s, f) => s + (f.impactMax || 0), 0);

  const retentionInForceMidpoint = retentionActive.reduce((s, f) => s + (f.impactMidpoint || 0), 0);
  const retentionInForceMin = retentionActive.reduce((s, f) => s + (f.impactMin || 0), 0);
  const retentionInForceMax = retentionActive.reduce((s, f) => s + (f.impactMax || 0), 0);

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
    retentionInForceMidpoint,
    retentionInForceMin,
    retentionInForceMax,
    retentionInForceCount: retentionActive.length,
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

// ──────────────────────────────────────────────
// Wave 20.6 — Chronic finding detection.
//
// A finding is CHRONIC when it has been observed → resolved → observed
// again across multiple cycles. Today the UI only surfaces the LATEST
// regression event, not the pattern. The "always-on revenue protection"
// pitch (Wave 21) is exactly this story:
//
//   "trust_boundary_crossed came back for the 3rd time in 5 weeks
//    — this is what continuous monitoring catches that a one-shot
//    audit doesn't."
//
// Each Finding row is one observation in one cycle. Counting how many
// times a (environmentId, inferenceKey, surface) identity has had
// status='resolved' across its history gives the toggle count. Two or
// more resolved events = chronic.
// ──────────────────────────────────────────────

export interface ChronicFinding {
  /** Stable inference key — matches FindingProjection.inference_key. */
  inferenceKey: string;
  /** Page / surface the finding fires on. */
  surface: string;
  pack: string;
  /** Number of times this identity has been marked resolved across its
   *  lifetime. A finding with 3 resolves has appeared+disappeared 3
   *  times — strong chronic signal. */
  resolveCount: number;
  /** Number of times this identity has gone through regressed status —
   *  i.e. resolved → present-again transitions. Closely correlates with
   *  resolveCount but counts the comeback events specifically. */
  regressedCount: number;
  /** ISO timestamp of the earliest cycle that observed this identity. */
  firstSeenAt: Date;
  /** ISO timestamp of the most recent cycle that observed this identity. */
  lastSeenAt: Date;
  /** Span between first and last observation in days. */
  spanDays: number;
  /** Current lifecycle status (the most recent observation's status). */
  currentStatus: string;
  /** Most recent observed midpoint impact. */
  recentImpactMidpoint: number;
}

/**
 * Detect chronic findings for an environment.
 *
 * Returns identities that have toggled at least `minResolves` times
 * (default 2), sorted by resolveCount desc then by recentImpactMidpoint
 * desc. Each row carries enough context for the UI / MCP / digest
 * email to render the "X came back N times in M weeks" narrative
 * without doing further lookups.
 */
export async function detectChronicFindings(
  prisma: PrismaClient,
  environmentId: string,
  options: { minResolves?: number; lookbackDays?: number } = {},
): Promise<ChronicFinding[]> {
  const minResolves = options.minResolves ?? 2;
  const lookbackDays = options.lookbackDays ?? 180;
  const lookbackStart = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  // Fetch every Finding row for the env inside the lookback window.
  // At ~10 cycles of retention × ~100 findings each = ~1000 rows max
  // per env, easily aggregated in memory. Indexed on (environmentId,
  // inferenceKey, surface) so the scan is cheap.
  const rows = await prisma.finding.findMany({
    where: {
      environmentId,
      createdAt: { gte: lookbackStart },
    },
    select: {
      inferenceKey: true,
      surface: true,
      pack: true,
      status: true,
      impactMidpoint: true,
      createdAt: true,
      statusChangedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Group by identity. For each group, count status='resolved' and
  // status='regressed' observations and capture first/last seen and the
  // most recent impact midpoint + status.
  type Bucket = {
    pack: string;
    resolveCount: number;
    regressedCount: number;
    firstSeen: Date;
    lastSeen: Date;
    lastStatus: string;
    lastMidpoint: number;
  };
  const groups = new Map<string, Bucket>();
  for (const r of rows) {
    const key = `${r.inferenceKey}::${r.surface}`;
    const b = groups.get(key);
    if (!b) {
      groups.set(key, {
        pack: r.pack,
        resolveCount: r.status === "resolved" ? 1 : 0,
        regressedCount: r.status === "regressed" ? 1 : 0,
        firstSeen: r.createdAt,
        lastSeen: r.createdAt,
        lastStatus: r.status,
        lastMidpoint: r.impactMidpoint || 0,
      });
    } else {
      if (r.status === "resolved") b.resolveCount++;
      if (r.status === "regressed") b.regressedCount++;
      if (r.createdAt < b.firstSeen) b.firstSeen = r.createdAt;
      if (r.createdAt >= b.lastSeen) {
        b.lastSeen = r.createdAt;
        b.lastStatus = r.status;
        b.lastMidpoint = r.impactMidpoint || 0;
      }
    }
  }

  const chronic: ChronicFinding[] = [];
  for (const [key, b] of groups) {
    if (b.resolveCount < minResolves) continue;
    const [inferenceKey, surface] = key.split("::");
    const spanMs = b.lastSeen.getTime() - b.firstSeen.getTime();
    chronic.push({
      inferenceKey,
      surface,
      pack: b.pack,
      resolveCount: b.resolveCount,
      regressedCount: b.regressedCount,
      firstSeenAt: b.firstSeen,
      lastSeenAt: b.lastSeen,
      spanDays: Math.round(spanMs / (24 * 60 * 60 * 1000)),
      currentStatus: b.lastStatus,
      recentImpactMidpoint: b.lastMidpoint,
    });
  }

  chronic.sort((a, b) => {
    if (b.resolveCount !== a.resolveCount) return b.resolveCount - a.resolveCount;
    return b.recentImpactMidpoint - a.recentImpactMidpoint;
  });

  return chronic;
}
