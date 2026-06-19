import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import { decryptConfig } from "@/libs/integration-crypto";
import { verifyShopifySignature } from "@/libs/shopify-hmac";

// ──────────────────────────────────────────────
// Shopify Webhook Receiver
//
// POST /api/integrations/shopify/webhook
//
// Verifies HMAC-SHA256 signature with the app's shared secret and
// dispatches by topic. The store is identified by the
// X-Shopify-Shop-Domain header (public, non-sensitive).
//
// Supported topics:
//   - app/uninstalled   → mark connection disconnected
//   - orders/create     → bump lastSyncedAt + cache event in syncMetadata
//   - orders/updated    → same
//   - orders/cancelled  → same
//   - refunds/create    → same
//   - Anything else     → 200 acknowledge (no-op)
//
// Idempotency: X-Shopify-Webhook-Id is logged but we accept replays —
// the downstream poller dedupes by order id at aggregation time.
//
// Secret: SHOPIFY_WEBHOOK_SECRET env var. For Custom Apps this is the
// app's API secret; for a Public App it is the Client Secret. Both
// are the same value Shopify uses to sign webhooks.
// ──────────────────────────────────────────────

const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || "";

// verifyShopifySignature moved to @/libs/shopify-hmac so Next.js 15's
// strict route-file export rule (only HTTP handlers + config flags
// allowed) doesn't fail typegen on the named export. Tests now import
// from the new location.

/**
 * Find the IntegrationConnection for a given shop_domain.
 *
 * The shop domain is stored encrypted (it's part of the OAuth config),
 * so we have to decrypt the candidate rows to match. Volume is small
 * (one row per tenant who connected Shopify), so the O(N) decrypt is
 * acceptable — replace with a syncMetadata index if it ever bites.
 */
async function findConnectionByShopDomain(
	shopDomain: string,
): Promise<{ id: string; environmentId: string } | null> {
	const normalized = shopDomain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");

	const candidates = await prisma.integrationConnection.findMany({
		where: { provider: "shopify", status: { in: ["connected", "error"] } },
		select: { id: true, environmentId: true, config: true },
	});

	for (const c of candidates) {
		if (!c.config) continue;
		try {
			const cfg = decryptConfig(c.config);
			const stored = (cfg.shop_domain || cfg.store_url || "")
				.toLowerCase()
				.replace(/^https?:\/\//, "")
				.replace(/\/$/, "");
			if (stored === normalized) return { id: c.id, environmentId: c.environmentId };
		} catch {
			// corrupt or empty config — skip
		}
	}
	return null;
}

export async function POST(request: Request) {
	const rawBody = await request.text();
	const sigHeader = request.headers.get("x-shopify-hmac-sha256");
	const topic = request.headers.get("x-shopify-topic") || "";
	const shopDomain = request.headers.get("x-shopify-shop-domain") || "";
	const webhookId = request.headers.get("x-shopify-webhook-id") || "";

	// Step 1: Verify signature BEFORE doing anything else.
	const verification = verifyShopifySignature(rawBody, sigHeader, WEBHOOK_SECRET);
	if (!verification.valid) {
		console.warn(
			`[shopify-webhook] signature verification failed: ${verification.error} (topic=${topic} shop=${shopDomain})`,
		);
		return NextResponse.json({ error: verification.error }, { status: 401 });
	}

	if (!shopDomain || !topic) {
		return NextResponse.json({ error: "missing_required_headers" }, { status: 400 });
	}

	// Step 2: Locate the connection.
	const conn = await findConnectionByShopDomain(shopDomain);
	if (!conn) {
		// Still 200 — we don't want Shopify retrying webhooks for stores we don't know.
		return NextResponse.json({ received: true, matched: false });
	}

	// Step 3: Dispatch by topic.
	try {
		if (topic === "app/uninstalled") {
			await prisma.integrationConnection.update({
				where: { id: conn.id },
				data: {
					status: "disconnected",
					config: "", // tokens are invalid post-uninstall
					syncError: "Store uninstalled the app via Shopify Admin",
					syncMetadata: JSON.stringify({
						uninstalled_at: new Date().toISOString(),
						shop_domain: shopDomain,
					}),
				},
			});
			return NextResponse.json({ received: true });
		}

		if (
			topic === "orders/create" ||
			topic === "orders/updated" ||
			topic === "orders/cancelled" ||
			topic === "refunds/create"
		) {
			// Bump lastSyncedAt and stash the most recent event id for the
			// next poll cycle to know there's fresh data. We don't re-poll
			// inline — webhook handlers must stay fast.
			const existing = await prisma.integrationConnection.findUnique({
				where: { id: conn.id },
				select: { syncMetadata: true },
			});
			let meta: Record<string, any> = {};
			try {
				meta = existing?.syncMetadata ? JSON.parse(existing.syncMetadata) : {};
			} catch {
				meta = {};
			}
			meta.last_webhook_at = new Date().toISOString();
			meta.last_webhook_topic = topic;
			meta.last_webhook_id = webhookId;

			await prisma.integrationConnection.update({
				where: { id: conn.id },
				data: {
					lastSyncedAt: new Date(),
					syncMetadata: JSON.stringify(meta),
				},
			});
			return NextResponse.json({ received: true });
		}

		// Unhandled topic — acknowledge so Shopify stops retrying.
		return NextResponse.json({ received: true, handled: false });
	} catch (err) {
		console.error(`[shopify-webhook] handler error for topic=${topic}:`, err);
		// Return 200 anyway — we don't want infinite retry storms for our bugs.
		return NextResponse.json({ received: true, error: "handler_failed" });
	}
}
