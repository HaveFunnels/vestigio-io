import type { MetaAdsSnapshotData } from "../../packages/integrations/types";

// ──────────────────────────────────────────────
// Meta Ads Poller — Graph Marketing API v21.0
//
// Reads: account insights (total spend 30d) + top ads with creative
// content and per-ad spend. Read-only.
//
// Authentication: long-lived access token (System User token for
// business assets, or 60-day extended user token). Same static-
// credential model as Shopify — no OAuth dance at poll time.
//
// Failure modes: returns non-fatal errors in the result's `errors`
// array; the caller logs and continues. Never throws.
// ──────────────────────────────────────────────

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export interface MetaAdsCredentials {
	/** Long-lived access token (System User recommended). */
	access_token: string;
	/** Ad account id with leading "act_" prefix. We normalize if absent. */
	ad_account_id: string;
}

export interface MetaAdsPollResult {
	data: MetaAdsSnapshotData;
	errors: string[];
	duration_ms: number;
}

interface InsightsResponse {
	data?: {
		spend?: string;
		impressions?: string;
		clicks?: string;
		account_currency?: string;
	}[];
}

interface AdsListResponse {
	data?: {
		id: string;
		name?: string;
		status?: string;
		creative?: {
			id?: string;
			title?: string;
			body?: string;
			call_to_action_type?: string;
			object_story_spec?: {
				link_data?: {
					link?: string;
					name?: string;
					description?: string;
					call_to_action?: { type?: string };
				};
				video_data?: {
					link_description?: string;
					title?: string;
					call_to_action?: { type?: string };
				};
			};
		};
		insights?: {
			data?: { spend?: string }[];
		};
	}[];
}

function normaliseAccountId(id: string): string {
	const trimmed = id.trim();
	return trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
}

async function graphGet<T>(
	path: string,
	accessToken: string,
	timeoutMs = 15_000,
): Promise<{ ok: boolean; data?: T; error?: string; status: number }> {
	try {
		const url = `${GRAPH_BASE}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(accessToken)}`;
		const res = await fetch(url, {
			method: "GET",
			headers: { "Content-Type": "application/json" },
			signal: AbortSignal.timeout(timeoutMs),
		});

		const text = await res.text();
		let body: any = {};
		try { body = text ? JSON.parse(text) : {}; } catch { /* ignore */ }

		if (!res.ok) {
			const msg = body?.error?.message || `HTTP ${res.status}`;
			return { ok: false, error: msg, status: res.status };
		}
		return { ok: true, data: body as T, status: res.status };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { ok: false, error: msg, status: 0 };
	}
}

export async function pollMetaAdsData(
	credentials: MetaAdsCredentials,
): Promise<MetaAdsPollResult> {
	const started = Date.now();
	const errors: string[] = [];
	const accountId = normaliseAccountId(credentials.ad_account_id);

	// 1. Account insights — total spend 30d + currency
	const insightsRes = await graphGet<InsightsResponse>(
		`/${accountId}/insights?fields=spend,impressions,clicks,account_currency&date_preset=last_30d&level=account`,
		credentials.access_token,
	);

	let adSpend30d = 0;
	let currency = "USD";
	if (!insightsRes.ok) {
		errors.push(`insights: ${insightsRes.error ?? "unknown"}`);
	} else {
		const rec = insightsRes.data?.data?.[0];
		adSpend30d = parseFloat(rec?.spend ?? "0") || 0;
		currency = rec?.account_currency ?? "USD";
	}

	// 2. Top ads with creative + per-ad spend. Cap at 20 to keep payload
	//    small; the engine only needs a representative sample.
	const adsFields = [
		"id",
		"name",
		"status",
		"creative{id,title,body,call_to_action_type,object_story_spec}",
		"insights.date_preset(last_30d){spend}",
	].join(",");
	const adsRes = await graphGet<AdsListResponse>(
		`/${accountId}/ads?fields=${encodeURIComponent(adsFields)}&limit=20`,
		credentials.access_token,
	);

	const creatives: MetaAdsSnapshotData["creatives"] = [];
	if (!adsRes.ok) {
		errors.push(`ads: ${adsRes.error ?? "unknown"}`);
	} else {
		for (const ad of adsRes.data?.data ?? []) {
			const adSpend = parseFloat(ad.insights?.data?.[0]?.spend ?? "0") || 0;
			const linkData = ad.creative?.object_story_spec?.link_data;
			const videoData = ad.creative?.object_story_spec?.video_data;
			const headline =
				ad.creative?.title ?? linkData?.name ?? videoData?.title ?? ad.name ?? "";
			const body =
				ad.creative?.body ?? linkData?.description ?? videoData?.link_description ?? "";
			const cta =
				ad.creative?.call_to_action_type ??
				linkData?.call_to_action?.type ??
				videoData?.call_to_action?.type ??
				"";
			const destinationUrl = linkData?.link ?? "";
			creatives.push({
				id: ad.id,
				headline,
				body,
				cta,
				destination_url: destinationUrl,
				status: ad.status ?? "UNKNOWN",
				spend_30d: adSpend,
			});
		}
	}

	const durationMs = Date.now() - started;

	return {
		data: {
			ad_spend_30d: adSpend30d,
			currency,
			creatives,
		},
		errors,
		duration_ms: durationMs,
	};
}

export async function verifyMetaAdsConnection(
	credentials: MetaAdsCredentials,
): Promise<{ ok: boolean; error?: string }> {
	const accountId = normaliseAccountId(credentials.ad_account_id);
	const res = await graphGet<{ id?: string; name?: string }>(
		`/${accountId}?fields=id,name`,
		credentials.access_token,
	);
	if (!res.ok) {
		if (res.status === 401 || res.status === 403) {
			return { ok: false, error: "Invalid Meta Ads access token or account id" };
		}
		return { ok: false, error: res.error ?? `HTTP ${res.status}` };
	}
	return { ok: true };
}
