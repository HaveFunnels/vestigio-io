import { getIp } from "@/libs/get-ip";

// ──────────────────────────────────────────────
// Cloudflare Turnstile — server-side verify (Wave 18e P3.2)
//
// Public forms (newsletter, /audit, /register, /forgot-password) call
// verifyTurnstile(token) and reject 400 on failure. The client-side
// widget must be wired separately (React component reads
// NEXT_PUBLIC_TURNSTILE_SITE_KEY).
//
// Two env vars gate this:
//   - TURNSTILE_SECRET_KEY   → without it, verifyTurnstile fails-open
//                              (returns { ok: true, reason: "disabled" })
//                              so dev doesn't require a captcha and
//                              staged rollout can flip per surface.
//   - NEXT_PUBLIC_TURNSTILE_SITE_KEY → client widget site key.
//
// Result invariant:
//   { ok: true } → let the request through
//   { ok: false, reason } → 400 with reason surfaced to the caller
// ──────────────────────────────────────────────

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileResult {
  ok: boolean;
  reason?: string;
}

export function isTurnstileConfigured(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

export async function verifyTurnstile(token: string | null | undefined): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Feature disabled — fail-open so dev + staged rollout work.
    // Callers can additionally check isTurnstileConfigured() if they
    // want to require the widget in a specific environment.
    return { ok: true, reason: "disabled" };
  }

  if (!token || typeof token !== "string" || token.length < 8) {
    return { ok: false, reason: "missing_token" };
  }

  // Turnstile tokens can be long but 4KB is a hard upper bound.
  if (token.length > 4096) {
    return { ok: false, reason: "token_too_long" };
  }

  const remoteip = (await getIp()) ?? undefined;

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteip) body.set("remoteip", remoteip);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, reason: `verify_status_${res.status}` };
    }
    const data = (await res.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };
    if (data.success !== true) {
      const codes = Array.isArray(data["error-codes"]) ? data["error-codes"].join(",") : "unknown";
      return { ok: false, reason: `verify_failed:${codes}` };
    }
    return { ok: true };
  } catch (err) {
    // Timeout or network fault — fail-CLOSED here because the point
    // of Turnstile is to bound abuse. Falling open on a Cloudflare
    // outage would leave public forms unprotected for the duration.
    return { ok: false, reason: err instanceof Error && err.name === "AbortError" ? "verify_timeout" : "verify_network_error" };
  }
}
