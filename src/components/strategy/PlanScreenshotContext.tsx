"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

// ──────────────────────────────────────────────
// PlanScreenshotContext — resolves a captured-surface screenshot URL
// for any source URL surfaced inside the Monthly Strategy Plan.
//
// Data flow:
//   1. /api/library/strategy/[month] builds a normalized
//      path → 1h-presigned R2 URL map (screenshotUrlByPath) from the
//      SurfaceScreenshot table.
//   2. StrategyPlanPanel wraps its subtree in <PlanScreenshotProvider>.
//   3. FindingCard (and any future plan surface) calls
//      usePlanScreenshotForUrl(finding.source_url) to render the
//      customer's ACTUAL page beside the finding.
//
// The mismatch between source_url (may be absolute, may include query
// or hash) and the map's normalized path is resolved here so consumers
// never have to think about it. Missing/empty map → hook returns null
// and callers skip rendering the figure entirely (text-only degrade).
// ──────────────────────────────────────────────

const PlanScreenshotContext = createContext<Record<string, string>>({});

export function PlanScreenshotProvider({
	urlByPath,
	children,
}: {
	urlByPath?: Record<string, string>;
	children: ReactNode;
}) {
	const value = useMemo(() => urlByPath ?? {}, [urlByPath]);
	return (
		<PlanScreenshotContext.Provider value={value}>
			{children}
		</PlanScreenshotContext.Provider>
	);
}

function normalizePath(input: string): string {
	const raw = input.trim();
	if (!raw) return "/";
	// Accept absolute URLs OR bare paths. URL parser handles both when
	// we give it a fake base — the pathname of "https://x/foo/" is "/foo/".
	let path: string;
	try {
		path = new URL(raw, "https://x").pathname;
	} catch {
		path = raw.startsWith("/") ? raw : `/${raw}`;
	}
	// Match the API-side normPath: strip a trailing slash unless it's the root.
	return path.length > 1 ? path.replace(/\/+$/, "") : "/";
}

export interface PlanScreenshotMatch {
	url: string;
	/** "exact" — screenshot of the finding's actual source URL (best).
	 *  "home" — falls back to homepage when the exact page wasn't in
	 *  the top-N surfaces captured this cycle. Home is always in the
	 *  capture set, so this fallback lifts coverage from ~30% to ~90%
	 *  of findings and still anchors the drawer in "your real page".
	 *  Consumers should adjust the caption to say "sua home" instead
	 *  of the specific surface when kind === "home". */
	kind: "exact" | "home";
}

/**
 * Resolves a source URL to a presigned screenshot URL. Returns null
 * only when both the exact page AND the homepage have no capture (R2
 * unset, or the cycle failed to capture anything).
 */
export function usePlanScreenshotForUrl(sourceUrl: string | null | undefined): PlanScreenshotMatch | null {
	const map = useContext(PlanScreenshotContext);
	if (sourceUrl) {
		const path = normalizePath(sourceUrl);
		const exact = map[path];
		if (exact) return { url: exact, kind: "exact" };
	}
	const home = map["/"];
	if (home) return { url: home, kind: "home" };
	return null;
}
