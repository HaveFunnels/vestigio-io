import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { encodeOAuthState } from "@/libs/oauth-state";

// ──────────────────────────────────────────────
// Shopify OAuth — Authorize
//
// GET /api/integrations/shopify/oauth/authorize
//   ?shop=loja.myshopify.com&environment_id=XXX
//
// Validates that the caller owns the environment, generates a signed
// state token, then redirects the browser to the merchant's Shopify
// authorize URL. The merchant approves the requested scopes; Shopify
// then redirects back to /callback with `?code` + `?hmac` + `?state`.
//
// Scopes requested are read-only and match REQUIRED_SCOPES in the
// adapter types: `read_orders`, `read_customers`. Bump here AND
// in types.ts together — Shopify forces a re-auth dialog whenever
// the scope set changes.
//
// Note: this route works for both a registered Public App AND for
// a Custom App installed via OAuth (newer Shopify model). For the
// legacy "paste admin token" Custom App flow we already support,
// users go through /api/integrations POST instead — the two paths
// coexist.
// ──────────────────────────────────────────────

const SHOPIFY_CLIENT_ID =
	process.env.SHOPIFY_APP_CLIENT_ID || process.env.SHOPIFY_API_KEY || "";

const SHOPIFY_SCOPES = ["read_orders", "read_customers"].join(",");

const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

function getBaseUrl(): string {
	return (
		process.env.SITE_URL ||
		process.env.NEXTAUTH_URL ||
		"http://localhost:3000"
	);
}

function redirectToError(reason: string): NextResponse {
	return NextResponse.redirect(
		`${getBaseUrl()}/app/settings/data-sources?shopify_error=${encodeURIComponent(reason)}`,
	);
}

export async function GET(request: Request) {
	if (!SHOPIFY_CLIENT_ID) return redirectToError("shopify_app_not_configured");

	const session = await getServerSession(authOptions);
	if (!session?.user) {
		return NextResponse.redirect(`${getBaseUrl()}/auth/signin`);
	}

	const userId = (session.user as any).id as string;
	const { searchParams } = new URL(request.url);
	const environmentId = searchParams.get("environment_id");
	const rawShop = searchParams.get("shop");

	if (!environmentId) return redirectToError("missing_environment_id");
	if (!rawShop) return redirectToError("missing_shop");

	// Normalize and validate: only allow `xxx.myshopify.com`. Reject
	// arbitrary hosts to prevent open-redirect to attacker-controlled
	// shops that look real but aren't.
	const shop = rawShop
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.replace(/\/+$/, "");
	if (!SHOP_DOMAIN_RE.test(shop)) return redirectToError("invalid_shop_domain");

	// Verify environment ownership.
	const environment = await prisma.environment.findUnique({
		where: { id: environmentId },
		select: { organizationId: true },
	});
	if (!environment) return redirectToError("environment_not_found");
	const membership = await prisma.membership.findUnique({
		where: {
			userId_organizationId: {
				userId,
				organizationId: environment.organizationId,
			},
		},
	});
	if (!membership) return redirectToError("access_denied");

	// Carry environmentId AND shop in state — shop is also returned by
	// Shopify on the callback, but signing it here lets us tie the
	// authorization to the user/env that initiated the flow.
	const state = encodeOAuthState(environmentId, userId, "shopify");
	const redirectUri = `${getBaseUrl()}/api/integrations/shopify/oauth/callback`;

	const params = new URLSearchParams({
		client_id: SHOPIFY_CLIENT_ID,
		scope: SHOPIFY_SCOPES,
		redirect_uri: redirectUri,
		state,
	});

	return NextResponse.redirect(
		`https://${shop}/admin/oauth/authorize?${params.toString()}`,
	);
}
