// ──────────────────────────────────────────────
// Crawl Constraints — Collection Hardening
//
// Prevents:
//   - Infinite crawls (max pages per domain)
//   - Deep recursion (depth limit)
//   - Duplicate fetches (deduplication)
//   - Crawl loops (same-page detection)
//   - SPA overload (selective Playwright)
//
// All limits configurable per-crawl session.
// ──────────────────────────────────────────────

export interface CrawlConstraints {
  max_pages_per_domain: number;
  max_depth: number;
  per_request_timeout_ms: number;
  global_timeout_ms: number;
  max_body_size_bytes: number;
  enable_loop_detection: boolean;
  spa_detection_enabled: boolean;
}

export const DEFAULT_CONSTRAINTS: CrawlConstraints = {
  max_pages_per_domain: 30,
  max_depth: 3,
  per_request_timeout_ms: 10_000,
  global_timeout_ms: 60_000,
  max_body_size_bytes: 2_000_000, // 2MB
  enable_loop_detection: true,
  spa_detection_enabled: true,
};

// ──────────────────────────────────────────────
// Crawl Session — tracks state per crawl
// ──────────────────────────────────────────────

export class CrawlSession {
  private fetched = new Set<string>();
  private urlHashes = new Map<string, string>(); // normalized URL → content hash
  private pageCount = 0;
  private startTime: number;
  private aborted = false;
  private abortReason: string | null = null;

  constructor(
    readonly domain: string,
    readonly constraints: CrawlConstraints = DEFAULT_CONSTRAINTS,
  ) {
    this.startTime = Date.now();
  }

  canFetch(url: string): { allowed: boolean; reason: string | null } {
    if (this.aborted) {
      return { allowed: false, reason: this.abortReason || 'Crawl aborted.' };
    }

    // Global timeout
    if (Date.now() - this.startTime >= this.constraints.global_timeout_ms) {
      this.abort('Global timeout reached.');
      return { allowed: false, reason: 'Global timeout reached.' };
    }

    // Max pages
    if (this.pageCount >= this.constraints.max_pages_per_domain) {
      return { allowed: false, reason: `Max pages per domain reached (${this.constraints.max_pages_per_domain}).` };
    }

    // Deduplication
    const normalized = normalizeForDedup(url);
    if (this.fetched.has(normalized)) {
      return { allowed: false, reason: 'Already fetched (deduplicated).' };
    }

    return { allowed: true, reason: null };
  }

  recordFetch(url: string, contentHash?: string): void {
    const normalized = normalizeForDedup(url);
    this.fetched.add(normalized);
    this.pageCount++;
    if (contentHash) {
      this.urlHashes.set(normalized, contentHash);
    }
  }

  isLoopDetected(url: string, contentHash: string): boolean {
    if (!this.constraints.enable_loop_detection) return false;

    // Check if same content was already seen at a different URL
    for (const [existingUrl, existingHash] of this.urlHashes) {
      if (existingUrl !== normalizeForDedup(url) && existingHash === contentHash) {
        return true;
      }
    }
    return false;
  }

  abort(reason: string): void {
    this.aborted = true;
    this.abortReason = reason;
  }

  isAborted(): boolean {
    return this.aborted;
  }

  getStats(): CrawlStats {
    return {
      pages_fetched: this.pageCount,
      unique_urls: this.fetched.size,
      elapsed_ms: Date.now() - this.startTime,
      aborted: this.aborted,
      abort_reason: this.abortReason,
      loops_detected: 0,
    };
  }
}

export interface CrawlStats {
  pages_fetched: number;
  unique_urls: number;
  elapsed_ms: number;
  aborted: boolean;
  abort_reason: string | null;
  loops_detected: number;
}

// ──────────────────────────────────────────────
// SPA Detection
// ──────────────────────────────────────────────

export function detectSpaPage(html: string, scriptCount: number): boolean {
  if (scriptCount > 15) return true;
  // Common SPA frameworks
  const spaPatterns = [
    /\b__NEXT_DATA__\b/,
    /\bwindow\.__NUXT__\b/,
    /\bng-version\b/,
    /\bid="__gatsby"\b/,
    /\bid="app"\s+data-v-/,
    /\breact-root\b/i,
    /\bid="root"><\/div>/,
  ];
  return spaPatterns.some(p => p.test(html));
}

export function shouldTriggerPlaywright(html: string, scriptCount: number, bodyLength: number): boolean {
  if (!detectSpaPage(html, scriptCount)) return false;
  // Thin content — likely JS-rendered
  if (bodyLength < 2000 && scriptCount > 5) return true;
  // Empty body with lots of scripts
  const textContent = html.replace(/<[^>]+>/g, '').trim();
  if (textContent.length < 500 && scriptCount > 8) return true;
  return false;
}

// ──────────────────────────────────────────────
// Content hashing for loop detection
// ──────────────────────────────────────────────

export function hashContent(content: string): string {
  let hash = 0;
  const str = content.slice(0, 5000); // only hash first 5KB
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

// ──────────────────────────────────────────────
// URL normalization for dedup
// ──────────────────────────────────────────────

function normalizeForDedup(raw: string): string {
  try {
    const u = new URL(raw);
    u.hostname = u.hostname.toLowerCase();
    u.hash = '';
    // Remove common tracking params
    u.searchParams.delete('utm_source');
    u.searchParams.delete('utm_medium');
    u.searchParams.delete('utm_campaign');
    u.searchParams.delete('utm_term');
    u.searchParams.delete('utm_content');
    u.searchParams.delete('ref');
    u.searchParams.delete('fbclid');
    u.searchParams.delete('gclid');
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return raw.toLowerCase();
  }
}
