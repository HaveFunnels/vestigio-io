import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { encodeOAuthState } from "@/libs/oauth-state";

// ──────────────────────────────────────────────
// Meta Ads OAuth — Authorize
//
// GET /api/integrations/meta-ads/authorize?environment_id=XXX
//
// Validates the user owns the environment, generates a signed state
// token, and redirects the browser to Facebook's OAuth dialog. User
// returns to /callback with `?code` + `?state`.
//
// Scopes requested: `ads_read` (required for Marketing API insights)
// and `business_management` (to list ad accounts the user has access
// to). Both are read-only.
// ──────────────────────────────────────────────

const META_APP_ID = process.env.META_ADS_APP_ID || process.env.META_APP_ID || "";
const META_OAUTH_DIALOG = "https://www.facebook.com/v21.0/dialog/oauth";

function getBaseUrl(): string {
	return process.env.SITE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

function redirectToError(reason: string): NextResponse {
	return NextResponse.redirect(
		`${getBaseUrl()}/app/settings/data-sources?meta_ads_error=${encodeURIComponent(reason)}`,
	);
}

export async function GET(request: Request) {
	if (!META_APP_ID) {
		return redirectToError("meta_app_not_configured");
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

	const state = encodeOAuthState(environmentId, "meta_ads");
	const redirectUri = `${getBaseUrl()}/api/integrations/meta-ads/callback`;

	const params = new URLSearchParams({
		client_id: META_APP_ID,
		redirect_uri: redirectUri,
		state,
		scope: "ads_read,business_management",
		response_type: "code",
	});

	return NextResponse.redirect(`${META_OAUTH_DIALOG}?${params.toString()}`);
}
