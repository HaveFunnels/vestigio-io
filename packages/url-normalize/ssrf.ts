// ──────────────────────────────────────────────
// SSRF guard — shared private-IP detection + URL safety check
//
// Extracted from workers/ingestion/enrichment/competitor-fetch.ts so
// it can be reused at the inventory manual-add API endpoint (and
// anywhere else user-supplied URLs enter our fetch pipeline).
//
// What this blocks:
//   - direct attacks like `internal.bad.example.com` → A 10.0.0.5
//   - IMDS pivots like `http://169.254.169.254/` (AWS / GCP metadata)
//   - link-local, loopback, ULA, multicast, CGNAT, reserved
//   - bare IPv4 / IPv6 inputs that resolve to private space
//
// What this does NOT block:
//   - DNS rebinding mid-fetch (the resolution we run here is at
//     submit time; the fetcher would need its own connect-time
//     lookup to fully harden — see competitor-fetch.ts for the
//     reference pattern). Acceptable for the manual-URL flow
//     because we re-validate domain match at every cycle's pipeline
//     entry too.
// ──────────────────────────────────────────────

import dns from "node:dns/promises";

export function isPrivateOrLoopbackIPv4(ip: string): boolean {
	const parts = ip.split(".").map(Number);
	if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
	const [a, b] = parts;
	if (a === 10) return true;
	if (a === 127) return true;
	if (a === 0) return true;
	if (a === 169 && b === 254) return true; // link-local (IMDS 169.254.169.254)
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
	if (a >= 224) return true; // multicast + reserved
	return false;
}

export function isPrivateOrLoopbackIPv6(ip: string): boolean {
	const lower = ip.toLowerCase();
	if (lower === "::1" || lower === "::") return true;
	if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
	if (lower.startsWith("fe80:")) return true; // link-local
	const mapped = lower.match(/^::ffff:([\d.]+)$/);
	if (mapped) return isPrivateOrLoopbackIPv4(mapped[1]);
	return false;
}

export function isBlockedAddress(ip: string, family: number): boolean {
	if (family === 4) return isPrivateOrLoopbackIPv4(ip);
	if (family === 6) return isPrivateOrLoopbackIPv6(ip);
	return true;
}

export type UrlSafetyResult =
	| { safe: true }
	| { safe: false; reason: string };

/**
 * Resolves the URL's hostname and rejects when ANY resolved address
 * is private/loopback/link-local/IMDS. Awaits DNS so the caller can
 * surface a clean error to the user before the URL enters any fetch
 * queue. Returns the first failure reason for actionable UX.
 *
 * Designed for moderate-volume admin/user inputs (manual URL add,
 * competitor add). Don't put it on a hot fetch path — for that, use
 * a connect-time lookup like competitor-fetch.ts does.
 */
export async function isUrlSafeForFetch(input: string): Promise<UrlSafetyResult> {
	let parsed: URL;
	try {
		parsed = new URL(input);
	} catch {
		return { safe: false, reason: "invalid_url" };
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		return { safe: false, reason: `disallowed_protocol:${parsed.protocol}` };
	}
	const host = parsed.hostname;
	if (host === "localhost" || host === "ip6-localhost") {
		return { safe: false, reason: "localhost" };
	}
	try {
		const records = await dns.lookup(host, { all: true });
		if (records.length === 0) {
			return { safe: false, reason: "no_dns_record" };
		}
		for (const rec of records) {
			if (isBlockedAddress(rec.address, rec.family)) {
				return { safe: false, reason: `private_ip:${rec.address}` };
			}
		}
		return { safe: true };
	} catch (err) {
		return { safe: false, reason: "dns_resolution_failed" };
	}
}
