import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import { encryptConfig } from "@/libs/integration-crypto";
import { decodeOAuthState } from "@/libs/oauth-state";
import { verifyShopifyCallbackHmac } from "@/libs/shopify-hmac";

// ──────────────────────────────────────────────
// Shopify OAuth — Callback
//
// GET /api/integrations/shopify/oauth/callback
//   ?code=...&hmac=...&host=...&shop=...&state=...&timestamp=...
//
// Steps:
//   1. Verify HMAC of all query params (sans hmac) using client secret.
//      Shopify signs the redirect; without this any attacker can craft
//      a fake callback URL to phish a code for a different shop.
//   2. Verify shop domain matches *.myshopify.com.
//   3. Verify state (HMAC-signed by us) to recover environmentId and
//      prevent CSRF / cross-tenant token binding.
//   4. Exchange code for access_token via POST to the shop.
//   5. Persist encrypted credentials on the IntegrationConnection.
//   6. Redirect to /app/settings/data-sources with success flag.
// ──────────────────────────────────────────────

const CLIENT_ID =
	process.env.SHOPIFY_APP_CLIENT_ID || process.env.SHOPIFY_API_KEY || "";
const CLIENT_SECRET =
	process.env.SHOPIFY_APP_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET || "";

const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

function getBaseUrl(): string {
	return (
		process.env.SITE_URL ||
		process.env.NEXTAUTH_URL ||
		"http://localhost:3000"
	);
}

function redirect(path: string): NextResponse {
	return NextResponse.redirect(`${getBaseUrl()}${path}`);
}

// verifyShopifyCallbackHmac moved to @/libs/shopify-hmac so Next.js 15's
// strict route-file export rule (only HTTP handlers + config flags
// allowed) doesn't fail typegen on the named export. Tests import
// from the new location.

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const code = searchParams.get("code");
	const shop = (searchParams.get("shop") || "").toLowerCase();
	const state = searchParams.get("state");

	// 1. HMAC of the redirect itself (anti-tamper)
	if (!verifyShopifyCallbackHmac(searchParams, CLIENT_SECRET)) {
		return redirect("/app/settings/data-sources?shopify_error=hmac_invalid");
	}

	// 2. Shop domain shape
	if (!SHOP_DOMAIN_RE.test(shop)) {
		return redirect("/app/settings/data-sources?shopify_error=invalid_shop_domain");
	}

	// 3. State token (CSRF + carries environmentId)
	const decoded = decodeOAuthState(state);
	if (!decoded.ok) {
		return redirect(
			`/app/settings/data-sources?shopify_error=${encodeURIComponent("state:" + decoded.error)}`,
		);
	}
	if (decoded.payload.provider !== "shopify") {
		return redirect("/app/settings/data-sources?shopify_error=state_provider_mismatch");
	}
	const environmentId = decoded.payload.environmentId;

	if (!code) {
		return redirect("/app/settings/data-sources?shopify_error=missing_code");
	}

	// 4. Exchange code for access_token
	let accessToken: string;
	let scope: string;
	try {
		const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				client_id: CLIENT_ID,
				client_secret: CLIENT_SECRET,
				code,
			}),
			signal: AbortSignal.timeout(15_000),
		});

		if (!tokenRes.ok) {
			const errBody = await tokenRes.text().catch(() => "");
			console.error(
				`[shopify-oauth-callback] token exchange failed ${tokenRes.status}: ${errBody.slice(0, 200)}`,
			);
			return redirect("/app/settings/data-sources?shopify_error=token_exchange_failed");
		}

		const tokenData = await tokenRes.json();
		accessToken = tokenData.access_token;
		scope = tokenData.scope || "";

		if (!accessToken) {
			return redirect("/app/settings/data-sources?shopify_error=invalid_token_response");
		}
	} catch (err) {
		console.error("[shopify-oauth-callback] token exchange error:", err);
		return redirect("/app/settings/data-sources?shopify_error=token_exchange_failed");
	}

	// 5. Persist on the IntegrationConnection (encrypted)
	try {
		const encryptedConfig = encryptConfig({
			shop_domain: shop,
			store_url: shop,
			access_token: accessToken,
			api_key: CLIENT_ID,
			api_secret: "",       // public app: secret never leaves the server env, do not persist
			scope,
		});

		await prisma.integrationConnection.upsert({
			where: {
				environmentId_provider: { environmentId, provider: "shopify" },
			},
			update: {
				config: encryptedConfig,
				status: "connected",
				syncError: null,
				syncMetadata: JSON.stringify({
					shop_domain: shop,
					scope,
					installed_via: "oauth",
					installed_at: new Date().toISOString(),
				}),
			},
			create: {
				environmentId,
				provider: "shopify",
				config: encryptedConfig,
				status: "connected",
				syncMetadata: JSON.stringify({
					shop_domain: shop,
					scope,
					installed_via: "oauth",
					installed_at: new Date().toISOString(),
				}),
			},
		});
	} catch (err) {
		console.error("[shopify-oauth-callback] persist error:", err);
		return redirect("/app/settings/data-sources?shopify_error=save_failed");
	}

	return redirect("/app/settings/data-sources?shopify_connected=true");
}
