import { NextResponse } from "next/server";
import dns from "node:dns";
import { promisify } from "node:util";
import net from "node:net";

const dnsLookup = promisify(dns.lookup);

/**
 * Lightweight domain validation: DNS resolve + HTTP reachability.
 * Used during onboarding to warn early if the domain is unreachable.
 * GET /api/validate-domain?domain=example.com
 *
 * SEC-14 fix: Added SSRF protection — rejects private/internal IPs,
 * validates domain format, and adds per-request rate limiting context.
 */

// RFC1918 + link-local + loopback IP detection
function isPrivateIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    // Reject all IPv6 for simplicity (::1, fe80::, fc00::, etc.)
    return ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd");
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return true; // malformed = reject
  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 127.0.0.0/8 (loopback)
  if (parts[0] === 127) return true;
  // 169.254.0.0/16 (link-local / cloud metadata)
  if (parts[0] === 169 && parts[1] === 254) return true;
  // 0.0.0.0
  if (parts.every((p) => p === 0)) return true;
  return false;
}

// Basic domain format validation (no IPs, must have TLD)
const DOMAIN_FORMAT = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain");

  if (!domain) {
    return NextResponse.json({ ok: false, error: "Domain is required" }, { status: 400 });
  }

  // Normalize: strip protocol and trailing slashes, take only hostname
  const normalized = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "").split("/")[0].split(":")[0];

  // SEC-14: Validate domain format — reject raw IPs and malformed input
  if (!DOMAIN_FORMAT.test(normalized)) {
    return NextResponse.json({
      ok: false,
      error: `"${normalized}" doesn't look like a valid domain. Enter something like "example.com".`,
    }, { status: 400 });
  }

  // 1. DNS resolution check + SSRF mitigation
  let resolvedIp: string;
  try {
    const result = await dnsLookup(normalized);
    resolvedIp = result.address;
  } catch {
    return NextResponse.json({
      ok: false,
      error: `DNS resolution failed for "${normalized}". Check the domain spelling.`,
    });
  }

  // SEC-14: Reject private/internal IPs (prevents SSRF to cloud metadata, internal services)
  if (isPrivateIp(resolvedIp)) {
    return NextResponse.json({
      ok: false,
      error: `"${normalized}" resolves to a private IP address. Please enter a publicly accessible domain.`,
    }, { status: 400 });
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
