// ──────────────────────────────────────────────
// Brevo (formerly Sendinblue) HTTP client
//
// Single provider for transactional email, SMS, and WhatsApp.
// We use the REST API directly (no SDK) to keep deps minimal.
//
// Docs: https://developers.brevo.com/reference
//
// Required env vars:
//   BREVO_API_KEY            — your Brevo API key (xkeysib-...)
//   BREVO_SENDER_EMAIL       — verified sender email (e.g. notifications@vestigio.io)
//   BREVO_SENDER_NAME        — display name (e.g. "Vestigio")
//   BREVO_SMS_SENDER         — alphanumeric sender id, max 11 chars (e.g. "Vestigio")
//   BREVO_WHATSAPP_NUMBER    — your registered WhatsApp business number, E.164 format
// ──────────────────────────────────────────────

const BREVO_API_BASE = "https://api.brevo.com/v3";

function getApiKey(): string | null {
	return process.env.BREVO_API_KEY || null;
}

export function isBrevoConfigured(): boolean {
	return !!getApiKey();
}

interface BrevoResponse {
	ok: boolean;
	messageId?: string;
	error?: string;
	status?: number;
}

async function brevoFetch(path: string, body: unknown): Promise<BrevoResponse> {
	const apiKey = getApiKey();
	if (!apiKey) {
		return { ok: false, error: "BREVO_API_KEY not configured" };
	}

	try {
		const res = await fetch(`${BREVO_API_BASE}${path}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"api-key": apiKey,
				accept: "application/json",
			},
			body: JSON.stringify(body),
		});

		const text = await res.text();
		const data = text ? safeParseJson(text) : {};

		if (!res.ok) {
			return {
				ok: false,
				status: res.status,
				error: data?.message || data?.code || `HTTP ${res.status}`,
			};
		}

		return {
			ok: true,
			messageId: data?.messageId || data?.reference || data?.messageIds?.[0] || undefined,
		};
	} catch (err: any) {
		return { ok: false, error: err?.message || "Network error" };
	}
}

function safeParseJson(text: string): any {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

// ──────────────────────────────────────────────
// Email
// ──────────────────────────────────────────────

export interface BrevoEmailPayload {
	to: string;
	toName?: string;
	subject: string;
	html: string;
	text?: string;
	replyTo?: string;
	tags?: string[];
	/**
	 * Sender profile:
	 * - "notifications" (default): notifications@vestigio.io — alerts, newsletters, incident reports
	 * - "noreply": no-reply@vestigio.io — magic links, password resets, billing receipts
	 *
	 * The actual email address is read from BREVO_SENDER_EMAIL / BREVO_NOREPLY_EMAIL
	 * so each can be changed independently without a code change.
	 */
	senderProfile?: "notifications" | "noreply";
}

function resolveSender(profile?: "notifications" | "noreply") {
	const name = process.env.BREVO_SENDER_NAME || "Vestigio";
	if (profile === "noreply") {
		return {
			name,
			email: process.env.BREVO_NOREPLY_EMAIL || process.env.BREVO_SENDER_EMAIL || "no-reply@vestigio.io",
		};
	}
	return {
		name,
		email: process.env.BREVO_SENDER_EMAIL || "notifications@vestigio.io",
	};
}

export async function sendBrevoEmail(payload: BrevoEmailPayload): Promise<BrevoResponse> {
	return brevoFetch("/smtp/email", {
		sender: resolveSender(payload.senderProfile),
		to: [{ email: payload.to, name: payload.toName }],
		subject: payload.subject,
		htmlContent: payload.html,
		textContent: payload.text,
		replyTo: payload.replyTo
			? { email: payload.replyTo }
			: undefined,
		tags: payload.tags,
	});
}

// ──────────────────────────────────────────────
// SMS (transactional)
//
// Phone must be E.164 format, e.g. +5511999999999
// Sender must be ≤11 alphanumeric chars
// ──────────────────────────────────────────────

export interface BrevoSmsPayload {
	to: string; // E.164
	message: string; // max 160 chars per segment
	tag?: string;
}

export async function sendBrevoSms(payload: BrevoSmsPayload): Promise<BrevoResponse> {
	return brevoFetch("/transactionalSMS/sms", {
		sender: process.env.BREVO_SMS_SENDER || "Vestigio",
		recipient: payload.to,
		content: payload.message.slice(0, 320), // 2 segments max
		type: "transactional",
		tag: payload.tag,
	});
}

// ──────────────────────────────────────────────
// WhatsApp
//
// Brevo requires pre-approved templates for outbound WA messages.
// You configure templates in the Brevo dashboard then reference them by name.
// ──────────────────────────────────────────────

export interface BrevoWhatsAppPayload {
	to: string; // E.164 without +
	templateId: number; // numeric template id from Brevo dashboard
	params?: Record<string, string>; // template variables {{1}}, {{2}}, etc.
}

export async function sendBrevoWhatsApp(payload: BrevoWhatsAppPayload): Promise<BrevoResponse> {
	const cleanTo = payload.to.replace(/^\+/, "");
	return brevoFetch("/whatsapp/sendMessage", {
		senderNumber: (process.env.BREVO_WHATSAPP_NUMBER || "").replace(/^\+/, ""),
		contactNumbers: [cleanTo],
		templateId: payload.templateId,
		params: payload.params,
	});
}

// ──────────────────────────────────────────────
// Contacts (for newsletter list management)
// ──────────────────────────────────────────────

export async function upsertBrevoContact(email: string, attributes?: Record<string, string>): Promise<BrevoResponse> {
	return brevoFetch("/contacts", {
		email,
		attributes,
		updateEnabled: true,
	});
}
