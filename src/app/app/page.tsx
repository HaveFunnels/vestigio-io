import { redirect } from "next/navigation";
import { resolveOrgContext } from "@/libs/resolve-org";

// /app — Phase 1 UX overhaul. Land users on the current month's
// Strategy Plan instead of the Pulse dashboard (testers said the
// dashboard is "too complicated" and they don't know where to
// start).
//
// resolveOrgContext is called server-side so we can inject ?env=
// into the redirect URL. The strategy page is a client component
// that otherwise falls back to reading the active_env cookie; if
// the cookie is stale or points at an env the user isn't a member
// of, the API returns 403 (failure path the user just hit). Passing
// env via URL bypasses the cookie entirely for this entry path.
//
// The plan page handles "not generated yet" gracefully, so no
// server-side existence check is needed here — one redirect, no
// double-bounce.
export default async function AppRootPage() {
	const orgCtx = await resolveOrgContext();
	const now = new Date();
	const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
	const hasResolvedEnv =
		orgCtx.envId && orgCtx.envId !== "default" && orgCtx.envId !== "default_env";
	const target = hasResolvedEnv
		? `/app/library/strategy/${month}?env=${encodeURIComponent(orgCtx.envId)}`
		: `/app/library/strategy/${month}`;
	redirect(target);
}
