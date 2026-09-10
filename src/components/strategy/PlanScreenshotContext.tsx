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

export interface ShotMetaCtx {
	width: number | null;
	height: number | null;
	annotations: Array<{ kind: string; x: number; y: number; w: number; h: number; label?: string }> | null;
}

interface ShotCtxValue {
	urlByPath: Record<string, string>;
	metaByPath: Record<string, ShotMetaCtx>;
	noteByPath: Record<string, string>;
}

const PlanScreenshotContext = createContext<ShotCtxValue>({
	urlByPath: {},
	metaByPath: {},
	noteByPath: {},
});

export function PlanScreenshotProvider({
	urlByPath,
	metaByPath,
	noteByPath,
	children,
}: {
	urlByPath?: Record<string, string>;
	metaByPath?: Record<string, ShotMetaCtx>;
	noteByPath?: Record<string, string>;
	children: ReactNode;
}) {
	const value = useMemo(
		() => ({
			urlByPath: urlByPath ?? {},
			metaByPath: metaByPath ?? {},
			noteByPath: noteByPath ?? {},
		}),
		[urlByPath, metaByPath, noteByPath],
	);
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
	/** Always "exact" now. EXAME A8 killed the "home" fallback: it put
	 *  the SAME homepage promo banner under five different findings,
	 *  which the customer reads as broken or fake — worse than no
	 *  image. A finding without a capture of ITS page shows text only;
	 *  coverage comes from capturing the right surfaces (the worker now
	 *  targets finding-referenced paths), not from lying with the home. */
	kind: "exact";
}

/**
 * Resolves a source URL to a presigned screenshot of THAT page.
 * No capture of that exact page → null (text-only figure degrade).
 */
export function usePlanScreenshotForUrl(sourceUrl: string | null | undefined): PlanScreenshotMatch | null {
	const { urlByPath } = useContext(PlanScreenshotContext);
	if (!sourceUrl) return null;
	const path = normalizePath(sourceUrl);
	const exact = urlByPath[path];
	if (exact) return { url: exact, kind: "exact" };
	return null;
}

/** ONDA 4.3 — located regions + measured note for a path's capture. */
export function usePlanShotDecoration(sourceUrl: string | null | undefined): {
	meta: ShotMetaCtx | null;
	note: string | null;
} {
	const { metaByPath, noteByPath } = useContext(PlanScreenshotContext);
	if (!sourceUrl) return { meta: null, note: null };
	const path = normalizePath(sourceUrl);
	return { meta: metaByPath[path] ?? null, note: noteByPath[path] ?? null };
}
