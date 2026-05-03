import { prisma } from "@/libs/prismaDb";
import { sendBrevoEmail } from "@/libs/brevo";
import { renderBrandedEmail } from "@/libs/notifications";

/**
 * Event-driven alert evaluation.
 *
 * Instead of cron-polling, this is called when the data an alert monitors
 * actually changes:
 *   - error_rate      -> called after trackError()
 *   - new_signup      -> called after user registration
 *   - health_check    -> called after an UptimeCheck is recorded
 *   - mcp_usage       -> called after MCP usage is recorded
 *   - org_over_limit  -> called after usage is recorded
 *
 * Always fire-and-forget: `evaluateAlerts("metric").catch(() => {})`
 */
export async function evaluateAlerts(metric: string): Promise<void> {
  try {
    // 1. Fetch all enabled rules for this metric
    const rules = await prisma.alertRule.findMany({
      where: { metric, enabled: true },
    });

    if (rules.length === 0) return;

    const now = new Date();

    for (const rule of rules) {
      try {
        // 2. Compute the current value based on the metric
        const windowStart = new Date(now.getTime() - rule.window * 60 * 1000);
        let value: number;

        switch (metric) {
          case "error_rate": {
            value = await prisma.platformError.count({
              where: { createdAt: { gte: windowStart } },
            });
            break;
          }

          case "new_signup": {
            value = await prisma.user.count({
              where: { createdAt: { gte: windowStart } },
            });
            break;
          }

          case "health_check": {
            value = await prisma.uptimeCheck.count({
              where: {
                createdAt: { gte: windowStart },
                status: { in: ["down", "degraded"] },
              },
            });
            break;
          }

          case "mcp_usage": {
            const mcpAgg = await prisma.usage.aggregate({
              where: {
                createdAt: { gte: windowStart },
                usageType: { in: ["mcp_chat", "mcp_tool"] },
              },
              _sum: { amount: true },
            });
            value = mcpAgg._sum.amount ?? 0;
            break;
          }

          case "org_over_limit": {
            // Count orgs whose total usage in the current period exceeds the rule threshold
            const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
            const orgUsages = await prisma.usage.groupBy({
              by: ["organizationId"],
              where: { period: currentPeriod },
              _sum: { amount: true },
            });
            value = orgUsages.filter(
              (o) => (o._sum.amount ?? 0) > rule.threshold
            ).length;
            break;
          }

          default: {
            console.log(`[alert-evaluator] Unknown metric: ${metric}`);
            continue;
          }
        }

        // 3. Evaluate condition
        let triggered = false;
        switch (rule.condition) {
          case "gt":
            triggered = value > rule.threshold;
            break;
          case "lt":
            triggered = value < rule.threshold;
            break;
          case "eq":
            triggered = value === rule.threshold;
            break;
        }

        if (!triggered) continue;

        // 4. Spam guard: skip if lastTriggered is within the window
        if (rule.lastTriggered) {
          const cooldownEnd = new Date(
            rule.lastTriggered.getTime() + rule.window * 60 * 1000
          );
          if (now < cooldownEnd) {
            console.log(
              `[alert-evaluator] Rule "${rule.name}" skipped (cooldown until ${cooldownEnd.toISOString()})`
            );
            continue;
          }
        }

        // 5. Create AlertEvent
        const message = `Alert "${rule.name}": ${metric} is ${value} (${rule.condition} ${rule.threshold}) in the last ${rule.window}min`;

        await prisma.alertEvent.create({
          data: {
            ruleId: rule.id,
            value,
            message,
          },
        });

        // 6. Update lastTriggered
        await prisma.alertRule.update({
          where: { id: rule.id },
          data: { lastTriggered: now },
        });

        console.log(`[alert-evaluator] TRIGGERED: ${message}`);

        // 7. Send email notification if channel includes "email"
        if (rule.channel === "email" || rule.channel === "both") {
          try {
            const adminEmails = process.env.ADMIN_EMAILS?.split(",") || [];
            const recipient = adminEmails[0]; // primary admin
            if (recipient) {
              const descLine = rule.description ? `<br/><br/><strong>Description:</strong> ${rule.description}` : "";
              const html = renderBrandedEmail({
                headline: `Alert: ${rule.name}`,
                intro: `<strong>${metric}</strong> is <strong>${value}</strong> (${rule.condition} ${rule.threshold}) in the last ${rule.window} minutes.${descLine}`,
                ctaLabel: "Open Dashboard",
                ctaUrl: `${process.env.NEXTAUTH_URL || "https://vestigio.io"}/admin/alerts`,
                footerNote: `Triggered at ${now.toISOString()}.`,
              });
              const res = await sendBrevoEmail({
                to: recipient,
                subject: `[Vestigio Alert] ${rule.name}`,
                html,
                tags: ["platform-alert"],
                senderProfile: "notifications",
              });
              if (res.ok) {
                console.log(`[alert-evaluator] Email sent to ${recipient} for rule "${rule.name}"`);
              } else {
                console.error(`[alert-evaluator] Brevo error for rule "${rule.name}": ${res.error}`);
              }
            }
          } catch (emailErr) {
            console.error(`[alert-evaluator] Failed to send email for rule "${rule.name}":`, emailErr);
          }
        }
      } catch (ruleErr) {
        console.error(`[alert-evaluator] Error evaluating rule "${rule.name}" (${rule.id}):`, ruleErr);
      }
    }
  } catch (err) {
    console.error("[alert-evaluator] Fatal error during evaluation:", err);
  }
}
