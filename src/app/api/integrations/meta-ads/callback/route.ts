import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import { encryptConfig } from "@/libs/integration-crypto";
import { decodeOAuthState } from "@/libs/oauth-state";

// ──────────────────────────────────────────────
// Meta Ads OAuth — Callback
//
// GET /api/integrations/meta-ads/callback?code=XXX&state=YYY
//
// Exchanges the short-lived auth code for an access token, upgrades
// to a long-lived (~60 day) token, fetches the user's ad accounts,
// and persists credentials in IntegrationConnection. Metadata keyed
// by the user's Meta user_id to correlate deletion/deauthorize
// webhooks back to the env.
// ──────────────────────────────────────────────

const META_APP_ID = process.env.META_ADS_APP_ID || process.env.META_APP_ID || "";
const META_APP_SECRET = process.env.META_ADS_APP_SECRET || process.env.META_APP_SECRET || "";
const GRAPH_BASE = "https://graph.facebook.com/v21.0";

function getBaseUrl(): string {
	return process.env.SITE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

function redirectResult(params: Record<string, string>): NextResponse {
	const qs = new URLSearchParams(params).toString();
	return NextResponse.redirect(
		`${getBaseUrl()}/app/settings/data-sources?${qs}`,
	);
}

interface TokenResponse {
	access_token?: string;
	token_type?: string;
	expires_in?: number;
	error?: { message: string; code?: number };
}

interface MeResponse {
	id?: string;
	name?: string;
	error?: { message: string };
}

interface AdAccountsResponse {
	data?: { id: string; account_id: string; name: string; account_status?: number }[];
	error?: { message: string };
}

async function graphGet<T>(
	path: string,
	timeoutMs = 15_000,
): Promise<{ ok: boolean; data?: T; error?: string; status: number }> {
	try {
		const res = await fetch(`${GRAPH_BASE}${path}`, {
			method: "GET",
			headers: { "Content-Type": "application/json" },
			signal: AbortSignal.timeout(timeoutMs),
		});
		const text = await res.text();
		let body: any = {};
		try { body = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
		if (!res.ok) {
			return { ok: false, error: body?.error?.message || `HTTP ${res.status}`, status: res.status };
		}
		return { ok: true, data: body as T, status: res.status };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err), status: 0 };
	}
}

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const code = searchParams.get("code");
	const state = searchParams.get("state");
	const error = searchParams.get("error");
	const errorDescription = searchParams.get("error_description");

	// Handle user cancellation / Meta errors before anything else.
	if (error) {
		return redirectResult({ meta_ads_error: errorDescription || error });
	}
	if (!code || !state) {
		return redirectResult({ meta_ads_error: "missing_code_or_state" });
	}
	if (!META_APP_ID || !META_APP_SECRET) {
		return redirectResult({ meta_ads_error: "meta_app_not_configured" });
	}

	const stateResult = decodeOAuthState(state);
	if (!stateResult.ok) {
		return redirectResult({ meta_ads_error: `state_${stateResult.error.replace(/\s+/g, "_")}` });
	}
	if (stateResult.payload.provider !== "meta_ads") {
		return redirectResult({ meta_ads_error: "state_provider_mismatch" });
	}
	const { environmentId } = stateResult.payload;

	const redirectUri = `${getBaseUrl()}/api/integrations/meta-ads/callback`;

	// Step 1: exchange code → short-lived token.
	const codeExchange = await graphGet<TokenResponse>(
		`/oauth/access_token?client_id=${encodeURIComponent(META_APP_ID)}&client_secret=${encodeURIComponent(META_APP_SECRET)}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`,
	);
	if (!codeExchange.ok || !codeExchange.data?.access_token) {
		return redirectResult({ meta_ads_error: `code_exchange_failed:${codeExchange.error ?? "unknown"}` });
	}
	const shortToken = codeExchange.data.access_token;

	// Step 2: upgrade to long-lived (~60d) token.
	const longLived = await graphGet<TokenResponse>(
		`/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(META_APP_ID)}&client_secret=${encodeURIComponent(META_APP_SECRET)}&fb_exchange_token=${encodeURIComponent(shortToken)}`,
	);
	const accessToken = longLived.data?.access_token || shortToken;
	const isShortLived = !longLived.data?.access_token;
	// If long-lived upgrade worked, use its reported expiry; otherwise mark as short-lived (1h).
	const expiresInSec = isShortLived ? 3600 : (longLived.data?.expires_in ?? 5184000);
	const tokenType = isShortLived ? "short_lived" : "long_lived";
	if (isShortLived) {
		console.warn("[Meta Ads Callback] Long-lived token upgrade failed — using short-lived token (expires in ~1h). Error:", longLived.error);
	}

	// Step 3: identify the Meta user so deletion/deauthorize webhooks
	// can be correlated back to this environment.
	const me = await graphGet<MeResponse>(
		`/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
	);
	if (!me.ok || !me.data?.id) {
		return redirectResult({ meta_ads_error: `me_fetch_failed:${me.error ?? "unknown"}` });
	}
	const metaUserId = me.data.id;

	// Step 4: list the user's ad accounts. Pick the first active one as
	// the default; user can re-run the flow or configure multiple later.
	const accountsRes = await graphGet<AdAccountsResponse>(
		`/me/adaccounts?fields=id,account_id,name,account_status&access_token=${encodeURIComponent(accessToken)}`,
	);
	if (!accountsRes.ok) {
		return redirectResult({ meta_ads_error: `accounts_fetch_failed:${accountsRes.error ?? "unknown"}` });
	}
	const accounts = accountsRes.data?.data || [];
	const active = accounts.find((a) => a.account_status === 1) || accounts[0];
	if (!active) {
		return redirectResult({ meta_ads_error: "no_ad_accounts_accessible" });
	}

	// Persist. Ad account id stored with act_ prefix for poller convenience.
	const adAccountId = active.id.startsWith("act_") ? active.id : `act_${active.id}`;
	const tokenIssuedAt = Date.now();
	const encryptedConfig = encryptConfig({
		access_token: accessToken,
		ad_account_id: adAccountId,
		meta_user_id: metaUserId,
		account_name: active.name,
		token_issued_at: String(tokenIssuedAt),
		token_expires_in_sec: String(expiresInSec),
		token_type: tokenType,
	});

	await prisma.integrationConnection.upsert({
		where: {
			environmentId_provider: { environmentId, provider: "meta_ads" },
		},
		update: {
			config: encryptedConfig,
			status: "connected",
			syncError: null,
			syncMetadata: JSON.stringify({
				token_type: tokenType,
				token_expires_at: tokenIssuedAt + expiresInSec * 1000,
				account_name: active.name,
				connected_at: new Date().toISOString(),
			}),
		},
		create: {
			environmentId,
			provider: "meta_ads",
			config: encryptedConfig,
			status: "connected",
			syncMetadata: JSON.stringify({
				token_type: tokenType,
				token_expires_at: tokenIssuedAt + expiresInSec * 1000,
				account_name: active.name,
				connected_at: new Date().toISOString(),
			}),
		},
	});

	return redirectResult({ meta_ads_connected: "true", ad_account: active.name });
}
