import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { encodeOAuthState } from "@/libs/oauth-state";

// ──────────────────────────────────────────────
// Google Ads OAuth — Authorize
//
// GET /api/integrations/google-ads/authorize?environment_id=XXX
//
// Redirects to Google OAuth 2.0 consent screen with the `adwords`
// scope. `access_type=offline` + `prompt=consent` ensure we receive
// a refresh_token even on re-authorization.
// ──────────────────────────────────────────────

const GOOGLE_OAUTH_CLIENT_ID =
	process.env.GOOGLE_OAUTH_CLIENT_ID ||
	process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ||
	"";
const GOOGLE_OAUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

function getBaseUrl(): string {
	return process.env.SITE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

function redirectToError(reason: string): NextResponse {
	return NextResponse.redirect(
		`${getBaseUrl()}/app/settings/data-sources?google_ads_error=${encodeURIComponent(reason)}`,
	);
}

export async function GET(request: Request) {
	if (!GOOGLE_OAUTH_CLIENT_ID) {
		return redirectToError("google_oauth_not_configured");
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

	const state = encodeOAuthState(environmentId, "google_ads");
	const redirectUri = `${getBaseUrl()}/api/integrations/google-ads/callback`;

	const params = new URLSearchParams({
		client_id: GOOGLE_OAUTH_CLIENT_ID,
		redirect_uri: redirectUri,
		response_type: "code",
		scope: "https://www.googleapis.com/auth/adwords",
		access_type: "offline",
		prompt: "consent",
		include_granted_scopes: "true",
		state,
	});

	return NextResponse.redirect(`${GOOGLE_OAUTH_ENDPOINT}?${params.toString()}`);
}
