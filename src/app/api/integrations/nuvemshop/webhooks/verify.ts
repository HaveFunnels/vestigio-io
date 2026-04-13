import { createHmac } from "crypto";

// ──────────────────────────────────────────────
// Nuvemshop Webhook HMAC Verification
//
// Nuvemshop signs every webhook with HMAC-SHA256
// using the app's client_secret. The signature is
// sent in the `x-linkedstore-hmac-sha256` header.
//
// hash_hmac('sha256', request_body, client_secret)
// ──────────────────────────────────────────────

const NUVEMSHOP_CLIENT_SECRET = process.env.NUVEMSHOP_CLIENT_SECRET || "";

/**
 * Verify that a webhook request actually came from Nuvemshop.
 * Returns { valid, body } if the HMAC signature matches.
 */
export async function verifyNuvemshopWebhook(
  request: Request,
): Promise<{ valid: boolean; body: any; error?: string }> {
  if (!NUVEMSHOP_CLIENT_SECRET) {
    console.error("[nuvemshop-webhook] NUVEMSHOP_CLIENT_SECRET not configured");
    return { valid: false, body: null, error: "Server misconfigured" };
  }

  // Nuvemshop sends the HMAC in x-linkedstore-hmac-sha256
  const hmacHeader =
    request.headers.get("x-linkedstore-hmac-sha256") ||
    request.headers.get("X-Linkedstore-Hmac-Sha256") ||
    request.headers.get("HTTP_X_LINKEDSTORE_HMAC_SHA256");

  if (!hmacHeader) {
    return { valid: false, body: null, error: "Missing HMAC signature header" };
  }

  // Read the raw body for HMAC verification
  const rawBody = await request.text();

  // Compute expected HMAC
  const expectedHmac = createHmac("sha256", NUVEMSHOP_CLIENT_SECRET)
    .update(rawBody)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(hmacHeader, expectedHmac)) {
    console.warn("[nuvemshop-webhook] HMAC mismatch — rejecting request");
    return { valid: false, body: null, error: "Invalid HMAC signature" };
  }

  // Parse the verified body
  try {
    const body = JSON.parse(rawBody);
    return { valid: true, body };
  } catch {
    return { valid: false, body: null, error: "Invalid JSON body" };
  }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
