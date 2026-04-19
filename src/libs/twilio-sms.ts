// ──────────────────────────────────────────────
// Twilio SMS — transactional SMS via REST API
//
// Env vars:
//   TWILIO_ACCOUNT_SID   — ACxxxxxxxx
//   TWILIO_AUTH_TOKEN     — your auth token
//   TWILIO_FROM_NUMBER    — E.164 number (e.g. +16063426850)
// ──────────────────────────────────────────────

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || "";

export function isTwilioConfigured(): boolean {
	return !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER);
}

export interface TwilioSmsPayload {
	to: string;
	message: string;
}

export interface TwilioSmsResult {
	ok: boolean;
	messageId?: string;
	error?: string;
}

export async function sendTwilioSms(payload: TwilioSmsPayload): Promise<TwilioSmsResult> {
	if (!isTwilioConfigured()) {
		return { ok: false, error: "Twilio not configured" };
	}

	const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
	const body = new URLSearchParams({
		To: payload.to,
		From: TWILIO_FROM_NUMBER,
		Body: payload.message.slice(0, 1600),
	});

	const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");

	try {
		const res = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Basic ${auth}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: body.toString(),
		});

		const json = await res.json();

		if (res.ok && json.sid) {
			return { ok: true, messageId: json.sid };
		}

		return {
			ok: false,
			error: json.message || `HTTP ${res.status}`,
		};
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : "Twilio request failed",
		};
	}
}
