import NextAuth from "next-auth/next";
import { authOptions } from "@/libs/auth";
import { checkRateLimit } from "@/libs/limiter";

const handler = NextAuth(authOptions);

// ──────────────────────────────────────────────
// Server-side IP throttle on credential sign-in.
//
// The IP throttle used to live only in the sign-in form, as a server
// action the browser called before submitting. That protected nobody:
// credential stuffing does not use the form, it POSTs straight to
// /api/auth/callback/credentials, which never invoked it. The only
// people it could stop were the ones using the UI — and on 2026-09-09
// it stopped a real one, because a stale client bundle made the action
// call fail and the form reported that as "too many attempts".
//
// Putting it here makes it apply to the request that actually matters
// and cannot be skipped. The per-account lockout in authorize() (5
// failures per email, 15 minutes) remains the primary control; this is
// the defence against stuffing spread across many emails from one
// source, which a per-account lockout cannot see.
//
// Scoped deliberately to the credentials callback. NextAuth serves
// /api/auth/session on this same route and the client polls it, so a
// blanket limit would throttle every signed-in user out of their own
// session.
//
// Fails open when no client IP can be resolved — checkRateLimit's
// existing behaviour. Behind Cloudflare and Railway an absent IP means
// the upstream is misconfigured, and given that today's incident was an
// auth outage, availability wins over closing a gap that the account
// lockout still covers. Worth revisiting if header stripping is ever
// observed in practice.
// ──────────────────────────────────────────────

function isCredentialSignIn(req: Request): boolean {
	return new URL(req.url).pathname.endsWith("/callback/credentials");
}

export async function POST(req: Request, ctx: unknown) {
	if (isCredentialSignIn(req)) {
		const limited = await checkRateLimit("auth");
		if (limited) return limited;
	}
	return handler(req, ctx as never);
}

export { handler as GET };
