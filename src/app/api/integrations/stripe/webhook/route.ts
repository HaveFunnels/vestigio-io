import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/libs/prismaDb";
import { decryptConfig } from "@/libs/integration-crypto";

// ──────────────────────────────────────────────
// Stripe Integration Webhook
//
// POST /api/integrations/stripe/webhook
//
// Receives Stripe Connect webhook events. Currently handles:
//   - account.application.deauthorized: user revoked our access
//
// Webhook secret: STRIPE_WEBHOOK_SECRET env var (same as billing
// webhooks — Stripe routes events to endpoints by URL, not by secret).
// If you need a separate secret for this endpoint, use
// STRIPE_CONNECT_WEBHOOK_SECRET instead.
// ──────────────────────────────────────────────

const WEBHOOK_SECRET =
	process.env.STRIPE_CONNECT_WEBHOOK_SECRET ||
	process.env.STRIPE_WEBHOOK_SECRET ||
	"";

/**
 * Verify Stripe webhook signature (HMAC-SHA256 with timestamp).
 *
 * Stripe sends `Stripe-Signature` header in format:
 *   t=<timestamp>,v1=<hex_signature>[,v0=<legacy>]
 *
 * The signed payload is: `${timestamp}.${rawBody}`
 */
function verifyStripeSignature(
	rawBody: string,
	sigHeader: string,
	secret: string,
	toleranceSec = 300,
): { valid: boolean; error?: string } {
	if (!secret) {
		return { valid: false, error: "webhook_secret_not_configured" };
	}

	const elements = sigHeader.split(",");
	const timestampStr = elements
		.find((e) => e.startsWith("t="))
		?.slice(2);
	const signatures = elements
		.filter((e) => e.startsWith("v1="))
		.map((e) => e.slice(3));

	if (!timestampStr || signatures.length === 0) {
		return { valid: false, error: "invalid_signature_format" };
	}

	const timestamp = parseInt(timestampStr, 10);
	if (isNaN(timestamp)) {
		return { valid: false, error: "invalid_timestamp" };
	}

	// Check tolerance (prevent replay attacks)
	const now = Math.floor(Date.now() / 1000);
	if (Math.abs(now - timestamp) > toleranceSec) {
		return { valid: false, error: "timestamp_outside_tolerance" };
	}

	// Compute expected signature
	const signedPayload = `${timestamp}.${rawBody}`;
	const expectedSig = crypto
		.createHmac("sha256", secret)
		.update(signedPayload, "utf8")
		.digest("hex");

	// Compare using timing-safe equality
	const valid = signatures.some((sig) => {
		try {
			return crypto.timingSafeEqual(
				Buffer.from(expectedSig, "hex"),
				Buffer.from(sig, "hex"),
			);
		} catch {
			return false;
		}
	});

	return valid ? { valid: true } : { valid: false, error: "signature_mismatch" };
}

export async function POST(request: Request) {
	const rawBody = await request.text();
	const sigHeader = request.headers.get("stripe-signature") || "";

	// Verify webhook signature
	const verification = verifyStripeSignature(rawBody, sigHeader, WEBHOOK_SECRET);
	if (!verification.valid) {
		console.warn(
			`[stripe-webhook] signature verification failed: ${verification.error}`,
		);
		return NextResponse.json(
			{ error: verification.error },
			{ status: 400 },
		);
	}

	let event: any;
	try {
		event = JSON.parse(rawBody);
	} catch {
		return NextResponse.json({ error: "invalid_json" }, { status: 400 });
	}

	const eventType = event?.type;

	// ── account.application.deauthorized ──────────────
	// Fired when a connected account revokes our platform's access.
	// We find the IntegrationConnection matching the stripe_user_id
	// and mark it disconnected.
	if (eventType === "account.application.deauthorized") {
		const stripeAccountId =
			event?.account || event?.data?.object?.id;

		if (!stripeAccountId) {
			console.warn("[stripe-webhook] deauthorized event missing account id");
			return NextResponse.json({ received: true });
		}

		console.log(
			`[stripe-webhook] account.application.deauthorized for ${stripeAccountId}`,
		);

		try {
			// Find all Stripe connections and check which one matches this account
			const stripeConnections = await prisma.integrationConnection.findMany({
				where: { provider: "stripe", status: "connected" },
			});

			let matched = false;
			for (const conn of stripeConnections) {
				try {
					const config = decryptConfig(conn.config);
					if (config.stripe_user_id === stripeAccountId) {
						await prisma.integrationConnection.update({
							where: { id: conn.id },
							data: {
								status: "disconnected",
								config: "", // Clear encrypted config — token is now invalid
								syncError: "Account deauthorized by user via Stripe",
								syncMetadata: JSON.stringify({
									deauthorized_at: new Date().toISOString(),
									stripe_user_id: stripeAccountId,
								}),
							},
						});
						matched = true;
						console.log(
							`[stripe-webhook] marked connection ${conn.id} (env=${conn.environmentId}) as disconnected`,
						);
					}
				} catch {
					// Decrypt failure — stale connection, skip
				}
			}

			if (!matched) {
				console.warn(
					`[stripe-webhook] no matching connection found for stripe_user_id=${stripeAccountId}`,
				);
			}
		} catch (err) {
			console.error("[stripe-webhook] error processing deauthorization:", err);
			// Still return 200 so Stripe doesn't retry
		}

		return NextResponse.json({ received: true });
	}

	// Unhandled event type — acknowledge receipt
	return NextResponse.json({ received: true });
}
