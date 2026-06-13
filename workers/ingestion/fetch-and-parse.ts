import { httpFetch, type HttpResponse } from "./http-client";
import { parsePage, type ParsedPage } from "./parser";

// ──────────────────────────────────────────────
// fetch-and-parse — shared homepage fetch + parse step
//
// Used by both run-mini-audit (terminal step 7) and run-early-crawl
// (after step 1). Single source of truth for "go get the HTML and
// parse it" so the two workers can share semantics — and so run-mini-
// audit can be handed a pre-fetched HttpResponse to skip the network
// round-trip.
//
// Wave-23 value-on-fill: early-crawl populates the cachedHtml; the
// run-audit calls fetchAndParseHomepage(domain, { precomputedResponse })
// to short-circuit.
// ──────────────────────────────────────────────

export interface FetchAndParseOutput {
	response: HttpResponse;
	parsed: ParsedPage;
}

export async function fetchAndParseHomepage(
	domain: string,
	opts?: { precomputedResponse?: HttpResponse | null },
): Promise<FetchAndParseOutput> {
	const response =
		opts?.precomputedResponse ??
		(await httpFetch(domain.startsWith("http") ? domain : `https://${domain}`));
	const parsed = parsePage(response.body, response.final_url);
	return { response, parsed };
}
