import { resolve } from 'dns';
import { promisify } from 'util';
import { createHash } from 'crypto';
import {
  BrandScanConfig,
  BrandScanResult,
  BrandImpersonationCandidate,
  DEFAULT_BRAND_SCAN_CONFIG,
} from '../../packages/brand-adapter';
import { generateDomainCandidates } from '../../packages/brand-adapter/domain-generator';
import { scoreCandidate, extractHtmlEnrichment, computeFaviconSimilarity } from '../../packages/brand-adapter/similarity-scorer';
import { checkSafeBrowsing, urlsForDomain } from './safe-browsing';

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
  // Wave 23 P1.1 — buscar bytes do favicon do root pra comparação
  // binária. Se não tiver favicon ou der erro, segue sem (signal opcional).
  const rootFaviconHash = await fetchFaviconBytesHash(
    rootMeta.faviconUrl,
    config.root_domain,
  );

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

      // Wave 23 P1.1 — favicon bytes-match. Pega caso típico de clone
      // visual: golpista copia o favicon original (mesmos bytes), mas
      // hospedado em path/host diferente — onde a comparação por URL
      // já não bate. Custa 1 HTTP extra por candidato suspeito, então
      // só vale a pena pra os que já passaram do threshold mínimo (30).
      if (candidate.confidence_score >= 30 && enrichment?.faviconUrl && rootFaviconHash) {
        const candidateFaviconHash = await fetchFaviconBytesHash(
          enrichment.faviconUrl,
          domain,
        );
        if (candidateFaviconHash && candidateFaviconHash === rootFaviconHash) {
          candidate.favicon_bytes_match = true;
          // +30 pontos pelo match exato de bytes — sinal MUITO forte
          candidate.confidence_score = Math.min(100, candidate.confidence_score + 30);
          candidate.confidence =
            candidate.confidence_score >= 70 ? 'high' :
            candidate.confidence_score >= 40 ? 'medium' : 'low';
        }
      }

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

  // Wave 23 P2.2 — cross-check medium+ matches contra Google Safe
  // Browsing. Quando o Google já flagrou o domínio como phishing/
  // malware/etc, boostamos a confidence pra refletir validação externa.
  // Sem GOOGLE_SAFE_BROWSING_API_KEY configurada, retorna [] e o
  // pipeline segue normal (degradação silenciosa).
  const suspicious = scoredResults.filter(r => r.confidence_score >= 40);
  if (suspicious.length > 0) {
    const urlMap = new Map<string, string>(); // url → domain
    for (const r of suspicious) {
      for (const url of urlsForDomain(r.domain)) {
        urlMap.set(url, r.domain);
      }
    }
    const matches = await checkSafeBrowsing(Array.from(urlMap.keys()));
    const flaggedDomains = new Set<string>();
    for (const m of matches) {
      const domain = urlMap.get(m.url);
      if (domain) flaggedDomains.add(domain);
    }
    for (const r of scoredResults) {
      if (flaggedDomains.has(r.domain)) {
        // +25 pontos pela validação externa do Google
        r.confidence_score = Math.min(100, r.confidence_score + 25);
        r.confidence =
          r.confidence_score >= 70 ? 'high' :
          r.confidence_score >= 40 ? 'medium' : 'low';
        // Anota no commercial_interpretation pra UI mostrar
        r.commercial_interpretation = `[Google Safe Browsing já flagrou] ${r.commercial_interpretation}`;
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
 * Wave 23 P1.1 — fetch favicon bytes + SHA256 hash.
 *
 * Resolve URL relativa contra o host base, fetcha com timeout curto +
 * size cap (favicons normalmente são <100KB), retorna SHA256 hex dos
 * bytes brutos. Match exato entre 2 hashes = mesmo arquivo de favicon
 * = sinal forte de clone visual.
 *
 * Cap de 100KB protege contra payload bombs (alguém serve 100MB
 * pretending ser favicon).
 */
async function fetchFaviconBytesHash(
  faviconUrl: string | null,
  baseHost: string,
): Promise<string | null> {
  if (!faviconUrl) return null;
  try {
    const absolute = faviconUrl.startsWith('http')
      ? faviconUrl
      : faviconUrl.startsWith('//')
        ? `https:${faviconUrl}`
        : faviconUrl.startsWith('/')
          ? `https://${baseHost}${faviconUrl}`
          : `https://${baseHost}/${faviconUrl}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(absolute, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'Vestigio-BrandIntel/1.0' },
    });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const contentLength = Number(response.headers.get('content-length') || '0');
    if (contentLength > 100_000) return null;

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > 100_000) return null;

    return createHash('sha256').update(Buffer.from(buffer)).digest('hex');
  } catch {
    return null;
  }
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
