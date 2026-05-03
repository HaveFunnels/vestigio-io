import { prisma } from "@/libs/prismaDb";
import { notifyOrganization, notifyUser } from "@/libs/notifications";
import { renderSmsFromTemplate, renderEmailFromTemplate } from "@/libs/notification-templates";

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

	// Resolve org + user locale (most users have a single membership)
	const membership = await prisma.membership.findFirst({
		where: { userId: args.userId, organization: { status: "active" } },
		select: { organizationId: true },
	});
	if (!membership) return;

	const userLocale = await getUserLocale(args.userId);

	// Pick the most impactful one to headline (avoid spam — single notification per cycle)
	const headline = critical.sort(
		(a, b) => (b.impact?.midpoint || 0) - (a.impact?.midpoint || 0),
	)[0];

	const dedupeKey = `incident:${headline.id}`;
	if (await wasRecentlySent(dedupeKey, args.userId)) return;

	const vars = {
		count: String(critical.length),
		domain: args.domain,
		headline: headline.title,
		rootCauseSuffix: headline.root_cause ? ` — ${escapeHtml(headline.root_cause)}` : "",
	};

	const email = renderEmailFromTemplate("incident", vars, getBaseUrl(), userLocale)!;
	const smsText = renderSmsFromTemplate("incident", vars, userLocale)!;

	await notifyOrganization(membership.organizationId, {
		event: "incident",
		subject: email.subject,
		bodyHtml: email.html,
		bodyText: smsText,
		tag: dedupeKey,
		// Meta WhatsApp template params for "vestigio_incident":
		// {{1}} = domain, {{2}} = headline, {{3}} = root_cause_summary
		whatsappBodyParams: [
			args.domain,
			truncate(headline.title, 60),
			truncate(headline.root_cause || `${critical.length} issue${critical.length > 1 ? "s" : ""} detected`, 120),
		],
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

	const userLocale = await getUserLocale(args.userId);

	const headline = args.regressions.sort(
		(a, b) => (b.impact?.midpoint || 0) - (a.impact?.midpoint || 0),
	)[0];

	const dedupeKey = `regression:${headline.id}`;
	if (await wasRecentlySent(dedupeKey, args.userId)) return;

	const vars = {
		count: String(args.regressions.length),
		domain: args.domain,
		headline: headline.title,
		rootCauseSuffix: headline.root_cause ? `<br/><br/>${escapeHtml(headline.root_cause)}` : "",
	};

	const email = renderEmailFromTemplate("regression", vars, getBaseUrl(), userLocale)!;
	const smsText = renderSmsFromTemplate("regression", vars, userLocale)!;

	await notifyOrganization(membership.organizationId, {
		event: "regression",
		subject: email.subject,
		bodyHtml: email.html,
		bodyText: smsText,
		tag: dedupeKey,
		// Meta WhatsApp template params for "vestigio_regression":
		// {{1}} = domain, {{2}} = headline, {{3}} = count
		whatsappBodyParams: [
			args.domain,
			truncate(headline.title, 60),
			String(args.regressions.length),
		],
	});
}

// ──────────────────────────────────────────────
// Page down trigger
//
// Today the health-checker only monitors Vestigio infrastructure;
// when client domain monitoring lands, call this with the failing
// page so we fan out to the affected org.
//
// TODO: Activate this trigger when user-facing surface monitoring
// ships (Wave 7 — Hybrid Architecture Channel B). Currently the
// health-checker only monitors Vestigio's own infrastructure, so
// this function is never called from production code paths. Once
// Channel B adds external domain monitoring, wire this from the
// health-check worker's failure handler so page_down events reach
// the affected org's owners/admins.
// ──────────────────────────────────────────────

export async function triggerPageDownNotification(args: {
	organizationId: string;
	pageUrl: string;
	statusCode?: number;
	errorMessage?: string;
}): Promise<void> {
	const dedupeKey = `page_down:${args.organizationId}:${args.pageUrl}`;
	if (await wasRecentlySent(dedupeKey)) return;

	const vars = {
		pageUrl: args.pageUrl,
		statusSuffix: args.statusCode ? ` (HTTP ${args.statusCode})` : "",
		statusDetail: args.statusCode ? `<br/><br/>HTTP status: <strong>${args.statusCode}</strong>` : "",
		errorDetail: args.errorMessage ? `<br/><br/>${escapeHtml(args.errorMessage)}` : "",
	};

	const email = renderEmailFromTemplate("page_down", vars, getBaseUrl())!;
	const smsText = renderSmsFromTemplate("page_down", vars)!;

	await notifyOrganization(args.organizationId, {
		event: "page_down",
		subject: email.subject,
		bodyHtml: email.html,
		bodyText: smsText,
		tag: dedupeKey,
		// Meta WhatsApp template params for "vestigio_page_down":
		// {{1}} = page_url, {{2}} = status_code
		whatsappBodyParams: [
			truncate(args.pageUrl, 80),
			args.statusCode ? String(args.statusCode) : "unknown",
		],
	});
}

// ──────────────────────────────────────────────
// Magic link / password reset / support reply (transactional, always fired)
// ──────────────────────────────────────────────

export async function sendMagicLink(email: string, link: string): Promise<void> {
	const vars = { link };
	const rendered = renderEmailFromTemplate("magic_link", vars, getBaseUrl())!;
	const smsText = renderSmsFromTemplate("magic_link", vars)!;

	const { notifyDirect } = await import("@/libs/notifications");
	await notifyDirect({
		event: "magic_link",
		to: { email },
		subject: rendered.subject,
		bodyHtml: rendered.html,
		bodyText: smsText,
		tag: "magic_link",
	});
}

/**
 * Post-purchase activation email for /lp buyers. Sent once per lead
 * conversion — does NOT deliver a magic link. The link lands the user
 * on /activate/:token where they pick Google, GitHub, or a password.
 *
 * Kept separate from sendMagicLink because:
 *   1. Wording is different ("your audit is ready" vs. "sign in")
 *   2. TTL is 24h here, 10min for magic links
 *   3. We NEVER want /lp buyers to receive an autologin link — the
 *      activation token is the authority, but it must be consumed
 *      through a deliberate auth-method choice, not a one-click
 *      signin that bypasses password/OAuth setup entirely.
 */
export async function sendActivationEmail(
	email: string,
	token: string,
	domain: string,
): Promise<void> {
	const base =
		process.env.NEXTAUTH_URL ||
		process.env.NEXT_PUBLIC_APP_URL ||
		"https://app.vestigio.io";
	const link = `${base}/activate/${encodeURIComponent(token)}`;
	const vars = { domain: domain.replace(/[<>&"']/g, ""), link };

	const rendered = renderEmailFromTemplate("activation_link", vars, getBaseUrl())!;
	const smsText = renderSmsFromTemplate("activation_link", vars)!;

	const { notifyDirect } = await import("@/libs/notifications");
	await notifyDirect({
		event: "activation_link",
		to: { email },
		subject: rendered.subject,
		bodyHtml: rendered.html,
		bodyText: smsText,
		tag: "activation_link",
	});
}

// ──────────────────────────────────────────────
// Mini-audit completion email — sent to the lead's email
// when audit_complete fires. Includes findings summary
// with severity + impact, and a CTA to the result page.
// ──────────────────────────────────────────────

interface MiniAuditFinding {
	title: string;
	severity: string;
	impact?: { min_brl_cents: number; max_brl_cents: number } | null;
}

const SEVERITY_LABELS: Record<string, string> = {
	critical: "Crítico",
	high: "Alto",
	medium: "Médio",
	low: "Baixo",
};

const SEVERITY_COLORS: Record<string, string> = {
	critical: "#f87171",
	high: "#fbbf24",
	medium: "#facc15",
	low: "#a1a1aa",
};

function formatBRLCents(cents: number): string {
	return `R$ ${Math.round(cents / 100).toLocaleString("pt-BR")}`;
}

function buildFindingsHtml(
	domain: string,
	findings: MiniAuditFinding[],
	totalImpactMin: number,
	totalImpactMax: number,
	hiddenCount: number,
): string {
	const rows = findings
		.filter((f) => f.severity !== "positive")
		.map((f) => {
			const color = SEVERITY_COLORS[f.severity] || "#a1a1aa";
			const label = SEVERITY_LABELS[f.severity] || f.severity;
			const impact = f.impact
				? `<span style="color:#f87171;font-family:monospace;font-size:12px;">↓ ${formatBRLCents(f.impact.min_brl_cents)}–${formatBRLCents(f.impact.max_brl_cents)}/mês</span>`
				: "";
			return `<tr>
				<td style="padding:8px 12px;border-bottom:1px solid #27272a;">
					<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;vertical-align:middle;"></span>
					<span style="font-size:11px;font-weight:600;text-transform:uppercase;color:${color};letter-spacing:0.5px;">${escapeHtml(label)}</span>
				</td>
				<td style="padding:8px 12px;border-bottom:1px solid #27272a;font-size:14px;color:#e4e4e7;">${escapeHtml(f.title)}</td>
				<td style="padding:8px 12px;border-bottom:1px solid #27272a;text-align:right;">${impact}</td>
			</tr>`;
		})
		.join("");

	return `<p style="margin:0 0 8px 0;font-size:15px;color:#d4d4d8;">
		Encontramos <strong style="color:#f87171;">${findings.filter((f) => f.severity !== "positive").length} vazamentos</strong> em
		<strong>${escapeHtml(domain)}</strong> custando entre
		<strong style="color:#f87171;">${formatBRLCents(totalImpactMin)}</strong> e
		<strong style="color:#f87171;">${formatBRLCents(totalImpactMax)}</strong> por mês.
	</p>
	<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0;background:#0f0f17;border:1px solid #27272a;border-radius:8px;overflow:hidden;">
		${rows}
	</table>
	${hiddenCount > 0 ? `<p style="margin:0 0 8px 0;font-size:13px;color:#71717a;">+ ${hiddenCount} findings adicionais bloqueados no diagnóstico gratuito.</p>` : ""}`;
}

export async function sendMiniAuditEmail(args: {
	email: string;
	domain: string;
	leadId: string;
	findings: MiniAuditFinding[];
	hiddenCount: number;
	totalImpactMin: number;
	totalImpactMax: number;
}): Promise<void> {
	const baseUrl = getBaseUrl();
	const resultUrl = `${baseUrl}/lp/audit/result/${args.leadId}`;
	const negativeCount = args.findings.filter((f) => f.severity !== "positive").length;

	const findingsHtml = buildFindingsHtml(
		args.domain,
		args.findings,
		args.totalImpactMin,
		args.totalImpactMax,
		args.hiddenCount,
	);

	const vars = {
		domain: args.domain.replace(/[<>&"']/g, ""),
		count: String(negativeCount),
		impact: `${formatBRLCents(args.totalImpactMin)}–${formatBRLCents(args.totalImpactMax)}`,
		resultUrl,
		findingsHtml,
	};

	const rendered = renderEmailFromTemplate("mini_audit_complete", vars, baseUrl)!;
	const smsText = renderSmsFromTemplate("mini_audit_complete", vars)!;

	const { notifyDirect } = await import("@/libs/notifications");
	await notifyDirect({
		event: "mini_audit_complete",
		to: { email: args.email },
		subject: rendered.subject,
		bodyHtml: rendered.html,
		bodyText: smsText,
		tag: `mini_audit:${args.leadId}`,
	});
}

export async function sendPasswordResetEmail(userId: string, email: string, link: string): Promise<void> {
	const userLocale = await getUserLocale(userId);
	const vars = { link };
	const rendered = renderEmailFromTemplate("password_reset", vars, getBaseUrl(), userLocale)!;
	const smsText = renderSmsFromTemplate("password_reset", vars, userLocale)!;

	await notifyUser({
		userId,
		event: "password_reset",
		subject: rendered.subject,
		bodyHtml: rendered.html,
		bodyText: smsText,
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

/** Look up a user's preferred locale for template i18n. Best-effort. */
async function getUserLocale(userId: string): Promise<string | null> {
	try {
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: { locale: true },
		});
		return user?.locale ?? null;
	} catch {
		return null;
	}
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Meta WhatsApp rejects template params that contain newlines or exceed
 * the template's allowed length. Truncate + collapse whitespace to keep
 * sends from failing with error 131008 (template param mismatch).
 */
function truncate(s: string, max: number): string {
	const clean = s.replace(/\s+/g, " ").trim();
	if (clean.length <= max) return clean;
	return clean.slice(0, max - 1) + "…";
}
