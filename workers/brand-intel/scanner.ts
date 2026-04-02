import { resolve } from 'dns';
import { promisify } from 'util';
import {
  BrandScanConfig,
  BrandScanResult,
  BrandImpersonationCandidate,
  DEFAULT_BRAND_SCAN_CONFIG,
} from '../../packages/brand-adapter';
import { generateDomainCandidates } from '../../packages/brand-adapter/domain-generator';
import { scoreCandidate, extractHtmlEnrichment, computeFaviconSimilarity } from '../../packages/brand-adapter/similarity-scorer';

// ──────────────────────────────────────────────
// Brand Intelligence Scanner — Phase 3E.1 Upgrade
//
// Fast, controlled brand impersonation detection.
//
// Flow:
// 1. Generate ~300 candidate domains
// 2. Fast DNS resolution (root-only)
// 3. Lightweight HTTP check + HTML enrichment
// 4. Multi-signal scoring (domain, content, favicon,
//    credential/payment capture, sensitive paths)
// 5. Deep analysis only for high-confidence matches
//
// Performance constraints:
// - Max 300 candidate domains
// - DNS timeout 3s per domain
// - HTTP timeout 5s per domain
// - Rate limited checks
// - Deep analysis only on high-confidence
// ──────────────────────────────────────────────

const dnsResolve = promisify(resolve);

export async function runBrandScan(
  config: BrandScanConfig,
): Promise<BrandScanResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const maxCandidates = config.max_candidates || DEFAULT_BRAND_SCAN_CONFIG.max_candidates!;
  const dnsTimeout = config.dns_timeout_ms || DEFAULT_BRAND_SCAN_CONFIG.dns_timeout_ms!;
  const minSim = config.min_similarity || DEFAULT_BRAND_SCAN_CONFIG.min_similarity!;

  // Step 0: Fetch root domain metadata for comparison
  const rootMeta = await fetchRootMeta(config.root_domain);

  // Step 1: Generate candidate domains
  const candidates = generateDomainCandidates(
    config.root_domain,
    config.brand_tokens,
    maxCandidates,
  );

  // Step 2: Fast DNS resolution (root-only, parallel batches)
  const activeDomains: string[] = [];
  const BATCH_SIZE = 20;
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async domain => {
        const hostname = domain.replace(/^https?:\/\//, '');
        await Promise.race([
          dnsResolve(hostname),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), dnsTimeout)),
        ]);
        return domain;
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') activeDomains.push(r.value);
    }
  }

  // Step 3: Lightweight HTTP check + enrichment scoring
  const scoredResults: BrandImpersonationCandidate[] = [];
  for (const domain of activeDomains) {
    try {
      const url = `https://${domain}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'Vestigio-BrandIntel/1.0' },
      });
      clearTimeout(timeout);

      const html = await response.text();
      const enrichment = extractHtmlEnrichment(html, url, config.brand_tokens);

      const candidate = scoreCandidate(
        domain,
        config.root_domain,
        config.brand_tokens,
        response.status,
        enrichment,
        rootMeta.title,
        rootMeta.faviconUrl,
      );

      if (candidate.confidence_score >= minSim) {
        scoredResults.push(candidate);
      }
    } catch {
      // HTTP check failed — still score based on domain-only signals
      const candidate = scoreCandidate(
        domain,
        config.root_domain,
        config.brand_tokens,
        null,
        null,
        rootMeta.title,
        rootMeta.faviconUrl,
      );
      if (candidate.confidence_score >= minSim) {
        scoredResults.push(candidate);
      }
    }
  }

  // Classify by confidence
  const high = scoredResults.filter(r => r.confidence === 'high');
  const medium = scoredResults.filter(r => r.confidence === 'medium');
  const low = scoredResults.filter(r => r.confidence === 'low');

  return {
    candidates_generated: candidates.length,
    candidates_resolved: activeDomains.length,
    candidates_active: activeDomains.length,
    high_confidence: high,
    medium_confidence: medium,
    low_confidence: low,
    duration_ms: Date.now() - startTime,
    errors,
  };
}

/**
 * Fetch root domain title and favicon for comparison.
 */
async function fetchRootMeta(rootDomain: string): Promise<{ title: string | null; faviconUrl: string | null }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`https://${rootDomain}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Vestigio-BrandIntel/1.0' },
    });
    clearTimeout(timeout);
    const html = await response.text();
    const snippet = html.slice(0, 10000);
    const titleMatch = snippet.match(/<title[^>]*>([^<]+)<\/title>/i);
    const faviconMatch = snippet.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i)
      || snippet.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
    return {
      title: titleMatch ? titleMatch[1].trim().slice(0, 200) : null,
      faviconUrl: faviconMatch ? faviconMatch[1] : null,
    };
  } catch {
    return { title: null, faviconUrl: null };
  }
}
