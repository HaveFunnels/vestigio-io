import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { encodeOAuthState } from "@/libs/oauth-state";

// ──────────────────────────────────────────────
// Stripe OAuth — Authorize
//
// GET /api/integrations/stripe/authorize?environment_id=XXX
//
// Validates the user owns the environment, generates a signed state
// token, and redirects the browser to Stripe's OAuth Connect dialog.
// User returns to /callback with `?code` + `?state`.
//
// Scope: read_only (revenue intelligence only — no writes).
// ──────────────────────────────────────────────

const STRIPE_CONNECT_CLIENT_ID = process.env.STRIPE_CONNECT_CLIENT_ID || "";
const STRIPE_OAUTH_DIALOG = "https://connect.stripe.com/oauth/authorize";

function getBaseUrl(): string {
	return process.env.SITE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

function redirectToError(reason: string): NextResponse {
	return NextResponse.redirect(
		`${getBaseUrl()}/app/settings/data-sources?stripe_error=${encodeURIComponent(reason)}`,
	);
}

export async function GET(request: Request) {
	if (!STRIPE_CONNECT_CLIENT_ID) {
		return redirectToError("stripe_not_configured");
	}

	const session = await getServerSession(authOptions);
	if (!session?.user) {
		return NextResponse.redirect(`${getBaseUrl()}/auth/signin`);
	}

	const userId = (session.user as any).id as string;
	const { searchParams } = new URL(request.url);
	const environmentId = searchParams.get("environment_id");

	if (!environmentId) {
		return redirectToError("missing_environment_id");
	}

	// Verify user has access to the environment.
	const environment = await prisma.environment.findUnique({
		where: { id: environmentId },
		select: { organizationId: true },
	});
	if (!environment) {
		return redirectToError("environment_not_found");
	}
	const membership = await prisma.membership.findUnique({
		where: {
			userId_organizationId: {
				userId,
				organizationId: environment.organizationId,
			},
		},
	});
	if (!membership) {
		return redirectToError("access_denied");
	}

	const state = encodeOAuthState(environmentId, "stripe");
	const redirectUri = `${getBaseUrl()}/api/integrations/stripe/callback`;

	const params = new URLSearchParams({
		response_type: "code",
		client_id: STRIPE_CONNECT_CLIENT_ID,
		scope: "read_only",
		state,
		redirect_uri: redirectUri,
	});

	return NextResponse.redirect(`${STRIPE_OAUTH_DIALOG}?${params.toString()}`);
}
