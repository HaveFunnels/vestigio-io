// ──────────────────────────────────────────────
// SERP host exclusions — Wave 25
//
// Hosts we never treat as competitors when they appear in SERP
// results. Three categories:
//
//   - User-controlled / social: the owner publishes there, so a hit
//     is THEIR content, not a competitor's.
//   - News / reference / aggregators: write about everyone — appearing
//     for a branded search is editorial coverage, not encroachment.
//   - Review platforms: customers go there to compare; hitting one
//     for "your brand" is normal review SERP behavior, not a peer.
//
// Single source of truth shared by:
//   - workers/ingestion/enrichment/serp-observation.ts (auto-discovery filter)
//   - packages/signals/competitive-signals.ts (encroachment / overlap)
//
// New entries land here, both consumers pick them up automatically.
// ──────────────────────────────────────────────

export const SERP_EXCLUDED_HOSTS: ReadonlySet<string> = new Set([
	// User-controlled / social
	"linkedin.com",
	"x.com",
	"twitter.com",
	"facebook.com",
	"instagram.com",
	"youtube.com",
	"tiktok.com",
	"medium.com",
	"github.com",
	// News + reference
	"wikipedia.org",
	"crunchbase.com",
	"bloomberg.com",
	"forbes.com",
	"techcrunch.com",
	"businessinsider.com",
	// Aggregators / SERP itself
	"google.com",
	"bing.com",
	"duckduckgo.com",
	"reddit.com",
	"quora.com",
	// Review sites
	"g2.com",
	"capterra.com",
	"trustpilot.com",
	"reclameaqui.com.br",
	"glassdoor.com",
	"softwareworld.co",
	"softwaresuggest.com",
	"getapp.com",
	"trustradius.com",
	// App stores / aggregator listings
	"play.google.com",
	"apps.apple.com",
	"alternativeto.net",
	"producthunt.com",
]);

/**
 * Returns true when the host should NOT count as a competitor
 * candidate or encroacher: own apex (or subdomain), known excluded
 * host, or excluded apex (handles e.g. blog.linkedin.com).
 */
export function isSerpExcluded(host: string, ownApex: string | null): boolean {
	if (!host) return true;
	if (ownApex && (host === ownApex || host.endsWith("." + ownApex))) return true;
	if (SERP_EXCLUDED_HOSTS.has(host)) return true;
	const parts = host.split(".");
	if (parts.length > 2) {
		const apex = parts.slice(-2).join(".");
		if (SERP_EXCLUDED_HOSTS.has(apex)) return true;
	}
	return false;
}
