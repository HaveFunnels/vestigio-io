import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import { encryptConfig } from "@/libs/integration-crypto";
import { decodeOAuthState } from "@/libs/oauth-state";

// ──────────────────────────────────────────────
// Stripe OAuth — Callback
//
// GET /api/integrations/stripe/callback?code=XXX&state=YYY
//
// Exchanges the authorization code for an access token via Stripe
// Connect's OAuth token endpoint. Persists encrypted credentials in
// IntegrationConnection. Redirects user back to data-sources page.
// ──────────────────────────────────────────────

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

function getBaseUrl(): string {
	return process.env.SITE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

function redirectResult(params: Record<string, string>): NextResponse {
	const qs = new URLSearchParams(params).toString();
	return NextResponse.redirect(
		`${getBaseUrl()}/app/settings/data-sources?${qs}`,
	);
}

interface StripeTokenResponse {
	access_token?: string;
	refresh_token?: string;
	stripe_user_id?: string;
	scope?: string;
	token_type?: string;
	livemode?: boolean;
	error?: string;
	error_description?: string;
}

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const code = searchParams.get("code");
	const state = searchParams.get("state");
	const error = searchParams.get("error");
	const errorDescription = searchParams.get("error_description");

	// Handle user cancellation / Stripe errors before anything else.
	if (error) {
		return redirectResult({ stripe_error: errorDescription || error });
	}
	if (!code || !state) {
		return redirectResult({ stripe_error: "missing_code_or_state" });
	}
	if (!STRIPE_SECRET_KEY) {
		return redirectResult({ stripe_error: "stripe_not_configured" });
	}

	const stateResult = decodeOAuthState(state);
	if (!stateResult.ok) {
		return redirectResult({ stripe_error: `state_${stateResult.error.replace(/\s+/g, "_")}` });
	}
	if (stateResult.payload.provider !== "stripe") {
		return redirectResult({ stripe_error: "state_provider_mismatch" });
	}
	const { environmentId } = stateResult.payload;

	// Exchange authorization code for access token.
	let tokenData: StripeTokenResponse;
	try {
		const res = await fetch("https://connect.stripe.com/oauth/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				client_secret: STRIPE_SECRET_KEY,
			}).toString(),
			signal: AbortSignal.timeout(15_000),
		});

		const text = await res.text();
		try {
			tokenData = JSON.parse(text);
		} catch {
			return redirectResult({ stripe_error: `token_parse_error` });
		}

		if (!res.ok || tokenData.error) {
			return redirectResult({
				stripe_error: `token_exchange_failed:${tokenData.error_description || tokenData.error || `HTTP ${res.status}`}`,
			});
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return redirectResult({ stripe_error: `token_request_failed:${msg}` });
	}

	if (!tokenData.access_token || !tokenData.stripe_user_id) {
		return redirectResult({ stripe_error: "missing_token_or_account_id" });
	}

	// Persist encrypted credentials.
	const encryptedConfig = encryptConfig({
		access_token: tokenData.access_token,
		refresh_token: tokenData.refresh_token || "",
		stripe_user_id: tokenData.stripe_user_id,
		connected_at: new Date().toISOString(),
	});

	await prisma.integrationConnection.upsert({
		where: {
			environmentId_provider: { environmentId, provider: "stripe" },
		},
		update: {
			config: encryptedConfig,
			status: "connected",
			syncError: null,
		},
		create: {
			environmentId,
			provider: "stripe",
			config: encryptedConfig,
			status: "connected",
		},
	});

	return redirectResult({ connected: "stripe" });
}
