// ──────────────────────────────────────────────
// Shared types for external-recon sub-fetchers.
//
// Each sub-fetcher returns one ReconResult (industry-listings returns
// an array of 4). The orchestrator in ../external-recon.ts wraps each
// result into an OffSiteReconPayload evidence entry.
// ──────────────────────────────────────────────

import type { OffSiteReconPayload } from "../../../../packages/domain";

export interface ReconResult {
	/** True when the source was reachable and the data parsed. */
	reachable: boolean;
	/** Source-specific normalized data — inferences read keys per source. */
	data: Record<string, unknown>;
	/** URL we fetched (for audit trail). */
	fetched_url: string;
	/** Reason category when reachable=false. */
	error_kind?: OffSiteReconPayload["error_kind"];
}

/** Standard timeout for any single external HTTP fetch in recon. */
export const RECON_FETCH_TIMEOUT_MS = 8_000;

/** User-Agent used for HTML scraping. Some sources reject obvious bots. */
export const RECON_USER_AGENT =
	"Mozilla/5.0 (compatible; VestigioBrandEcho/1.0; +https://vestigio.io/bot)";

/** Helper: AbortController-wrapped fetch with timeout. Returns null on any failure. */
export async function reconFetch(
	url: string,
	init: RequestInit = {},
): Promise<Response | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), RECON_FETCH_TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			...init,
			signal: controller.signal,
			headers: {
				"User-Agent": RECON_USER_AGENT,
				"Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8",
				...(init.headers || {}),
			},
			redirect: "follow",
		});
		return res;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/** Returns a ReconResult with reachable=false and the given error kind. */
export function unreachable(
	url: string,
	error_kind: OffSiteReconPayload["error_kind"] = "unknown",
	extra: Record<string, unknown> = {},
): ReconResult {
	return { reachable: false, fetched_url: url, data: extra, error_kind };
}
