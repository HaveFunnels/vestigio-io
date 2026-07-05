import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// resolveEnvId — canonical env selection for authenticated API routes.
//
// The multi-tenant model is Organization → Environment. A user can
// belong to an org that has more than one env (havefunnels.com +
// casamontelle.com is the working example). The active env is
// tracked in a client-side `active_env` cookie set by the sidebar
// EnvironmentSwitcher and refreshed by AppSidebarLayout on every
// layout mount from the server-resolved value.
//
// M2 flagged ~15 API routes that DID NOT read the cookie: they
// picked "the first env by isProduction desc, createdAt asc" from
// the caller's org, which for multi-env orgs always returned the
// same env regardless of what the customer had selected in the
// sidebar. Visible symptom: casamontelle customer sees havefunnels
// data on those routes, persistent (not the transient flash the
// earlier commits fixed).
//
// This helper is the canonical resolver every authenticated route
// should call:
//
//   const envId = await resolveEnvId({ userId, cookieHeader });
//   if (!envId) return NextResponse.json({...}, {status:404});
//
// Priority:
//   1. active_env cookie value — validate membership before trust
//   2. First env of caller's org, isProduction+createdAt ordered
//   3. null → caller returns 404 / empty
//
// It never falls THROUGH from step 1 to step 2 on a mismatch — a
// cookie pointing at an env the user doesn't have membership on is
// suspicious (stale after org change, or a stolen cookie); we drop
// down to their org's default rather than silently serving the
// mis-cookie env. That said the M2 CRITICAL was about routes NOT
// reading the cookie at all — this helper fixes the "no cookie
// read" cases; a "wrong cookie" case is handled by the
// membership verification.
// ──────────────────────────────────────────────

export interface ResolveEnvOptions {
	userId: string;
	/// Raw cookie header string from the incoming request. Callers
	/// pass request.headers.get("cookie") or the parsed activeEnv id
	/// directly via `activeEnv` below.
	cookieHeader?: string | null;
	/// Pre-extracted active_env value. Useful when the caller already
	/// has next/headers cookies() and doesn't want another lookup.
	activeEnv?: string | null;
}

export async function resolveEnvId(opts: ResolveEnvOptions): Promise<string | null> {
	const { userId } = opts;
	const activeEnvFromCookie =
		opts.activeEnv ??
		(opts.cookieHeader
			? extractActiveEnvFromCookieHeader(opts.cookieHeader)
			: null);

	const membership = await prisma.membership.findFirst({
		where: { userId },
		select: { organizationId: true },
		orderBy: { createdAt: "desc" },
	});
	if (!membership) return null;

	if (activeEnvFromCookie) {
		const claimed = await prisma.environment.findFirst({
			where: {
				id: activeEnvFromCookie,
				organizationId: membership.organizationId,
			},
			select: { id: true },
		});
		if (claimed) return claimed.id;
		// Cookie points to an env we don't have membership on — fall
		// through to org-default rather than trust it.
	}

	const fallback = await prisma.environment.findFirst({
		where: { organizationId: membership.organizationId },
		orderBy: [{ isProduction: "desc" }, { createdAt: "asc" }],
		select: { id: true },
	});
	return fallback?.id ?? null;
}

function extractActiveEnvFromCookieHeader(header: string): string | null {
	const match = header.match(/(?:^|;\s*)active_env=([^;]*)/);
	return match?.[1] ?? null;
}
