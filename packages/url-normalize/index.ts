// ──────────────────────────────────────────────
// URL normalization — single source of truth
//
// Used by crawler dedup, audit-runner persistence, allow-list filtering,
// and inventory matching. All call sites MUST use these functions to
// avoid silent drift (e.g. "/checkout" vs "/checkout/" treated as
// different URLs in different layers).
// ──────────────────────────────────────────────

const TRACKING_PARAMS = new Set([
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_term",
	"utm_content",
	"utm_id",
	"ref",
	"refsrc",
	"fbclid",
	"gclid",
	"msclkid",
	"mc_cid",
	"mc_eid",
	"yclid",
	"dclid",
	"_ga",
	"_gl",
]);

/**
 * Canonical URL form used everywhere:
 *  - lowercase host
 *  - drop fragment (#hash)
 *  - drop tracking params (utm_*, fbclid, gclid, etc.)
 *  - keep meaningful params (id, page, q, etc.)
 *  - drop trailing slash on non-root paths
 *  - preserve case in path (some sites are case-sensitive)
 */
export function canonicalUrl(raw: string): string {
	if (!raw) return raw;
	try {
		const u = new URL(raw);
		u.hostname = u.hostname.toLowerCase();
		u.hash = "";
		for (const param of [...u.searchParams.keys()]) {
			if (TRACKING_PARAMS.has(param.toLowerCase())) {
				u.searchParams.delete(param);
			}
		}
		// Sort remaining params for stable comparison
		const sorted = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
		u.search = "";
		for (const [k, v] of sorted) u.searchParams.append(k, v);
		// Drop trailing slash on non-root paths
		if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
			u.pathname = u.pathname.slice(0, -1);
		}
		return u.toString();
	} catch {
		return raw.trim().toLowerCase();
	}
}

/**
 * Path-only canonical form for matching findings, journey nodes, etc.
 * Lowercased so `/Checkout` matches `/checkout` (rare but happens).
 */
export function canonicalPath(raw: string): string {
	try {
		const u = new URL(raw);
		let p = u.pathname.toLowerCase();
		if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
		return p;
	} catch {
		// Treat as path directly
		let p = raw.split("?")[0].split("#")[0].toLowerCase();
		if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
		return p;
	}
}

/**
 * Aggressive form for membership checks (allow-list, dedup).
 * Drops ALL query params — useful when we want `/p?id=1` == `/p?id=2`.
 * Use with caution: only for cases where query params are content-identical.
 */
export function membershipKey(raw: string): string {
	try {
		const u = new URL(raw);
		u.search = "";
		u.hash = "";
		u.hostname = u.hostname.toLowerCase();
		if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
			u.pathname = u.pathname.slice(0, -1);
		}
		return u.toString();
	} catch {
		return raw.trim().toLowerCase();
	}
}

/**
 * Check if two URLs refer to the same canonical resource.
 */
export function sameUrl(a: string, b: string): boolean {
	return canonicalUrl(a) === canonicalUrl(b);
}

// ──────────────────────────────────────────────
// Glob pattern matching for crawl exclusions
//
// Supports `*` (zero-or-more chars) and `?` (single char). Patterns are
// matched against URL paths (not full URLs). Anchored: the pattern must
// match the entire path. Matching is case-insensitive.
//
// Examples:
//   "/admin/*"   matches "/admin", "/admin/", "/admin/users", "/admin/x/y"
//   "*.pdf"      matches "/file.pdf", "/docs/report.pdf"
//   "/test"      matches only "/test" (exact)
// ──────────────────────────────────────────────

function compileGlob(pattern: string): RegExp {
	// Escape regex special chars except * and ?, then translate the two
	// glob wildcards. `*` becomes `.*` so "/admin/*" also matches "/admin".
	const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	const translated = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
	return new RegExp(`^${translated}$`, "i");
}

const globCache = new Map<string, RegExp>();
function getGlobRegex(pattern: string): RegExp {
	const cached = globCache.get(pattern);
	if (cached) return cached;
	const compiled = compileGlob(pattern.trim());
	globCache.set(pattern, compiled);
	return compiled;
}

/**
 * Check whether a given path matches any of the supplied glob patterns.
 * Special-cases the "/admin/*" form to also match the bare "/admin".
 */
export function matchesAnyPattern(path: string, patterns: string[]): boolean {
	if (!patterns || patterns.length === 0) return false;
	for (const raw of patterns) {
		if (!raw || !raw.trim()) continue;
		const pattern = raw.trim();
		// "/admin/*" should also match "/admin"
		if (pattern.endsWith("/*")) {
			const stem = pattern.slice(0, -2);
			if (path === stem) return true;
		}
		if (getGlobRegex(pattern).test(path)) return true;
	}
	return false;
}

/**
 * Returns true when the URL's path matches any exclusion pattern.
 * Pass the full URL — we extract the path for matching.
 */
export function urlMatchesExclusion(url: string, patterns: string[]): boolean {
	if (!patterns || patterns.length === 0) return false;
	let path: string;
	try {
		path = new URL(url).pathname;
	} catch {
		path = url.split("?")[0].split("#")[0];
	}
	return matchesAnyPattern(path, patterns);
}

// Re-export Wire 1 URL templating for NetworkSurface dedup.
export { urlTemplate } from "./template";
