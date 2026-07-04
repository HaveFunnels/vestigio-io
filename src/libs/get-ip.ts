import { headers } from "next/headers";

// ──────────────────────────────────────────────
// Client-IP resolution behind Cloudflare + Railway.
//
// Ordering matters for rate-limit integrity:
//
//   1. cf-connecting-ip — Cloudflare edge sets this after its own
//      authentication of the source IP. Behind orange-cloud DNS
//      (vestigio.io + app.vestigio.io both proxied) this is the
//      client's real IP, unspoofable by the client because
//      Cloudflare overwrites whatever the client sent.
//   2. x-real-ip — set by Railway's edge / any upstream nginx-style
//      proxy. Secondary trust anchor when Cloudflare is bypassed
//      (direct Railway URL, worker-to-worker, etc.).
//   3. x-forwarded-for LEFTMOST — user-controllable in general; kept
//      only as a last resort so dev / preview URLs behind no proxy
//      still return SOMETHING for rate-limit keying. Do not treat
//      this branch as security-grade; it's a fallback identifier.
//
// The previous implementation started at x-forwarded-for and never
// looked at cf-connecting-ip / x-real-ip. Because Cloudflare forwards
// whatever X-Forwarded-For the client sent (only appending, never
// replacing the first entry), an attacker simply setting
// `X-Forwarded-For: 1.2.3.4` on every request rotated the rate-limit
// key on every hit — checkRateLimit() effectively went to zero on
// every unauth endpoint (register, forgot-password, activate, cycles/
// trigger, onboard, analytics, support-tickets). This ordering closes
// that hole without changing any caller.
// ──────────────────────────────────────────────

export async function getIp(): Promise<string | null> {
	const headersList = await headers();

	const cfIp = headersList.get("cf-connecting-ip");
	if (cfIp) return cfIp.trim();

	const realIp = headersList.get("x-real-ip");
	if (realIp) return realIp.trim();

	const forwardedFor = headersList.get("x-forwarded-for");
	if (forwardedFor) {
		const first = forwardedFor.split(",")[0]?.trim();
		if (first) return first;
	}

	return null;
}
