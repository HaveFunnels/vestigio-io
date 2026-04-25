import {
  ShopifyCredentials,
  ShopifyConnectionState,
  ShopifyConnectionStatus,
  ShopifyErrorType,
  ShopifyRawOrder,
  ShopifyCheckout,
  ShopifyCustomer,
  ShopifyProduct,
  ShopifyInventoryLevel,
  REQUIRED_SCOPES,
} from './types';

// ──────────────────────────────────────────────
// Shopify Admin API Client — Read-Only
//
// Lightweight client for Shopify Admin REST API.
// Only reads orders, refunds, and transactions.
//
// Safety:
// - No write operations
// - No mutation endpoints
// - Rate limited (Shopify: 2 req/s for REST)
// - Timeout enforced
// ──────────────────────────────────────────────

const API_VERSION = '2024-01';
const REQUEST_TIMEOUT = 10000; // 10s

/**
 * Verify connection and scopes.
 */
export async function verifyConnection(
  credentials: ShopifyCredentials,
): Promise<ShopifyConnectionState> {
  try {
    const response = await shopifyFetch(credentials, '/shop.json');
    if (!response.ok) {
      const errorType = classifyHttpError(response.status);
      const status: ShopifyConnectionStatus = errorType === 'auth_error' ? 'invalid_credentials' : 'error';
      return {
        status,
        shop_domain: credentials.shop_domain,
        shop_name: null,
        last_sync_at: null,
        last_successful_sync_at: null,
        last_error: `HTTP ${response.status}`,
        error_type: errorType,
        scopes_verified: false,
        initial_sync_complete: false,
        summary_30d: null,
      };
    }

    const data = await response.json();
    return {
      status: 'connected',
      shop_domain: credentials.shop_domain,
      shop_name: data.shop?.name || null,
      last_sync_at: new Date(),
      last_successful_sync_at: new Date(),
      last_error: null,
      error_type: null,
      scopes_verified: true,
      initial_sync_complete: false, // set true after first full poll
      summary_30d: null, // populated after first poll
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: 'error',
      shop_domain: credentials.shop_domain,
      shop_name: null,
      last_sync_at: null,
      last_successful_sync_at: null,
      last_error: msg,
      error_type: classifyNetworkError(msg),
      scopes_verified: false,
      initial_sync_complete: false,
      summary_30d: null,
    };
  }
}

/**
 * Classify HTTP error status into ShopifyErrorType.
 */
export function classifyHttpError(status: number): ShopifyErrorType {
  if (status === 401 || status === 403) return 'auth_error';
  if (status === 429) return 'rate_limit';
  return 'unknown';
}

/**
 * Classify network error message into ShopifyErrorType.
 */
export function classifyNetworkError(message: string): ShopifyErrorType {
  if (/abort|timeout/i.test(message)) return 'network_error';
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET/i.test(message)) return 'network_error';
  if (/JSON|parse|unexpected/i.test(message)) return 'data_parsing_error';
  return 'unknown';
}

/**
 * Fetch orders within a date range (inclusive).
 * Returns minimal order data with refunds and transactions.
 */
export async function fetchOrders(
  credentials: ShopifyCredentials,
  since: Date,
  until: Date,
  limit: number = 250,
): Promise<{ orders: ShopifyRawOrder[]; errors: string[] }> {
  const errors: string[] = [];
  const allOrders: ShopifyRawOrder[] = [];

  const sinceISO = since.toISOString();
  const untilISO = until.toISOString();

  let pageUrl: string | null =
    `/orders.json?status=any&created_at_min=${sinceISO}&created_at_max=${untilISO}&limit=${Math.min(limit, 250)}&fields=id,created_at,total_price,currency,financial_status,fulfillment_status,cancelled_at,landing_site,referring_site,total_discounts,discount_codes,gateway,refunds,transactions,line_items`;

  let pageCount = 0;
  const MAX_PAGES = 10; // safety limit

  while (pageUrl && pageCount < MAX_PAGES) {
    try {
      const response = await shopifyFetch(credentials, pageUrl);
      if (!response.ok) {
        errors.push(`Orders fetch failed: HTTP ${response.status}`);
        break;
      }

      const data = await response.json();
      const orders: ShopifyRawOrder[] = data.orders || [];
      allOrders.push(...orders);

      // Pagination: check Link header for next page
      const linkHeader = response.headers.get('link');
      pageUrl = extractNextPageUrl(linkHeader, credentials.shop_domain);
      pageCount++;

      // Rate limiting: Shopify allows ~2 req/s for REST
      await delay(500);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      break;
    }
  }

  return { orders: allOrders, errors };
}

/**
 * Fetch orders incrementally using cursor (order ID).
 */
export async function fetchOrdersSinceCursor(
  credentials: ShopifyCredentials,
  sinceId: string | null,
  limit: number = 250,
): Promise<{ orders: ShopifyRawOrder[]; last_id: string | null; errors: string[] }> {
  const errors: string[] = [];

  const sinceParam = sinceId ? `&since_id=${sinceId}` : '';
  const url = `/orders.json?status=any&limit=${Math.min(limit, 250)}&fields=id,created_at,total_price,currency,financial_status,fulfillment_status,cancelled_at,landing_site,referring_site,total_discounts,discount_codes,gateway,refunds,transactions${sinceParam}`;

  try {
    const response = await shopifyFetch(credentials, url);
    if (!response.ok) {
      errors.push(`Orders fetch failed: HTTP ${response.status}`);
      return { orders: [], last_id: sinceId, errors };
    }

    const data = await response.json();
    const orders: ShopifyRawOrder[] = data.orders || [];
    const lastId = orders.length > 0 ? String(orders[orders.length - 1].id) : sinceId;

    return { orders, last_id: lastId, errors };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { orders: [], last_id: sinceId, errors };
  }
}

// ──────────────────────────────────────────────
// Phase 4A.2: Additional fetch methods
// Checkouts, Customers, Products, Inventory
// ──────────────────────────────────────────────

/**
 * Fetch abandoned checkouts (status=open) within a date range.
 * Non-fatal: returns empty array + errors on failure.
 */
export async function fetchAbandonedCheckouts(
  credentials: ShopifyCredentials,
  since: Date,
): Promise<{ checkouts: ShopifyCheckout[]; errors: string[] }> {
  const errors: string[] = [];
  const allCheckouts: ShopifyCheckout[] = [];

  const sinceISO = since.toISOString();
  let pageUrl: string | null =
    `/checkouts.json?created_at_min=${sinceISO}&status=open&limit=250`;

  let pageCount = 0;
  const MAX_PAGES = 10;

  while (pageUrl && pageCount < MAX_PAGES) {
    try {
      const response = await shopifyFetch(credentials, pageUrl);
      if (!response.ok) {
        errors.push(`Checkouts fetch failed: HTTP ${response.status}`);
        break;
      }

      const data = await response.json();
      const checkouts: ShopifyCheckout[] = (data.checkouts || []).map((c: any) => ({
        id: c.id,
        created_at: c.created_at,
        total_price: c.total_price,
        currency: c.currency,
        completed_at: c.completed_at || null,
        abandoned_checkout_url: c.abandoned_checkout_url || null,
      }));
      allCheckouts.push(...checkouts);

      const linkHeader = response.headers.get('link');
      pageUrl = extractNextPageUrl(linkHeader, credentials.shop_domain);
      pageCount++;

      await delay(500);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      break;
    }
  }

  return { checkouts: allCheckouts, errors };
}

/**
 * Fetch customers created since a given date.
 * Non-fatal: returns empty array + errors on failure.
 */
export async function fetchCustomers(
  credentials: ShopifyCredentials,
  since: Date,
): Promise<{ customers: ShopifyCustomer[]; errors: string[] }> {
  const errors: string[] = [];
  const allCustomers: ShopifyCustomer[] = [];

  const sinceISO = since.toISOString();
  let pageUrl: string | null =
    `/customers.json?created_at_min=${sinceISO}&limit=250&fields=id,orders_count,total_spent,created_at,currency`;

  let pageCount = 0;
  const MAX_PAGES = 10;

  while (pageUrl && pageCount < MAX_PAGES) {
    try {
      const response = await shopifyFetch(credentials, pageUrl);
      if (!response.ok) {
        errors.push(`Customers fetch failed: HTTP ${response.status}`);
        break;
      }

      const data = await response.json();
      const customers: ShopifyCustomer[] = (data.customers || []).map((c: any) => ({
        id: c.id,
        orders_count: c.orders_count,
        total_spent: c.total_spent,
        created_at: c.created_at,
        currency: c.currency,
      }));
      allCustomers.push(...customers);

      const linkHeader = response.headers.get('link');
      pageUrl = extractNextPageUrl(linkHeader, credentials.shop_domain);
      pageCount++;

      await delay(500);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      break;
    }
  }

  return { customers: allCustomers, errors };
}

/**
 * Fetch active products with variant inventory data.
 * Non-fatal: returns empty array + errors on failure.
 */
export async function fetchProducts(
  credentials: ShopifyCredentials,
): Promise<{ products: ShopifyProduct[]; errors: string[] }> {
  const errors: string[] = [];
  const allProducts: ShopifyProduct[] = [];

  let pageUrl: string | null =
    `/products.json?status=active&limit=250&fields=id,title,handle,status,variants`;

  let pageCount = 0;
  const MAX_PAGES = 10;

  while (pageUrl && pageCount < MAX_PAGES) {
    try {
      const response = await shopifyFetch(credentials, pageUrl);
      if (!response.ok) {
        errors.push(`Products fetch failed: HTTP ${response.status}`);
        break;
      }

      const data = await response.json();
      const products: ShopifyProduct[] = (data.products || []).map((p: any) => ({
        id: p.id,
        title: p.title,
        handle: p.handle || '',
        status: p.status,
        variants: (p.variants || []).map((v: any) => ({
          id: v.id,
          inventory_quantity: v.inventory_quantity,
          price: v.price,
        })),
      }));
      allProducts.push(...products);

      const linkHeader = response.headers.get('link');
      pageUrl = extractNextPageUrl(linkHeader, credentials.shop_domain);
      pageCount++;

      await delay(500);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      break;
    }
  }

  return { products: allProducts, errors };
}

/**
 * Fetch inventory levels for specific inventory item IDs.
 * Batches requests in groups of 50 IDs (Shopify limit).
 * Non-fatal: returns empty array + errors on failure.
 */
export async function fetchInventoryLevels(
  credentials: ShopifyCredentials,
  inventoryItemIds: string[],
): Promise<{ levels: ShopifyInventoryLevel[]; errors: string[] }> {
  const errors: string[] = [];
  const allLevels: ShopifyInventoryLevel[] = [];

  // Shopify limits inventory_item_ids to 50 per request
  const BATCH_SIZE = 50;
  for (let i = 0; i < inventoryItemIds.length; i += BATCH_SIZE) {
    const batch = inventoryItemIds.slice(i, i + BATCH_SIZE);
    const idsParam = batch.join(',');

    try {
      const response = await shopifyFetch(
        credentials,
        `/inventory_levels.json?inventory_item_ids=${idsParam}`,
      );
      if (!response.ok) {
        errors.push(`Inventory levels fetch failed: HTTP ${response.status}`);
        break;
      }

      const data = await response.json();
      const levels: ShopifyInventoryLevel[] = (data.inventory_levels || []).map((l: any) => ({
        inventory_item_id: l.inventory_item_id,
        available: l.available,
      }));
      allLevels.push(...levels);

      await delay(500);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      break;
    }
  }

  return { levels: allLevels, errors };
}

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

async function shopifyFetch(
  credentials: ShopifyCredentials,
  path: string,
): Promise<Response> {
  const baseUrl = `https://${credentials.shop_domain}/admin/api/${API_VERSION}`;
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    return await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': credentials.access_token,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function extractNextPageUrl(linkHeader: string | null, shopDomain: string): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  if (!match) return null;
  // Return the full URL (Shopify pagination uses full URLs)
  return match[1];
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
