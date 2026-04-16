import type { GoogleAdsSnapshotData } from "../../packages/integrations/types";

// ──────────────────────────────────────────────
// Google Ads Poller — Google Ads API v18
//
// Reads: campaigns with 30-day cost + responsive search ad creative
// text (headlines + descriptions) via GAQL searchStream.
//
// Authentication: refresh-token → access-token flow. User provides
// developer_token + client_id + client_secret + refresh_token +
// customer_id (MCC or direct). We exchange refresh for short-lived
// access token at poll time.
//
// Failure modes: returns non-fatal errors in result.errors; never
// throws. Caller logs and continues.
// ──────────────────────────────────────────────

const OAUTH_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v18";

export interface GoogleAdsCredentials {
	developer_token: string;
	client_id: string;
	client_secret: string;
	refresh_token: string;
	/** Numeric customer id, no hyphens (e.g. "1234567890") */
	customer_id: string;
	/** Optional manager (MCC) id — set via login-customer-id header */
	login_customer_id?: string;
}

export interface GoogleAdsPollResult {
	data: GoogleAdsSnapshotData;
	errors: string[];
	duration_ms: number;
}

interface OAuthTokenResponse {
	access_token?: string;
	expires_in?: number;
	error?: string;
	error_description?: string;
}

interface SearchStreamChunk {
	results?: GaqlRow[];
}

interface GaqlRow {
	campaign?: { id?: string; name?: string };
	metrics?: { costMicros?: string };
	customer?: { currencyCode?: string };
	adGroupAd?: {
		ad?: {
			finalUrls?: string[];
			responsiveSearchAd?: {
				headlines?: { text?: string }[];
				descriptions?: { text?: string }[];
			};
		};
	};
}

async function exchangeRefreshToken(
	credentials: GoogleAdsCredentials,
): Promise<{ ok: boolean; access_token?: string; error?: string }> {
	try {
		const body = new URLSearchParams({
			client_id: credentials.client_id,
			client_secret: credentials.client_secret,
			refresh_token: credentials.refresh_token,
			grant_type: "refresh_token",
		});
		const res = await fetch(OAUTH_TOKEN_ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: body.toString(),
			signal: AbortSignal.timeout(10_000),
		});
		const data = (await res.json().catch(() => ({}))) as OAuthTokenResponse;
		if (!res.ok || !data.access_token) {
			return {
				ok: false,
				error: data.error_description || data.error || `HTTP ${res.status}`,
			};
		}
		return { ok: true, access_token: data.access_token };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

async function runGaql(
	credentials: GoogleAdsCredentials,
	accessToken: string,
	query: string,
): Promise<{ ok: boolean; rows?: GaqlRow[]; error?: string }> {
	try {
		const customerId = credentials.customer_id.replace(/-/g, "");
		const url = `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:searchStream`;
		const headers: Record<string, string> = {
			Authorization: `Bearer ${accessToken}`,
			"developer-token": credentials.developer_token,
			"Content-Type": "application/json",
		};
		if (credentials.login_customer_id) {
			headers["login-customer-id"] = credentials.login_customer_id.replace(/-/g, "");
		}
		const res = await fetch(url, {
			method: "POST",
			headers,
			body: JSON.stringify({ query }),
			signal: AbortSignal.timeout(20_000),
		});
		const text = await res.text();
		let body: any = {};
		try {
			body = text ? JSON.parse(text) : {};
		} catch { /* ignore */ }

		if (!res.ok) {
			const errMsg =
				Array.isArray(body) ? body[0]?.error?.message : body?.error?.message;
			return { ok: false, error: errMsg || `HTTP ${res.status}` };
		}

		// searchStream returns an array of chunks, each with a `results` array.
		const chunks: SearchStreamChunk[] = Array.isArray(body) ? body : [body];
		const rows: GaqlRow[] = [];
		for (const chunk of chunks) {
			for (const r of chunk.results ?? []) rows.push(r);
		}
		return { ok: true, rows };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

export async function pollGoogleAdsData(
	credentials: GoogleAdsCredentials,
): Promise<GoogleAdsPollResult> {
	const started = Date.now();
	const errors: string[] = [];

	// Step 1: exchange refresh token for a short-lived access token.
	const tokenRes = await exchangeRefreshToken(credentials);
	if (!tokenRes.ok || !tokenRes.access_token) {
		errors.push(`oauth: ${tokenRes.error ?? "unknown"}`);
		return {
			data: { ad_spend_30d: 0, currency: "USD", campaigns: [] },
			errors,
			duration_ms: Date.now() - started,
		};
	}

	// Step 2: query campaigns + metrics + responsive search ad content.
	// Use LAST_30_DAYS date segment; limit to top 50 campaigns by cost
	// to keep payload small without dropping meaningful ones.
	const query = `
		SELECT
			campaign.id,
			campaign.name,
			customer.currency_code,
			metrics.cost_micros,
			ad_group_ad.ad.final_urls,
			ad_group_ad.ad.responsive_search_ad.headlines,
			ad_group_ad.ad.responsive_search_ad.descriptions
		FROM ad_group_ad
		WHERE segments.date DURING LAST_30_DAYS
			AND ad_group_ad.ad.type = RESPONSIVE_SEARCH_AD
		ORDER BY metrics.cost_micros DESC
		LIMIT 50
	`.trim();

	const gaqlRes = await runGaql(credentials, tokenRes.access_token, query);
	if (!gaqlRes.ok || !gaqlRes.rows) {
		errors.push(`gaql: ${gaqlRes.error ?? "unknown"}`);
		return {
			data: { ad_spend_30d: 0, currency: "USD", campaigns: [] },
			errors,
			duration_ms: Date.now() - started,
		};
	}

	// Aggregate per-campaign (multiple ads per campaign → sum cost,
	// collect first-seen creative text).
	const byCampaign = new Map<
		string,
		{ name: string; spend_30d: number; headlines: string[]; descriptions: string[]; final_url: string }
	>();
	let currency = "USD";
	let totalCostMicros = 0;
	for (const row of gaqlRes.rows) {
		const campaignId = row.campaign?.id;
		if (!campaignId) continue;
		const costMicros = parseInt(row.metrics?.costMicros ?? "0", 10) || 0;
		totalCostMicros += costMicros;
		if (row.customer?.currencyCode) currency = row.customer.currencyCode;

		const existing = byCampaign.get(campaignId);
		const rsa = row.adGroupAd?.ad?.responsiveSearchAd;
		const headlines = rsa?.headlines?.map((h) => h.text || "").filter(Boolean) ?? [];
		const descriptions = rsa?.descriptions?.map((d) => d.text || "").filter(Boolean) ?? [];
		const finalUrl = row.adGroupAd?.ad?.finalUrls?.[0] ?? "";

		if (existing) {
			existing.spend_30d += costMicros / 1_000_000;
			if (existing.headlines.length === 0) existing.headlines = headlines;
			if (existing.descriptions.length === 0) existing.descriptions = descriptions;
			if (!existing.final_url) existing.final_url = finalUrl;
		} else {
			byCampaign.set(campaignId, {
				name: row.campaign?.name ?? `campaign_${campaignId}`,
				spend_30d: costMicros / 1_000_000,
				headlines,
				descriptions,
				final_url: finalUrl,
			});
		}
	}

	const campaigns: GoogleAdsSnapshotData["campaigns"] = Array.from(byCampaign)
		.map(([id, c]) => ({
			id,
			name: c.name,
			headlines: c.headlines,
			descriptions: c.descriptions,
			final_url: c.final_url,
			spend_30d: c.spend_30d,
		}))
		.sort((a, b) => b.spend_30d - a.spend_30d);

	return {
		data: {
			ad_spend_30d: totalCostMicros / 1_000_000,
			currency,
			campaigns,
		},
		errors,
		duration_ms: Date.now() - started,
	};
}

export async function verifyGoogleAdsConnection(
	credentials: GoogleAdsCredentials,
): Promise<{ ok: boolean; error?: string }> {
	const tokenRes = await exchangeRefreshToken(credentials);
	if (!tokenRes.ok || !tokenRes.access_token) {
		return { ok: false, error: `OAuth refresh failed: ${tokenRes.error}` };
	}

	// Simple metadata query — fastest valid GAQL that confirms the
	// developer_token + customer_id chain works.
	const gaqlRes = await runGaql(
		credentials,
		tokenRes.access_token,
		"SELECT customer.id, customer.currency_code FROM customer LIMIT 1",
	);
	if (!gaqlRes.ok) {
		return { ok: false, error: gaqlRes.error ?? "GAQL query failed" };
	}
	return { ok: true };
}
