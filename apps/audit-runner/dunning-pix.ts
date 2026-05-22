// ──────────────────────────────────────────────
// MP PIX dunning sweep
//
// Runs on an hourly cron under leader-election. Each pass:
//
//   1. Find every active MP-PIX user (paymentProvider=mp, no
//      mpPreapprovalId → card-recurring users are auto-charged by MP
//      and don't need PIX renewals).
//   2. For each, compute days-to-due (currentPeriodEnd - now).
//   3. If due in ≤ 5 days and no pending PixCharge exists for this
//      cycle, mint one via the same path the billing page uses.
//   4. Send the right reminder email (5d/2d/0d) if not yet sent for
//      this PixCharge. The `remindersSent` array on the row is the
//      idempotency key — won't double-fire on overlapping cron ticks.
//   5. At D+14 since due, set Org.status='suspended' and dispatch the
//      pix_suspended email. (Confirmed-payment email is sent from the
//      webhook handler when payment.status becomes approved — not
//      from this sweep.)
//
// Idempotency: every email send checks remindersSent[] before firing.
// Multiple ticks within a window are safe. Crashes mid-sweep just
// resume next tick — no partial-state to clean up.
//
// Card recurring users (mpPreapprovalId set) are skipped entirely.
// MP handles those via authorized_payment webhooks → extends
// currentPeriodEnd automatically. If a card fails, MP retries on its
// own schedule and eventually moves the preapproval to `paused`,
// which the webhook treats as a suspension.
// ──────────────────────────────────────────────

import { prisma } from "../../src/libs/prismaDb";
import { notifyUser } from "../../src/libs/notifications";
import { renderEmailFromTemplate } from "../../src/libs/notification-templates";
import {
	buildPixExternalRef,
	centsToReais,
	createPixPayment,
} from "../../src/libs/mp-api";
import { getPlanByKey } from "../../src/libs/plan-config";
import crypto from "node:crypto";

const SITE_URL =
	process.env.SITE_URL || process.env.NEXTAUTH_URL || "https://app.vestigio.io";

const SUSPEND_GRACE_DAYS = 14; // hard suspension threshold past dueAt
const REMINDER_WINDOWS = [
	{ daysOut: 5, key: "d5", template: "pix_reminder_5d" },
	{ daysOut: 2, key: "d2", template: "pix_reminder_2d" },
	{ daysOut: 0, key: "d0", template: "pix_reminder_today" },
] as const;

interface SweepResult {
	usersEvaluated: number;
	chargesCreated: number;
	remindersSent: number;
	suspended: number;
}

function daysUntil(date: Date): number {
	return Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function formatBrl(cents: number): string {
	return (cents / 100).toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
	});
}

function formatDate(date: Date): string {
	return date.toLocaleDateString("pt-BR", {
		day: "2-digit",
		month: "long",
		year: "numeric",
	});
}

// ──────────────────────────────────────────────
// PIX charge issuance — mirrors /api/mercadopago/create-pix-charge but
// runs as a server-side scheduled call, not an HTTP handler.
// ──────────────────────────────────────────────

async function ensurePixChargeForCycle(opts: {
	userId: string;
	userEmail: string;
	organizationId: string;
	planKey: string;
	dueAt: Date;
}): Promise<{ id: string; status: string } | null> {
	// If a pending charge already exists for this cycle (same dueAt
	// day), reuse it — the cron has fired multiple times.
	const existing = await prisma.pixCharge.findFirst({
		where: {
			userId: opts.userId,
			organizationId: opts.organizationId,
			status: "pending",
			dueAt: { gte: new Date(opts.dueAt.getTime() - 24 * 60 * 60 * 1000) },
		},
		orderBy: { createdAt: "desc" },
	});
	if (existing) return { id: existing.id, status: existing.status };

	const plan = await getPlanByKey(opts.planKey);
	if (!plan?.monthlyPriceCentsBrl) return null;

	const nonce = crypto.randomBytes(6).toString("hex");
	const externalReference = buildPixExternalRef({
		orgId: opts.organizationId,
		userId: opts.userId,
		cycleDueAt: opts.dueAt,
		nonce,
	});

	const charge = await prisma.pixCharge.create({
		data: {
			userId: opts.userId,
			organizationId: opts.organizationId,
			amountCents: plan.monthlyPriceCentsBrl,
			planKey: opts.planKey,
			cycle: "monthly",
			dueAt: opts.dueAt,
			externalReference,
			status: "pending",
		},
	});

	try {
		const payment = await createPixPayment({
			amountBrl: centsToReais(plan.monthlyPriceCentsBrl),
			payerEmail: opts.userEmail,
			description: `Vestigio ${plan.label} — Mensal (renovação)`,
			externalReference,
			notificationUrl: process.env.MP_PREAPPROVAL_NOTIFICATION_URL,
			idempotencyKey: externalReference,
			metadata: {
				orgId: opts.organizationId,
				userId: opts.userId,
				planKey: opts.planKey,
				source: "dunning",
			},
		});
		const qrData = payment.point_of_interaction?.transaction_data;
		await prisma.pixCharge.update({
			where: { id: charge.id },
			data: {
				mpPaymentId: String(payment.id),
				qrCode: qrData?.qr_code ?? null,
				qrCodeBase64: qrData?.qr_code_base64 ?? null,
				ticketUrl: qrData?.ticket_url ?? null,
				expiresAt: payment.date_of_expiration ? new Date(payment.date_of_expiration) : null,
			},
		});
		return { id: charge.id, status: "pending" };
	} catch (err) {
		await prisma.pixCharge.update({
			where: { id: charge.id },
			data: { status: "rejected" },
		});
		console.error(`[dunning-pix] failed to issue PIX for user ${opts.userId}: ${(err as Error).message}`);
		return null;
	}
}

// ──────────────────────────────────────────────
// Email dispatch — one reminder per (charge, window).
// ──────────────────────────────────────────────

async function sendReminderIfDue(
	userId: string,
	userLocale: string,
	planLabel: string,
	chargeId: string,
	amountCents: number,
	dueAt: Date,
	remindersSent: string[],
): Promise<boolean> {
	const daysOut = daysUntil(dueAt);

	// Find which window we're in; bail if outside [-0, +5].
	const window = REMINDER_WINDOWS.find((w) => daysOut <= w.daysOut);
	if (!window) return false;
	if (daysOut < 0) return false; // past-due handled by suspend path
	if (remindersSent.includes(window.key)) return false;

	const vars: Record<string, string> = {
		planLabel,
		amount: formatBrl(amountCents),
		dueDate: formatDate(dueAt),
	};
	const rendered = renderEmailFromTemplate(window.template, vars, SITE_URL, userLocale);
	if (!rendered) return false;

	await notifyUser({
		userId,
		event: window.template,
		subject: rendered.subject,
		bodyHtml: rendered.html,
		bodyText: rendered.text,
		tag: `pix-${window.key}:${chargeId}`,
	});

	await prisma.pixCharge.update({
		where: { id: chargeId },
		data: { remindersSent: { push: window.key } },
	});
	return true;
}

// ──────────────────────────────────────────────
// Suspension — D+14 past dueAt without an approved payment.
// ──────────────────────────────────────────────

async function suspendIfOverdue(opts: {
	userId: string;
	userLocale: string;
	organizationId: string;
	planKey: string;
	planLabel: string;
	dueAt: Date;
}): Promise<boolean> {
	const daysOverdue = -daysUntil(opts.dueAt);
	if (daysOverdue < SUSPEND_GRACE_DAYS) return false;

	const org = await prisma.organization.findUnique({
		where: { id: opts.organizationId },
		select: { status: true },
	});
	if (!org || org.status === "suspended") return false; // already done

	await prisma.organization.update({
		where: { id: opts.organizationId },
		data: { status: "suspended", plan: "free" },
	});

	const vars: Record<string, string> = {
		planLabel: opts.planLabel,
	};
	const rendered = renderEmailFromTemplate("pix_suspended", vars, SITE_URL, opts.userLocale);
	if (rendered) {
		await notifyUser({
			userId: opts.userId,
			event: "pix_suspended",
			subject: rendered.subject,
			bodyHtml: rendered.html,
			bodyText: rendered.text,
			tag: `pix-suspended:${opts.organizationId}:${opts.dueAt.toISOString().slice(0, 10)}`,
		});
	}
	return true;
}

// ──────────────────────────────────────────────
// Sweep entry point
// ──────────────────────────────────────────────

export async function runMpDunningSweep(): Promise<SweepResult> {
	const result: SweepResult = {
		usersEvaluated: 0,
		chargesCreated: 0,
		remindersSent: 0,
		suspended: 0,
	};

	// PIX users only: paymentProvider=mp AND no card preapproval.
	// (Users with `mpPreapprovalId` set are on cartão recorrente — MP
	// auto-charges them and authorized_payment webhooks extend the
	// period. No PIX dunning needed.)
	const users = await prisma.user.findMany({
		where: {
			paymentProvider: "mercadopago",
			mpPreapprovalId: null,
			currentPeriodEnd: { not: null },
		},
		select: {
			id: true,
			email: true,
			locale: true,
			currentPeriodEnd: true,
			memberships: {
				select: { organizationId: true, organization: { select: { plan: true, status: true } } },
				take: 1,
			},
		},
	});

	for (const user of users) {
		result.usersEvaluated += 1;
		if (!user.currentPeriodEnd || !user.email) continue;
		const membership = user.memberships[0];
		if (!membership) continue;

		const planKey = membership.organization.plan;
		if (planKey === "free") continue; // nothing to renew

		const plan = await getPlanByKey(planKey);
		if (!plan) continue;

		const dueAt = user.currentPeriodEnd;
		const days = daysUntil(dueAt);

		// Suspend path
		if (days <= -SUSPEND_GRACE_DAYS) {
			const did = await suspendIfOverdue({
				userId: user.id,
				userLocale: user.locale || "pt-BR",
				organizationId: membership.organizationId,
				planKey,
				planLabel: plan.label,
				dueAt,
			});
			if (did) result.suspended += 1;
			continue;
		}

		// Outside reminder window (further than 5 days out)
		if (days > 5) continue;

		// Ensure a PIX charge exists for this cycle (if we already
		// emitted one and it's pending, this is a no-op fetch).
		const charge = await ensurePixChargeForCycle({
			userId: user.id,
			userEmail: user.email,
			organizationId: membership.organizationId,
			planKey,
			dueAt,
		});
		if (!charge) continue;
		if (charge.status !== "pending") {
			// already approved/rejected — nothing to remind about
			continue;
		}
		const wasNewCharge = days >= 0 && days <= 5;
		if (wasNewCharge) {
			// Count creations as a separate side-effect; the row may have
			// been pre-existing so we only bump on a real insert
			// (heuristic: created in the last 5s).
			const fresh = await prisma.pixCharge.findUnique({
				where: { id: charge.id },
				select: { createdAt: true, remindersSent: true, amountCents: true },
			});
			if (!fresh) continue;
			if (Date.now() - fresh.createdAt.getTime() < 5_000) {
				result.chargesCreated += 1;
			}

			const sent = await sendReminderIfDue(
				user.id,
				user.locale || "pt-BR",
				plan.label,
				charge.id,
				fresh.amountCents,
				dueAt,
				fresh.remindersSent,
			);
			if (sent) result.remindersSent += 1;
		}
	}

	return result;
}
