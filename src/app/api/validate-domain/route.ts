import { NextResponse } from "next/server";

/**
 * Lightweight domain validation: DNS resolve + HTTP reachability.
 * Used during onboarding to warn early if the domain is unreachable.
 * GET /api/validate-domain?domain=example.com
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain");

  if (!domain) {
    return NextResponse.json({ ok: false, error: "Domain is required" }, { status: 400 });
  }

  // Normalize: strip protocol and trailing slashes
  const normalized = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "").split("/")[0];

  // 1. DNS resolution check
  try {
    const dns = await import("node:dns");
    await new Promise<void>((resolve, reject) => {
      dns.lookup(normalized, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch {
    return NextResponse.json({
      ok: false,
      error: `DNS resolution failed for "${normalized}". Check the domain spelling.`,
    });
  }

  // 2. HTTP reachability check (lightweight HEAD request, 5s timeout)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`https://${normalized}`, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok && res.status >= 500) {
      return NextResponse.json({
        ok: false,
        error: `Domain returned HTTP ${res.status}. The server may be down.`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return NextResponse.json({
        ok: false,
        error: `Connection to "${normalized}" timed out (5s). The site may be slow or behind a firewall.`,
      });
    }

    // Try HTTP fallback
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      await fetch(`http://${normalized}`, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({
        ok: false,
        error: `Could not connect to "${normalized}". Verify the domain is accessible.`,
      });
    }
  }
}
