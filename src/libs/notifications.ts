import { prisma } from "@/libs/prismaDb";
import {
	isBrevoConfigured,
	sendBrevoEmail,
	sendBrevoSms,
	sendBrevoWhatsApp,
} from "@/libs/brevo";
import { sendEmail as sendNodemailerEmail } from "@/libs/email";
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
	| "password_reset"
	| "support_reply"
	| "billing"
	| "system";

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
			message: `[Vestigio] ${payload.bodyText}`,
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
			message: `[Vestigio] ${payload.bodyText}`,
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
	// Prefer Brevo, fall back to Nodemailer
	if (isBrevoConfigured()) {
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

	// Legacy SMTP fallback
	try {
		await sendNodemailerEmail({
			to: args.to,
			subject: args.subject,
			html: args.html,
		});
		await logNotification({
			userId: args.userId,
			channel: "email",
			event: args.event,
			recipient: args.to,
			subject: args.subject,
			status: "sent",
			provider: "nodemailer",
		});
		return { sent: true };
	} catch (err: any) {
		const msg = err?.message || "smtp error";
		await logNotification({
			userId: args.userId,
			channel: "email",
			event: args.event,
			recipient: args.to,
			subject: args.subject,
			status: "failed",
			provider: "nodemailer",
			errorMsg: msg,
		});
		return { sent: false, error: msg };
	}
}

async function sendOneSms(args: {
	to: string;
	message: string;
	tag?: string;
	userId?: string;
	event: NotificationEvent;
}): Promise<{ sent: boolean; error?: string }> {
	if (!isBrevoConfigured()) {
		return { sent: false, error: "Brevo not configured" };
	}
	const res = await sendBrevoSms({
		to: args.to,
		message: args.message,
		tag: args.tag,
	});
	await logNotification({
		userId: args.userId,
		channel: "sms",
		event: args.event,
		recipient: args.to,
		status: res.ok ? "sent" : "failed",
		provider: "brevo",
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
}): boolean {
	switch (event) {
		case "page_down": return prefs.alertOnPageDown;
		case "incident": return prefs.alertOnIncident;
		case "regression": return prefs.alertOnRegression;
		case "improvement": return prefs.alertOnImprovement;
		case "newsletter": return prefs.newsletterSubscribed;
		case "system":
		case "magic_link":
		case "password_reset":
		case "support_reply":
		case "billing":
			return true; // critical / transactional always sent
	}
}

// ──────────────────────────────────────────────
// Email template helpers — minimal branded layout
// ──────────────────────────────────────────────

export function renderBrandedEmail(args: {
	headline: string;
	intro: string;
	ctaLabel?: string;
	ctaUrl?: string;
	footerNote?: string;
}): string {
	const cta = args.ctaUrl
		? `<a href="${escapeHtml(args.ctaUrl)}" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;">${escapeHtml(args.ctaLabel || "Open Vestigio")}</a>`
		: "";

	return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e4e4e7;">
	<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
		<tr>
			<td align="center" style="padding:40px 16px;">
				<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="background:#18181b;border:1px solid #27272a;border-radius:12px;overflow:hidden;">
					<tr>
						<td style="padding:32px 32px 16px 32px;">
							<div style="font-size:14px;color:#a1a1aa;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Vestigio</div>
							<h1 style="margin:12px 0 16px 0;font-size:22px;color:#fafafa;font-weight:700;">${escapeHtml(args.headline)}</h1>
							<p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#d4d4d8;">${args.intro}</p>
							${cta}
							${args.footerNote ? `<p style="margin:24px 0 0 0;font-size:13px;color:#71717a;line-height:1.5;">${escapeHtml(args.footerNote)}</p>` : ""}
						</td>
					</tr>
					<tr>
						<td style="padding:16px 32px;border-top:1px solid #27272a;font-size:12px;color:#52525b;">
							You're receiving this because you have notifications enabled.
							<a href="https://vestigio.io/app/settings" style="color:#10b981;text-decoration:none;"> Manage preferences</a>.
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
