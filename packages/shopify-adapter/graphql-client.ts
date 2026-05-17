import {
	ShopifyCredentials,
	ShopifyRawOrder,
} from './types';
import {
	API_VERSION,
	detectDeprecationWarning,
} from './client';

// ──────────────────────────────────────────────
// Shopify GraphQL Admin API Client — Read-Only
//
// Companion to the REST client (./client.ts). Shopify's strategic
// direction is GraphQL; REST endpoints are being capped or removed
// over time (notably, REST Orders deprecates after 2024-10 for new
// apps). This file ports the read-only paths we depend on.
//
// Differences from REST:
//   - Single endpoint: POST /admin/api/{version}/graphql.json
//   - Pagination: pageInfo.hasNextPage + endCursor → next `after:`
//   - Rate limit: cost-based (1000-point bucket, refills 50/s)
//   - Errors: GraphQL `errors[]` may coexist with partial `data`
//
// We deliberately stay narrow: only the queries the impact pipeline
// actually consumes. Extend by adding a new typed query — do not
// turn this into a general-purpose Shopify SDK.
// ──────────────────────────────────────────────

const REQUEST_TIMEOUT = 15000; // GraphQL queries can be heavier than REST

export interface ShopifyGraphQLCost {
	requestedQueryCost: number;
	actualQueryCost: number;
	throttleStatus: {
		maximumAvailable: number;
		currentlyAvailable: number;
		restoreRate: number;
	};
}

export interface ShopifyGraphQLResult<T> {
	data: T | null;
	errors: string[];
	cost: ShopifyGraphQLCost | null;
	deprecation: string | null;
}

/**
 * Low-level GraphQL request. Returns `data`, an `errors` array, and the
 * parsed cost extension when present. Never throws on protocol errors —
 * callers branch on `errors.length`.
 */
export async function shopifyGraphQL<T>(
	credentials: ShopifyCredentials,
	query: string,
	variables: Record<string, any> = {},
): Promise<ShopifyGraphQLResult<T>> {
	const url = `https://${credentials.shop_domain}/admin/api/${API_VERSION}/graphql.json`;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'X-Shopify-Access-Token': credentials.access_token,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ query, variables }),
			signal: controller.signal,
		});

		const deprecation = detectDeprecationWarning(response.headers);

		if (!response.ok) {
			return {
				data: null,
				errors: [`HTTP ${response.status}`],
				cost: null,
				deprecation,
			};
		}

		const payload: any = await response.json().catch(() => null);
		if (!payload) {
			return { data: null, errors: ['data_parsing_error'], cost: null, deprecation };
		}

		const errs: string[] = [];
		if (Array.isArray(payload.errors)) {
			for (const e of payload.errors) {
				if (typeof e === 'string') errs.push(e);
				else if (e && typeof e.message === 'string') errs.push(e.message);
				else errs.push(JSON.stringify(e));
			}
		}

		const cost: ShopifyGraphQLCost | null = payload.extensions?.cost ?? null;

		return {
			data: (payload.data ?? null) as T | null,
			errors: errs,
			cost,
			deprecation,
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { data: null, errors: [msg], cost: null, deprecation: null };
	} finally {
		clearTimeout(timeout);
	}
}

// ──────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────

const ORDERS_QUERY = `
query Orders($query: String!, $first: Int!, $after: String) {
	orders(query: $query, first: $first, after: $after, sortKey: CREATED_AT) {
		pageInfo { hasNextPage endCursor }
		edges {
			node {
				id
				name
				createdAt
				cancelledAt
				displayFinancialStatus
				displayFulfillmentStatus
				totalPriceSet { shopMoney { amount currencyCode } }
				totalDiscountsSet { shopMoney { amount } }
				customerJourneySummary {
					lastVisit { landingPage { url } referrerUrl }
				}
				discountCodes
				paymentGatewayNames
				transactions { kind status amountSet { shopMoney { amount } } }
				refunds {
					id
					createdAt
					transactions(first: 50) {
						edges { node { amountSet { shopMoney { amount currencyCode } } } }
					}
				}
			}
		}
	}
}`;

interface OrdersQueryResult {
	orders: {
		pageInfo: { hasNextPage: boolean; endCursor: string | null };
		edges: { node: any }[];
	};
}

/**
 * Fetch orders within a date range via the GraphQL Admin API.
 * Returns the same `ShopifyRawOrder` shape as the REST `fetchOrders`,
 * so it can drop into the existing aggregator.
 */
export async function fetchOrdersGraphQL(
	credentials: ShopifyCredentials,
	since: Date,
	until: Date,
	maxOrders: number = 2500,
): Promise<{
	orders: ShopifyRawOrder[];
	errors: string[];
	truncated: boolean;
	totalCost: number;
}> {
	const errors: string[] = [];
	const all: ShopifyRawOrder[] = [];
	let totalCost = 0;
	let after: string | null = null;
	let pageCount = 0;
	let truncated = false;

	const PAGE_SIZE = 100; // Shopify GraphQL max is 250 but heavier queries cost more
	const MAX_PAGES = Math.ceil(maxOrders / PAGE_SIZE);

	const queryString = `created_at:>='${since.toISOString()}' AND created_at:<='${until.toISOString()}'`;

	while (pageCount < MAX_PAGES) {
		const res: ShopifyGraphQLResult<OrdersQueryResult> = await shopifyGraphQL<OrdersQueryResult>(
			credentials,
			ORDERS_QUERY,
			{ query: queryString, first: PAGE_SIZE, after },
		);

		if (pageCount === 0 && res.deprecation) errors.push(res.deprecation);

		if (res.errors.length > 0 || !res.data) {
			errors.push(...res.errors);
			break;
		}

		if (res.cost) totalCost += res.cost.actualQueryCost;

		const data: OrdersQueryResult = res.data;
		const edges = data.orders?.edges ?? [];
		for (const edge of edges) {
			all.push(mapGraphQLOrderToRaw(edge.node));
		}

		const info: { hasNextPage: boolean; endCursor: string | null } | undefined = data.orders?.pageInfo;
		if (!info?.hasNextPage || !info.endCursor) break;
		after = info.endCursor;
		pageCount++;

		// Cost-based throttle: if we're close to the bucket bottom, wait
		// for refill before next page. Shopify default refill is 50/s.
		if (res.cost && res.cost.throttleStatus.currentlyAvailable < 200) {
			await delay(1000);
		}
	}

	if (after && pageCount >= MAX_PAGES) {
		truncated = true;
		errors.push(
			`GraphQL orders truncated at ${pageCount} pages (~${pageCount * PAGE_SIZE} records).`,
		);
	}

	return { orders: all, errors, truncated, totalCost };
}

// ──────────────────────────────────────────────
// Mappers — GraphQL node → REST-shaped raw order
// ──────────────────────────────────────────────

/**
 * Map a GraphQL Order node back into the REST `ShopifyRawOrder`
 * shape so downstream aggregator code doesn't need to fork.
 *
 * Exported for unit testing.
 */
export function mapGraphQLOrderToRaw(node: any): ShopifyRawOrder {
	const totalPrice = node?.totalPriceSet?.shopMoney?.amount ?? '0.00';
	const currency = node?.totalPriceSet?.shopMoney?.currencyCode ?? 'USD';
	const totalDiscounts = node?.totalDiscountsSet?.shopMoney?.amount ?? '0.00';

	const landing = node?.customerJourneySummary?.lastVisit?.landingPage?.url ?? null;
	const referring = node?.customerJourneySummary?.lastVisit?.referrerUrl ?? null;

	const refunds = (node?.refunds || []).map((r: any) => ({
		id: parseIdFromGid(r.id),
		created_at: r.createdAt,
		transactions: (r.transactions?.edges || []).map((e: any) => ({
			amount: e.node?.amountSet?.shopMoney?.amount ?? '0',
			currency: e.node?.amountSet?.shopMoney?.currencyCode ?? currency,
		})),
	}));

	const transactions = (node?.transactions || []).map((t: any) => ({
		id: 0,
		kind: (t.kind || '').toLowerCase(),
		status: (t.status || '').toLowerCase(),
		amount: t.amountSet?.shopMoney?.amount ?? '0',
		currency,
		created_at: node.createdAt,
		gateway: (node?.paymentGatewayNames?.[0] || '').toString(),
	}));

	return {
		id: parseIdFromGid(node.id),
		created_at: node.createdAt,
		total_price: totalPrice,
		currency,
		financial_status: (node?.displayFinancialStatus || '').toLowerCase(),
		fulfillment_status: node?.displayFulfillmentStatus
			? String(node.displayFulfillmentStatus).toLowerCase()
			: null,
		cancelled_at: node?.cancelledAt ?? null,
		landing_site: landing,
		referring_site: referring,
		total_discounts: totalDiscounts,
		discount_codes: Array.isArray(node?.discountCodes)
			? node.discountCodes.map((c: string) => ({ code: c, amount: '0', type: '' }))
			: [],
		gateway: (node?.paymentGatewayNames?.[0] || '').toString(),
		refunds,
		transactions,
	} as ShopifyRawOrder;
}

/** Extract numeric id from a Shopify GID like `gid://shopify/Order/12345`. */
function parseIdFromGid(gid: unknown): number {
	if (typeof gid !== 'string') return 0;
	const m = gid.match(/(\d+)$/);
	return m ? parseInt(m[1], 10) : 0;
}

function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}
