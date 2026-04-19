import { prisma } from "@/libs/prismaDb";
import { isBrevoConfigured, sendBrevoEmail } from "@/libs/brevo";
import { sendEmail as sendNodemailerEmail } from "@/libs/email";
import { renderEmailFromTemplate } from "@/libs/notification-templates";

// ──────────────────────────────────────────────
// Notification dispatcher — drains queued messages
//
// Some callers write NotificationLog rows with status="skipped" as a
// pre-send queue signal instead of dispatching inline. The canonical
// example is the inactivity-pause cron (src/instrumentation-node.ts):
// it pauses an env, records the event, and defers delivery so the
// cron stays fast and idempotent.
//
// Without this dispatcher, those rows pile up and owners never learn
// their audits paused. Fixes Blocker 3 from docs/USER_JOURNEYS.md.
//
// Strategy:
//   1. Read up to BATCH_SIZE skipped email rows in createdAt order
//   2. Build the branded email body from a per-event template map
//   3. Send via Brevo (preferred) or Nodemailer fallback
//   4. Update the ORIGINAL row in place (status sent|failed, provider,
//      providerId, errorMsg). Updating the row instead of creating a
//      second one preserves the queued `createdAt` so we can report
//      queue age / SLA breach.
//
// This dispatcher only handles email today. SMS and WhatsApp queueing
// is possible via the same mechanism but no caller uses it yet, so the
// code path stays focused.
// ──────────────────────────────────────────────

const BATCH_SIZE = 50;
const MAX_AGE_DAYS_BEFORE_DROP = 7;

export interface DispatcherResult {
	evaluated: number;
	sent: number;
	failed: number;
	dropped: number; // too-old rows we stop trying to deliver
}

interface QueuedRow {
	id: string;
	userId: string | null;
	event: string;
	recipient: string;
	subject: string | null;
	createdAt: Date;
}

/**
 * Build the branded HTML body for a queued event. Returns null when
 * the event is unknown — caller marks the row as failed + logs so we
 * don't hot-loop on a malformed entry.
 */
function buildEmailBody(
	event: string,
	subject: string | null,
	ctx: { domain?: string; appUrl: string },
): { html: string; text: string; subject: string } | null {
	const vars = { domain: ctx.domain || "your environment" };
	const rendered = renderEmailFromTemplate(event, vars, ctx.appUrl);
	if (!rendered) return null;
	return {
		subject: subject || rendered.subject,
		html: rendered.html,
		text: rendered.text,
	};
}

export async function runNotificationDispatcher(): Promise<DispatcherResult> {
	const result: DispatcherResult = {
		evaluated: 0,
		sent: 0,
		failed: 0,
		dropped: 0,
	};

	const rows = (await prisma.notificationLog.findMany({
		where: {
			status: "skipped",
			channel: "email",
		},
		orderBy: { createdAt: "asc" },
		take: BATCH_SIZE,
		select: {
			id: true,
			userId: true,
			event: true,
			recipient: true,
			subject: true,
			createdAt: true,
		},
	})) as QueuedRow[];

	result.evaluated = rows.length;
	if (rows.length === 0) return result;

	const appUrl = process.env.NEXTAUTH_URL || "https://app.vestigio.io";
	const dropCutoff = new Date(
		Date.now() - MAX_AGE_DAYS_BEFORE_DROP * 24 * 60 * 60 * 1000,
	);

	for (const row of rows) {
		// Stale rows — older than a week, drop them so we don't spam an
		// owner about an event that may no longer be relevant. They stay
		// in the log as `dropped` for audit purposes.
		if (row.createdAt < dropCutoff) {
			await safeMarkStatus(row.id, {
				status: "dropped",
				errorMsg: "queued > 7 days — not delivered",
			});
			result.dropped += 1;
			continue;
		}

		// recipient must look like an email. Historical rows from before
		// the fix (inactivity-pause was storing userId there) would fail
		// silently at the provider; better to short-circuit and flag them
		// so the dispatcher surfaces the bad data rather than burning API
		// credits on invalid sends.
		if (!row.recipient.includes("@")) {
			await safeMarkStatus(row.id, {
				status: "failed",
				errorMsg: `recipient is not an email: ${row.recipient.slice(0, 64)}`,
			});
			result.failed += 1;
			continue;
		}

		// Event-specific context — today only inactivity_pause needs the
		// env domain, which we can parse out of the subject line that the
		// pause cron already formatted ("Audits paused for {domain}").
		const domain = extractDomainFromSubject(row.subject);
		const body = buildEmailBody(row.event, row.subject, {
			domain,
			appUrl,
		});

		if (!body) {
			// Unknown event — fail the row so we don't loop forever on it.
			// Add event handlers to buildEmailBody as new callers land.
			await safeMarkStatus(row.id, {
				status: "failed",
				errorMsg: `no template registered for event=${row.event}`,
			});
			result.failed += 1;
			continue;
		}

		// Send. Brevo first, Nodemailer second. Both paths update the
		// original row with the final outcome.
		try {
			if (isBrevoConfigured()) {
				const send = await sendBrevoEmail({
					to: row.recipient,
					subject: body.subject,
					html: body.html,
					text: body.text,
					tags: [row.event],
					senderProfile: "notifications",
				});
				if (send.ok) {
					await safeMarkStatus(row.id, {
						status: "sent",
						provider: "brevo",
						providerId: send.messageId,
					});
					result.sent += 1;
				} else {
					await safeMarkStatus(row.id, {
						status: "failed",
						provider: "brevo",
						errorMsg: send.error,
					});
					result.failed += 1;
				}
			} else {
				await sendNodemailerEmail({
					to: row.recipient,
					subject: body.subject,
					html: body.html,
				});
				await safeMarkStatus(row.id, {
					status: "sent",
					provider: "nodemailer",
				});
				result.sent += 1;
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : "unknown error";
			await safeMarkStatus(row.id, {
				status: "failed",
				errorMsg: msg,
			});
			result.failed += 1;
		}
	}

	return result;
}

async function safeMarkStatus(
	id: string,
	patch: {
		status: string;
		provider?: string;
		providerId?: string;
		errorMsg?: string;
	},
) {
	try {
		await prisma.notificationLog.update({
			where: { id },
			data: {
				status: patch.status,
				provider: patch.provider ?? undefined,
				providerId: patch.providerId ?? undefined,
				errorMsg: patch.errorMsg?.slice(0, 500) ?? undefined,
			},
		});
	} catch (err) {
		// Best-effort — a status-update failure shouldn't crash the loop.
		// The row stays as `skipped` and will be retried on the next tick.
		console.warn(
			`[notification-dispatcher] failed to mark ${id} as ${patch.status}:`,
			err,
		);
	}
}

// Pulls the "{domain}" portion out of the inactivity-pause subject line
// format "Audits paused for {domain}". Returns undefined for other events
// so buildEmailBody can fall back to generic copy.
function extractDomainFromSubject(subject: string | null): string | undefined {
	if (!subject) return undefined;
	const m = subject.match(/^Audits paused for (.+)$/i);
	return m?.[1]?.trim();
}

