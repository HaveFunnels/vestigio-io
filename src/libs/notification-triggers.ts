import { prisma } from "@/libs/prismaDb";
import { notifyOrganization, notifyUser, renderBrandedEmail } from "@/libs/notifications";

// ──────────────────────────────────────────────
// Notification triggers — high-level events that fan out
// to user/org notification preferences via Brevo.
//
// These are called from the inference pipeline + health worker.
// They are deduplicated by `notificationLog` (per event+recipient+window)
// to prevent the same incident firing multiple times within a short window.
// ──────────────────────────────────────────────

interface FindingLike {
	id: string;
	title: string;
	severity: string;
	change_class?: string | null;
	impact?: { midpoint?: number };
	root_cause?: string | null;
}

/** Window during which the same finding event will not re-fire (24h) */
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

// ──────────────────────────────────────────────
// Critical finding (incident) trigger
// ──────────────────────────────────────────────

export async function triggerIncidentNotifications(args: {
	userId: string;
	domain: string;
	findings: FindingLike[];
}): Promise<void> {
	const critical = args.findings.filter(
		(f) => f.severity === "critical" || f.change_class === "new_issue",
	);
	if (critical.length === 0) return;

	// Resolve org from user (most users have a single membership)
	const membership = await prisma.membership.findFirst({
		where: { userId: args.userId, organization: { status: "active" } },
		select: { organizationId: true },
	});
	if (!membership) return;

	// Pick the most impactful one to headline (avoid spam — single notification per cycle)
	const headline = critical.sort(
		(a, b) => (b.impact?.midpoint || 0) - (a.impact?.midpoint || 0),
	)[0];

	const dedupeKey = `incident:${headline.id}`;
	if (await wasRecentlySent(dedupeKey, args.userId)) return;

	const summary = `${critical.length} critical issue${critical.length > 1 ? "s" : ""} detected on ${args.domain}`;
	const intro = `<strong>${escapeHtml(headline.title)}</strong>${
		headline.root_cause ? ` — ${escapeHtml(headline.root_cause)}` : ""
	}.<br/><br/>Vestigio just finished an analysis of <strong>${escapeHtml(args.domain)}</strong> and flagged ${critical.length} issue${critical.length > 1 ? "s" : ""} that need attention.`;

	const html = renderBrandedEmail({
		headline: "Incident detected",
		intro,
		ctaLabel: "View in Vestigio",
		ctaUrl: `${getBaseUrl()}/app/analysis`,
		footerNote: `Triggered by audit of ${args.domain}.`,
	});

	await notifyOrganization(membership.organizationId, {
		event: "incident",
		subject: `[Vestigio] Incident: ${headline.title}`,
		bodyHtml: html,
		bodyText: summary,
		tag: dedupeKey,
	});
}

// ──────────────────────────────────────────────
// Regression trigger (cycle-over-cycle)
// ──────────────────────────────────────────────

export async function triggerRegressionNotifications(args: {
	userId: string;
	domain: string;
	regressions: FindingLike[];
}): Promise<void> {
	if (args.regressions.length === 0) return;

	const membership = await prisma.membership.findFirst({
		where: { userId: args.userId, organization: { status: "active" } },
		select: { organizationId: true },
	});
	if (!membership) return;

	const headline = args.regressions.sort(
		(a, b) => (b.impact?.midpoint || 0) - (a.impact?.midpoint || 0),
	)[0];

	const dedupeKey = `regression:${headline.id}`;
	if (await wasRecentlySent(dedupeKey, args.userId)) return;

	const summary = `Regression detected on ${args.domain}: ${headline.title}`;
	const intro = `<strong>${escapeHtml(headline.title)}</strong> got worse since your last audit.${
		headline.root_cause ? `<br/><br/>${escapeHtml(headline.root_cause)}` : ""
	}<br/><br/>Total regressions in this cycle: <strong>${args.regressions.length}</strong>.`;

	const html = renderBrandedEmail({
		headline: "Regression detected",
		intro,
		ctaLabel: "Open change report",
		ctaUrl: `${getBaseUrl()}/app/analysis`,
		footerNote: `Compared against the previous audit of ${args.domain}.`,
	});

	await notifyOrganization(membership.organizationId, {
		event: "regression",
		subject: `[Vestigio] Regression: ${headline.title}`,
		bodyHtml: html,
		bodyText: summary,
		tag: dedupeKey,
	});
}

// ──────────────────────────────────────────────
// Page down trigger
//
// Today the health-checker only monitors Vestigio infrastructure;
// when client domain monitoring lands, call this with the failing
// page so we fan out to the affected org.
// ──────────────────────────────────────────────

export async function triggerPageDownNotification(args: {
	organizationId: string;
	pageUrl: string;
	statusCode?: number;
	errorMessage?: string;
}): Promise<void> {
	const dedupeKey = `page_down:${args.organizationId}:${args.pageUrl}`;
	if (await wasRecentlySent(dedupeKey)) return;

	const summary = `Page down: ${args.pageUrl}${args.statusCode ? ` (HTTP ${args.statusCode})` : ""}`;
	const intro = `Vestigio just detected that <strong>${escapeHtml(args.pageUrl)}</strong> is unreachable.${
		args.statusCode ? `<br/><br/>HTTP status: <strong>${args.statusCode}</strong>` : ""
	}${args.errorMessage ? `<br/><br/>${escapeHtml(args.errorMessage)}` : ""}`;

	const html = renderBrandedEmail({
		headline: "A page on your site is down",
		intro,
		ctaLabel: "View incident",
		ctaUrl: `${getBaseUrl()}/app/analysis`,
		footerNote: "We'll notify you again when the page recovers.",
	});

	await notifyOrganization(args.organizationId, {
		event: "page_down",
		subject: `[Vestigio] Page down: ${args.pageUrl}`,
		bodyHtml: html,
		bodyText: summary,
		tag: dedupeKey,
	});
}

// ──────────────────────────────────────────────
// Magic link / password reset / support reply (transactional, always fired)
// ──────────────────────────────────────────────

export async function sendMagicLink(email: string, link: string): Promise<void> {
	const html = renderBrandedEmail({
		headline: "Sign in to Vestigio",
		intro: "Click the button below to sign in. This link expires in 10 minutes.",
		ctaLabel: "Sign in",
		ctaUrl: link,
		footerNote: "If you did not request this, you can safely ignore this email.",
	});

	const { notifyDirect } = await import("@/libs/notifications");
	await notifyDirect({
		event: "magic_link",
		to: { email },
		subject: "Sign in to Vestigio",
		bodyHtml: html,
		bodyText: `Sign in to Vestigio: ${link}`,
		tag: "magic_link",
	});
}

export async function sendPasswordResetEmail(userId: string, email: string, link: string): Promise<void> {
	const html = renderBrandedEmail({
		headline: "Reset your password",
		intro: "Click the button below to choose a new password. This link expires in 1 hour.",
		ctaLabel: "Reset password",
		ctaUrl: link,
		footerNote: "If you did not request this, you can safely ignore this email.",
	});

	await notifyUser({
		userId,
		event: "password_reset",
		subject: "Reset your Vestigio password",
		bodyHtml: html,
		bodyText: `Reset your Vestigio password: ${link}`,
		tag: "password_reset",
	});
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

async function wasRecentlySent(tag: string, userId?: string): Promise<boolean> {
	try {
		const cutoff = new Date(Date.now() - DEDUPE_WINDOW_MS);
		const recent = await prisma.notificationLog.findFirst({
			where: {
				event: { startsWith: tag.split(":")[0] },
				subject: { contains: tag.split(":").slice(1).join(":").slice(0, 80) },
				createdAt: { gte: cutoff },
				status: "sent",
				...(userId ? { userId } : {}),
			},
			select: { id: true },
		});
		return !!recent;
	} catch {
		return false; // never block on dedupe failure
	}
}

function getBaseUrl(): string {
	return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://vestigio.io";
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
