import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ──────────────────────────────────────────────
// HTTP Client — basic fetch for ingestion
// No external dependencies. Node built-ins only.
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
const USER_AGENT =
  'Mozilla/5.0 (compatible; VestigioBot/1.0; +https://vestigio.io)';

export async function httpFetch(
  targetUrl: string,
  maxRedirects: number = MAX_REDIRECTS,
): Promise<HttpResponse> {
  const start = Date.now();
  const redirectChain: RedirectEntry[] = [];
  let currentUrl = targetUrl;
  let attempts = 0;

  while (attempts < maxRedirects) {
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

  throw new Error(`Too many redirects (>${maxRedirects}) for ${targetUrl}`);
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
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
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
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}
