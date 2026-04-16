import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import { encryptConfig } from "@/libs/integration-crypto";
import { decodeOAuthState } from "@/libs/oauth-state";

// ──────────────────────────────────────────────
// Google Ads OAuth — Callback
//
// GET /api/integrations/google-ads/callback?code=XXX&state=YYY
//
// Exchanges the auth code for access_token + refresh_token. Then
// calls `customers:listAccessibleCustomers` (Google Ads API) to
// identify the user's customer_id. Stores refresh_token +
// customer_id + Vestigio-owned developer_token in the encrypted
// IntegrationConnection config, so later polls use Vestigio's single
// approved developer token with the user's refresh token.
// ──────────────────────────────────────────────

const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
const GOOGLE_ADS_DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";
const OAUTH_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v18";

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
	refresh_token?: string;
	expires_in?: number;
	scope?: string;
	token_type?: string;
	error?: string;
	error_description?: string;
}

interface ListCustomersResponse {
	resourceNames?: string[];
	error?: { message: string };
}

async function exchangeCode(
	code: string,
	redirectUri: string,
): Promise<{ ok: boolean; data?: TokenResponse; error?: string }> {
	try {
		const body = new URLSearchParams({
			code,
			client_id: GOOGLE_OAUTH_CLIENT_ID,
			client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
			redirect_uri: redirectUri,
			grant_type: "authorization_code",
		});
		const res = await fetch(OAUTH_TOKEN_ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: body.toString(),
			signal: AbortSignal.timeout(15_000),
		});
		const data = (await res.json().catch(() => ({}))) as TokenResponse;
		if (!res.ok || !data.access_token) {
			return {
				ok: false,
				error: data.error_description || data.error || `HTTP ${res.status}`,
			};
		}
		return { ok: true, data };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}

async function listAccessibleCustomers(
	accessToken: string,
): Promise<{ ok: boolean; customerId?: string; error?: string }> {
	// Requires developer_token header even for listAccessibleCustomers.
	if (!GOOGLE_ADS_DEVELOPER_TOKEN) {
		return { ok: false, error: "google_ads_developer_token_missing" };
	}
	try {
		const res = await fetch(
			`${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`,
			{
				method: "GET",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"developer-token": GOOGLE_ADS_DEVELOPER_TOKEN,
					"Content-Type": "application/json",
				},
				signal: AbortSignal.timeout(15_000),
			},
		);
		const data = (await res.json().catch(() => ({}))) as ListCustomersResponse;
		if (!res.ok) {
			return {
				ok: false,
				error: data?.error?.message || `HTTP ${res.status}`,
			};
		}
		const first = (data.resourceNames || [])[0];
		if (!first) return { ok: false, error: "no_accessible_customers" };
		const customerId = first.replace(/^customers\//, "");
		return { ok: true, customerId };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const code = searchParams.get("code");
	const state = searchParams.get("state");
	const error = searchParams.get("error");
	const errorDescription = searchParams.get("error_description");

	if (error) {
		return redirectResult({ google_ads_error: errorDescription || error });
	}
	if (!code || !state) {
		return redirectResult({ google_ads_error: "missing_code_or_state" });
	}
	if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET) {
		return redirectResult({ google_ads_error: "google_oauth_not_configured" });
	}
	if (!GOOGLE_ADS_DEVELOPER_TOKEN) {
		return redirectResult({ google_ads_error: "google_ads_developer_token_not_configured" });
	}

	const stateResult = decodeOAuthState(state);
	if (!stateResult.ok) {
		return redirectResult({
			google_ads_error: `state_${stateResult.error.replace(/\s+/g, "_")}`,
		});
	}
	if (stateResult.payload.provider !== "google_ads") {
		return redirectResult({ google_ads_error: "state_provider_mismatch" });
	}
	const { environmentId } = stateResult.payload;

	const redirectUri = `${getBaseUrl()}/api/integrations/google-ads/callback`;
	const exchange = await exchangeCode(code, redirectUri);
	if (!exchange.ok || !exchange.data?.refresh_token) {
		return redirectResult({
			google_ads_error:
				exchange.error && exchange.error.toLowerCase().includes("refresh")
					? "no_refresh_token_returned"
					: `code_exchange_failed:${exchange.error ?? "unknown"}`,
		});
	}

	const { access_token, refresh_token } = exchange.data;

	const customers = await listAccessibleCustomers(access_token!);
	if (!customers.ok || !customers.customerId) {
		return redirectResult({
			google_ads_error: `list_customers_failed:${customers.error ?? "unknown"}`,
		});
	}

	const encryptedConfig = encryptConfig({
		client_id: GOOGLE_OAUTH_CLIENT_ID,
		client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
		refresh_token: refresh_token!,
		customer_id: customers.customerId,
		developer_token: GOOGLE_ADS_DEVELOPER_TOKEN,
		connected_at: String(Date.now()),
	});

	await prisma.integrationConnection.upsert({
		where: {
			environmentId_provider: { environmentId, provider: "google_ads" },
		},
		update: {
			config: encryptedConfig,
			status: "connected",
			syncError: null,
		},
		create: {
			environmentId,
			provider: "google_ads",
			config: encryptedConfig,
			status: "connected",
		},
	});

	return redirectResult({
		google_ads_connected: "true",
		customer_id: customers.customerId,
	});
}
