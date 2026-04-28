import type { StripeSnapshotData } from "../../packages/integrations/types";

// ──────────────────────────────────────────────
// Stripe Revenue Poller — Connect API v1
//
// Reads: charges, subscriptions, disputes, refunds over 30d window.
// Uses Stripe-Account header for connected-account access via
// OAuth Connect tokens. Read-only.
//
// Failure modes: returns non-fatal errors in the result's `errors`
// array; the caller logs and continues. Never throws.
// ──────────────────────────────────────────────

const STRIPE_API_BASE = "https://api.stripe.com/v1";

export interface StripeCredentials {
	access_token: string;
	stripe_user_id: string;
}

export interface StripePollResult {
	data: StripeSnapshotData;
	errors: string[];
	duration_ms: number;
}

interface StripeListResponse<T> {
	object: "list";
	data: T[];
	has_more: boolean;
	url: string;
}

interface StripeCharge {
	id: string;
	amount: number;
	currency: string;
	status: "succeeded" | "pending" | "failed";
	created: number;
}

interface StripeSubscription {
	id: string;
	status: string;
	created: number;
	items: {
		data: {
			price: {
				unit_amount: number | null;
				recurring: { interval: string; interval_count: number } | null;
			};
			quantity: number;
		}[];
	};
}

interface StripeDispute {
	id: string;
	amount: number;
	created: number;
}

interface StripeRefund {
	id: string;
	amount: number;
	created: number;
}

// ── HTTP helpers ─────────────────────────────

async function stripeGet<T>(
	path: string,
	credentials: StripeCredentials,
	timeoutMs = 15_000,
): Promise<{ ok: boolean; data?: T; error?: string; status: number }> {
	try {
		const url = `${STRIPE_API_BASE}${path}`;
		const res = await fetch(url, {
			method: "GET",
			headers: {
				"Authorization": `Bearer ${credentials.access_token}`,
				"Stripe-Account": credentials.stripe_user_id,
				"Content-Type": "application/x-www-form-urlencoded",
			},
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

/**
 * Fetch all items from a paginated Stripe list endpoint.
 * Follows `has_more` / `starting_after` pagination up to maxPages.
 */
async function stripeListAll<T extends { id: string }>(
	basePath: string,
	credentials: StripeCredentials,
	maxPages = 10,
): Promise<{ items: T[]; errors: string[] }> {
	const items: T[] = [];
	const errors: string[] = [];
	let startingAfter: string | null = null;
	let page = 0;

	while (page < maxPages) {
		const separator: string = basePath.includes("?") ? "&" : "?";
		const paginationParam: string = startingAfter ? `${separator}starting_after=${startingAfter}` : "";
		const res: { ok: boolean; data?: StripeListResponse<T>; error?: string; status: number } = await stripeGet<StripeListResponse<T>>(
			`${basePath}${paginationParam}`,
			credentials,
		);

		if (!res.ok) {
			errors.push(res.error ?? "unknown error");
			break;
		}

		const list: StripeListResponse<T> | undefined = res.data;
		if (!list || !list.data) break;

		items.push(...list.data);

		if (!list.has_more || list.data.length === 0) break;
		startingAfter = list.data[list.data.length - 1].id;
		page++;
	}

	return { items, errors };
}

// ── Main poller ──────────────────────────────

export async function pollStripeData(
	credentials: StripeCredentials,
): Promise<StripePollResult> {
	const started = Date.now();
	const errors: string[] = [];

	const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);

	// 1. Fetch all charges (last 30d) — both succeeded and failed
	const allChargesResult = await stripeListAll<StripeCharge>(
		`/charges?created[gte]=${thirtyDaysAgo}&limit=100`,
		credentials,
	);
	errors.push(...allChargesResult.errors);
	const allCharges = allChargesResult.items;

	const successfulCharges = allCharges.filter(c => c.status === "succeeded");
	const failedCharges = allCharges.filter(c => c.status === "failed");
	const totalRevenue = successfulCharges.reduce((sum, c) => sum + c.amount, 0) / 100; // cents to dollars
	const currency = successfulCharges[0]?.currency?.toUpperCase() || "USD";
	const chargeCount = allCharges.length;
	const failedPaymentRate = chargeCount > 0 ? failedCharges.length / chargeCount : 0;

	// 2. Fetch active subscriptions
	const activeSubsResult = await stripeListAll<StripeSubscription>(
		`/subscriptions?status=active&limit=100`,
		credentials,
	);
	errors.push(...activeSubsResult.errors);
	const activeSubs = activeSubsResult.items;
	const activeCount = activeSubs.length;

	// 3. Fetch canceled subscriptions (last 30d)
	const canceledSubsResult = await stripeListAll<StripeSubscription>(
		`/subscriptions?status=canceled&created[gte]=${thirtyDaysAgo}&limit=100`,
		credentials,
	);
	errors.push(...canceledSubsResult.errors);
	const canceledSubs = canceledSubsResult.items;
	const canceledCount = canceledSubs.length;

	// 4. Compute MRR from active subscriptions
	let mrr: number | null = null;
	if (activeSubs.length > 0) {
		mrr = 0;
		for (const sub of activeSubs) {
			for (const item of sub.items?.data || []) {
				const unitAmount = (item.price?.unit_amount ?? 0) / 100; // cents to dollars
				const quantity = item.quantity || 1;
				const interval = item.price?.recurring?.interval;
				const intervalCount = item.price?.recurring?.interval_count ?? 1;

				if (interval === "year") {
					mrr += (unitAmount * quantity) / (12 * intervalCount);
				} else if (interval === "month") {
					mrr += (unitAmount * quantity) / intervalCount;
				} else if (interval === "week") {
					mrr += (unitAmount * quantity * 52) / (12 * intervalCount);
				} else if (interval === "day") {
					mrr += (unitAmount * quantity * 365) / (12 * intervalCount);
				} else {
					// Default to monthly
					mrr += unitAmount * quantity;
				}
			}
		}
		mrr = Math.round(mrr * 100) / 100;
	}

	// 5. Compute churn rate
	const churnRate = (activeCount + canceledCount) > 0
		? canceledCount / (activeCount + canceledCount)
		: null;

	// 6. Fetch disputes (last 30d)
	const disputesResult = await stripeListAll<StripeDispute>(
		`/disputes?created[gte]=${thirtyDaysAgo}&limit=100`,
		credentials,
	);
	errors.push(...disputesResult.errors);
	const disputeCount = disputesResult.items.length;
	const disputeRate = chargeCount > 0 ? disputeCount / chargeCount : 0;

	// 7. Fetch refunds (last 30d)
	const refundsResult = await stripeListAll<StripeRefund>(
		`/refunds?created[gte]=${thirtyDaysAgo}&limit=100`,
		credentials,
	);
	errors.push(...refundsResult.errors);
	const totalRefunded = refundsResult.items.reduce((sum, r) => sum + r.amount, 0) / 100;
	const refundRate = totalRevenue > 0 ? totalRefunded / totalRevenue : 0;

	// 8. Build snapshot
	const data: StripeSnapshotData = {
		revenue: { total: totalRevenue, currency, charge_count: chargeCount },
		mrr,
		churn_rate: churnRate,
		refund_rate: Math.round(refundRate * 10000) / 10000,
		dispute_rate: Math.round(disputeRate * 10000) / 10000,
		failed_payment_rate: Math.round(failedPaymentRate * 10000) / 10000,
		subscriptions: activeCount > 0 || canceledCount > 0
			? { active: activeCount, canceled_30d: canceledCount }
			: null,
	};

	return {
		data,
		errors,
		duration_ms: Date.now() - started,
	};
}

// ── Connection verification ──────────────────

export async function verifyStripeConnection(
	credentials: StripeCredentials,
): Promise<{ ok: boolean; error?: string }> {
	const res = await stripeGet<{ id?: string }>(
		"/account",
		credentials,
	);
	if (!res.ok) {
		if (res.status === 401 || res.status === 403) {
			return { ok: false, error: "Invalid Stripe credentials" };
		}
		return { ok: false, error: res.error ?? `HTTP ${res.status}` };
	}
	return { ok: true };
}
