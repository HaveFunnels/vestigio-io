import { decryptConfig } from "@/libs/integration-crypto";

// ──────────────────────────────────────────────
// Provider-side token revocation on disconnect.
//
// Prior behavior on DELETE /api/integrations was to clear the local
// config and set status=disconnected — but the vendor still held a
// valid OAuth token. Symptoms visible to the customer:
//
//   - Meta / Google Ads apps kept appearing in the customer's
//     "connected apps" list on the vendor's dashboard.
//   - Stripe Connect kept the account association active — the
//     linked account could still transact via our platform id if
//     resurfaced.
//   - Nuvemshop app remained installed at the store.
//
// M9 H1 flagged this as a HIGH finding. The customer's expectation
// on "Disconnect" is that BOTH sides drop the token; anything less
// is a silent security posture regression. Handlers per provider
// below convert our decrypted config into the vendor's revoke API
// call. Failures do NOT block the local disconnect: the customer's
// intent is clear, and we accept the residual "still valid at
// vendor" risk in exchange for keeping the UX responsive. Failure
// is logged so ops can retry.
//
// Shopify: no OAuth revoke endpoint exists — the merchant must
// uninstall the app from within Shopify Admin. We return
// { attempted: false } for shopify so the caller can surface a
// hint to the operator ("also uninstall from your Shopify Admin").
// ──────────────────────────────────────────────

export interface RevokeOutcome {
	attempted: boolean;
	ok: boolean;
	reason?: string;
}

/// Best-effort revoke. Never throws — errors surface via
/// RevokeOutcome so the caller can log without aborting the
/// local disconnect. Timeout is short (5s) because a hung vendor
/// endpoint must not stall the customer's disconnect UI.
export async function revokeAtProvider(
	provider: string,
	encryptedConfig: string,
): Promise<RevokeOutcome> {
	if (!encryptedConfig) {
		return { attempted: false, ok: true, reason: "no_stored_config" };
	}
	let config: Record<string, string>;
	try {
		config = decryptConfig(encryptedConfig);
	} catch {
		return { attempted: false, ok: false, reason: "decrypt_failed" };
	}
	try {
		switch (provider) {
			case "meta_ads":
				return await revokeMetaAds(config);
			case "google_ads":
				return await revokeGoogleAds(config);
			case "stripe":
				return await revokeStripe(config);
			case "nuvemshop":
				return await revokeNuvemshop(config);
			case "shopify":
				return { attempted: false, ok: true, reason: "vendor_has_no_revoke_endpoint" };
			default:
				return { attempted: false, ok: true, reason: "unknown_provider" };
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { attempted: true, ok: false, reason: msg.slice(0, 200) };
	}
}

// ── Meta Ads (Facebook Graph API) ─────────────────────────────
// DELETE /{user_id}/permissions?access_token=<token> revokes all
// scopes for the app on that user. Returns { success: true }.
async function revokeMetaAds(config: Record<string, string>): Promise<RevokeOutcome> {
	const token = config.access_token;
	const userId = config.meta_user_id || config.user_id;
	if (!token || !userId) {
		return { attempted: false, ok: false, reason: "missing_token_or_user_id" };
	}
	const res = await fetch(
		`https://graph.facebook.com/v21.0/${encodeURIComponent(userId)}/permissions?access_token=${encodeURIComponent(token)}`,
		{ method: "DELETE", signal: AbortSignal.timeout(5_000) },
	);
	if (!res.ok) {
		return { attempted: true, ok: false, reason: `http_${res.status}` };
	}
	return { attempted: true, ok: true };
}

// ── Google Ads / Google OAuth ─────────────────────────────────
// POST https://oauth2.googleapis.com/revoke — accepts either the
// access token or the refresh token; either revokes the whole grant.
// We prefer refresh_token because it also invalidates any live
// access tokens minted from it.
async function revokeGoogleAds(config: Record<string, string>): Promise<RevokeOutcome> {
	const token = config.refresh_token || config.access_token;
	if (!token) {
		return { attempted: false, ok: false, reason: "missing_token" };
	}
	const res = await fetch("https://oauth2.googleapis.com/revoke", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: `token=${encodeURIComponent(token)}`,
		signal: AbortSignal.timeout(5_000),
	});
	if (!res.ok) {
		return { attempted: true, ok: false, reason: `http_${res.status}` };
	}
	return { attempted: true, ok: true };
}

// ── Stripe Connect ────────────────────────────────────────────
// POST https://connect.stripe.com/oauth/deauthorize with
// client_secret + stripe_user_id (the connected account id).
async function revokeStripe(config: Record<string, string>): Promise<RevokeOutcome> {
	const stripeUserId = config.stripe_user_id || config.connected_account_id;
	if (!stripeUserId) {
		return { attempted: false, ok: false, reason: "missing_stripe_user_id" };
	}
	const clientSecret = process.env.STRIPE_SECRET_KEY;
	if (!clientSecret) {
		return { attempted: false, ok: false, reason: "missing_stripe_secret" };
	}
	const params = new URLSearchParams({
		client_id: process.env.STRIPE_CONNECT_CLIENT_ID || "",
		stripe_user_id: stripeUserId,
	});
	const res = await fetch(
		`https://connect.stripe.com/oauth/deauthorize?${params.toString()}`,
		{
			method: "POST",
			headers: { Authorization: `Bearer ${clientSecret}` },
			signal: AbortSignal.timeout(5_000),
		},
	);
	if (!res.ok) {
		return { attempted: true, ok: false, reason: `http_${res.status}` };
	}
	return { attempted: true, ok: true };
}

// ── Nuvemshop ──────────────────────────────────────────────────
// DELETE https://api.nuvemshop.com.br/v1/{store_id}/store
// Requires the store's access token in the Authentication header.
async function revokeNuvemshop(config: Record<string, string>): Promise<RevokeOutcome> {
	const token = config.access_token;
	const storeId = config.store_id;
	if (!token || !storeId) {
		return { attempted: false, ok: false, reason: "missing_token_or_store_id" };
	}
	const res = await fetch(
		`https://api.nuvemshop.com.br/v1/${encodeURIComponent(storeId)}/store`,
		{
			method: "DELETE",
			headers: {
				Authentication: `bearer ${token}`,
				"User-Agent": "Vestigio (support@vestigio.io)",
			},
			signal: AbortSignal.timeout(5_000),
		},
	);
	if (!res.ok) {
		return { attempted: true, ok: false, reason: `http_${res.status}` };
	}
	return { attempted: true, ok: true };
}
