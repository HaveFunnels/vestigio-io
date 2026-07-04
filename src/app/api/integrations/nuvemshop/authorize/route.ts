import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { encodeOAuthState } from "@/libs/oauth-state";

// ──────────────────────────────────────────────
// Nuvemshop OAuth — Authorize
//
// GET /api/integrations/nuvemshop/authorize?environment_id=XXX
//
// This route existed as ONLY a callback before, which meant:
//   - Anyone with a leaked or replayed `?code` could hit /callback,
//     get a token exchanged, and (because the callback only chose
//     `membership.organization.environments[0]` and never verified
//     the code was minted for THIS user's env) land the resulting
//     Nuvemshop store token in an env the caller doesn't own.
//   - No CSRF protection: the install URL was generated ad-hoc,
//     often from Nuvemshop's own app dashboard, with no state.
//
// This authorize route mirrors the meta-ads / google-ads / stripe /
// shopify pattern: verify the caller's membership on the target
// env, mint an HMAC-signed state that binds environmentId + userId,
// then redirect to Nuvemshop with `?state=`. The callback verifies
// state + session identity before persisting anything.
// ──────────────────────────────────────────────

const NUVEMSHOP_APP_ID = process.env.NUVEMSHOP_APP_ID || "";
const NUVEMSHOP_AUTHORIZE = "https://www.tiendanube.com/apps/authorize/authorize";

function getBaseUrl(): string {
	return process.env.SITE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

function redirectToError(reason: string): NextResponse {
	return NextResponse.redirect(
		`${getBaseUrl()}/app/settings/data-sources?nuvemshop_error=${encodeURIComponent(reason)}`,
	);
}

export async function GET(request: Request) {
	if (!NUVEMSHOP_APP_ID) {
		return redirectToError("nuvemshop_app_not_configured");
	}

	const session = await getServerSession(authOptions);
	if (!session?.user) {
		return NextResponse.redirect(`${getBaseUrl()}/auth/signin`);
	}

	const userId = (session.user as { id: string }).id;
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

	const state = encodeOAuthState(environmentId, userId, "nuvemshop");

	const params = new URLSearchParams({
		state,
	});

	return NextResponse.redirect(
		`${NUVEMSHOP_AUTHORIZE}/${NUVEMSHOP_APP_ID}?${params.toString()}`,
	);
}
