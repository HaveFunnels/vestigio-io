import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import {
	parseWebhookPayload,
	verifyWebhookChallenge,
	verifyWebhookSignature,
} from "@/libs/whatsapp-meta";

// ──────────────────────────────────────────────
// Meta Cloud API webhook
//
// URL (register this in Meta App Dashboard → WhatsApp → Configuration → Webhook):
//   https://vestigio.io/api/whatsapp/webhook
//
// Verify token: the value of META_WEBHOOK_VERIFY_TOKEN in your env.
//
// Subscribed fields: messages, message_template_status_update
//
// Handled events:
//  - Inbound messages (text, media, button, interactive) → InboundMessage table
//  - Delivery/read status updates → NotificationLog.status
//  - Template approval status changes → logged (no DB effect yet)
//
// All payload processing is best-effort: we always return 200 so Meta does not
// retry indefinitely on transient errors. Errors are logged to stdout.
// ──────────────────────────────────────────────

export const dynamic = "force-dynamic";

// ── GET: webhook verification handshake ───────────────────────────
export async function GET(request: Request) {
	const url = new URL(request.url);
	const challenge = verifyWebhookChallenge(url.searchParams);
	if (challenge) {
		// Meta echoes back this raw string to confirm ownership
		return new Response(challenge, { status: 200 });
	}
	return new NextResponse("forbidden", { status: 403 });
}

// ── POST: receive events ──────────────────────────────────────────
export async function POST(request: Request) {
	// Refuse any POST before Meta is configured. This prevents random
	// writes to InboundMessage from unauthenticated callers in the window
	// between shipping the route and setting the env vars.
	if (!process.env.META_APP_SECRET) {
		return new NextResponse("whatsapp not configured", { status: 503 });
	}

	// 1. Read raw body so we can verify signature before parsing
	const raw = await request.text();
	const signature = request.headers.get("x-hub-signature-256");

	if (!verifyWebhookSignature(raw, signature)) {
		console.warn("[whatsapp-webhook] invalid signature");
		return new NextResponse("invalid signature", { status: 401 });
	}

	let payload: any;
	try {
		payload = JSON.parse(raw);
	} catch {
		return new NextResponse("bad json", { status: 400 });
	}

	// 2. Parse inbound messages + status updates
	try {
		const { messages, statuses } = parseWebhookPayload(payload);

		// ── Inbound messages ──
		for (const m of messages) {
			try {
				// Match by phone to an existing Vestigio user if possible.
				// Meta sends phone as E.164 without leading + (e.g. "5511999999999"),
				// but our DB stores it with + — try both.
				const normalized = m.from.startsWith("+") ? m.from : `+${m.from}`;
				const user = await prisma.user.findFirst({
					where: {
						OR: [{ phone: normalized }, { phone: m.from }],
					},
					select: { id: true },
				});

				await prisma.inboundMessage.create({
					data: {
						channel: "whatsapp",
						provider: "meta_whatsapp",
						providerMsgId: m.wamid,
						fromAddress: normalized,
						fromName: m.fromName,
						userId: user?.id,
						body: m.text || `(${m.type} message)`,
						mediaUrl: m.mediaId ? `meta://${m.mediaId}` : null,
						mediaMimeType: m.mimeType,
					},
				});
			} catch (err: any) {
				// Unique constraint violation on providerMsgId means Meta
				// retried — safe to ignore.
				if (!/Unique constraint/i.test(err?.message || "")) {
					console.error("[whatsapp-webhook] inbound error", err);
				}
			}
		}

		// ── Delivery / read status updates ──
		for (const s of statuses) {
			try {
				await prisma.notificationLog.updateMany({
					where: { providerId: s.wamid },
					data: {
						status: s.status, // sent | delivered | read | failed
						errorMsg: s.errorMessage,
					},
				});
			} catch (err) {
				console.error("[whatsapp-webhook] status update error", err);
			}
		}
	} catch (err) {
		console.error("[whatsapp-webhook] fatal parse error", err);
	}

	// Always 200 so Meta stops retrying
	return NextResponse.json({ ok: true });
}
