// ──────────────────────────────────────────────
// Mercado Pago API Helper
//
// Thin typed wrapper over the MP REST API. Raw fetch instead of the
// `mercadopago` npm SDK because:
//   1. The SDK is mid-migration (v2 → v3) and the official BR docs
//      still target v2 in many places; raw fetch sidesteps that drift.
//   2. Mirrors src/libs/paddle-api.ts which is also raw fetch.
//   3. Lets us own retry/timeout/headers behavior explicitly.
//
// Auth: Bearer access token from MP_ACCESS_TOKEN (TEST-... or prod).
// Base URL: https://api.mercadopago.com (no path prefix — endpoints are
// versioned per resource, e.g. /preapproval, /v1/payments).
// ──────────────────────────────────────────────

import crypto from "node:crypto";

const BASE_URL = "https://api.mercadopago.com";

const getAccessToken = () => process.env.MP_ACCESS_TOKEN;

/** Whether MP server-side integration is configured. */
export function isMpConfigured(): boolean {
	return !!getAccessToken();
}

/** Whether MP is in test mode (TEST-prefixed credentials). */
export function isMpTestMode(): boolean {
	const t = getAccessToken();
	return !!t && t.startsWith("TEST-");
}

function headers(
	idempotencyKey?: string,
	deviceSessionId?: string,
): Record<string, string> {
	const h: Record<string, string> = {
		"Content-Type": "application/json",
		Authorization: `Bearer ${getAccessToken()}`,
	};
	// MP supports X-Idempotency-Key on POSTs that create resources.
	// Required when retrying create-payment / create-preapproval to
	// avoid double-charging. Caller decides the key (typically the
	// PixCharge.externalReference or a uuid).
	if (idempotencyKey) h["X-Idempotency-Key"] = idempotencyKey;
	// MP-recommended antifraud signal. MP.js drops MP_DEVICE_SESSION_ID
	// on `window` when initialized; we forward it as a request header so
	// MP's risk engine ties this server call to that browser session.
	// Approval-rate uplift is material — MP cites it explicitly in their
	// "improving approval rate" guide. Optional: requests without it
	// still succeed, just with a lower-confidence risk score.
	if (deviceSessionId) h["X-meli-session-id"] = deviceSessionId;
	return h;
}

async function mpRequest<T>(
	method: "GET" | "POST" | "PUT" | "DELETE",
	path: string,
	body?: unknown,
	idempotencyKey?: string,
	deviceSessionId?: string,
): Promise<T> {
	if (!isMpConfigured()) {
		throw new Error("MP_ACCESS_TOKEN not configured");
	}
	const res = await fetch(`${BASE_URL}${path}`, {
		method,
		headers: headers(idempotencyKey, deviceSessionId),
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!res.ok) {
		const errText = await res.text().catch(() => "");
		throw new Error(`MP ${method} ${path} failed: ${res.status} ${errText.slice(0, 400)}`);
	}
	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}

// ──────────────────────────────────────────────
// Customers
// ──────────────────────────────────────────────

export interface MpCustomer {
	id: string;
	email: string;
	first_name?: string;
	last_name?: string;
	identification?: { type: string; number: string };
	date_created?: string;
}

export async function getCustomer(customerId: string): Promise<MpCustomer> {
	return mpRequest<MpCustomer>("GET", `/v1/customers/${customerId}`);
}

/** Look up customer by email; returns null if MP has no match. */
export async function findCustomerByEmail(email: string): Promise<MpCustomer | null> {
	const json = await mpRequest<{ results: MpCustomer[] }>(
		"GET",
		`/v1/customers/search?email=${encodeURIComponent(email)}`,
	);
	return json.results?.[0] ?? null;
}

export async function createCustomer(input: {
	email: string;
	firstName?: string;
	lastName?: string;
	identification?: { type: "CPF" | "CNPJ"; number: string };
}): Promise<MpCustomer> {
	return mpRequest<MpCustomer>("POST", "/v1/customers", {
		email: input.email,
		first_name: input.firstName,
		last_name: input.lastName,
		identification: input.identification,
	});
}

/** Idempotent get-or-create. Avoids the "customer already exists" 400. */
export async function upsertCustomerByEmail(input: {
	email: string;
	firstName?: string;
	lastName?: string;
	identification?: { type: "CPF" | "CNPJ"; number: string };
}): Promise<MpCustomer> {
	const existing = await findCustomerByEmail(input.email);
	if (existing) return existing;
	return createCustomer(input);
}

// ──────────────────────────────────────────────
// PreApproval (recurring subscriptions)
//
// Two ways to subscribe:
//   1. PreApproval Plans (`/preapproval_plan`) — reusable plan template
//      that multiple users sign up to. We provision one per (planKey,
//      cadence) via admin sync. Subscriptions reference it by id.
//   2. PreApproval direct (`/preapproval`) — creates a subscription
//      either bound to a plan or with inline price config. We bind to
//      a plan id so price changes propagate uniformly.
// ──────────────────────────────────────────────

export type MpFrequencyType = "months" | "days";

export interface MpPreapprovalPlan {
	id: string;
	reason: string;
	status: "active" | "inactive" | "cancelled";
	auto_recurring: {
		frequency: number;
		frequency_type: MpFrequencyType;
		transaction_amount: number;
		currency_id: "BRL";
		repetitions?: number;
		billing_day?: number;
	};
	back_url?: string;
}

export async function createPreapprovalPlan(input: {
	reason: string; // human label visible in MP dashboard ("Vestigio Pro — Monthly")
	transactionAmountBrl: number; // reais decimal, NOT centavos
	frequency: number; // 1
	frequencyType: MpFrequencyType; // "months" for monthly, "days" for testing
	backUrl: string; // post-subscribe redirect
}): Promise<MpPreapprovalPlan> {
	return mpRequest<MpPreapprovalPlan>("POST", "/preapproval_plan", {
		reason: input.reason,
		auto_recurring: {
			frequency: input.frequency,
			frequency_type: input.frequencyType,
			transaction_amount: input.transactionAmountBrl,
			currency_id: "BRL",
		},
		back_url: input.backUrl,
	});
}

export async function getPreapprovalPlan(planId: string): Promise<MpPreapprovalPlan> {
	return mpRequest<MpPreapprovalPlan>("GET", `/preapproval_plan/${planId}`);
}

export async function updatePreapprovalPlan(
	planId: string,
	patch: Partial<{ reason: string; status: "active" | "inactive" }>,
): Promise<MpPreapprovalPlan> {
	return mpRequest<MpPreapprovalPlan>("PUT", `/preapproval_plan/${planId}`, patch);
}

export interface MpPreapproval {
	id: string;
	payer_id?: number;
	payer_email?: string;
	preapproval_plan_id?: string;
	reason: string;
	external_reference?: string;
	status: "pending" | "authorized" | "paused" | "cancelled";
	init_point?: string; // checkout URL when card tokenization is not pre-supplied
	auto_recurring: {
		frequency: number;
		frequency_type: MpFrequencyType;
		transaction_amount: number;
		currency_id: "BRL";
	};
	next_payment_date?: string;
	date_created?: string;
	last_modified?: string;
}

/**
 * Create a recurring subscription. Two modes:
 *
 * (a) Direct (with card token) — `cardTokenId` supplied → MP charges
 *     immediately and the subscription is `authorized` on success.
 *     Best UX (user stays in our domain via Bricks tokenization).
 *
 * (b) Indirect (redirect) — no token → MP returns `init_point` URL we
 *     redirect the user to. They tokenize on MP and come back.
 *     Fallback for when Bricks fails.
 */
export async function createPreapproval(input: {
	preapprovalPlanId: string;
	payerEmail: string;
	externalReference: string;
	backUrl: string;
	cardTokenId?: string;
	idempotencyKey: string;
	/** MP_DEVICE_SESSION_ID from MP.js — forwarded as X-meli-session-id */
	deviceSessionId?: string;
	/** Per-request webhook URL. Overrides the preapproval plan's
	 *  notification_url for this subscription only. Useful when the
	 *  plan was synced against one env (prod) but a request comes
	 *  from another (staging) and needs callbacks back to itself. */
	notificationUrl?: string;
}): Promise<MpPreapproval> {
	const body: Record<string, unknown> = {
		preapproval_plan_id: input.preapprovalPlanId,
		payer_email: input.payerEmail,
		external_reference: input.externalReference,
		back_url: input.backUrl,
	};
	if (input.cardTokenId) {
		body.card_token_id = input.cardTokenId;
		body.status = "authorized"; // tell MP to activate immediately
	}
	if (input.notificationUrl) {
		body.notification_url = input.notificationUrl;
	}
	return mpRequest<MpPreapproval>(
		"POST",
		"/preapproval",
		body,
		input.idempotencyKey,
		input.deviceSessionId,
	);
}

export async function getPreapproval(preapprovalId: string): Promise<MpPreapproval> {
	return mpRequest<MpPreapproval>("GET", `/preapproval/${preapprovalId}`);
}

/** Cancel a recurring subscription. Idempotent — repeat calls are 200. */
export async function cancelPreapproval(preapprovalId: string): Promise<MpPreapproval> {
	return mpRequest<MpPreapproval>("PUT", `/preapproval/${preapprovalId}`, {
		status: "cancelled",
	});
}

/** Pause / resume a subscription. */
export async function setPreapprovalStatus(
	preapprovalId: string,
	status: "paused" | "authorized",
): Promise<MpPreapproval> {
	return mpRequest<MpPreapproval>("PUT", `/preapproval/${preapprovalId}`, { status });
}

// ──────────────────────────────────────────────
// Payments (one-shot PIX + credit pack purchases)
//
// Subscription cycle renewals via card are handled by MP automatically
// (PreApproval triggers `authorized_payment` events the webhook
// consumes). This API is for:
//   - PIX renewal charges (we generate fresh PIX per cycle)
//   - Credit pack one-shot purchases
//   - Refund / capture follow-ups
// ──────────────────────────────────────────────

export interface MpPaymentResponse {
	id: number;
	status: "approved" | "pending" | "in_process" | "rejected" | "cancelled" | "refunded" | "charged_back";
	status_detail?: string;
	external_reference?: string;
	transaction_amount: number;
	currency_id: "BRL";
	payment_method_id: string; // "pix" | "visa" | "master" | ...
	payment_type_id?: string;  // "credit_card" | "bank_transfer" | ...
	date_created?: string;
	date_approved?: string | null;
	date_of_expiration?: string;
	payer?: {
		id?: string;
		email?: string;
	};
	point_of_interaction?: {
		transaction_data?: {
			qr_code?: string;        // BR Code EMV copy-paste string
			qr_code_base64?: string; // base64 PNG
			ticket_url?: string;     // MP-hosted page with QR + instructions
		};
	};
	metadata?: Record<string, unknown>;
}

export async function createPixPayment(input: {
	amountBrl: number; // reais decimal
	payerEmail: string;
	/** Used for payer first/last split + additional_info — MP's risk
	 *  engine cross-references it. Optional: we omit cleanly if absent. */
	payerName?: string;
	description: string;
	externalReference: string;
	notificationUrl?: string;
	expiresInMinutes?: number; // default 60
	idempotencyKey: string;
	metadata?: Record<string, unknown>;
	deviceSessionId?: string;
}): Promise<MpPaymentResponse> {
	const expires = new Date(Date.now() + (input.expiresInMinutes ?? 60) * 60_000);
	// Split full name → first / last for MP's risk engine. Single-word
	// names (common in BR test data) go in first_name, last empty.
	const trimmedName = input.payerName?.trim();
	const nameParts = trimmedName ? trimmedName.split(/\s+/) : [];
	const firstName = nameParts.shift();
	const lastName = nameParts.join(" ") || undefined;

	const payer: Record<string, unknown> = { email: input.payerEmail };
	if (firstName) payer.first_name = firstName;
	if (lastName) payer.last_name = lastName;

	const body: Record<string, unknown> = {
		transaction_amount: input.amountBrl,
		description: input.description,
		payment_method_id: "pix",
		payer,
		external_reference: input.externalReference,
		notification_url: input.notificationUrl,
		date_of_expiration: expires.toISOString(),
		metadata: input.metadata,
	};
	// additional_info is what MP's risk engine actually consults
	// for non-card payments. Echoes payer details so the score has
	// redundant signal even if the top-level payer block is sparse.
	if (firstName || lastName) {
		body.additional_info = {
			payer: { first_name: firstName, last_name: lastName },
		};
	}
	return mpRequest<MpPaymentResponse>(
		"POST",
		"/v1/payments",
		body,
		input.idempotencyKey,
		input.deviceSessionId,
	);
}

export async function createCardPayment(input: {
	amountBrl: number;
	cardTokenId: string;
	installments: number;
	paymentMethodId: string; // "visa" | "master" | ...
	payerEmail: string;
	description: string;
	externalReference: string;
	idempotencyKey: string;
	metadata?: Record<string, unknown>;
}): Promise<MpPaymentResponse> {
	return mpRequest<MpPaymentResponse>(
		"POST",
		"/v1/payments",
		{
			transaction_amount: input.amountBrl,
			description: input.description,
			payment_method_id: input.paymentMethodId,
			token: input.cardTokenId,
			installments: input.installments,
			payer: { email: input.payerEmail },
			external_reference: input.externalReference,
			metadata: input.metadata,
		},
		input.idempotencyKey,
	);
}

export async function getPayment(paymentId: string | number): Promise<MpPaymentResponse> {
	return mpRequest<MpPaymentResponse>("GET", `/v1/payments/${paymentId}`);
}

// ──────────────────────────────────────────────
// Chargebacks (contestações)
//
// MP fires `chargebacks` webhook events when a cardholder disputes a
// charge with their issuer. Lifecycle: pending → in_process → won
// (we kept the money) or lost (money refunded by MP). We treat any
// non-final state as "active dispute" and suspend the org + cancel
// the preapproval so we stop serving + stop charging.
// ──────────────────────────────────────────────

export interface MpChargeback {
	id: number;
	payment_id: number;
	amount: number;
	currency_id: "BRL";
	reason?: string;
	status: "pending" | "in_process" | "won" | "lost";
	date_created?: string;
	date_event?: string;
	live_mode?: boolean;
}

export async function getChargeback(chargebackId: string | number): Promise<MpChargeback> {
	return mpRequest<MpChargeback>("GET", `/v1/chargebacks/${chargebackId}`);
}

// ──────────────────────────────────────────────
// Webhook signature verification
//
// MP sends `x-signature: ts=...,v1=<hmac-sha256-hex>` and
// `x-request-id: <uuid>` headers. The signed manifest is
// `id:<dataId>;request-id:<requestId>;ts:<ts>;`.
//
// Secret comes from MP dashboard > Webhooks > Notificações > Chave
// secreta (MP_WEBHOOK_SECRET).
// ──────────────────────────────────────────────

export interface MpWebhookHeaders {
	signature: string | null;
	requestId: string | null;
}

export function verifyMpWebhookSignature(
	headers: MpWebhookHeaders,
	dataId: string,
): boolean {
	const secret = process.env.MP_WEBHOOK_SECRET;
	if (!secret) return false;
	if (!headers.signature || !headers.requestId || !dataId) return false;

	// Parse "ts=1700000000,v1=abc..." or "ts=...;v1=..." (MP has used both)
	const parts: Record<string, string> = {};
	for (const segment of headers.signature.split(/[,;]/)) {
		const [k, v] = segment.trim().split("=");
		if (k && v) parts[k] = v;
	}
	const ts = parts.ts;
	const v1 = parts.v1;
	if (!ts || !v1) return false;

	const manifest = `id:${dataId};request-id:${headers.requestId};ts:${ts};`;
	const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

	if (expected.length !== v1.length) return false;
	try {
		return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(v1, "hex"));
	} catch {
		return false;
	}
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Convert centavos → reais (BRL decimal) the MP API expects. */
export function centsToReais(cents: number): number {
	return Math.round(cents) / 100;
}

/** Build an externalReference for a PIX renewal so the webhook can
 *  trace back to the PixCharge row even before mpPaymentId is set. */
export function buildPixExternalRef(opts: {
	orgId: string;
	userId: string;
	cycleDueAt: Date;
	nonce: string;
}): string {
	const isoDate = opts.cycleDueAt.toISOString().slice(0, 10); // YYYY-MM-DD
	return `pixrenew:${opts.orgId}:${opts.userId}:${isoDate}:${opts.nonce}`;
}

/** Build externalReference for credit pack one-shots. */
export function buildCreditPackExternalRef(opts: {
	orgId: string;
	packKey: string;
	nonce: string;
}): string {
	return `creditpack:${opts.orgId}:${opts.packKey}:${opts.nonce}`;
}

/** Parse an external reference back to its tag for routing in the webhook. */
export function parseExternalRef(ref: string): {
	tag: "pixrenew" | "creditpack" | "preapproval" | "paywall_pix" | "paywall_card" | "unknown";
	parts: string[];
} {
	const parts = ref.split(":");
	const tag = parts[0];
	if (
		tag === "pixrenew" ||
		tag === "creditpack" ||
		tag === "preapproval" ||
		tag === "paywall_pix" ||
		tag === "paywall_card"
	) {
		return { tag, parts: parts.slice(1) };
	}
	return { tag: "unknown", parts };
}
