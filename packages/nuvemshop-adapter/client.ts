import {
  NuvemshopCredentials,
  NuvemshopConnectionState,
  NuvemshopConnectionStatus,
  NuvemshopErrorType,
  NuvemshopRawOrder,
  NuvemshopCustomer,
  NuvemshopProduct,
} from './types';

// ──────────────────────────────────────────────
// Nuvemshop API Client — Read-Only
//
// Lightweight client for Nuvemshop REST API v1.
// Only reads orders, customers, and products.
//
// Safety:
// - No write operations
// - No mutation endpoints
// - Rate limited (Nuvemshop: 2 req/s, bucket 40)
// - Timeout enforced
// ──────────────────────────────────────────────

const BASE_URL = 'https://api.nuvemshop.com.br/v1';
const REQUEST_TIMEOUT = 10000; // 10s
const USER_AGENT = 'Vestigio (support@vestigio.io)';

/**
 * Verify connection by fetching store info.
 */
export async function verifyConnection(
  credentials: NuvemshopCredentials,
): Promise<NuvemshopConnectionState> {
  try {
    const response = await nuvemshopFetch(credentials, '/store');
    if (!response.ok) {
      const errorType = classifyHttpError(response.status);
      const status: NuvemshopConnectionStatus = errorType === 'auth_error' ? 'invalid_credentials' : 'error';
      return {
        status,
        store_id: credentials.store_id,
        store_name: null,
        store_domain: null,
        last_sync_at: null,
        last_successful_sync_at: null,
        last_error: `HTTP ${response.status}`,
        error_type: errorType,
        initial_sync_complete: false,
        summary_30d: null,
      };
    }

    const data = await response.json();
    // Nuvemshop returns name as multilingual object or string
    const storeName = typeof data.name === 'object'
      ? (data.name?.pt || data.name?.es || data.name?.en || Object.values(data.name)[0] || null)
      : data.name || null;

    return {
      status: 'connected',
      store_id: credentials.store_id,
      store_name: storeName as string | null,
      store_domain: data.original_domain || data.url_with_protocol || null,
      last_sync_at: new Date(),
      last_successful_sync_at: new Date(),
      last_error: null,
      error_type: null,
      initial_sync_complete: false,
      summary_30d: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: 'error',
      store_id: credentials.store_id,
      store_name: null,
      store_domain: null,
      last_sync_at: null,
      last_successful_sync_at: null,
      last_error: msg,
      error_type: classifyNetworkError(msg),
      initial_sync_complete: false,
      summary_30d: null,
    };
  }
}

/**
 * Classify HTTP error status.
 */
export function classifyHttpError(status: number): NuvemshopErrorType {
  if (status === 401 || status === 403) return 'auth_error';
  if (status === 429) return 'rate_limit';
  return 'unknown';
}

/**
 * Classify network error message.
 */
export function classifyNetworkError(message: string): NuvemshopErrorType {
  if (/abort|timeout/i.test(message)) return 'network_error';
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET/i.test(message)) return 'network_error';
  if (/JSON|parse|unexpected/i.test(message)) return 'data_parsing_error';
  return 'unknown';
}

/**
 * Fetch orders within a date range.
 * Nuvemshop paginates with page+per_page (max 200).
 */
export async function fetchOrders(
  credentials: NuvemshopCredentials,
  since: Date,
  until: Date,
  perPage: number = 200,
): Promise<{ orders: NuvemshopRawOrder[]; errors: string[] }> {
  const errors: string[] = [];
  const allOrders: NuvemshopRawOrder[] = [];

  const sinceISO = since.toISOString();
  const untilISO = until.toISOString();

  let page = 1;
  const MAX_PAGES = 50; // safety limit (50 * 200 = 10,000 orders max)

  while (page <= MAX_PAGES) {
    try {
      const path = `/orders?status=any&created_at_min=${sinceISO}&created_at_max=${untilISO}&per_page=${Math.min(perPage, 200)}&page=${page}&fields=id,number,created_at,updated_at,status,payment_status,shipping_status,total,subtotal,discount,currency,gateway,cancelled_at,paid_at,products,customer`;

      const response = await nuvemshopFetch(credentials, path);
      if (!response.ok) {
        if (response.status === 429) {
          // Rate limited — wait and retry once
          await delay(2000);
          const retryResponse = await nuvemshopFetch(credentials, path);
          if (!retryResponse.ok) {
            errors.push(`Orders fetch failed: HTTP ${retryResponse.status}`);
            break;
          }
          const retryData = await retryResponse.json();
          const retryOrders = mapRawOrders(retryData);
          allOrders.push(...retryOrders);
          if (retryOrders.length < perPage) break;
          page++;
          await delay(500);
          continue;
        }
        errors.push(`Orders fetch failed: HTTP ${response.status}`);
        break;
      }

      const data = await response.json();
      const orders = mapRawOrders(data);
      allOrders.push(...orders);

      // If fewer than requested, we've reached the last page
      if (orders.length < perPage) break;

      page++;
      // Rate limiting: stay under 2 req/s
      await delay(500);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      break;
    }
  }

  return { orders: allOrders, errors };
}

/**
 * Fetch customers with pagination.
 * Non-fatal: returns empty array + errors on failure.
 */
export async function fetchCustomers(
  credentials: NuvemshopCredentials,
  since: Date,
): Promise<{ customers: NuvemshopCustomer[]; errors: string[] }> {
  const errors: string[] = [];
  const allCustomers: NuvemshopCustomer[] = [];

  const sinceISO = since.toISOString();
  let page = 1;
  const MAX_PAGES = 50;

  while (page <= MAX_PAGES) {
    try {
      const path = `/customers?created_at_min=${sinceISO}&per_page=200&page=${page}&fields=id,name,email,total_spent,total_spent_currency,last_order_id,created_at,updated_at`;

      const response = await nuvemshopFetch(credentials, path);
      if (!response.ok) {
        errors.push(`Customers fetch failed: HTTP ${response.status}`);
        break;
      }

      const data = await response.json();
      const customers: NuvemshopCustomer[] = (Array.isArray(data) ? data : []).map((c: any) => ({
        id: c.id,
        name: c.name || '',
        email: c.email || '',
        total_spent: c.total_spent || '0',
        total_spent_currency: c.total_spent_currency || 'BRL',
        last_order_id: c.last_order_id ?? null,
        created_at: c.created_at,
        updated_at: c.updated_at,
      }));
      allCustomers.push(...customers);

      if (customers.length < 200) break;
      page++;
      await delay(500);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      break;
    }
  }

  return { customers: allCustomers, errors };
}

/**
 * Fetch published products with variant data.
 * Non-fatal: returns empty array + errors on failure.
 */
export async function fetchProducts(
  credentials: NuvemshopCredentials,
): Promise<{ products: NuvemshopProduct[]; errors: string[] }> {
  const errors: string[] = [];
  const allProducts: NuvemshopProduct[] = [];

  let page = 1;
  const MAX_PAGES = 50;

  while (page <= MAX_PAGES) {
    try {
      const path = `/products?published=true&per_page=200&page=${page}&fields=id,name,published,variants,created_at,updated_at`;

      const response = await nuvemshopFetch(credentials, path);
      if (!response.ok) {
        errors.push(`Products fetch failed: HTTP ${response.status}`);
        break;
      }

      const data = await response.json();
      const products: NuvemshopProduct[] = (Array.isArray(data) ? data : []).map((p: any) => ({
        id: p.id,
        name: p.name || {},
        published: p.published ?? true,
        variants: (p.variants || []).map((v: any) => ({
          id: v.id,
          price: v.price || '0',
          stock: v.stock ?? null,
          stock_management: v.stock_management ?? false,
        })),
        created_at: p.created_at,
        updated_at: p.updated_at,
      }));
      allProducts.push(...products);

      if (products.length < 200) break;
      page++;
      await delay(500);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      break;
    }
  }

  return { products: allProducts, errors };
}

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

async function nuvemshopFetch(
  credentials: NuvemshopCredentials,
  path: string,
): Promise<Response> {
  const url = `${BASE_URL}/${credentials.store_id}${path}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    return await fetch(url, {
      method: 'GET',
      headers: {
        'Authentication': `bearer ${credentials.access_token}`,
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function mapRawOrders(data: any): NuvemshopRawOrder[] {
  const arr = Array.isArray(data) ? data : [];
  return arr.map((o: any) => ({
    id: o.id,
    number: o.number,
    created_at: o.created_at,
    updated_at: o.updated_at,
    status: o.status || 'open',
    payment_status: o.payment_status || 'pending',
    shipping_status: o.shipping_status || 'unpacked',
    total: o.total || '0',
    subtotal: o.subtotal || '0',
    discount: o.discount || '0',
    currency: o.currency || 'BRL',
    gateway: o.gateway || 'unknown',
    cancelled_at: o.cancelled_at || null,
    paid_at: o.paid_at || null,
    products: (o.products || []).map((p: any) => ({
      id: p.id,
      product_id: p.product_id,
      variant_id: p.variant_id,
      name: p.name || '',
      price: p.price || '0',
      quantity: p.quantity || 1,
    })),
    customer: o.customer ? {
      id: o.customer.id,
      name: o.customer.name || '',
      email: o.customer.email || '',
    } : null,
  }));
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
