// ──────────────────────────────────────────────
// Meta CAPI (Conversions API) — server-side event dispatch
//
// Sits on top of https://graph.facebook.com/v18.0/{pixelId}/events.
// Fired from Paddle webhook on transaction.completed so Meta counts
// the Purchase even when the buyer's browser blocks fbq (adblock,
// iOS 14+, tracking-protection).
//
// Payload rules:
//   - event_id MUST match the client Pixel's eventID so Meta dedupes
//     (both fire → count as 1). Use leadId or transaction ref.
//   - user_data must include hashed email/phone/ip for match quality.
//   - Purchase events NEED value + currency for optimizer to work.
//
// Env vars:
//   NEXT_PUBLIC_META_PIXEL_ID      — pixel to attribute events to
//   META_CAPI_ACCESS_TOKEN         — long-lived token from Events
//                                    Manager → Settings → CAPI
//   META_CAPI_TEST_EVENT_CODE      — optional; when set, events go
//                                    into Test Events view instead
//                                    of production stats. Useful for
//                                    the first hour of setup.
//
// Degrade-safe: any missing env var → early return, no throw.
// ──────────────────────────────────────────────

import crypto from "node:crypto";
import type { TrackingEvent, TrackingEventData } from "./types";

const META_EVENT_NAMES: Record<TrackingEvent, string> = {
	lead: "Lead",
	initiate_checkout: "InitiateCheckout",
	purchase: "Purchase",
};

function sha256Lower(input: string): string {
	return crypto.createHash("sha256").update(input.trim().toLowerCase()).digest("hex");
}

interface MetaCapiInput extends TrackingEventData {
	/** Client IP — Meta wants this in user_data for match quality. */
	ip?: string;
	/** UA string — same reason. */
	userAgent?: string;
	/** URL the conversion happened on — Meta requires event_source_url. */
	sourceUrl?: string;
}

export async function sendMetaCapiEvent(
	event: TrackingEvent,
	data: MetaCapiInput,
): Promise<{ ok: boolean; reason?: string }> {
	const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
	const token = process.env.META_CAPI_ACCESS_TOKEN;
	if (!pixelId || !token) {
		return { ok: false, reason: "not_configured" };
	}
	const testCode = process.env.META_CAPI_TEST_EVENT_CODE || undefined;

	const userData: Record<string, unknown> = {};
	if (data.email) userData.em = [sha256Lower(data.email)];
	if (data.phone) userData.ph = [sha256Lower(data.phone)];
	if (data.firstName) userData.fn = [sha256Lower(data.firstName)];
	if (data.lastName) userData.ln = [sha256Lower(data.lastName)];
	if (data.ip) userData.client_ip_address = data.ip;
	if (data.userAgent) userData.client_user_agent = data.userAgent;

	const customData: Record<string, unknown> = {};
	if (data.valueCents !== undefined) {
		customData.value = data.valueCents / 100;
		customData.currency = data.currency ?? "BRL";
	}
	if (data.contentId) customData.content_ids = [data.contentId];
	if (data.contentName) customData.content_name = data.contentName;

	const eventObj: Record<string, unknown> = {
		event_name: META_EVENT_NAMES[event],
		event_time: Math.floor(Date.now() / 1000),
		action_source: "website",
		user_data: userData,
		custom_data: customData,
	};
	if (data.eventId) eventObj.event_id = data.eventId;
	if (data.sourceUrl) eventObj.event_source_url = data.sourceUrl;

	const body: Record<string, unknown> = { data: [eventObj] };
	if (testCode) body.test_event_code = testCode;

	try {
		const res = await fetch(
			`https://graph.facebook.com/v18.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			},
		);
		if (!res.ok) {
			const errText = await res.text().catch(() => "");
			console.warn(`[meta-capi] ${event} rejected status=${res.status} body=${errText.slice(0, 200)}`);
			return { ok: false, reason: `status_${res.status}` };
		}
		return { ok: true };
	} catch (err) {
		console.warn(`[meta-capi] ${event} network error:`, err instanceof Error ? err.message : err);
		return { ok: false, reason: "network_error" };
	}
}
