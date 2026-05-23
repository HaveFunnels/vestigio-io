// ──────────────────────────────────────────────
// Value Caught — monthly cron worker (Wave 21.5)
//
// Runs once per day, leader-elected. For every active environment that
// hasn't received a value-caught email for the prior calendar month
// yet, computes the summary and queues a `value_caught_monthly`
// notification (the NotificationLog dispatcher delivers via Brevo).
//
// Why daily and not monthly: a monthly cron is fragile — one missed
// tick = a customer doesn't get their report. Daily-with-idempotency
// is what every battle-tested billing-style report cron does.
// Idempotency key: `${envId}:${monthYYYYMM}`, stored as
// NotificationLog.tag — the dispatcher already deduplicates by tag.
// ──────────────────────────────────────────────

import { prisma } from "./prismaDb";
import { computeValueCaught } from "../../packages/value-caught";

interface RunResult {
  envsEvaluated: number;
  reportsSent: number;
  skipped: number;
  errors: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function runMonthlyValueCaughtPass(now: Date = new Date()): Promise<RunResult> {
  // Compute the prior month window.
  const windowEnd = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const windowStart = new Date(windowEnd.getFullYear(), windowEnd.getMonth() - 1, 1, 0, 0, 0, 0);
  const monthYYYYMM = `${windowStart.getFullYear()}${String(windowStart.getMonth() + 1).padStart(2, "0")}`;

  // Only deliver in the first 7 days of the new month. After that, the
  // window is stale and the customer probably already saw newer data.
  // The window itself can extend further (queries still work), but the
  // automated send only happens in the early-month bucket.
  const daysIntoMonth = Math.floor((now.getTime() - windowEnd.getTime()) / MS_PER_DAY);
  if (daysIntoMonth >= 7) {
    return { envsEvaluated: 0, reportsSent: 0, skipped: 0, errors: 0 };
  }

  let envsEvaluated = 0;
  let reportsSent = 0;
  let skipped = 0;
  let errors = 0;

  // Eligible environments: active (not paused, not suspended), have at
  // least one completed audit cycle, belong to an organization that
  // isn't suspended.
  const envs = await prisma.environment.findMany({
    where: {
      activated: true,
      continuousPaused: false,
      organization: { status: "active" },
      auditCycles: { some: { status: "complete" } },
    },
    select: {
      id: true,
      domain: true,
      organization: {
        select: { id: true, ownerId: true, name: true },
      },
    },
  });

  // Resolve owner emails in one query.
  const ownerIds = Array.from(
    new Set(envs.map(e => e.organization?.ownerId).filter((id): id is string => Boolean(id))),
  );
  const owners = ownerIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: ownerIds } },
        select: { id: true, email: true, locale: true },
      })
    : [];
  const ownerById = new Map(owners.map(u => [u.id, u]));

  const monthLabel = windowStart.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  for (const env of envs) {
    envsEvaluated++;
    const ownerId = env.organization?.ownerId;
    if (!ownerId) {
      skipped++;
      continue;
    }
    const owner = ownerById.get(ownerId);
    if (!owner?.email) {
      skipped++;
      continue;
    }

    const tag = `value-caught:${env.id}:${monthYYYYMM}`;

    // Idempotency: skip if we already sent a value_caught_monthly to
    // this user since the window start. NotificationLog has no `tag`
    // column today, so we scope by (userId, event, createdAt >= start)
    // — this gives per-user dedup. If a user has multiple envs we
    // currently send the report for whichever env we evaluate first;
    // adding a `tag` field to NotificationLog (Prisma migration) would
    // unlock per-env granularity if customers request it.
    const existing = await prisma.notificationLog.findFirst({
      where: {
        userId: ownerId,
        event: "value_caught_monthly",
        createdAt: { gte: windowEnd }, // any send since this month's window closed
      },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    try {
      const summary = await computeValueCaught(prisma, env.id, windowStart, windowEnd);

      // Skip zero-result months: we don't want to email "we caught $0
      // this month" — the report should only land when there's a
      // genuine win to celebrate. The dashboard widget still shows
      // the 0 in-month so the customer isn't surprised, but the email
      // requires substance.
      if (summary.resolvedCount === 0 || summary.totalCaughtMidpoint <= 0) {
        skipped++;
        continue;
      }

      const fmt = (n: number) => Math.round(n).toLocaleString("pt-BR");

      const { renderEmailFromTemplate } = await import("./notification-templates");
      const { notifyUser } = await import("./notifications");
      const siteUrl = process.env.SITE_URL || process.env.NEXTAUTH_URL || "https://app.vestigio.io";
      // Wave 20.6 — pre-build the retention HTML fragment so the
      // template can drop it in via a single {retentionBlock} sub. We
      // build outside the template because the single-brace interpolator
      // doesn't support mustache-style {{#var}}…{{/var}} conditionals.
      const retentionMid = summary.retentionInForceMidpoint;
      const locale = owner.locale || "pt-BR";
      const retentionBlock =
        retentionMid > 0
          ? locale === "pt-BR"
            ? `<br/><br/>Além disso, <strong>R$ ${fmt(retentionMid)}/mês</strong> estão sendo mantidos seguros por ${summary.retentionInForceCount} controles ativos que continuam funcionando no seu site — receita que estaria em risco se eles falhassem.`
            : `<br/><br/>On top of that, <strong>$${fmt(retentionMid)}/month</strong> is being held safe by ${summary.retentionInForceCount} active controls that are still working on your site — revenue that would be at risk if they broke.`
          : "";

      const rendered = renderEmailFromTemplate(
        "value_caught_monthly",
        {
          amount: fmt(summary.totalCaughtMidpoint),
          amountMin: fmt(summary.totalCaughtMin),
          amountMax: fmt(summary.totalCaughtMax),
          monthLabel,
          resolvedCount: String(summary.resolvedCount),
          retentionBlock,
        },
        siteUrl,
        locale,
      );
      if (!rendered) {
        skipped++;
        continue;
      }
      await notifyUser({
        userId: ownerId,
        event: "value_caught_monthly",
        subject: rendered.subject,
        bodyHtml: rendered.html,
        bodyText: rendered.text,
        tag,
      });
      reportsSent++;
    } catch (err) {
      errors++;
      console.error(`[value-caught-monthly] env=${env.id} failed:`, err);
    }
  }

  return { envsEvaluated, reportsSent, skipped, errors };
}
