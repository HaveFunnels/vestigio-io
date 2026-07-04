import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { isUrlSafeForFetch } from '../../packages/url-normalize/ssrf';

// ──────────────────────────────────────────────
// HTTP Client — SSRF-guarded fetch for ingestion.
//
// This client is the shared outbound HTTP path for the audit-runner
// crawler and every enrichment worker downstream (15+ passes). It
// therefore has two attacker-adjacent inputs:
//
//   1. The domain a customer (or /audit form submitter) hands us.
//   2. The Location header a fetched page returns during a redirect
//      chain, which — under an attacker-controlled site — points
//      wherever they want.
//
// Both are checked through isUrlSafeForFetch (from packages/
// url-normalize/ssrf.ts) before every hop, which pre-resolves DNS
// and rejects any hostname whose A/AAAA record lands on RFC1918,
// loopback, link-local (IMDS 169.254.169.254), CGNAT, multicast,
// or IPv6 ULA/link-local. Redirect follows re-check on every hop
// so a 200-to-public → 302-to-private chain is blocked at the
// second step, not just the first.
//
// Body size is capped (MAX_BODY_BYTES) so a customer-controlled
// upstream can't fill the crawler container's memory with a
// gigabyte of garbage; requests over the cap abort with
// `body_too_large`.
// ──────────────────────────────────────────────

export interface HttpResponse {
  url: string;
  final_url: string;
  status_code: number;
  headers: Record<string, string>;
  body: string;
  response_time_ms: number;
  redirect_chain: RedirectEntry[];
  content_type: string | null;
  content_length: number | null;
}

export interface RedirectEntry {
  url: string;
  status_code: number;
  host: string;
}

const MAX_REDIRECTS = 10;
const TIMEOUT_MS = 15000;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MiB — page bodies vary widely; audit-runner has never legitimately needed more than a few hundred KB
const USER_AGENT =
  'Mozilla/5.0 (compatible; VestigioBot/1.0; +https://vestigio.io)';

export class HttpFetchError extends Error {
  constructor(
    message: string,
    public readonly reason:
      | 'ssrf_blocked'
      | 'body_too_large'
      | 'too_many_redirects'
      | 'timeout'
      | 'network',
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'HttpFetchError';
  }
}

export async function httpFetch(
  targetUrl: string,
  maxRedirects: number = MAX_REDIRECTS,
): Promise<HttpResponse> {
  const start = Date.now();
  const redirectChain: RedirectEntry[] = [];
  let currentUrl = targetUrl;
  let attempts = 0;

  while (attempts < maxRedirects) {
    // Re-check on every hop, including the initial one — an attacker-
    // controlled origin can 302-redirect from a public host to a
    // private one and we'd have no defense if we only checked the
    // first URL. TOCTOU vs DNS rebinding is still theoretically open
    // (the address resolved here isn't guaranteed to be the address
    // the fetch below dials); we accept that residual risk since the
    // Node http/https module doesn't expose the resolver hook needed
    // to close it end-to-end. For that stricter guarantee the caller
    // should use the connect-time-lookup pattern in
    // workers/ingestion/enrichment/competitor-fetch.ts. This layer
    // still stops the overwhelmingly common attack path (submit-time
    // hostname that resolves to a private IP) at negligible cost.
    const safety = await isUrlSafeForFetch(currentUrl);
    if (!safety.safe) {
      throw new HttpFetchError(
        `SSRF-blocked URL ${currentUrl}: ${safety.reason}`,
        'ssrf_blocked',
        safety.reason,
      );
    }

    const result = await singleFetch(currentUrl);

    if (result.status_code >= 300 && result.status_code < 400 && result.headers['location']) {
      redirectChain.push({
        url: currentUrl,
        status_code: result.status_code,
        host: new URL(currentUrl).hostname,
      });
      const location = result.headers['location'];
      currentUrl = location.startsWith('http')
        ? location
        : new URL(location, currentUrl).toString();
      attempts++;
      continue;
    }

    const elapsed = Date.now() - start;
    return {
      url: targetUrl,
      final_url: currentUrl,
      status_code: result.status_code,
      headers: result.headers,
      body: result.body,
      response_time_ms: elapsed,
      redirect_chain: redirectChain,
      content_type: result.headers['content-type'] || null,
      content_length: result.headers['content-length']
        ? parseInt(result.headers['content-length'], 10)
        : null,
    };
  }

  throw new HttpFetchError(
    `Too many redirects (>${maxRedirects}) for ${targetUrl}`,
    'too_many_redirects',
  );
}

function singleFetch(
  url: string,
): Promise<{ status_code: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;

    const req = transport.get(
      url,
      {
        headers: { 'User-Agent': USER_AGENT },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const headers: Record<string, string> = {};
        for (const [key, val] of Object.entries(res.headers)) {
          if (val) headers[key] = Array.isArray(val) ? val.join(', ') : val;
        }

        // For redirects, don't consume body
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          resolve({
            status_code: res.statusCode,
            headers,
            body: '',
          });
          return;
        }

        const chunks: Buffer[] = [];
        let receivedBytes = 0;
        let aborted = false;
        res.on('data', (chunk: Buffer) => {
          if (aborted) return;
          receivedBytes += chunk.length;
          if (receivedBytes > MAX_BODY_BYTES) {
            aborted = true;
            res.destroy();
            reject(
              new HttpFetchError(
                `Response body exceeded ${MAX_BODY_BYTES} bytes for ${url}`,
                'body_too_large',
              ),
            );
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          if (aborted) return;
          resolve({
            status_code: res.statusCode || 0,
            headers,
            body: Buffer.concat(chunks).toString('utf-8'),
          });
        });
        res.on('error', reject);
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new HttpFetchError(`Timeout fetching ${url}`, 'timeout'));
    });
  });
}
