// ──────────────────────────────────────────────
// Surface resolver — Wave 22.5 Tier 3
//
// Reads operator-declared Surface rows for an environment and provides
// a `resolveSurfaceForUrl(url)` function that maps a URL to a
// SurfaceKind based on the declarations.
//
// Behavior:
//   - More-specific patterns (lower displayOrder, longer urlPattern)
//     win over the catch-all '*'.
//   - The catch-all '*' (seeded automatically per env) is the
//     ultimate fallback.
//   - When no declarations exist for the env (older env that missed
//     the seed migration), resolveSurfaceForUrl falls back to
//     classifySurfaceByUrl from packages/domain (the Tier 1
//     URL-substring heuristic).
//
// Why a separate package: the resolver is consumed by the audit
// pipeline (workers/ingestion/...) and the recompute layer
// (packages/workspace/...) AND the UI (src/app/... — surface
// management page). Keeping it in a dependency-light package avoids
// cycles.
// ──────────────────────────────────────────────

import { classifySurfaceByUrl, SurfaceKind } from "../domain";

export interface SurfaceDeclaration {
	id: string;
	kind: string; // 'public' | 'authenticated' | 'mixed' (stored as string in DB)
	urlPattern: string;
	label: string;
	authRequired: boolean;
	displayOrder: number;
}

export interface SurfaceResolver {
	/** Resolve the SurfaceKind for a given URL using the declared surfaces. */
	resolveSurfaceForUrl(url: string): SurfaceKind;
	/** Lookup the full declaration (including label, authRequired) for a URL. */
	resolveDeclarationForUrl(url: string): SurfaceDeclaration | null;
}

/**
 * Build a SurfaceResolver from a list of declarations (typically
 * loaded from prisma.surface.findMany({ where: { environmentId } })).
 *
 * Pattern matching:
 *   - '*' matches any URL — the catch-all.
 *   - Patterns starting with 'http://' or 'https://' are treated as
 *     URL-prefix matches (case-insensitive).
 *   - Patterns with no scheme are hostname matches: the URL's host
 *     must equal OR end with the pattern (e.g. 'app.example.com' or
 *     'app.*' or just 'app').
 *
 * Specificity: declarations are sorted by displayOrder ascending then
 * by urlPattern length descending — more-specific patterns win over
 * less-specific ones (the catch-all '*' has length 1 and lands last).
 */
export function buildSurfaceResolver(
	declarations: ReadonlyArray<SurfaceDeclaration>,
): SurfaceResolver {
	// Sort specific-before-general for the match loop.
	const sorted = [...declarations].sort((a, b) => {
		if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
		return b.urlPattern.length - a.urlPattern.length;
	});

	const match = (url: string): SurfaceDeclaration | null => {
		if (!url) return null;
		const urlLower = url.toLowerCase();
		let host: string | null = null;
		try {
			host = new URL(url).host.toLowerCase();
		} catch {
			// Not a parseable URL — fall through to glob matching against
			// the raw string.
		}
		for (const d of sorted) {
			if (matchesPattern(d.urlPattern, urlLower, host)) return d;
		}
		return null;
	};

	return {
		resolveDeclarationForUrl: match,
		resolveSurfaceForUrl(url: string): SurfaceKind {
			const decl = match(url);
			if (decl) return parseKind(decl.kind);
			// No declarations / no match — fall back to URL-substring
			// heuristic (Tier 1's classifySurfaceByUrl).
			return classifySurfaceByUrl(url);
		},
	};
}

function parseKind(kind: string): SurfaceKind {
	switch (kind.toLowerCase()) {
		case "authenticated":
			return SurfaceKind.Authenticated;
		case "mixed":
			return SurfaceKind.Mixed;
		case "public":
			return SurfaceKind.Public;
		default:
			return SurfaceKind.Unknown;
	}
}

function matchesPattern(
	pattern: string,
	urlLower: string,
	host: string | null,
): boolean {
	if (pattern === "*") return true;
	const p = pattern.toLowerCase();
	// Full URL prefix match.
	if (p.startsWith("http://") || p.startsWith("https://")) {
		return urlLower.startsWith(p);
	}
	// Hostname-or-substring match.
	if (host) {
		// Suffix glob: 'app.*' → starts with 'app.'.
		if (p.endsWith(".*")) {
			const prefix = p.slice(0, -1); // 'app.'
			return host.startsWith(prefix);
		}
		// Exact host match, OR host ends with pattern (e.g. customer
		// declares 'example.com' and URL is 'app.example.com').
		if (host === p) return true;
		if (host.endsWith("." + p)) return true;
	}
	// Last-resort substring match against the URL.
	return urlLower.includes(p);
}

// ──────────────────────────────────────────────
// Default seed for a new env
// ──────────────────────────────────────────────

/**
 * Default surface declarations every new env starts with. Just the
 * catch-all 'public' / '*' surface so any URL classifies as Public
 * unless the operator adds more specific surfaces. Matches the seed
 * migration that backfilled existing envs.
 */
export const DEFAULT_NEW_ENV_SURFACES = [
	{
		kind: "public",
		urlPattern: "*",
		label: "Site público",
		authRequired: false,
		displayOrder: 100,
	},
] as const;
