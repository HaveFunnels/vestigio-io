/**
 * Shopify adapter — unit tests (client + aggregator + mapper).
 *
 * Covers:
 *   - Client: connection verify, auth/rate/network errors, pagination
 *   - Aggregator: orders → metrics, date windows, refunds, currency
 *   - Mapper: metrics → BusinessInputs, basis_type classification
 *
 * No network calls — globalThis.fetch is stubbed per test.
 *
 * Run: npx tsx --test tests/shopify-adapter.test.ts
 */

import crypto from "node:crypto";
import { assert, assertEqual, assertGreater } from "./helpers";

import {
	verifyConnection,
	fetchOrders,
	fetchOrdersSinceCursor,
	fetchAbandonedCheckouts,
	fetchCustomers,
	classifyHttpError,
	classifyNetworkError,
	detectDeprecationWarning,
	API_VERSION,
} from "../packages/shopify-adapter/client";

import {
	aggregateOrdersIntoMetrics,
} from "../packages/shopify-adapter/aggregator";

import {
	mapToBusinessInputs,
	determineBasisType,
} from "../packages/shopify-adapter/mapper";

import { verifyShopifySignature } from "../src/app/api/integrations/shopify/webhook/route";
import { verifyShopifyCallbackHmac } from "../src/app/api/integrations/shopify/oauth/callback/route";

import {
	shopifyGraphQL,
	fetchOrdersGraphQL,
	mapGraphQLOrderToRaw,
} from "../packages/shopify-adapter/graphql-client";

import type {
	ShopifyCredentials,
	ShopifyRawOrder,
} from "../packages/shopify-adapter/types";

let suitesPassed = 0;
let suitesFailed = 0;
const failures: string[] = [];

async function runSuite(name: string, fn: () => Promise<void> | void): Promise<void> {
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
	respond: () => { status: number; body: any; headers?: Record<string, string> };
};

function installFetchMock(responses: MockResponse[]): () => void {
	const original = globalThis.fetch;
	globalThis.fetch = (async (input: any, init?: any) => {
		const url = typeof input === "string" ? input : input.url;
		for (const r of responses) {
			if (r.match(url, init)) {
				const { status, body, headers } = r.respond();
				const text = typeof body === "string" ? body : JSON.stringify(body);
				return new Response(text, {
					status,
					headers: {
						"Content-Type": "application/json",
						...(headers || {}),
					},
				});
			}
		}
		throw new Error(`unmocked URL: ${url}`);
	}) as any;
	return () => {
		globalThis.fetch = original;
	};
}

const CREDS: ShopifyCredentials = {
	shop_domain: "test-shop.myshopify.com",
	access_token: "shpat_TESTTOKEN",
	api_key: "k",
	api_secret: "s",
};

// ══════════════════════════════════════════════════
// Error classifiers (pure functions)
// ══════════════════════════════════════════════════

async function testErrorClassifiers(): Promise<void> {
	await runSuite("classifyHttpError: 401 → auth_error", () => {
		assertEqual(classifyHttpError(401), "auth_error", "401");
		assertEqual(classifyHttpError(403), "auth_error", "403");
	});

	await runSuite("classifyHttpError: 429 → rate_limit", () => {
		assertEqual(classifyHttpError(429), "rate_limit", "429");
	});

	await runSuite("classifyHttpError: 500 → unknown", () => {
		assertEqual(classifyHttpError(500), "unknown", "500");
		assertEqual(classifyHttpError(502), "unknown", "502");
	});

	await runSuite("classifyNetworkError: timeout strings", () => {
		assertEqual(classifyNetworkError("aborted"), "network_error", "abort");
		assertEqual(classifyNetworkError("operation timeout"), "network_error", "timeout");
		assertEqual(classifyNetworkError("ENOTFOUND test"), "network_error", "ENOTFOUND");
		assertEqual(classifyNetworkError("ECONNREFUSED"), "network_error", "ECONNREFUSED");
	});

	await runSuite("classifyNetworkError: parse errors", () => {
		assertEqual(classifyNetworkError("Unexpected token in JSON"), "data_parsing_error", "json");
		assertEqual(classifyNetworkError("could not parse response"), "data_parsing_error", "parse");
	});

	await runSuite("classifyNetworkError: unknown fallback", () => {
		assertEqual(classifyNetworkError("something exploded"), "unknown", "unknown");
	});
}

// ══════════════════════════════════════════════════
// API version & deprecation detection
// ══════════════════════════════════════════════════

async function testApiVersion(): Promise<void> {
	await runSuite("API_VERSION: matches Shopify quarterly format", () => {
		assert(/^\d{4}-(01|04|07|10)$/.test(API_VERSION), `unexpected: ${API_VERSION}`);
	});

	await runSuite("detectDeprecationWarning: returns null when no header", () => {
		const headers = new Headers({ "x-shopify-api-version": API_VERSION });
		assertEqual(detectDeprecationWarning(headers), null, "no deprecation");
	});

	await runSuite("detectDeprecationWarning: surfaces deprecation reason", () => {
		const headers = new Headers({
			"x-shopify-api-version": "2024-01",
			"x-shopify-api-deprecated-reason": "https://shopify.dev/api/usage/versioning",
		});
		const warning = detectDeprecationWarning(headers);
		assert(warning !== null, "warning produced");
		assert(warning!.includes("2024-01"), "carries version");
		assert(warning!.includes("deprecated"), "mentions deprecation");
	});

	await runSuite("fetchOrders: bubbles deprecation warning into errors", async () => {
		const restore = installFetchMock([
			{
				match: (u) => u.includes("/orders.json"),
				respond: () => ({
					status: 200,
					body: { orders: [sampleOrder({ id: 1 })] },
					headers: {
						"x-shopify-api-version": "2024-01",
						"x-shopify-api-deprecated-reason": "Use newer API version",
					},
				}),
			},
		]);

		try {
			const r = await fetchOrders(CREDS, new Date(), new Date());
			assert(
				r.errors.some(e => e.includes("deprecated")),
				`expected deprecation warning, got: ${r.errors.join("; ")}`,
			);
			assertEqual(r.orders.length, 1, "data still returned");
		} finally {
			restore();
		}
	});
}

// ══════════════════════════════════════════════════
// Client: verifyConnection
// ══════════════════════════════════════════════════

async function testVerifyConnection(): Promise<void> {
	await runSuite("verifyConnection: happy path", async () => {
		const restore = installFetchMock([
			{
				match: (u) => u.includes("/shop.json"),
				respond: () => ({
					status: 200,
					body: { shop: { name: "Test Shop" } },
				}),
			},
		]);

		try {
			const state = await verifyConnection(CREDS);
			assertEqual(state.status, "connected", "status connected");
			assertEqual(state.shop_name, "Test Shop", "shop name parsed");
			assertEqual(state.scopes_verified, true, "scopes verified");
			assertEqual(state.error_type, null, "no error type");
		} finally {
			restore();
		}
	});

	await runSuite("verifyConnection: 401 → invalid_credentials", async () => {
		const restore = installFetchMock([
			{
				match: () => true,
				respond: () => ({ status: 401, body: { errors: "Invalid API token" } }),
			},
		]);

		try {
			const state = await verifyConnection(CREDS);
			assertEqual(state.status, "invalid_credentials", "invalid_credentials status");
			assertEqual(state.error_type, "auth_error", "auth_error type");
			assertEqual(state.scopes_verified, false, "scopes not verified");
		} finally {
			restore();
		}
	});

	await runSuite("verifyConnection: 429 → error + rate_limit", async () => {
		const restore = installFetchMock([
			{
				match: () => true,
				respond: () => ({ status: 429, body: {} }),
			},
		]);

		try {
			const state = await verifyConnection(CREDS);
			assertEqual(state.status, "error", "error status");
			assertEqual(state.error_type, "rate_limit", "rate_limit type");
		} finally {
			restore();
		}
	});

	await runSuite("verifyConnection: network failure → network_error", async () => {
		const original = globalThis.fetch;
		globalThis.fetch = (async () => {
			throw new Error("ENOTFOUND test-shop.myshopify.com");
		}) as any;

		try {
			const state = await verifyConnection(CREDS);
			assertEqual(state.status, "error", "error status");
			assertEqual(state.error_type, "network_error", "network_error type");
			assert(state.last_error?.includes("ENOTFOUND") ?? false, "captures DNS error");
		} finally {
			globalThis.fetch = original;
		}
	});
}

// ══════════════════════════════════════════════════
// Client: fetchOrders pagination
// ══════════════════════════════════════════════════

async function testFetchOrders(): Promise<void> {
	await runSuite("fetchOrders: single page", async () => {
		const restore = installFetchMock([
			{
				match: (u) => u.includes("/orders.json"),
				respond: () => ({
					status: 200,
					body: {
						orders: [
							sampleOrder({ id: 1, total_price: "100.00" }),
							sampleOrder({ id: 2, total_price: "50.00" }),
						],
					},
				}),
			},
		]);

		try {
			const r = await fetchOrders(CREDS, new Date("2026-01-01"), new Date("2026-02-01"));
			assertEqual(r.orders.length, 2, "two orders fetched");
			assertEqual(r.errors.length, 0, "no errors");
		} finally {
			restore();
		}
	});

	await runSuite("fetchOrders: follows Link header pagination", async () => {
		let callCount = 0;
		const restore = installFetchMock([
			{
				match: (u) => u.includes("/orders.json"),
				respond: () => {
					callCount++;
					if (callCount === 1) {
						return {
							status: 200,
							body: { orders: [sampleOrder({ id: 1 })] },
							headers: {
								link: `<https://test-shop.myshopify.com/admin/api/2024-01/orders.json?page_info=NEXT>; rel="next"`,
							},
						};
					}
					return {
						status: 200,
						body: { orders: [sampleOrder({ id: 2 })] },
					};
				},
			},
		]);

		try {
			const r = await fetchOrders(CREDS, new Date("2026-01-01"), new Date("2026-02-01"));
			assertEqual(r.orders.length, 2, "fetched both pages");
			assertEqual(callCount, 2, "two HTTP calls");
		} finally {
			restore();
		}
	});

	await runSuite("fetchOrders: 401 returns errors array (no throw)", async () => {
		const restore = installFetchMock([
			{
				match: () => true,
				respond: () => ({ status: 401, body: { errors: "Unauthorized" } }),
			},
		]);

		try {
			const r = await fetchOrders(CREDS, new Date(), new Date());
			assertEqual(r.orders.length, 0, "no orders");
			assert(r.errors.length > 0, "error captured");
			assert(r.errors[0].includes("401"), "status surfaced");
		} finally {
			restore();
		}
	});

	await runSuite("fetchOrders: surfaces truncated=true when maxPages hit", async () => {
		let callCount = 0;
		const restore = installFetchMock([
			{
				match: (u) => u.includes("/orders.json"),
				respond: () => {
					callCount++;
					// Always return a "next" link → would loop forever without cap
					return {
						status: 200,
						body: { orders: [sampleOrder({ id: callCount })] },
						headers: {
							link: `<https://test-shop.myshopify.com/admin/api/2024-01/orders.json?page_info=NEXT${callCount}>; rel="next"`,
						},
					};
				},
			},
		]);

		try {
			const r = await fetchOrders(CREDS, new Date(), new Date(), 250, 3);
			assertEqual(r.truncated, true, "truncated flag set");
			assertEqual(r.orders.length, 3, "stopped at maxPages");
			assert(
				r.errors.some(e => e.includes("truncated")),
				"truncation surfaced in errors",
			);
		} finally {
			restore();
		}
	});

	await runSuite("fetchOrders: truncated=false when pagination completes", async () => {
		const restore = installFetchMock([
			{
				match: (u) => u.includes("/orders.json"),
				respond: () => ({
					status: 200,
					body: { orders: [sampleOrder({ id: 1 })] },
					// No link header → no next page
				}),
			},
		]);

		try {
			const r = await fetchOrders(CREDS, new Date(), new Date());
			assertEqual(r.truncated, false, "not truncated");
			assertEqual(r.errors.length, 0, "no errors");
		} finally {
			restore();
		}
	});

	await runSuite("fetchOrdersSinceCursor: passes since_id and returns last id", async () => {
		let capturedUrl = "";
		const restore = installFetchMock([
			{
				match: (u) => {
					capturedUrl = u;
					return u.includes("/orders.json");
				},
				respond: () => ({
					status: 200,
					body: {
						orders: [
							sampleOrder({ id: 10 }),
							sampleOrder({ id: 11 }),
							sampleOrder({ id: 12 }),
						],
					},
				}),
			},
		]);

		try {
			const r = await fetchOrdersSinceCursor(CREDS, "5");
			assertEqual(r.orders.length, 3, "three orders");
			assertEqual(r.last_id, "12", "last id returned");
			assert(capturedUrl.includes("since_id=5"), "cursor in URL");
		} finally {
			restore();
		}
	});
}

// ══════════════════════════════════════════════════
// Client: extra endpoints (checkouts, customers)
// ══════════════════════════════════════════════════

async function testExtraEndpoints(): Promise<void> {
	await runSuite("fetchAbandonedCheckouts: maps fields", async () => {
		const restore = installFetchMock([
			{
				match: (u) => u.includes("/checkouts.json"),
				respond: () => ({
					status: 200,
					body: {
						checkouts: [
							{
								id: 100,
								created_at: "2026-05-01T00:00:00Z",
								total_price: "75.00",
								currency: "USD",
								completed_at: null,
								abandoned_checkout_url: "https://test/recover",
							},
						],
					},
				}),
			},
		]);

		try {
			const r = await fetchAbandonedCheckouts(CREDS, new Date("2026-04-01"));
			assertEqual(r.checkouts.length, 1, "one checkout");
			assertEqual(r.checkouts[0].total_price, "75.00", "price mapped");
			assertEqual(r.errors.length, 0, "no errors");
		} finally {
			restore();
		}
	});

	await runSuite("fetchCustomers: maps fields", async () => {
		const restore = installFetchMock([
			{
				match: (u) => u.includes("/customers.json"),
				respond: () => ({
					status: 200,
					body: {
						customers: [
							{
								id: 1,
								orders_count: 3,
								total_spent: "450.00",
								created_at: "2026-04-15T00:00:00Z",
								currency: "USD",
							},
						],
					},
				}),
			},
		]);

		try {
			const r = await fetchCustomers(CREDS, new Date("2026-04-01"));
			assertEqual(r.customers.length, 1, "one customer");
			assertEqual(r.customers[0].orders_count, 3, "orders_count");
		} finally {
			restore();
		}
	});
}

// ══════════════════════════════════════════════════
// Aggregator
// ══════════════════════════════════════════════════

async function testAggregator(): Promise<void> {
	await runSuite("aggregator: empty orders → zero metrics", () => {
		const m = aggregateOrdersIntoMetrics([], ["30d"]);
		assertEqual(m.length, 1, "one window");
		assertEqual(m[0].revenue.total, 0, "zero revenue");
		assertEqual(m[0].revenue.order_count, 0, "zero orders");
		assertEqual(m[0].revenue.average_order_value, 0, "zero AOV");
	});

	await runSuite("aggregator: revenue + AOV from orders", () => {
		const now = new Date();
		const orders = [
			sampleOrder({ id: 1, total_price: "100.00", created_at: daysAgo(now, 5) }),
			sampleOrder({ id: 2, total_price: "200.00", created_at: daysAgo(now, 10) }),
			sampleOrder({ id: 3, total_price: "300.00", created_at: daysAgo(now, 15) }),
		];
		const m = aggregateOrdersIntoMetrics(orders, ["30d"]);
		assertEqual(m[0].revenue.total, 600, "total revenue");
		assertEqual(m[0].revenue.order_count, 3, "order count");
		assertEqual(m[0].revenue.average_order_value, 200, "AOV");
	});

	await runSuite("aggregator: filters orders outside window", () => {
		const now = new Date();
		const orders = [
			sampleOrder({ id: 1, total_price: "100.00", created_at: daysAgo(now, 2) }),
			sampleOrder({ id: 2, total_price: "999.00", created_at: daysAgo(now, 60) }), // outside 30d
		];
		const m = aggregateOrdersIntoMetrics(orders, ["30d"]);
		assertEqual(m[0].revenue.total, 100, "outside-window excluded");
		assertEqual(m[0].revenue.order_count, 1, "only 1 in window");
	});

	await runSuite("aggregator: refund metrics from refunds[]", () => {
		const now = new Date();
		const orders = [
			sampleOrder({
				id: 1,
				total_price: "200.00",
				created_at: daysAgo(now, 5),
				refunds: [
					{
						id: 99,
						created_at: daysAgo(now, 4),
						transactions: [{ amount: "50.00", currency: "USD" }],
					},
				],
			}),
		];
		const m = aggregateOrdersIntoMetrics(orders, ["30d"]);
		assertGreater(m[0].refunds.total_amount, 0, "refund amount captured");
		assertGreater(m[0].refunds.refund_count, 0, "refund count > 0");
	});

	await runSuite("aggregator: produces multiple windows", () => {
		const now = new Date();
		const orders = [sampleOrder({ id: 1, total_price: "100", created_at: daysAgo(now, 5) })];
		const m = aggregateOrdersIntoMetrics(orders, ["7d", "30d", "90d"]);
		assertEqual(m.length, 3, "three windows");
		assertEqual(m[0].window, "7d", "first is 7d");
		assertEqual(m[1].window, "30d", "second is 30d");
		assertEqual(m[2].window, "90d", "third is 90d");
	});
}

// ══════════════════════════════════════════════════
// Mapper
// ══════════════════════════════════════════════════

async function testMapper(): Promise<void> {
	await runSuite("mapper: empty metrics → all nulls", () => {
		const inputs = mapToBusinessInputs([]);
		assertEqual(inputs.monthly_revenue, null, "no revenue");
		assertEqual(inputs.average_order_value, null, "no AOV");
		assertEqual(inputs.monthly_transactions, null, "no tx");
	});

	await runSuite("mapper: 30d window → projects to monthly", () => {
		const now = new Date();
		const orders = [
			sampleOrder({ id: 1, total_price: "1000", created_at: daysAgo(now, 5) }),
			sampleOrder({ id: 2, total_price: "1000", created_at: daysAgo(now, 10) }),
			sampleOrder({ id: 3, total_price: "1000", created_at: daysAgo(now, 15) }),
		];
		const metrics = aggregateOrdersIntoMetrics(orders, ["30d"]);
		const inputs = mapToBusinessInputs(metrics);
		assertEqual(inputs.monthly_revenue, 3000, "30d → monthly (1:1)");
		assertEqual(inputs.monthly_transactions, 3, "monthly tx");
		assertEqual(inputs.average_order_value, 1000, "AOV");
	});

	await runSuite("mapper: 7d window scales up to monthly", () => {
		const now = new Date();
		const orders = [
			sampleOrder({ id: 1, total_price: "100", created_at: daysAgo(now, 2) }),
		];
		// Only 7d available
		const metrics = aggregateOrdersIntoMetrics(orders, ["7d"]);
		const inputs = mapToBusinessInputs(metrics);
		// 100 over 7d → ~428/month (100 * 30/7)
		assertGreater(inputs.monthly_revenue || 0, 400, "scaled up");
		assert((inputs.monthly_revenue || 0) < 500, "but not crazy");
	});

	await runSuite("determineBasisType: data_driven when all real", () => {
		const t = determineBasisType({
			monthly_revenue: 1000,
			average_order_value: 100,
			monthly_transactions: 10,
			conversion_rate: null,
			chargeback_rate: null,
			churn_rate: null,
		});
		assertEqual(t, "data_driven", "all 3 real → data_driven");
	});

	await runSuite("determineBasisType: heuristic when none", () => {
		const t = determineBasisType({
			monthly_revenue: null,
			average_order_value: null,
			monthly_transactions: null,
			conversion_rate: null,
			chargeback_rate: null,
			churn_rate: null,
		});
		assertEqual(t, "heuristic", "no real → heuristic");
	});

	await runSuite("determineBasisType: mixed when partial", () => {
		const t = determineBasisType({
			monthly_revenue: 1000,
			average_order_value: null,
			monthly_transactions: null,
			conversion_rate: null,
			chargeback_rate: null,
			churn_rate: null,
		});
		assertEqual(t, "mixed", "1 real → mixed");
	});
}

// ══════════════════════════════════════════════════
// GraphQL client
// ══════════════════════════════════════════════════

async function testGraphQL(): Promise<void> {
	await runSuite("shopifyGraphQL: happy path + parses cost", async () => {
		const restore = installFetchMock([
			{
				match: (u) => u.includes("/graphql.json"),
				respond: () => ({
					status: 200,
					body: {
						data: { shop: { name: "Test" } },
						extensions: {
							cost: {
								requestedQueryCost: 10,
								actualQueryCost: 8,
								throttleStatus: {
									maximumAvailable: 1000,
									currentlyAvailable: 992,
									restoreRate: 50,
								},
							},
						},
					},
				}),
			},
		]);
		try {
			const r = await shopifyGraphQL(CREDS, "{ shop { name } }");
			assertEqual(r.errors.length, 0, "no errors");
			assertEqual((r.data as any).shop.name, "Test", "data parsed");
			assert(r.cost !== null, "cost present");
			assertEqual(r.cost!.actualQueryCost, 8, "actual cost");
		} finally {
			restore();
		}
	});

	await runSuite("shopifyGraphQL: surfaces GraphQL errors[]", async () => {
		const restore = installFetchMock([
			{
				match: (u) => u.includes("/graphql.json"),
				respond: () => ({
					status: 200,
					body: {
						errors: [{ message: "Field 'badField' doesn't exist" }],
						data: null,
					},
				}),
			},
		]);
		try {
			const r = await shopifyGraphQL(CREDS, "{ badField }");
			assert(r.errors.length > 0, "errors captured");
			assert(r.errors[0].includes("doesn't exist"), "carries message");
		} finally {
			restore();
		}
	});

	await runSuite("shopifyGraphQL: 401 → error", async () => {
		const restore = installFetchMock([
			{ match: () => true, respond: () => ({ status: 401, body: {} }) },
		]);
		try {
			const r = await shopifyGraphQL(CREDS, "{ shop { name } }");
			assertEqual(r.data, null, "no data");
			assert(r.errors[0].includes("401"), "status surfaced");
		} finally {
			restore();
		}
	});

	await runSuite("mapGraphQLOrderToRaw: maps core fields", () => {
		const node = {
			id: "gid://shopify/Order/12345",
			createdAt: "2026-05-01T10:00:00Z",
			cancelledAt: null,
			displayFinancialStatus: "PAID",
			displayFulfillmentStatus: "FULFILLED",
			totalPriceSet: { shopMoney: { amount: "150.00", currencyCode: "USD" } },
			totalDiscountsSet: { shopMoney: { amount: "10.00" } },
			customerJourneySummary: {
				lastVisit: { landingPage: { url: "/landing" }, referrerUrl: "https://google.com" },
			},
			discountCodes: ["WELCOME10"],
			paymentGatewayNames: ["shopify_payments"],
			transactions: [
				{
					kind: "SALE",
					status: "SUCCESS",
					amountSet: { shopMoney: { amount: "150.00" } },
				},
			],
			refunds: [],
		};
		const raw = mapGraphQLOrderToRaw(node);
		assertEqual(raw.id, 12345, "gid parsed to numeric");
		assertEqual(raw.total_price, "150.00", "total price");
		assertEqual(raw.currency, "USD", "currency");
		assertEqual(raw.financial_status, "paid", "lowercased");
		assertEqual(raw.fulfillment_status, "fulfilled", "lowercased");
		assertEqual(raw.landing_site, "/landing", "landing");
		assertEqual(raw.referring_site, "https://google.com", "referrer");
		assertEqual(raw.gateway, "shopify_payments", "gateway");
		assertEqual(raw.discount_codes.length, 1, "discount mapped");
		assertEqual(raw.transactions.length, 1, "one tx");
		assertEqual(raw.transactions[0].kind, "sale", "tx kind lowercased");
	});

	await runSuite("mapGraphQLOrderToRaw: maps refund transactions", () => {
		const node = {
			id: "gid://shopify/Order/9",
			createdAt: "2026-05-01T10:00:00Z",
			cancelledAt: null,
			displayFinancialStatus: "PARTIALLY_REFUNDED",
			displayFulfillmentStatus: null,
			totalPriceSet: { shopMoney: { amount: "200.00", currencyCode: "BRL" } },
			totalDiscountsSet: { shopMoney: { amount: "0" } },
			customerJourneySummary: null,
			discountCodes: [],
			paymentGatewayNames: ["pagseguro"],
			transactions: [],
			refunds: [
				{
					id: "gid://shopify/Refund/77",
					createdAt: "2026-05-02T10:00:00Z",
					transactions: {
						edges: [
							{ node: { amountSet: { shopMoney: { amount: "50.00", currencyCode: "BRL" } } } },
						],
					},
				},
			],
		};
		const raw = mapGraphQLOrderToRaw(node);
		assertEqual(raw.refunds.length, 1, "one refund");
		assertEqual(raw.refunds[0].id, 77, "refund id parsed");
		assertEqual(raw.refunds[0].transactions[0].amount, "50.00", "refund tx amount");
		assertEqual(raw.refunds[0].transactions[0].currency, "BRL", "refund tx currency");
	});

	await runSuite("fetchOrdersGraphQL: single page", async () => {
		const restore = installFetchMock([
			{
				match: (u) => u.includes("/graphql.json"),
				respond: () => ({
					status: 200,
					body: {
						data: {
							orders: {
								pageInfo: { hasNextPage: false, endCursor: null },
								edges: [
									{
										node: {
											id: "gid://shopify/Order/1",
											createdAt: "2026-05-01T00:00:00Z",
											cancelledAt: null,
											displayFinancialStatus: "PAID",
											displayFulfillmentStatus: "FULFILLED",
											totalPriceSet: {
												shopMoney: { amount: "100.00", currencyCode: "USD" },
											},
											totalDiscountsSet: { shopMoney: { amount: "0" } },
											customerJourneySummary: null,
											discountCodes: [],
											paymentGatewayNames: ["shopify_payments"],
											transactions: [],
											refunds: [],
										},
									},
								],
							},
						},
						extensions: {
							cost: {
								requestedQueryCost: 100,
								actualQueryCost: 80,
								throttleStatus: {
									maximumAvailable: 1000,
									currentlyAvailable: 920,
									restoreRate: 50,
								},
							},
						},
					},
				}),
			},
		]);
		try {
			const r = await fetchOrdersGraphQL(CREDS, new Date("2026-04-01"), new Date("2026-06-01"));
			assertEqual(r.orders.length, 1, "one order");
			assertEqual(r.truncated, false, "not truncated");
			assertEqual(r.errors.length, 0, "no errors");
			assertEqual(r.totalCost, 80, "cost summed");
		} finally {
			restore();
		}
	});

	await runSuite("fetchOrdersGraphQL: follows cursor pagination", async () => {
		let callCount = 0;
		const restore = installFetchMock([
			{
				match: (u) => u.includes("/graphql.json"),
				respond: () => {
					callCount++;
					const hasNext = callCount < 2;
					return {
						status: 200,
						body: {
							data: {
								orders: {
									pageInfo: {
										hasNextPage: hasNext,
										endCursor: hasNext ? "cursor_page2" : null,
									},
									edges: [
										{
											node: {
												id: `gid://shopify/Order/${callCount}`,
												createdAt: "2026-05-01T00:00:00Z",
												cancelledAt: null,
												displayFinancialStatus: "PAID",
												displayFulfillmentStatus: null,
												totalPriceSet: {
													shopMoney: { amount: "50", currencyCode: "USD" },
												},
												totalDiscountsSet: { shopMoney: { amount: "0" } },
												customerJourneySummary: null,
												discountCodes: [],
												paymentGatewayNames: [],
												transactions: [],
												refunds: [],
											},
										},
									],
								},
							},
						},
					};
				},
			},
		]);
		try {
			const r = await fetchOrdersGraphQL(CREDS, new Date(), new Date());
			assertEqual(r.orders.length, 2, "two pages");
			assertEqual(callCount, 2, "two calls");
		} finally {
			restore();
		}
	});
}

// ══════════════════════════════════════════════════
// Webhook signature verification
// ══════════════════════════════════════════════════

async function testWebhookSignature(): Promise<void> {
	const SECRET = "test-shared-secret";
	const sign = (body: string) =>
		crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("base64");

	await runSuite("verifyShopifySignature: valid signature", () => {
		const body = JSON.stringify({ id: 1, total_price: "10.00" });
		const r = verifyShopifySignature(body, sign(body), SECRET);
		assertEqual(r.valid, true, "accepts valid signature");
	});

	await runSuite("verifyShopifySignature: tampered body rejected", () => {
		const original = JSON.stringify({ id: 1, total_price: "10.00" });
		const tampered = JSON.stringify({ id: 1, total_price: "99999.00" });
		const r = verifyShopifySignature(tampered, sign(original), SECRET);
		assertEqual(r.valid, false, "rejects tampered body");
		assertEqual(r.error, "signature_mismatch", "error reason");
	});

	await runSuite("verifyShopifySignature: missing signature header", () => {
		const r = verifyShopifySignature("body", null, SECRET);
		assertEqual(r.valid, false, "rejects missing header");
		assertEqual(r.error, "missing_signature", "error reason");
	});

	await runSuite("verifyShopifySignature: no secret configured", () => {
		const body = "body";
		const r = verifyShopifySignature(body, sign(body), "");
		assertEqual(r.valid, false, "rejects without secret");
		assertEqual(r.error, "webhook_secret_not_configured", "error reason");
	});

	await runSuite("verifyShopifySignature: wrong secret rejected", () => {
		const body = "body";
		const wrong = crypto.createHmac("sha256", "wrong-secret").update(body, "utf8").digest("base64");
		const r = verifyShopifySignature(body, wrong, SECRET);
		assertEqual(r.valid, false, "rejects wrong-secret signature");
	});

	await runSuite("verifyShopifySignature: malformed signature header", () => {
		const r = verifyShopifySignature("body", "not-base64!!!", SECRET);
		assertEqual(r.valid, false, "rejects malformed");
	});
}

// ══════════════════════════════════════════════════
// OAuth callback HMAC verification
// ══════════════════════════════════════════════════

async function testOAuthCallbackHmac(): Promise<void> {
	const SECRET = "shopify-client-secret";

	function signQuery(params: Record<string, string>): string {
		const entries = Object.entries(params).sort(([a], [b]) =>
			a < b ? -1 : a > b ? 1 : 0,
		);
		const message = entries.map(([k, v]) => `${k}=${v}`).join("&");
		return crypto.createHmac("sha256", SECRET).update(message, "utf8").digest("hex");
	}

	await runSuite("callback HMAC: valid signature accepted", () => {
		const params = {
			code: "abc123",
			shop: "test-shop.myshopify.com",
			state: "signedstate",
			timestamp: "1700000000",
			host: "dGVzdA==",
		};
		const hmac = signQuery(params);
		const sp = new URLSearchParams({ ...params, hmac });
		assertEqual(verifyShopifyCallbackHmac(sp, SECRET), true, "valid accepted");
	});

	await runSuite("callback HMAC: tampered code rejected", () => {
		const params = {
			code: "abc123",
			shop: "test-shop.myshopify.com",
			state: "signedstate",
			timestamp: "1700000000",
		};
		const hmac = signQuery(params);
		const sp = new URLSearchParams({
			...params,
			code: "DIFFERENT",
			hmac,
		});
		assertEqual(verifyShopifyCallbackHmac(sp, SECRET), false, "tamper rejected");
	});

	await runSuite("callback HMAC: tampered shop rejected", () => {
		const params = {
			code: "abc123",
			shop: "test-shop.myshopify.com",
			state: "signedstate",
			timestamp: "1700000000",
		};
		const hmac = signQuery(params);
		const sp = new URLSearchParams({
			...params,
			shop: "evil.myshopify.com",
			hmac,
		});
		assertEqual(verifyShopifyCallbackHmac(sp, SECRET), false, "shop swap rejected");
	});

	await runSuite("callback HMAC: missing hmac param rejected", () => {
		const sp = new URLSearchParams({ code: "x", shop: "s.myshopify.com" });
		assertEqual(verifyShopifyCallbackHmac(sp, SECRET), false, "missing rejected");
	});

	await runSuite("callback HMAC: empty secret rejects all", () => {
		const params = { code: "x", shop: "s.myshopify.com" };
		const hmac = signQuery(params);
		const sp = new URLSearchParams({ ...params, hmac });
		assertEqual(verifyShopifyCallbackHmac(sp, ""), false, "no secret rejected");
	});

	await runSuite("callback HMAC: signature param excluded from canonical message", () => {
		// Shopify spec: both `hmac` and `signature` (legacy) are excluded.
		const params = {
			code: "abc123",
			shop: "test-shop.myshopify.com",
			timestamp: "1700000000",
		};
		const hmac = signQuery(params);
		const sp = new URLSearchParams({
			...params,
			signature: "legacy-value-should-be-ignored",
			hmac,
		});
		assertEqual(verifyShopifyCallbackHmac(sp, SECRET), true, "signature excluded");
	});
}

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

function sampleOrder(overrides: Partial<ShopifyRawOrder> = {}): ShopifyRawOrder {
	return {
		id: 1,
		created_at: new Date().toISOString(),
		total_price: "100.00",
		currency: "USD",
		financial_status: "paid",
		fulfillment_status: "fulfilled",
		cancelled_at: null,
		landing_site: null,
		referring_site: null,
		total_discounts: "0.00",
		discount_codes: [],
		gateway: "shopify_payments",
		refunds: [],
		transactions: [],
		line_items: [],
		...overrides,
	} as ShopifyRawOrder;
}

function daysAgo(now: Date, n: number): string {
	return new Date(now.getTime() - n * 86400000).toISOString();
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

(async () => {
	console.log("Shopify adapter");
	await testErrorClassifiers();
	await testApiVersion();
	await testVerifyConnection();
	await testFetchOrders();
	await testExtraEndpoints();
	await testAggregator();
	await testMapper();
	await testGraphQL();
	await testWebhookSignature();
	await testOAuthCallbackHmac();

	console.log(`\n${suitesPassed}/${suitesPassed + suitesFailed} passed`);
	if (suitesFailed > 0) {
		for (const f of failures) console.error(f);
		process.exit(1);
	}
})();
