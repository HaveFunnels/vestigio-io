/**
 * Meta Ads + Google Ads pollers — unit tests with HTTP mocks.
 *
 * Covers:
 *   - Happy path (200 OK → snapshot shape correct)
 *   - Auth failures (401/403 → errors array populated, no throw)
 *   - Malformed responses (missing fields → graceful defaults)
 *   - Account ID normalization (Meta)
 *   - Refresh-token → access-token handshake (Google)
 *   - GAQL aggregation (Google — multiple rows per campaign)
 *
 * No network calls — we stub globalThis.fetch per test.
 *
 * Run: npx tsx --test tests/ads-pollers.test.ts
 */

import {
	assert,
	assertEqual,
} from "./helpers";

import {
	pollMetaAdsData,
	verifyMetaAdsConnection,
} from "../workers/meta-ads/poller";
import {
	pollGoogleAdsData,
	verifyGoogleAdsConnection,
} from "../workers/google-ads/poller";

let suitesPassed = 0;
let suitesFailed = 0;
const failures: string[] = [];

async function runSuite(name: string, fn: () => Promise<void>): Promise<void> {
	try {
		await fn();
		suitesPassed++;
		console.log(`  ✓ ${name}`);
	} catch (err) {
		suitesFailed++;
		const msg = err instanceof Error ? err.message : String(err);
		failures.push(`  ✗ ${name}\n      ${msg}`);
		console.log(`  ✗ ${name}: ${msg}`);
	}
}

// ──────────────────────────────────────────────
// Fetch mocking utility
// ──────────────────────────────────────────────

type MockResponse = {
	match: (url: string, init?: any) => boolean;
	respond: () => { status: number; body: any };
};

function installFetchMock(responses: MockResponse[]): () => void {
	const original = globalThis.fetch;
	globalThis.fetch = (async (input: any, init?: any) => {
		const url = typeof input === "string" ? input : input.url;
		for (const r of responses) {
			if (r.match(url, init)) {
				const { status, body } = r.respond();
				const text = typeof body === "string" ? body : JSON.stringify(body);
				return new Response(text, {
					status,
					headers: { "Content-Type": "application/json" },
				});
			}
		}
		throw new Error(`unmocked URL: ${url}`);
	}) as any;
	return () => {
		globalThis.fetch = original;
	};
}

// ══════════════════════════════════════════════════
// Meta Ads poller
// ══════════════════════════════════════════════════

async function testMetaAds(): Promise<void> {
	await runSuite("Meta Ads — happy path", async () => {
		const restore = installFetchMock([
			{
				match: (u) => u.includes("/insights"),
				respond: () => ({
					status: 200,
					body: {
						data: [
							{
								spend: "1234.56",
								impressions: "10000",
								clicks: "250",
								account_currency: "BRL",
							},
						],
					},
				}),
			},
			{
				match: (u) => u.includes("/ads?"),
				respond: () => ({
					status: 200,
					body: {
						data: [
							{
								id: "ad_1",
								name: "Black Friday ad",
								status: "ACTIVE",
								creative: {
									title: "50% off today only",
									body: "Buy now",
									call_to_action_type: "SHOP_NOW",
									object_story_spec: {
										link_data: { link: "https://shop.example.com/bf" },
									},
								},
								insights: { data: [{ spend: "500.00" }] },
							},
						],
					},
				}),
			},
		]);

		try {
			const result = await pollMetaAdsData({
				access_token: "EAAtest",
				ad_account_id: "123456789",
			});
			assertEqual(result.data.ad_spend_30d, 1234.56, "spend parsed");
			assertEqual(result.data.currency, "BRL", "currency");
			assertEqual(result.data.creatives.length, 1, "one creative");
			assertEqual(result.data.creatives[0].cta, "SHOP_NOW", "cta");
			assertEqual(
				result.data.creatives[0].destination_url,
				"https://shop.example.com/bf",
				"destination url",
			);
			assertEqual(result.errors.length, 0, "no errors");
		} finally {
			restore();
		}
	});

	await runSuite("Meta Ads — auth failure", async () => {
		const restore = installFetchMock([
			{
				match: () => true,
				respond: () => ({
					status: 401,
					body: { error: { message: "Invalid OAuth 2.0 Access Token" } },
				}),
			},
		]);

		try {
			const result = await pollMetaAdsData({
				access_token: "BAD",
				ad_account_id: "act_1",
			});
			assert(result.errors.length > 0, "errors captured");
			assert(
				result.errors[0].toLowerCase().includes("invalid"),
				"error carries Meta message",
			);
			assertEqual(result.data.ad_spend_30d, 0, "spend defaults to 0");
		} finally {
			restore();
		}
	});

	await runSuite("Meta Ads — normalises account id (no prefix)", async () => {
		let capturedUrl = "";
		const restore = installFetchMock([
			{
				match: (u) => {
					capturedUrl = u;
					return true;
				},
				respond: () => ({
					status: 200,
					body: { data: [{ spend: "0", account_currency: "USD" }] },
				}),
			},
		]);

		try {
			await pollMetaAdsData({
				access_token: "x",
				ad_account_id: "999888777",
			});
			assert(
				capturedUrl.includes("/act_999888777/"),
				`url normalised, got: ${capturedUrl}`,
			);
		} finally {
			restore();
		}
	});

	await runSuite("Meta Ads — verify connection ok", async () => {
		const restore = installFetchMock([
			{
				match: () => true,
				respond: () => ({
					status: 200,
					body: { id: "act_1", name: "Test Account" },
				}),
			},
		]);

		try {
			const result = await verifyMetaAdsConnection({
				access_token: "x",
				ad_account_id: "1",
			});
			assertEqual(result.ok, true, "ok");
		} finally {
			restore();
		}
	});

	await runSuite("Meta Ads — verify connection 403 returns invalid-token error", async () => {
		const restore = installFetchMock([
			{
				match: () => true,
				respond: () => ({
					status: 403,
					body: { error: { message: "Token invalid" } },
				}),
			},
		]);

		try {
			const result = await verifyMetaAdsConnection({
				access_token: "bad",
				ad_account_id: "1",
			});
			assertEqual(result.ok, false, "not ok");
			assert(
				(result.error || "").toLowerCase().includes("invalid"),
				`error message meaningful: ${result.error}`,
			);
		} finally {
			restore();
		}
	});
}

// ══════════════════════════════════════════════════
// Google Ads poller
// ══════════════════════════════════════════════════

async function testGoogleAds(): Promise<void> {
	await runSuite("Google Ads — happy path with aggregation", async () => {
		const restore = installFetchMock([
			{
				match: (u) => u.includes("oauth2.googleapis.com/token"),
				respond: () => ({
					status: 200,
					body: { access_token: "ya29.test", expires_in: 3600 },
				}),
			},
			{
				match: (u) => u.includes("googleads.googleapis.com"),
				respond: () => ({
					status: 200,
					body: [
						{
							results: [
								{
									campaign: { id: "cam1", name: "Campaign One" },
									customer: { currencyCode: "BRL" },
									metrics: { costMicros: "5000000000" },
									adGroupAd: {
										ad: {
											finalUrls: ["https://example.com/a"],
											responsiveSearchAd: {
												headlines: [{ text: "Buy now" }, { text: "Free shipping" }],
												descriptions: [{ text: "Best prices" }],
											},
										},
									},
								},
								{
									campaign: { id: "cam1", name: "Campaign One" },
									customer: { currencyCode: "BRL" },
									metrics: { costMicros: "1000000000" },
									adGroupAd: {
										ad: {
											finalUrls: ["https://example.com/a"],
											responsiveSearchAd: {
												headlines: [{ text: "Buy now" }],
												descriptions: [],
											},
										},
									},
								},
								{
									campaign: { id: "cam2", name: "Campaign Two" },
									customer: { currencyCode: "BRL" },
									metrics: { costMicros: "2000000000" },
									adGroupAd: {
										ad: {
											finalUrls: ["https://example.com/b"],
											responsiveSearchAd: {
												headlines: [{ text: "Limited offer" }],
												descriptions: [{ text: "Act now" }],
											},
										},
									},
								},
							],
						},
					],
				}),
			},
		]);

		try {
			const result = await pollGoogleAdsData({
				developer_token: "dt",
				client_id: "cid",
				client_secret: "cs",
				refresh_token: "rt",
				customer_id: "123-456-7890",
			});
			assertEqual(result.errors.length, 0, "no errors");
			// Total: (5000M + 1000M + 2000M) micros = 8000 units
			assertEqual(result.data.ad_spend_30d, 8000, "total spend aggregated");
			assertEqual(result.data.currency, "BRL", "currency");
			assertEqual(result.data.campaigns.length, 2, "two campaigns");
			// Campaign 1 has 5000M + 1000M = 6000
			const cam1 = result.data.campaigns.find((c) => c.id === "cam1");
			assertEqual(cam1?.spend_30d, 6000, "campaign 1 spend aggregated");
			// Campaigns should be sorted by spend descending — cam1 (6000) first
			assertEqual(result.data.campaigns[0].id, "cam1", "sorted by spend");
		} finally {
			restore();
		}
	});

	await runSuite("Google Ads — oauth refresh failure", async () => {
		const restore = installFetchMock([
			{
				match: (u) => u.includes("oauth2.googleapis.com/token"),
				respond: () => ({
					status: 400,
					body: {
						error: "invalid_grant",
						error_description: "Token has been expired or revoked.",
					},
				}),
			},
		]);

		try {
			const result = await pollGoogleAdsData({
				developer_token: "dt",
				client_id: "cid",
				client_secret: "cs",
				refresh_token: "revoked",
				customer_id: "1234567890",
			});
			assert(result.errors.length > 0, "error captured");
			assert(
				result.errors[0].toLowerCase().includes("oauth"),
				"error prefixed with oauth",
			);
			assertEqual(result.data.ad_spend_30d, 0, "spend defaults 0");
		} finally {
			restore();
		}
	});

	await runSuite("Google Ads — sends developer-token and login-customer-id headers", async () => {
		let capturedHeaders: any = {};
		const restore = installFetchMock([
			{
				match: (u) => u.includes("oauth2.googleapis.com/token"),
				respond: () => ({
					status: 200,
					body: { access_token: "ya29.x", expires_in: 3600 },
				}),
			},
			{
				match: (u, init) => {
					if (u.includes("googleads.googleapis.com")) {
						capturedHeaders = init?.headers ?? {};
						return true;
					}
					return false;
				},
				respond: () => ({ status: 200, body: [] }),
			},
		]);

		try {
			await pollGoogleAdsData({
				developer_token: "DEV_TOKEN_X",
				client_id: "cid",
				client_secret: "cs",
				refresh_token: "rt",
				customer_id: "1234567890",
				login_customer_id: "9999888877",
			});
			assertEqual(
				capturedHeaders["developer-token"],
				"DEV_TOKEN_X",
				"dev token header",
			);
			assertEqual(
				capturedHeaders["login-customer-id"],
				"9999888877",
				"login customer id header",
			);
			assertEqual(
				capturedHeaders["Authorization"],
				"Bearer ya29.x",
				"bearer token",
			);
		} finally {
			restore();
		}
	});

	await runSuite("Google Ads — verify connection ok", async () => {
		const restore = installFetchMock([
			{
				match: (u) => u.includes("oauth2.googleapis.com/token"),
				respond: () => ({
					status: 200,
					body: { access_token: "ya29.x", expires_in: 3600 },
				}),
			},
			{
				match: (u) => u.includes("googleads.googleapis.com"),
				respond: () => ({
					status: 200,
					body: [{ results: [{ customer: { id: "1", currencyCode: "USD" } }] }],
				}),
			},
		]);

		try {
			const result = await verifyGoogleAdsConnection({
				developer_token: "dt",
				client_id: "cid",
				client_secret: "cs",
				refresh_token: "rt",
				customer_id: "1234567890",
			});
			assertEqual(result.ok, true, "ok");
		} finally {
			restore();
		}
	});

	await runSuite("Google Ads — verify connection bad refresh", async () => {
		const restore = installFetchMock([
			{
				match: () => true,
				respond: () => ({
					status: 400,
					body: { error: "invalid_grant", error_description: "Bad token" },
				}),
			},
		]);

		try {
			const result = await verifyGoogleAdsConnection({
				developer_token: "dt",
				client_id: "cid",
				client_secret: "cs",
				refresh_token: "bad",
				customer_id: "1234567890",
			});
			assertEqual(result.ok, false, "not ok");
			assert(
				(result.error || "").toLowerCase().includes("oauth"),
				`error message: ${result.error}`,
			);
		} finally {
			restore();
		}
	});
}

(async () => {
	console.log("Meta Ads + Google Ads pollers");
	await testMetaAds();
	await testGoogleAds();

	console.log(`\n${suitesPassed}/${suitesPassed + suitesFailed} passed`);
	if (suitesFailed > 0) {
		for (const f of failures) console.error(f);
		process.exit(1);
	}
})();
