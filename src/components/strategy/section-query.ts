// EXAME E3 — the lazy plan sections (journeys, ecosystem, predictive,
// analysis-stats) fetch their own API routes from the client. In the
// PDF exporter, the page is opened by a cookie-less headless chromium
// that authenticates via ?export_token=... on the page URL; the token
// must ride along on every lazy fetch or those routes 401 and the
// sections silently vanish from the exported document.
//
// One helper so no section can forget the token again.

/** Query string for a plan-section fetch: envId + (in print) the export token. */
export function planSectionQuery(envId: string): string {
	let qs = `envId=${encodeURIComponent(envId)}`;
	if (typeof window !== "undefined") {
		try {
			const token = new URLSearchParams(window.location.search).get("export_token");
			if (token) qs += `&export_token=${encodeURIComponent(token)}`;
		} catch {
			// window without a usable location (tests) — plain envId is fine.
		}
	}
	return qs;
}
