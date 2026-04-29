// ──────────────────────────────────────────────
// Paddle API v2 Helper
//
// Server-side helper for Paddle Products & Prices API.
// Auth via Bearer token from PADDLE_API_KEY env var.
// Base URL from NEXT_PUBLIC_PADDLE_API_URL or defaults to https://api.paddle.com.
// ──────────────────────────────────────────────

const getBaseUrl = () =>
  process.env.NEXT_PUBLIC_PADDLE_API_URL || "https://api.paddle.com";

const getApiKey = () => process.env.PADDLE_API_KEY;

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getApiKey()}`,
  };
}

/** Whether Paddle API integration is configured */
export function isPaddleConfigured(): boolean {
  return !!getApiKey();
}

// ── Products ────────────────────────────────────

export interface PaddleProduct {
  id: string;
  name: string;
  description: string | null;
  tax_category: string;
  status: string;
}

export async function listProducts(): Promise<PaddleProduct[]> {
  const res = await fetch(`${getBaseUrl()}/products`, {
    method: "GET",
    headers: headers(),
  });
  if (!res.ok) {
    throw new Error(`Paddle listProducts failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.data;
}

export async function createProduct(
  name: string,
  description?: string,
): Promise<PaddleProduct> {
  const body: Record<string, unknown> = {
    name,
    tax_category: "standard",
  };
  if (description) body.description = description;

  const res = await fetch(`${getBaseUrl()}/products`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Paddle createProduct failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.data;
}

// ── Prices ──────────────────────────────────────

export interface PaddlePrice {
  id: string;
  product_id: string;
  description: string;
  unit_price: {
    amount: string;
    currency_code: string;
  };
  billing_cycle: {
    interval: string;
    frequency: number;
  } | null;
  status: string;
}

export async function listPrices(productId: string): Promise<PaddlePrice[]> {
  const url = new URL(`${getBaseUrl()}/prices`);
  url.searchParams.set("product_id", productId);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: headers(),
  });
  if (!res.ok) {
    throw new Error(`Paddle listPrices failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.data;
}

export async function createPrice(
  productId: string,
  unitAmountCents: number,
  interval: "month" = "month",
): Promise<PaddlePrice> {
  const body = {
    product_id: productId,
    description: `Monthly subscription - ${unitAmountCents} cents`,
    unit_price: {
      amount: unitAmountCents.toString(),
      currency_code: "USD",
    },
    billing_cycle: {
      interval,
      frequency: 1,
    },
  };

  const res = await fetch(`${getBaseUrl()}/prices`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Paddle createPrice failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.data;
}

// ── Pricing Preview (localized prices) ──────────

export interface PricePreviewItem {
	priceId: string;
	quantity: number;
}

export interface PricePreviewResult {
	currencyCode: string;
	items: Array<{
		priceId: string;
		formattedTotal: string;
		unitAmountCents: number;
	}>;
}

/**
 * Paddle v2 Pricing Preview — returns localized prices based on
 * the customer's IP address. Paddle resolves the IP to a country,
 * applies currency overrides and tax rules, and returns the price
 * the customer would actually see at checkout.
 *
 * Docs: https://developer.paddle.com/api-reference/pricing-preview/preview-prices
 */
export async function previewPrices(
	items: PricePreviewItem[],
	customerIpAddress?: string,
): Promise<PricePreviewResult | null> {
	if (!isPaddleConfigured()) return null;

	const body: Record<string, unknown> = {
		items: items.map((i) => ({
			price_id: i.priceId,
			quantity: i.quantity,
		})),
	};
	if (customerIpAddress) {
		body.customer_ip_address = customerIpAddress;
	}

	try {
		const res = await fetch(`${getBaseUrl()}/pricing-preview`, {
			method: "POST",
			headers: headers(),
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			console.error(`[paddle] previewPrices failed: ${res.status}`);
			return null;
		}
		const json = await res.json();
		const data = json.data;

		return {
			currencyCode: data.currency_code,
			items: data.details.line_items.map((li: any) => ({
				priceId: li.price.id,
				formattedTotal: li.formatted_totals.subtotal,
				unitAmountCents: parseInt(li.price.unit_price.amount, 10),
			})),
		};
	} catch (err) {
		console.error("[paddle] previewPrices error:", err);
		return null;
	}
}

export async function updatePrice(
  priceId: string,
  description?: string,
): Promise<PaddlePrice> {
  const body: Record<string, unknown> = {};
  if (description) body.description = description;

  const res = await fetch(`${getBaseUrl()}/prices/${priceId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Paddle updatePrice failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.data;
}
