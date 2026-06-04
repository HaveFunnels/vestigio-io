import { prisma } from "@/libs/prismaDb";
import {
	isBrevoConfigured,
	sendBrevoEmail,
	sendBrevoWhatsApp,
} from "@/libs/brevo";
import { isTwilioConfigured, sendTwilioSms } from "@/libs/twilio-sms";
import {
	isMetaWhatsAppConfigured,
	sendWhatsAppTemplate,
} from "@/libs/whatsapp-meta";
import {
	getTemplateForEvent,
	localeToWhatsAppLanguage,
} from "@/libs/whatsapp-templates";

// ──────────────────────────────────────────────
// Notifications service — channel-aware fan-out
//
// Centralised entry point for every transactional message in Vestigio.
// Looks up user preferences, picks the right channels, and sends via Brevo
// (preferred) or Nodemailer (legacy fallback). Every attempt is logged to
// NotificationLog so we have an audit trail.
// ──────────────────────────────────────────────

export type NotificationEvent =
	| "page_down"
	| "incident"
	| "regression"
	| "improvement"
	| "newsletter"
	| "magic_link"
	| "activation_link"
	| "password_reset"
	| "support_reply"
	| "billing"
	| "system"
	// Fired by the post-cycle attribution job when a UserAction the
	// operator marked as done is confirmed resolved by a subsequent
	// cycle. Celebration moment — delivers the "since you fixed X,
	// you recovered $Y/mo" payoff.
	| "verified_resolved"
	| "digest"
	| "mini_audit_complete"
	// Product updates email channel — wired so the productUpdates toggle
	// in settings actually gates anything. Fired when product release
	// notes / changelog updates ship.
	| "product_updates"
	// PIX dunning lifecycle for MP recurring renewals. All five are
	// transactional/critical (always sent regardless of prefs) — see
	// isEventEnabled. Driven by apps/audit-runner/dunning-pix.ts.
	| "pix_reminder_5d"
	| "pix_reminder_2d"
	| "pix_reminder_today"
	| "pix_confirmed"
	| "pix_suspended"
	// Wave 21.5 — monthly "Vestigio caught $X this month" report
	// sent on the first ~7 days of each new month. Idempotent via
	// the tag value-caught:{envId}:{YYYYMM}.
	| "value_caught_monthly"
	// Wave-22.6 onboarding — fired on env activation (first audit
	// kicked off) and when the user marks their first UserAction as
	// in_progress. Dedupe-per-user via tag welcome:{userId} and
	// activation_celebrated:{userId}.
	| "welcome"
	| "activation_celebrated"
	// Wave 22.6 Step 7 — Monthly Strategy Plan ready notification.
	// Fired when MonthlyStrategyPlan.status flips from 'generating'
	// to 'ready' (either via day-1 cron OR first-cycle trigger).
	// Idempotent via tag strategy-plan:{envId}:{YYYYMM}. Two variants
	// via the same union member: subject line + intro change based
	// on isFirstPlan (resolved inside the trigger).
	| "strategy_plan_ready";

interface BaseNotification {
	event: NotificationEvent;
	subject: string; // used for email subject + log
	bodyHtml: string; // for email
	bodyText?: string; // short message for SMS / WhatsApp / email plaintext
	/**
	 * Ordered values that fill {{1}}, {{2}}, {{3}} placeholders in the Meta
	 * WhatsApp template for this event. If absent, WhatsApp is skipped.
	 * The template name itself is resolved from NotificationEvent via
	 * `whatsapp-templates.ts`.
	 */
	whatsappBodyParams?: string[];
	/** Optional param for the template's URL button dynamic portion */
	whatsappButtonParam?: string;
	/** Legacy Brevo fields — only used if Meta WhatsApp is not configured */
	whatsappTemplateId?: number;
	whatsappParams?: Record<string, string>;
	tag?: string;
}

interface UserNotification extends BaseNotification {
	userId: string;
}

interface DirectNotification extends BaseNotification {
	to: { email?: string; phone?: string };
	userId?: string; // optional — for logging
}

interface NotifyResult {
	email: { sent: boolean; error?: string };
	sms: { sent: boolean; error?: string };
	whatsapp: { sent: boolean; error?: string };
}

// ──────────────────────────────────────────────
// Per-user notify (looks up prefs)
// ──────────────────────────────────────────────

export async function notifyUser(payload: UserNotification): Promise<NotifyResult> {
	const result: NotifyResult = {
		email: { sent: false },
		sms: { sent: false },
		whatsapp: { sent: false },
	};

	const user = await prisma.user.findUnique({
		where: { id: payload.userId },
		include: { notificationPrefs: true },
	});

	if (!user) {
		result.email.error = "user not found";
		return result;
	}

	// Default preferences if user has none yet
	const prefs = user.notificationPrefs ?? {
		emailEnabled: true,
		smsEnabled: false,
		whatsappEnabled: false,
		alertOnPageDown: true,
		alertOnIncident: true,
		alertOnRegression: true,
		alertOnImprovement: false,
		newsletterSubscribed: true,
		productUpdates: true,
		alertOnVerifiedResolved: true,
		alertOnDigest: true,
	};

	// Event gating: respect per-event opt-outs
	if (!isEventEnabled(payload.event, prefs as any)) {
		return result;
	}

	// Email
	if (prefs.emailEnabled && user.email) {
		const r = await sendOneEmail({
			to: user.email,
			toName: user.name || undefined,
			subject: payload.subject,
			html: payload.bodyHtml,
			text: payload.bodyText,
			tag: payload.tag || payload.event,
			userId: user.id,
			event: payload.event,
		});
		result.email = r;
	}

	// SMS
	if (prefs.smsEnabled && user.phone && payload.bodyText) {
		const r = await sendOneSms({
			to: user.phone,
			message: payload.bodyText,
			tag: payload.tag || payload.event,
			userId: user.id,
			event: payload.event,
		});
		result.sms = r;
	}

	// WhatsApp — prefer Meta Cloud API (Coexistence), fall back to Brevo legacy
	if (prefs.whatsappEnabled && user.phone) {
		const r = await sendOneWhatsApp({
			to: user.phone,
			userLocale: user.locale,
			bodyParams: payload.whatsappBodyParams,
			buttonParam: payload.whatsappButtonParam,
			// Legacy Brevo fallback inputs
			brevoTemplateId: payload.whatsappTemplateId,
			brevoParams: payload.whatsappParams,
			userId: user.id,
			event: payload.event,
			tag: payload.tag || payload.event,
		});
		result.whatsapp = r;
	}

	return result;
}

// ──────────────────────────────────────────────
// Direct notify — used for unauthenticated flows like magic link
// ──────────────────────────────────────────────

export async function notifyDirect(payload: DirectNotification): Promise<NotifyResult> {
	const result: NotifyResult = {
		email: { sent: false },
		sms: { sent: false },
		whatsapp: { sent: false },
	};

	if (payload.to.email) {
		result.email = await sendOneEmail({
			to: payload.to.email,
			subject: payload.subject,
			html: payload.bodyHtml,
			text: payload.bodyText,
			tag: payload.tag || payload.event,
			userId: payload.userId,
			event: payload.event,
		});
	}

	if (payload.to.phone && payload.bodyText) {
		result.sms = await sendOneSms({
			to: payload.to.phone,
			message: payload.bodyText,
			tag: payload.tag || payload.event,
			userId: payload.userId,
			event: payload.event,
		});
	}

	return result;
}

// ──────────────────────────────────────────────
// Notify all owners + admins of an organization
// (used for org-level events: page down, incident, regression)
// ──────────────────────────────────────────────

export async function notifyOrganization(
	organizationId: string,
	payload: BaseNotification,
): Promise<{ recipients: number; results: NotifyResult[] }> {
	const memberships = await prisma.membership.findMany({
		where: {
			organizationId,
			role: { in: ["owner", "admin"] },
		},
		select: { userId: true },
	});

	const results: NotifyResult[] = [];
	for (const m of memberships) {
		const r = await notifyUser({ ...payload, userId: m.userId });
		results.push(r);
	}

	return { recipients: memberships.length, results };
}

// ──────────────────────────────────────────────
// Internal sender helpers — handle provider fallback + logging
// ──────────────────────────────────────────────

/**
 * Route event → sender profile.
 * Transactional flows the user should not reply to go via no-reply@,
 * everything else (alerts, newsletter, incidents) goes via notifications@.
 */
function senderProfileForEvent(event: NotificationEvent): "notifications" | "noreply" {
	switch (event) {
		case "magic_link":
		case "password_reset":
		case "billing":
			return "noreply";
		default:
			return "notifications";
	}
}

async function sendOneEmail(args: {
	to: string;
	toName?: string;
	subject: string;
	html: string;
	text?: string;
	tag?: string;
	userId?: string;
	event: NotificationEvent;
}): Promise<{ sent: boolean; error?: string }> {
	if (!isBrevoConfigured()) {
		const error = "BREVO_API_KEY not configured — email not sent";
		console.error(`[notifications] ${error}`);
		await logNotification({
			userId: args.userId,
			channel: "email",
			event: args.event,
			recipient: args.to,
			subject: args.subject,
			status: "failed",
			provider: "brevo",
			errorMsg: error,
			tag: args.tag,
		});
		return { sent: false, error };
	}

	const res = await sendBrevoEmail({
		to: args.to,
		toName: args.toName,
		subject: args.subject,
		html: args.html,
		text: args.text,
		tags: args.tag ? [args.tag] : undefined,
		senderProfile: senderProfileForEvent(args.event),
	});
	await logNotification({
		userId: args.userId,
		channel: "email",
		event: args.event,
		recipient: args.to,
		subject: args.subject,
		status: res.ok ? "sent" : "failed",
		provider: "brevo",
		providerId: res.messageId,
		errorMsg: res.error,
	});
	return { sent: res.ok, error: res.error };
}

async function sendOneSms(args: {
	to: string;
	message: string;
	tag?: string;
	userId?: string;
	event: NotificationEvent;
}): Promise<{ sent: boolean; error?: string }> {
	if (!isTwilioConfigured()) {
		return { sent: false, error: "Twilio not configured" };
	}
	const res = await sendTwilioSms({
		to: args.to,
		message: args.message,
	});
	await logNotification({
		userId: args.userId,
		channel: "sms",
		event: args.event,
		recipient: args.to,
		status: res.ok ? "sent" : "failed",
		provider: "twilio",
		providerId: res.messageId,
		errorMsg: res.error,
	});
	return { sent: res.ok, error: res.error };
}

async function sendOneWhatsApp(args: {
	to: string;
	userLocale?: string | null;
	bodyParams?: string[];
	buttonParam?: string;
	brevoTemplateId?: number;
	brevoParams?: Record<string, string>;
	userId?: string;
	event: NotificationEvent;
	tag?: string;
}): Promise<{ sent: boolean; error?: string }> {
	// Prefer Meta Cloud API (Coexistence) if configured and a template exists
	if (isMetaWhatsAppConfigured()) {
		const language = localeToWhatsAppLanguage(args.userLocale);
		const template = getTemplateForEvent(args.event, language);

		if (!template) {
			// No template registered for this event — skip silently rather than fail
			return { sent: false, error: "no template for event" };
		}
		if (!args.bodyParams) {
			return { sent: false, error: "missing whatsappBodyParams for template" };
		}

		const res = await sendWhatsAppTemplate({
			to: args.to,
			templateName: template.name,
			language,
			bodyParams: args.bodyParams,
			buttonParam: args.buttonParam,
		});

		await logNotification({
			userId: args.userId,
			channel: "whatsapp",
			event: args.event,
			recipient: args.to,
			subject: template.name,
			status: res.ok ? "sent" : "failed",
			provider: "meta_whatsapp",
			providerId: res.wamid,
			errorMsg: res.error,
		});
		return { sent: res.ok, error: res.error };
	}

	// Legacy Brevo fallback — only runs if Brevo WA is configured AND no Meta
	if (isBrevoConfigured() && args.brevoTemplateId) {
		const res = await sendBrevoWhatsApp({
			to: args.to,
			templateId: args.brevoTemplateId,
			params: args.brevoParams,
		});
		await logNotification({
			userId: args.userId,
			channel: "whatsapp",
			event: args.event,
			recipient: args.to,
			status: res.ok ? "sent" : "failed",
			provider: "brevo",
			providerId: res.messageId,
			errorMsg: res.error,
			tag: args.tag,
		});
		return { sent: res.ok, error: res.error };
	}

	return { sent: false, error: "no whatsapp provider configured" };
}

async function logNotification(data: {
	userId?: string;
	channel: string;
	event: string;
	recipient: string;
	subject?: string;
	status: string;
	provider: string;
	providerId?: string;
	errorMsg?: string;
	/** Wave 22.6 — first-class dedup key. New triggers should set
	    this; older ones still derive a key from subject substring. */
	tag?: string;
}) {
	try {
		await prisma.notificationLog.create({
			data: {
				userId: data.userId,
				channel: data.channel,
				event: data.event,
				recipient: data.recipient,
				subject: data.subject,
				status: data.status,
				provider: data.provider,
				providerId: data.providerId,
				errorMsg: data.errorMsg?.slice(0, 500),
				tag: data.tag,
			},
		});
	} catch {
		// best-effort — never block delivery on log failure
	}
}

function isEventEnabled(event: NotificationEvent, prefs: {
	alertOnPageDown: boolean;
	alertOnIncident: boolean;
	alertOnRegression: boolean;
	alertOnImprovement: boolean;
	newsletterSubscribed: boolean;
	productUpdates: boolean;
	alertOnVerifiedResolved?: boolean;
	alertOnDigest?: boolean;
}): boolean {
	switch (event) {
		case "page_down": return prefs.alertOnPageDown;
		case "incident": return prefs.alertOnIncident;
		case "regression": return prefs.alertOnRegression;
		case "improvement": return prefs.alertOnImprovement;
		case "newsletter": return prefs.newsletterSubscribed;
		case "system":
		case "magic_link":
		case "activation_link":
		case "password_reset":
		case "support_reply":
		case "billing":
		case "pix_reminder_5d":
		case "pix_reminder_2d":
		case "pix_reminder_today":
		case "pix_confirmed":
		case "pix_suspended":
			return true; // critical / transactional always sent
		case "verified_resolved":
			// Celebration / attribution event — opt-out via preference toggle.
			// Defaults to true (enabled) when preference hasn't been set yet.
			return prefs.alertOnVerifiedResolved ?? true;
		case "digest":
			// Daily digest — opt-out via preference toggle.
			// Defaults to true (enabled) when preference hasn't been set yet.
			return prefs.alertOnDigest ?? true;
		case "mini_audit_complete":
			// Anonymous lead email — always sent (they just requested it)
			return true;
		case "product_updates":
			// Release notes / changelog announcements — opt-out via
			// preference toggle. Defaults to true.
			return prefs.productUpdates;
		case "value_caught_monthly":
			// Wave 21.5 — monthly value-caught report. Defaults on; the
			// dashboard widget shows the same data so opt-out is a soft
			// preference (no information loss). Reuses alertOnDigest as
			// the toggle since it's conceptually the same "periodic
			// summary email" channel — splitting the pref would require
			// a Prisma migration for a low-value distinction.
			return prefs.alertOnDigest ?? true;
		case "strategy_plan_ready":
			// Wave 22.6 Step 7 — monthly Strategy Plan ready email.
			// Same justification as value_caught_monthly: conceptually
			// a periodic summary; the plan UI is always reachable
			// regardless of opt-out, so the email is a soft preference.
			return prefs.alertOnDigest ?? true;
		case "welcome":
		case "activation_celebrated":
			// Wave-22.6 onboarding triggers — transactional. Welcome
			// fires once per user on env activation; activation
			// celebrated fires once per user when they first mark an
			// action in-progress. Both have user-level dedup tags so
			// they can't spam.
			return true;
	}
}

// ──────────────────────────────────────────────
// Email template helpers — minimal branded layout
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// Branded email renderer
//
// Layout: neutral light body (renders reliably across Gmail desktop /
// Outlook / Apple Mail — dark backgrounds get force-inverted in many
// clients and look broken). The "card" inside the body is white with a
// subtle border + dark headline text, matching the brand without
// betting on email-client dark-mode support.
//
// Inputs:
//   - headline: H1 text. Always escaped before rendering.
//   - intro: paragraph HTML. Templates control formatting (<strong>,
//     <br/>, etc.); interpolated values MUST be escaped by the caller
//     before being substituted into the template string. See
//     renderEmailFromTemplate's escapedVars handling.
//   - ctaLabel + ctaUrl: optional CTA button. Both escaped.
//   - footerNote: optional dimmer secondary text under the CTA. Escaped.
//   - preheader: optional preview text shown in inbox before opening
//     (Gmail/iOS preview line). Defaults to first 100 chars of intro
//     with HTML stripped.
//   - locale: drives the "you're receiving this" footer copy.
//
// Per-locale i18n strings live in BRANDED_EMAIL_STRINGS — keeps the
// rendering shape locale-agnostic and the copy auditable in one place.
// ──────────────────────────────────────────────

const BRANDED_EMAIL_STRINGS: Record<string, {
	preferencesPrefix: string;
	preferencesLink: string;
	ctaFallbackLabel: string;
}> = {
	"pt-BR": {
		preferencesPrefix: "Você está recebendo este email porque suas notificações estão ativas. ",
		preferencesLink: "Gerenciar preferências",
		ctaFallbackLabel: "Abrir Vestigio",
	},
	en: {
		preferencesPrefix: "You're receiving this because you have notifications enabled. ",
		preferencesLink: "Manage preferences",
		ctaFallbackLabel: "Open Vestigio",
	},
	es: {
		preferencesPrefix: "Recibes este correo porque tus notificaciones están activas. ",
		preferencesLink: "Administrar preferencias",
		ctaFallbackLabel: "Abrir Vestigio",
	},
	de: {
		preferencesPrefix: "Du erhältst diese Nachricht, weil deine Benachrichtigungen aktiviert sind. ",
		preferencesLink: "Einstellungen verwalten",
		ctaFallbackLabel: "Vestigio öffnen",
	},
};

// App-subdomain so the "manage preferences" link doesn't bounce through
// a marketing → app redirect. The middleware does the redirect on the
// vestigio.io domain, but emails should send users to the right place
// the first time — saves a hop and keeps the URL stable.
const APP_SETTINGS_URL = "https://app.vestigio.io/app/settings";

export function renderBrandedEmail(args: {
	headline: string;
	intro: string;
	ctaLabel?: string;
	ctaUrl?: string;
	footerNote?: string;
	preheader?: string;
	locale?: string | null;
}): string {
	const localeKey = args.locale && BRANDED_EMAIL_STRINGS[args.locale] ? args.locale : "en";
	const strings = BRANDED_EMAIL_STRINGS[localeKey];

	// Preheader: hidden line that previews in the inbox before the email
	// is opened. Defaults to a stripped-tag snippet of the intro. The
	// trailing whitespace and zero-width chars are a common pattern to
	// prevent the email body from leaking into the preview (some clients
	// concatenate preheader + visible content).
	const preheaderText = args.preheader ?? stripHtml(args.intro).slice(0, 120).trim();
	const preheader = `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${escapeHtml(preheaderText)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`;

	const cta = args.ctaUrl
		? `<a href="${escapeHtml(args.ctaUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;">${escapeHtml(args.ctaLabel || strings.ctaFallbackLabel)}</a>`
		: "";

	return `<!doctype html>
<html lang="${escapeHtml(localeKey)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(args.headline)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#18181b;">
	${preheader}
	<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
		<tr>
			<td align="center" style="padding:40px 16px;">
				<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
					<tr>
						<td style="padding:32px 32px 16px 32px;">
							<div style="font-size:13px;color:#71717a;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Vestigio</div>
							<h1 style="margin:12px 0 16px 0;font-size:22px;color:#0f172a;font-weight:700;line-height:1.3;">${escapeHtml(args.headline)}</h1>
							<div style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#3f3f46;">${args.intro}</div>
							${cta}
							${args.footerNote ? `<p style="margin:24px 0 0 0;font-size:13px;color:#71717a;line-height:1.5;">${escapeHtml(args.footerNote)}</p>` : ""}
						</td>
					</tr>
					<tr>
						<td style="padding:16px 32px;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a;">
							${escapeHtml(strings.preferencesPrefix)}<a href="${APP_SETTINGS_URL}" style="color:#0f172a;text-decoration:underline;">${escapeHtml(strings.preferencesLink)}</a>.
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>`;
}

export function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

// Strip HTML tags + collapse whitespace. Used to derive the inbox
// preheader from an intro that may contain <strong> + <br/> tags.
function stripHtml(s: string): string {
	return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
