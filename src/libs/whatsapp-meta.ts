// ──────────────────────────────────────────────
// Meta Cloud API — WhatsApp Business Platform client
//
// Supports the Coexistence mode: same phone number used in the WhatsApp
// Business App (on a physical device) AND the Cloud API simultaneously.
// Messages sent via either channel appear in both via Messaging Echoes.
//
// Docs:
//   - https://developers.facebook.com/docs/whatsapp/cloud-api
//   - https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
//
// Required env vars:
//   META_APP_ID              — from Meta for Developers app dashboard
//   META_APP_SECRET          — used to verify webhook signatures
//   META_SYSTEM_USER_TOKEN   — permanent system user token (not the 24h debug token)
//   META_WABA_ID             — WhatsApp Business Account id (for template CRUD)
//   META_PHONE_NUMBER_ID     — the phone number id registered to the WABA
//   META_WEBHOOK_VERIFY_TOKEN — shared secret you pick, Meta echoes it during subscribe
//
// Graph API version is pinned because Meta deprecates old versions ~yearly.
// ──────────────────────────────────────────────

import crypto from "crypto";
import {
	WHATSAPP_TEMPLATES,
	listAllTemplates,
	type WhatsAppLanguage,
	type WhatsAppTemplateDef,
} from "@/libs/whatsapp-templates";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export function isMetaWhatsAppConfigured(): boolean {
	return !!(
		process.env.META_SYSTEM_USER_TOKEN &&
		process.env.META_PHONE_NUMBER_ID
	);
}

function getToken(): string {
	const t = process.env.META_SYSTEM_USER_TOKEN;
	if (!t) throw new Error("META_SYSTEM_USER_TOKEN not configured");
	return t;
}

function getPhoneNumberId(): string {
	const p = process.env.META_PHONE_NUMBER_ID;
	if (!p) throw new Error("META_PHONE_NUMBER_ID not configured");
	return p;
}

function getWabaId(): string {
	const w = process.env.META_WABA_ID;
	if (!w) throw new Error("META_WABA_ID not configured");
	return w;
}

// ──────────────────────────────────────────────
// Low-level Graph API fetch helper
// ──────────────────────────────────────────────

interface GraphResponse<T = any> {
	ok: boolean;
	status: number;
	data?: T;
	error?: {
		message: string;
		type?: string;
		code?: number;
		error_subcode?: number;
		fbtrace_id?: string;
	};
}

async function graphFetch<T = any>(
	path: string,
	init: { method: "GET" | "POST" | "DELETE"; body?: unknown } = { method: "GET" },
): Promise<GraphResponse<T>> {
	try {
		const res = await fetch(`${GRAPH_BASE}${path}`, {
			method: init.method,
			headers: {
				Authorization: `Bearer ${getToken()}`,
				"Content-Type": "application/json",
			},
			body: init.body ? JSON.stringify(init.body) : undefined,
		});

		const text = await res.text();
		const data = text ? safeJson(text) : {};

		if (!res.ok) {
			return {
				ok: false,
				status: res.status,
				error: data?.error || { message: `HTTP ${res.status}` },
			};
		}

		return { ok: true, status: res.status, data };
	} catch (err: any) {
		return {
			ok: false,
			status: 0,
			error: { message: err?.message || "Network error" },
		};
	}
}

function safeJson(text: string): any {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

// ──────────────────────────────────────────────
// Outbound: template messages
// ──────────────────────────────────────────────

export interface SendTemplateArgs {
	/** Recipient phone in E.164 format (with or without leading +) */
	to: string;
	/** Template name (must be approved in the WABA) */
	templateName: string;
	/** Template language code */
	language: WhatsAppLanguage;
	/** Ordered list of values to fill {{1}}, {{2}}, ... in the body */
	bodyParams: string[];
	/** If the template has a URL button, this replaces its dynamic portion */
	buttonParam?: string;
}

export interface SendResult {
	ok: boolean;
	wamid?: string;
	error?: string;
	errorCode?: number;
}

export async function sendWhatsAppTemplate(args: SendTemplateArgs): Promise<SendResult> {
	if (!isMetaWhatsAppConfigured()) {
		return { ok: false, error: "Meta WhatsApp not configured" };
	}

	const to = args.to.replace(/^\+/, "");

	const components: any[] = [];
	if (args.bodyParams.length > 0) {
		components.push({
			type: "body",
			parameters: args.bodyParams.map((text) => ({ type: "text", text })),
		});
	}
	if (args.buttonParam) {
		components.push({
			type: "button",
			sub_type: "url",
			index: "0",
			parameters: [{ type: "text", text: args.buttonParam }],
		});
	}

	const res = await graphFetch<{ messages: Array<{ id: string }> }>(
		`/${getPhoneNumberId()}/messages`,
		{
			method: "POST",
			body: {
				messaging_product: "whatsapp",
				recipient_type: "individual",
				to,
				type: "template",
				template: {
					name: args.templateName,
					language: { code: args.language },
					components,
				},
			},
		},
	);

	if (!res.ok) {
		return {
			ok: false,
			error: res.error?.message || `Graph error ${res.status}`,
			errorCode: res.error?.code,
		};
	}

	return {
		ok: true,
		wamid: res.data?.messages?.[0]?.id,
	};
}

// ──────────────────────────────────────────────
// Outbound: free-form text message
//
// Can ONLY be used when the recipient has sent a message within the last 24h
// (the "customer service window"). Outside that window, you must use a template.
// We use this for replies to inbound messages via the webhook.
// ──────────────────────────────────────────────

export async function sendWhatsAppText(args: {
	to: string;
	body: string;
	replyToMessageId?: string;
}): Promise<SendResult> {
	if (!isMetaWhatsAppConfigured()) {
		return { ok: false, error: "Meta WhatsApp not configured" };
	}

	const to = args.to.replace(/^\+/, "");

	const payload: any = {
		messaging_product: "whatsapp",
		recipient_type: "individual",
		to,
		type: "text",
		text: { preview_url: false, body: args.body },
	};
	if (args.replyToMessageId) {
		payload.context = { message_id: args.replyToMessageId };
	}

	const res = await graphFetch<{ messages: Array<{ id: string }> }>(
		`/${getPhoneNumberId()}/messages`,
		{ method: "POST", body: payload },
	);

	if (!res.ok) {
		return { ok: false, error: res.error?.message || `Graph error ${res.status}` };
	}

	return { ok: true, wamid: res.data?.messages?.[0]?.id };
}

// ──────────────────────────────────────────────
// Template management
// ──────────────────────────────────────────────

export interface MetaTemplate {
	id: string;
	name: string;
	language: string;
	status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED";
	category: string;
	components: any[];
}

/**
 * List all templates currently registered in the WABA.
 */
export async function listMetaTemplates(): Promise<{ ok: boolean; templates?: MetaTemplate[]; error?: string }> {
	const res = await graphFetch<{ data: MetaTemplate[] }>(
		`/${getWabaId()}/message_templates?limit=200`,
		{ method: "GET" },
	);
	if (!res.ok) return { ok: false, error: res.error?.message };
	return { ok: true, templates: res.data?.data || [] };
}

/**
 * Create (submit for approval) a template in the WABA.
 * Returns the template id; the template will remain in PENDING until Meta reviews it.
 */
export async function createMetaTemplate(
	tpl: WhatsAppTemplateDef & { language: WhatsAppLanguage },
): Promise<{ ok: boolean; id?: string; error?: string }> {
	const components: any[] = [
		{
			type: "BODY",
			text: tpl.body,
			...(countPlaceholders(tpl.body) > 0 && {
				example: {
					body_text: [tpl.params.map((_, i) => exampleValue(i))],
				},
			}),
		},
	];

	if (tpl.button) {
		components.push({
			type: "BUTTONS",
			buttons: [
				{
					type: "URL",
					text: tpl.button.text,
					url: tpl.button.url,
				},
			],
		});
	}

	const res = await graphFetch<{ id: string; status: string; category: string }>(
		`/${getWabaId()}/message_templates`,
		{
			method: "POST",
			body: {
				name: tpl.name,
				language: tpl.language,
				category: tpl.category,
				components,
			},
		},
	);

	if (!res.ok) return { ok: false, error: res.error?.message };
	return { ok: true, id: res.data?.id };
}

function countPlaceholders(body: string): number {
	const matches = body.match(/\{\{\d+\}\}/g);
	return matches ? matches.length : 0;
}

function exampleValue(i: number): string {
	const examples = ["vestigio.io", "Checkout redirect chain adds 2.4s latency", "3", "200", "ABC123"];
	return examples[i] || `value_${i + 1}`;
}

/**
 * Register every template in the local registry at Meta.
 * Safe to re-run — Meta rejects duplicates with error 190 / 2388023, which we swallow.
 */
export async function registerAllLocalTemplates(): Promise<Array<{
	name: string;
	language: string;
	status: "created" | "already_exists" | "failed";
	error?: string;
	id?: string;
}>> {
	const results: Array<{ name: string; language: string; status: "created" | "already_exists" | "failed"; error?: string; id?: string }> = [];
	for (const tpl of listAllTemplates()) {
		const res = await createMetaTemplate(tpl);
		if (res.ok) {
			results.push({ name: tpl.name, language: tpl.language, status: "created", id: res.id });
		} else if (res.error?.match(/already exists|Duplicate/i)) {
			results.push({ name: tpl.name, language: tpl.language, status: "already_exists" });
		} else {
			results.push({ name: tpl.name, language: tpl.language, status: "failed", error: res.error });
		}
	}
	return results;
}

// ──────────────────────────────────────────────
// Phone number + account health
// ──────────────────────────────────────────────

export interface PhoneNumberInfo {
	id: string;
	display_phone_number: string;
	verified_name: string;
	code_verification_status: string;
	quality_rating: string;
	messaging_limit_tier?: string;
	throughput?: { level: string };
	name_status?: string;
}

export async function getPhoneNumberInfo(): Promise<{ ok: boolean; info?: PhoneNumberInfo; error?: string }> {
	const res = await graphFetch<PhoneNumberInfo>(
		`/${getPhoneNumberId()}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,messaging_limit_tier,throughput,name_status`,
	);
	if (!res.ok) return { ok: false, error: res.error?.message };
	return { ok: true, info: res.data };
}

// ──────────────────────────────────────────────
// Webhook signature verification
//
// Meta signs every POST to your webhook with X-Hub-Signature-256 using the
// app secret. We must verify this before trusting the payload.
// ──────────────────────────────────────────────

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
	const appSecret = process.env.META_APP_SECRET;
	if (!appSecret) return false;
	if (!signatureHeader) return false;

	const expected = "sha256=" + crypto
		.createHmac("sha256", appSecret)
		.update(rawBody, "utf8")
		.digest("hex");

	try {
		return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
	} catch {
		return false;
	}
}

/**
 * Handle the GET verification handshake that Meta sends when you first
 * register the webhook URL in the app dashboard.
 * Meta sends: ?hub.mode=subscribe&hub.verify_token=XXX&hub.challenge=YYY
 * We must echo back the challenge if the verify_token matches ours.
 */
export function verifyWebhookChallenge(params: URLSearchParams): string | null {
	const mode = params.get("hub.mode");
	const token = params.get("hub.verify_token");
	const challenge = params.get("hub.challenge");

	const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
	if (mode === "subscribe" && token && expected && token === expected) {
		return challenge;
	}
	return null;
}

// ──────────────────────────────────────────────
// Webhook payload parsing
//
// The payload structure:
//   entry[].changes[].value.{messages, statuses, contacts}
// ──────────────────────────────────────────────

export interface InboundWhatsAppMessage {
	wamid: string;
	from: string; // phone in E.164 (no leading +)
	fromName?: string;
	timestamp: number;
	type: "text" | "image" | "video" | "audio" | "document" | "reaction" | "button" | "interactive" | "order";
	text?: string;
	mediaId?: string;
	mimeType?: string;
	/** Original message id this one replies to (if any) */
	contextMessageId?: string;
}

export interface StatusUpdate {
	wamid: string;
	status: "sent" | "delivered" | "read" | "failed";
	timestamp: number;
	recipient: string;
	errorMessage?: string;
}

export interface ParsedWebhook {
	messages: InboundWhatsAppMessage[];
	statuses: StatusUpdate[];
}

export function parseWebhookPayload(payload: any): ParsedWebhook {
	const result: ParsedWebhook = { messages: [], statuses: [] };

	const entries = payload?.entry || [];
	for (const entry of entries) {
		const changes = entry?.changes || [];
		for (const change of changes) {
			const value = change?.value || {};

			// Map contacts array (phone → name) for enrichment
			const contactNames: Record<string, string> = {};
			for (const c of value.contacts || []) {
				if (c.wa_id && c.profile?.name) contactNames[c.wa_id] = c.profile.name;
			}

			// Inbound messages
			for (const m of value.messages || []) {
				const msg: InboundWhatsAppMessage = {
					wamid: m.id,
					from: m.from,
					fromName: contactNames[m.from],
					timestamp: parseInt(m.timestamp, 10),
					type: m.type,
					contextMessageId: m.context?.id,
				};
				if (m.type === "text") msg.text = m.text?.body;
				if (m.type === "image") {
					msg.mediaId = m.image?.id;
					msg.mimeType = m.image?.mime_type;
				}
				if (m.type === "document") {
					msg.mediaId = m.document?.id;
					msg.mimeType = m.document?.mime_type;
				}
				if (m.type === "audio") {
					msg.mediaId = m.audio?.id;
					msg.mimeType = m.audio?.mime_type;
				}
				if (m.type === "button") msg.text = m.button?.text;
				if (m.type === "interactive") {
					msg.text = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title;
				}
				result.messages.push(msg);
			}

			// Delivery statuses
			for (const s of value.statuses || []) {
				result.statuses.push({
					wamid: s.id,
					status: s.status,
					timestamp: parseInt(s.timestamp, 10),
					recipient: s.recipient_id,
					errorMessage: s.errors?.[0]?.title,
				});
			}
		}
	}

	return result;
}

// ──────────────────────────────────────────────
// Coexistence-specific: sync contacts + history from Business App
// (called once after onboarding via embedded signup)
// ──────────────────────────────────────────────

export async function requestSmbAppDataSync(): Promise<{ ok: boolean; error?: string }> {
	const res = await graphFetch(
		`/${getPhoneNumberId()}/smb_app_data`,
		{ method: "POST", body: {} },
	);
	if (!res.ok) return { ok: false, error: res.error?.message };
	return { ok: true };
}
