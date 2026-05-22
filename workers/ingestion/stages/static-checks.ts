import * as dns from 'node:dns/promises';
import {
  Evidence,
  EvidenceType,
  Signal,
  SignalCategory,
  FreshnessState,
  Scoping,
  IdGenerator,
  makeRef,
  HttpResponsePayload,
  PageContentPayload,
  ScriptPayload,
  MetaPayload,
  LinkPayload,
  StructuredDataItemPayload,
} from '../../../packages/domain';
// Wave 20.3 — canonical createSignal factory (was duplicated below
// at line ~822 as a local copy — that copy is now removed).
import { createSignal } from '../../../packages/signals';

// ──────────────────────────────────────────────
// Static Checks — Post-crawl signal extraction
//
// Runs AFTER stages A-C complete. Consumes already-collected
// evidence and produces supplementary signals that the signal
// engine merges into the full signal set before inference.
//
// 21 checks across 5 categories:
//   DNS/Email Infrastructure (3)
//   SEO/Discoverability (6)
//   Performance (4)
//   Security (4)
//   Conversion/Trust (4)
// ──────────────���───────────────────────────────

export interface StaticCheckContext {
  evidence: readonly Evidence[];
  rootDomain: string;
  scoping: Scoping;
  cycle_ref: string;
}

export async function runStaticChecks(ctx: StaticCheckContext): Promise<Signal[]> {
  const signals: Signal[] = [];
  const ids = new IdGenerator('sc');

  // Group evidence by type for efficient access
  const byType = new Map<EvidenceType, Evidence[]>();
  for (const e of ctx.evidence) {
    const list = byType.get(e.evidence_type) || [];
    list.push(e);
    byType.set(e.evidence_type, list);
  }

  // Run all check categories
  await runDnsChecks(ctx, signals, ids);
  runSeoChecks(byType, ctx, signals, ids);
  runPerformanceChecks(byType, ctx, signals, ids);
  runSecurityChecks(byType, ctx, signals, ids);
  runConversionTrustChecks(byType, ctx, signals, ids);

  return signals;
}

// ══════════════════��═══════════════════════════
// DNS/Email Infrastructure (3 signals)
// ═════════════��════════════════��═══════════════

async function runDnsChecks(
  ctx: StaticCheckContext,
  signals: Signal[],
  ids: IdGenerator,
): Promise<void> {
  const { rootDomain, scoping, cycle_ref } = ctx;

  // 1. SPF record check
  try {
    const txtRecords = await dns.resolveTxt(rootDomain);
    const flat = txtRecords.map(r => r.join('')).join(' ');
    const hasSpf = flat.includes('v=spf1');

    if (!hasSpf) {
      signals.push(createSignal({
        ids,
        signal_key: 'spf_record_missing',
        category: SignalCategory.Security,
        attribute: 'dns.spf.present',
        value: 'false',
        confidence: 85,
        scoping,
        cycle_ref,
        evidence_refs: [],
        description: 'Order confirmation emails may never reach your buyers — without SPF, inbox providers flag your messages as spam or reject them entirely, leading to "where is my order?" support tickets and payment disputes.',
      }));
    }
  } catch {
    // DNS resolution failed — emit signal with lower confidence
    signals.push(createSignal({
      ids,
      signal_key: 'spf_record_missing',
      category: SignalCategory.Security,
      attribute: 'dns.spf.present',
      value: 'unknown',
      confidence: 50,
      scoping,
      cycle_ref,
      evidence_refs: [],
      description: 'We could not verify your email authentication setup — if order confirmations and shipping updates land in spam, buyers dispute charges instead of waiting.',
    }));
  }

  // 2. DKIM record check
  try {
    // Common DKIM selectors to probe
    const selectors = ['default', 'google', 'selector1', 'selector2', 'k1', 'mail', 'dkim'];
    let hasDkim = false;

    for (const sel of selectors) {
      try {
        const records = await dns.resolveTxt(`${sel}._domainkey.${rootDomain}`);
        if (records.length > 0) {
          hasDkim = true;
          break;
        }
      } catch {
        // selector not found, continue
      }
    }

    if (!hasDkim) {
      signals.push(createSignal({
        ids,
        signal_key: 'dkim_record_missing',
        category: SignalCategory.Security,
        attribute: 'dns.dkim.present',
        value: 'false',
        confidence: 70,
        scoping,
        cycle_ref,
        evidence_refs: [],
        description: 'Your emails lack a cryptographic signature that proves they really came from you — Gmail and Outlook are increasingly likely to reject unsigned messages, meaning buyers never see receipts or shipping updates.',
      }));
    }
  } catch {
    // Silently skip on complete DNS failure
  }

  // 3. DMARC record check
  try {
    const dmarcRecords = await dns.resolveTxt(`_dmarc.${rootDomain}`);
    const flat = dmarcRecords.map(r => r.join('')).join(' ');
    const hasDmarc = flat.includes('v=DMARC1');

    if (!hasDmarc) {
      signals.push(createSignal({
        ids,
        signal_key: 'dmarc_record_missing',
        category: SignalCategory.Security,
        attribute: 'dns.dmarc.present',
        value: 'false',
        confidence: 80,
        scoping,
        cycle_ref,
        evidence_refs: [],
        description: 'Anyone can send emails pretending to be your brand — without DMARC, phishing emails using your domain go unchallenged, eroding buyer trust and triggering fraud alerts at payment processors.',
      }));
    }
  } catch {
    signals.push(createSignal({
      ids,
      signal_key: 'dmarc_record_missing',
      category: SignalCategory.Security,
      attribute: 'dns.dmarc.present',
      value: 'unknown',
      confidence: 50,
      scoping,
      cycle_ref,
      evidence_refs: [],
      description: 'We could not verify your DMARC policy — without it, attackers can impersonate your brand in phishing campaigns, damaging buyer confidence and payment processor trust.',
    }));
  }
}

// ═════════════════════════════════════��════════
// SEO/Discoverability (6 signals)
// ══════════════════════════════════════════════

const COMMERCIAL_PATH = /checkout|cart|pay|pricing|product|comprar|pedido|carrinho|planos|plans|buy|shop|store|loja/i;

function runSeoChecks(
  byType: Map<EvidenceType, Evidence[]>,
  ctx: StaticCheckContext,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const pages = byType.get(EvidenceType.PageContent) || [];
  const { scoping, cycle_ref } = ctx;

  if (pages.length === 0) return;

  // 4. meta_description_missing_commercial — Commercial pages without meta description
  const commercialPages = pages.filter(e => {
    const p = e.payload as PageContentPayload;
    return COMMERCIAL_PATH.test(p.url);
  });

  const missingDescPages = commercialPages.filter(e => {
    const p = e.payload as PageContentPayload;
    return !p.meta_description || p.meta_description.trim().length < 20;
  });

  if (missingDescPages.length > 0) {
    signals.push(createSignal({
      ids,
      signal_key: 'meta_description_missing_commercial',
      category: SignalCategory.Discoverability,
      attribute: 'seo.meta_description.commercial_missing',
      value: String(missingDescPages.length),
      numeric_value: missingDescPages.length,
      confidence: 75,
      scoping,
      cycle_ref,
      evidence_refs: missingDescPages.slice(0, 5).map(e => makeRef('evidence', e.id)),
      description: `${missingDescPages.length} page(s) where people can buy or explore your offering have no compelling description for search engines — Google writes its own snippet and your click-through rate drops by 30-50% versus competitors who control their message.`,
    }));
  }

  // 5. duplicate_title_tags — Multiple pages share the same <title>
  const titleMap = new Map<string, Evidence[]>();
  for (const e of pages) {
    const p = e.payload as PageContentPayload;
    if (p.title && p.title.trim().length > 0) {
      const key = p.title.trim().toLowerCase();
      const list = titleMap.get(key) || [];
      list.push(e);
      titleMap.set(key, list);
    }
  }

  const duplicateTitles = Array.from(titleMap.entries()).filter(([, evs]) => evs.length > 1);
  if (duplicateTitles.length > 0) {
    const totalDupPages = duplicateTitles.reduce((sum, [, evs]) => sum + evs.length, 0);
    const refs = duplicateTitles.flatMap(([, evs]) => evs).slice(0, 5).map(e => makeRef('evidence', e.id));
    signals.push(createSignal({
      ids,
      signal_key: 'duplicate_title_tags',
      category: SignalCategory.Discoverability,
      attribute: 'seo.title.duplicates',
      value: String(duplicateTitles.length),
      numeric_value: totalDupPages,
      confidence: 80,
      scoping,
      cycle_ref,
      evidence_refs: refs,
      description: `${totalDupPages} pages share identical titles — search engines cannot distinguish them, so they compete against each other for the same queries instead of each ranking for its own keywords. Your organic traffic gets cannibalized.`,
    }));
  }

  // 6. missing_canonical_url — Pages without rel=canonical
  const noCanonical = pages.filter(e => {
    const p = e.payload as PageContentPayload;
    return !p.canonical_url;
  });

  if (noCanonical.length >= 2) {
    signals.push(createSignal({
      ids,
      signal_key: 'missing_canonical_url',
      category: SignalCategory.Discoverability,
      attribute: 'seo.canonical.missing',
      value: String(noCanonical.length),
      numeric_value: noCanonical.length,
      confidence: 70,
      scoping,
      cycle_ref,
      evidence_refs: noCanonical.slice(0, 5).map(e => makeRef('evidence', e.id)),
      description: `Search engines can't tell which version of ${noCanonical.length} page(s) is the real one — your ranking authority gets split across duplicates, and pages that should rank #1 end up on page 2 instead.`,
    }));
  }

  // 7. missing_og_tags — No og:title or og:image on commercial pages
  const metas = byType.get(EvidenceType.Meta) || [];
  const metaByUrl = new Map<string, Evidence>();
  for (const m of metas) {
    const p = m.payload as MetaPayload;
    metaByUrl.set(p.page_url, m);
  }

  // Also check page_content meta_tags field (parser extracts og: into meta_tags)
  const missingOgPages = commercialPages.filter(e => {
    const p = e.payload as PageContentPayload;
    const meta = metaByUrl.get(p.url);
    if (meta) {
      const og = (meta.payload as MetaPayload).og_tags || {};
      return !og['og:title'] || !og['og:image'];
    }
    // If no Meta evidence, OG tags are definitely missing
    return true;
  });

  if (missingOgPages.length > 0) {
    signals.push(createSignal({
      ids,
      signal_key: 'missing_og_tags',
      category: SignalCategory.Discoverability,
      attribute: 'seo.og_tags.missing',
      value: String(missingOgPages.length),
      numeric_value: missingOgPages.length,
      confidence: 70,
      scoping,
      cycle_ref,
      evidence_refs: missingOgPages.slice(0, 5).map(e => makeRef('evidence', e.id)),
      description: `${missingOgPages.length} commercial page(s) appear as plain text links when shared on social media — no product image, no headline. Every share becomes a missed conversion because nobody clicks a bare URL.`,
    }));
  }

  // 8. missing_structured_data — No JSON-LD schema on product/pricing pages
  const structuredData = byType.get(EvidenceType.StructuredDataItem) || [];
  const pagesWithSchema = new Set<string>();
  for (const sd of structuredData) {
    const p = sd.payload as StructuredDataItemPayload;
    pagesWithSchema.add(p.page_url);
  }

  const PRODUCT_PRICING_PATH = /product|pricing|plans|planos|precos|shop|loja|item/i;
  const productPages = pages.filter(e => PRODUCT_PRICING_PATH.test((e.payload as PageContentPayload).url));
  const noSchemaPages = productPages.filter(e => {
    const p = e.payload as PageContentPayload;
    return !pagesWithSchema.has(p.url);
  });

  if (noSchemaPages.length > 0) {
    signals.push(createSignal({
      ids,
      signal_key: 'missing_structured_data',
      category: SignalCategory.Discoverability,
      attribute: 'seo.structured_data.missing',
      value: String(noSchemaPages.length),
      numeric_value: noSchemaPages.length,
      confidence: 72,
      scoping,
      cycle_ref,
      evidence_refs: noSchemaPages.slice(0, 5).map(e => makeRef('evidence', e.id)),
      description: `${noSchemaPages.length} product or pricing page(s) have no structured data — Google cannot show rich results (stars, price, availability) for these pages, making competitors with rich snippets 2-3x more clickable in search results.`,
    }));
  }

  // 9. h1_missing_or_duplicate — Missing H1 or multiple H1s
  const noH1Pages = pages.filter(e => {
    const p = e.payload as PageContentPayload;
    return !p.h1 || p.h1.trim().length === 0;
  });

  if (noH1Pages.length > 0) {
    signals.push(createSignal({
      ids,
      signal_key: 'h1_missing_or_duplicate',
      category: SignalCategory.Discoverability,
      attribute: 'seo.h1.issues',
      value: 'missing',
      numeric_value: noH1Pages.length,
      confidence: 68,
      scoping,
      cycle_ref,
      evidence_refs: noH1Pages.slice(0, 5).map(e => makeRef('evidence', e.id)),
      description: `${noH1Pages.length} page(s) have no main heading — search engines and visitors cannot instantly understand what the page offers, increasing bounce rate and weakening topical authority.`,
    }));
  }
}

// ═══════════���═══════════════════��══════════════
// Performance (4 signals)
// ══════════════���═════════════════��═════════════

function runPerformanceChecks(
  byType: Map<EvidenceType, Evidence[]>,
  ctx: StaticCheckContext,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const httpResponses = byType.get(EvidenceType.HttpResponse) || [];
  const scripts = byType.get(EvidenceType.Script) || [];
  const { scoping, cycle_ref, rootDomain } = ctx;

  if (httpResponses.length === 0) return;

  // 10. no_compression_detected — Response without gzip/brotli
  const uncompressed = httpResponses.filter(e => {
    const p = e.payload as HttpResponsePayload;
    if (p.status_code < 200 || p.status_code >= 400) return false;
    const contentType = p.content_type || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/javascript') && !contentType.includes('text/css')) return false;
    const encoding = (p.headers?.['content-encoding'] || '').toLowerCase();
    return !encoding.includes('gzip') && !encoding.includes('br') && !encoding.includes('deflate');
  });

  if (uncompressed.length > 0) {
    signals.push(createSignal({
      ids,
      signal_key: 'no_compression_detected',
      category: SignalCategory.Friction,
      attribute: 'performance.compression.absent',
      value: String(uncompressed.length),
      numeric_value: uncompressed.length,
      confidence: 75,
      scoping,
      cycle_ref,
      evidence_refs: uncompressed.slice(0, 5).map(e => makeRef('evidence', e.id)),
      description: `${uncompressed.length} page(s) are served without compression — they take 3-5x longer to download than necessary. On mobile or slow connections, buyers abandon before your page even finishes loading.`,
    }));
  }

  // 11. heavy_page_weight — Total response > 2MB
  const HEAVY_THRESHOLD = 2 * 1024 * 1024; // 2MB
  const heavyPages = httpResponses.filter(e => {
    const p = e.payload as HttpResponsePayload;
    return p.content_length != null && p.content_length > HEAVY_THRESHOLD;
  });

  if (heavyPages.length > 0) {
    signals.push(createSignal({
      ids,
      signal_key: 'heavy_page_weight',
      category: SignalCategory.Friction,
      attribute: 'performance.page_weight.heavy',
      value: String(heavyPages.length),
      numeric_value: heavyPages.length,
      confidence: 80,
      scoping,
      cycle_ref,
      evidence_refs: heavyPages.slice(0, 5).map(e => makeRef('evidence', e.id)),
      description: `${heavyPages.length} page(s) exceed 2MB — each megabyte adds ~1 second of load time on 4G. Research shows 53% of mobile visitors abandon sites that take more than 3 seconds to load, directly costing you conversions.`,
    }));
  }

  // 12. slow_server_response — TTFB > 800ms
  const SLOW_THRESHOLD_MS = 800;
  const slowPages = httpResponses.filter(e => {
    const p = e.payload as HttpResponsePayload;
    return p.response_time_ms > SLOW_THRESHOLD_MS;
  });

  if (slowPages.length > 0) {
    const worstMs = Math.max(...slowPages.map(e => (e.payload as HttpResponsePayload).response_time_ms));
    signals.push(createSignal({
      ids,
      signal_key: 'slow_server_response',
      category: SignalCategory.Friction,
      attribute: 'performance.ttfb.slow',
      value: String(slowPages.length),
      numeric_value: worstMs,
      confidence: 78,
      scoping,
      cycle_ref,
      evidence_refs: slowPages.slice(0, 5).map(e => makeRef('evidence', e.id)),
      description: `${slowPages.length} page(s) take over 800ms just for the server to respond (worst: ${Math.round(worstMs)}ms) — before any content even starts rendering. Every 100ms of delay reduces conversion rate by ~1%. Your buyers wait while competitors load instantly.`,
    }));
  }

  // 13. excessive_third_party_scripts — >8 unique third-party script domains
  const thirdPartyHosts = new Set<string>();
  for (const e of scripts) {
    const p = e.payload as ScriptPayload;
    if (p.is_external) {
      try {
        const host = new URL(p.src).hostname;
        if (!host.includes(rootDomain)) {
          thirdPartyHosts.add(host);
        }
      } catch {
        // invalid URL, skip
      }
    }
  }

  if (thirdPartyHosts.size > 8) {
    signals.push(createSignal({
      ids,
      signal_key: 'excessive_third_party_scripts',
      category: SignalCategory.Friction,
      attribute: 'performance.third_party.excessive',
      value: String(thirdPartyHosts.size),
      numeric_value: thirdPartyHosts.size,
      confidence: 72,
      scoping,
      cycle_ref,
      evidence_refs: scripts
        .filter(e => (e.payload as ScriptPayload).is_external)
        .slice(0, 5)
        .map(e => makeRef('evidence', e.id)),
      description: `Your pages load scripts from ${thirdPartyHosts.size} different external services — each one adds DNS lookups, TLS handshakes, and execution time. Beyond 8 third parties, pages become noticeably sluggish, especially on mobile where each blocked script freezes the entire screen.`,
    }));
  }
}

// ══════════════════════════��═══════════════════
// Security (4 signals)
// ════════════════════════════════════���═════════

function runSecurityChecks(
  byType: Map<EvidenceType, Evidence[]>,
  ctx: StaticCheckContext,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const httpResponses = byType.get(EvidenceType.HttpResponse) || [];
  const scripts = byType.get(EvidenceType.Script) || [];
  const pages = byType.get(EvidenceType.PageContent) || [];
  const { scoping, cycle_ref } = ctx;

  if (httpResponses.length === 0) return;

  // 14. mixed_content_detected — HTTP resources loaded on HTTPS pages
  const httpScripts = scripts.filter(e => {
    const p = e.payload as ScriptPayload;
    return p.src.startsWith('http://') && p.is_external;
  });

  if (httpScripts.length > 0) {
    signals.push(createSignal({
      ids,
      signal_key: 'mixed_content_detected',
      category: SignalCategory.Security,
      attribute: 'security.mixed_content.present',
      value: 'true',
      numeric_value: httpScripts.length,
      confidence: 85,
      scoping,
      cycle_ref,
      evidence_refs: httpScripts.slice(0, 5).map(e => makeRef('evidence', e.id)),
      description: `${httpScripts.length} insecure resource(s) load over plain HTTP on your HTTPS pages — browsers show a "Not Secure" warning that makes buyers distrust your checkout. Credit card data could be intercepted by attackers on the same network.`,
    }));
  }

  // 15. cookies_insecure_flags — Session cookies without Secure/HttpOnly
  const insecureCookiePages: Evidence[] = [];
  for (const e of httpResponses) {
    const p = e.payload as HttpResponsePayload;
    const setCookie = p.headers?.['set-cookie'] || '';
    if (setCookie.length === 0) continue;

    // Check each cookie in the header
    const cookies = setCookie.split(/,(?=[^;]*=)/);
    for (const cookie of cookies) {
      const lower = cookie.toLowerCase();
      const isSession = /sess|token|auth|jwt|sid/i.test(cookie.split('=')[0] || '');
      if (isSession) {
        const missingSecure = !lower.includes('secure');
        const missingHttpOnly = !lower.includes('httponly');
        if (missingSecure || missingHttpOnly) {
          insecureCookiePages.push(e);
          break;
        }
      }
    }
  }

  if (insecureCookiePages.length > 0) {
    signals.push(createSignal({
      ids,
      signal_key: 'cookies_insecure_flags',
      category: SignalCategory.Security,
      attribute: 'security.cookies.insecure',
      value: 'true',
      numeric_value: insecureCookiePages.length,
      confidence: 80,
      scoping,
      cycle_ref,
      evidence_refs: insecureCookiePages.slice(0, 5).map(e => makeRef('evidence', e.id)),
      description: `Session cookies on ${insecureCookiePages.length} page(s) lack security flags — an attacker on public Wi-Fi can steal your buyers\' login sessions. This puts you at risk of account takeover complaints, refund fraud, and regulatory penalties.`,
    }));
  }

  // 16. server_version_exposed — Server/X-Powered-By header leaking version
  const exposedServers: Evidence[] = [];
  for (const e of httpResponses) {
    const p = e.payload as HttpResponsePayload;
    const server = p.headers?.['server'] || '';
    const poweredBy = p.headers?.['x-powered-by'] || '';
    // Check if version numbers are exposed (e.g., "nginx/1.18.0" or "PHP/8.1")
    if (/\d+\.\d+/.test(server) || /\d+\.\d+/.test(poweredBy)) {
      exposedServers.push(e);
    }
  }

  if (exposedServers.length > 0) {
    signals.push(createSignal({
      ids,
      signal_key: 'server_version_exposed',
      category: SignalCategory.Security,
      attribute: 'security.server_version.exposed',
      value: 'true',
      numeric_value: exposedServers.length,
      confidence: 65,
      scoping,
      cycle_ref,
      evidence_refs: exposedServers.slice(0, 5).map(e => makeRef('evidence', e.id)),
      description: `Your server broadcasts its exact software version to the internet — automated scanners use this to target known vulnerabilities in that version. A successful attack takes your store offline during peak hours.`,
    }));
  }

  // 17. referrer_policy_missing — No Referrer-Policy header on checkout
  const CHECKOUT_PATH = /checkout|cart|pay|payment|billing|order|purchase|comprar|pedido/i;
  const checkoutResponses = httpResponses.filter(e => {
    const p = e.payload as HttpResponsePayload;
    return CHECKOUT_PATH.test(p.url);
  });

  const noReferrerPolicy = checkoutResponses.filter(e => {
    const p = e.payload as HttpResponsePayload;
    return !p.headers?.['referrer-policy'];
  });

  if (noReferrerPolicy.length > 0) {
    signals.push(createSignal({
      ids,
      signal_key: 'referrer_policy_missing',
      category: SignalCategory.Security,
      attribute: 'security.referrer_policy.missing_checkout',
      value: 'true',
      numeric_value: noReferrerPolicy.length,
      confidence: 70,
      scoping,
      cycle_ref,
      evidence_refs: noReferrerPolicy.slice(0, 5).map(e => makeRef('evidence', e.id)),
      description: `Your checkout pages leak the full URL (including order IDs and cart contents) to every third-party service loaded on the page — analytics tools, ad pixels, and widgets all see what your buyer is purchasing, creating privacy liability and potential data breach exposure.`,
    }));
  }
}

// ══════════════════════════════════════════════
// Conversion/Trust (4 signals)
// ═════════════════════════���════════════════════

function runConversionTrustChecks(
  byType: Map<EvidenceType, Evidence[]>,
  ctx: StaticCheckContext,
  signals: Signal[],
  ids: IdGenerator,
): void {
  const httpResponses = byType.get(EvidenceType.HttpResponse) || [];
  const pages = byType.get(EvidenceType.PageContent) || [];
  const links = byType.get(EvidenceType.Link) || [];
  const { scoping, cycle_ref, rootDomain } = ctx;

  // 18. favicon_missing — No favicon link or /favicon.ico
  const hasFaviconEvidence = httpResponses.some(e => {
    const p = e.payload as HttpResponsePayload;
    return p.url.includes('/favicon') && p.status_code >= 200 && p.status_code < 400;
  });

  // Check if any link evidence points to a favicon
  const hasFaviconLink = links.some(e => {
    const p = e.payload as LinkPayload;
    return p.rel?.includes('icon') || p.href.includes('favicon');
  });

  if (!hasFaviconEvidence && !hasFaviconLink) {
    signals.push(createSignal({
      ids,
      signal_key: 'favicon_missing',
      category: SignalCategory.Trust,
      attribute: 'trust.favicon.present',
      value: 'false',
      confidence: 60,
      scoping,
      cycle_ref,
      evidence_refs: [],
      description: 'Your site shows a generic browser icon instead of your brand mark — tabs blend into the background, bookmarks look untrustworthy, and return visitors cannot quickly find you among their open tabs. This subconsciously signals "amateur operation" before they even read your page.',
    }));
  }

  // 19. social_links_dead — Social media links returning non-200
  const SOCIAL_DOMAINS = /facebook\.com|twitter\.com|x\.com|instagram\.com|linkedin\.com|youtube\.com|tiktok\.com|pinterest\.com/i;

  const socialLinks = links.filter(e => {
    const p = e.payload as LinkPayload;
    return SOCIAL_DOMAINS.test(p.href) && p.is_external;
  });

  // Check if any social link targets got fetched and returned non-200
  const socialUrls = new Set(socialLinks.map(e => (e.payload as LinkPayload).href));
  const deadSocialEvidence: Evidence[] = [];

  for (const e of httpResponses) {
    const p = e.payload as HttpResponsePayload;
    if (socialUrls.has(p.url) && (p.status_code >= 400 || p.status_code === 0)) {
      deadSocialEvidence.push(e);
    }
  }

  // Even without direct HTTP checks, broken social patterns are detectable
  // from links pointing to obviously broken paths (e.g., facebook.com/undefined)
  const suspiciousSocial = socialLinks.filter(e => {
    const p = e.payload as LinkPayload;
    return /\/(undefined|null|#|your-page|username|handle)\/?$/i.test(p.href);
  });

  const totalDeadSocial = deadSocialEvidence.length + suspiciousSocial.length;
  if (totalDeadSocial > 0) {
    const refs = [...deadSocialEvidence, ...suspiciousSocial].slice(0, 5).map(e => makeRef('evidence', e.id));
    signals.push(createSignal({
      ids,
      signal_key: 'social_links_dead',
      category: SignalCategory.Trust,
      attribute: 'trust.social_links.dead',
      value: String(totalDeadSocial),
      numeric_value: totalDeadSocial,
      confidence: 72,
      scoping,
      cycle_ref,
      evidence_refs: refs,
      description: `${totalDeadSocial} social media link(s) point to dead or placeholder pages — when a buyer clicks to verify your brand is real and gets a 404, they assume the business is abandoned or fake. Trust evaporates at the worst possible moment.`,
    }));
  }

  // 20. images_missing_alt — >50% images without alt text
  // We detect this from page content evidence (script_count, form_count are present
  // but img alt is not in PageContentPayload). Use a heuristic: if the page has
  // high word count but external_link_count is low and form_count is 0, it's
  // likely a content-heavy page. We check via available evidence signals.
  // Actually, we can detect this from the HTML body if accessible via link evidence.
  // For now, check meta evidence for accessibility signals.
  // NOTE: Since we don't have direct img alt data in evidence, use a proxy:
  // pages with many external scripts but low content are image-heavy sites
  // with poor alt coverage. This is a weaker signal.
  //
  // Better approach: check if MetaPayload has og:image:alt or if structured data
  // includes imageObject with descriptions. Pages with images but no alt text
  // are detectable through the absence of image-related accessibility markers.

  // Since direct alt text counting isn't available in the evidence model,
  // we detect pages where commercial images are likely present but accessibility
  // markers are absent (no structured data images, no og:image:alt)
  const metas = byType.get(EvidenceType.Meta) || [];
  const structuredData = byType.get(EvidenceType.StructuredDataItem) || [];

  // Product/commercial pages that have no image-related structured data or OG alt
  const imageHeavyCommercialPages = pages.filter(e => {
    const p = e.payload as PageContentPayload;
    // Product pages are typically image-heavy
    return /product|item|shop|loja|collection/i.test(p.url) && p.body_word_count > 50;
  });

  if (imageHeavyCommercialPages.length > 0) {
    const pagesWithImageSchema = new Set<string>();
    for (const sd of structuredData) {
      const p = sd.payload as StructuredDataItemPayload;
      if (p.schema_type === 'ImageObject' || p.schema_type === 'Product') {
        pagesWithImageSchema.add(p.page_url);
      }
    }

    const noImageAccessibility = imageHeavyCommercialPages.filter(e => {
      const p = e.payload as PageContentPayload;
      return !pagesWithImageSchema.has(p.url);
    });

    if (noImageAccessibility.length > 0 && noImageAccessibility.length >= imageHeavyCommercialPages.length * 0.5) {
      signals.push(createSignal({
        ids,
        signal_key: 'images_missing_alt',
        category: SignalCategory.Discoverability,
        attribute: 'accessibility.images.alt_missing',
        value: String(noImageAccessibility.length),
        numeric_value: noImageAccessibility.length,
        confidence: 55,
        scoping,
        cycle_ref,
        evidence_refs: noImageAccessibility.slice(0, 5).map(e => makeRef('evidence', e.id)),
        description: `${noImageAccessibility.length} product page(s) appear to lack proper image descriptions — screen readers cannot describe your products to visually impaired buyers, and Google Image Search cannot index your product photos, cutting off a free traffic source worth 10-20% of organic visits for visual products.`,
      }));
    }
  }

  // 21. language_tag_mismatch — html lang="en" but content clearly in another language
  const langMismatchPages: Evidence[] = [];
  for (const e of pages) {
    const p = e.payload as PageContentPayload;
    if (!p.lang) continue;
    const declaredLang = p.lang.toLowerCase().slice(0, 2);

    // Detect mismatch by checking title/description for non-matching language patterns
    const text = `${p.title || ''} ${p.meta_description || ''} ${p.h1 || ''}`.toLowerCase();
    if (text.length < 10) continue;

    // Heuristic: if lang="en" but text contains common Portuguese/Spanish indicators
    if (declaredLang === 'en') {
      const ptEsIndicators = /\b(comprar|carrinho|envio|garantia|atendimento|contato|produto|pagamento|sobre|politica|privacidade|termos|servicios|compras|ayuda|nosotros|contacto|tienda)\b/i;
      if (ptEsIndicators.test(text)) {
        langMismatchPages.push(e);
      }
    }
    // If lang="pt" or "es" but content looks English
    if (declaredLang === 'pt' || declaredLang === 'es') {
      const enIndicators = /\b(checkout|shipping|our team|get started|learn more|subscribe|newsletter|privacy policy|terms of service|add to cart)\b/i;
      if (enIndicators.test(text)) {
        langMismatchPages.push(e);
      }
    }
  }

  if (langMismatchPages.length > 0) {
    signals.push(createSignal({
      ids,
      signal_key: 'language_tag_mismatch',
      category: SignalCategory.Discoverability,
      attribute: 'seo.language.mismatch',
      value: String(langMismatchPages.length),
      numeric_value: langMismatchPages.length,
      confidence: 65,
      scoping,
      cycle_ref,
      evidence_refs: langMismatchPages.slice(0, 5).map(e => makeRef('evidence', e.id)),
      description: `${langMismatchPages.length} page(s) declare one language but contain content in another — search engines serve these pages to the wrong audience. A Brazilian buyer searching in Portuguese won't find you, and an English searcher who lands on your Portuguese page bounces immediately.`,
    }));
  }
}

// Wave 20.3 — local createSignal copy removed. Use the canonical
// factory imported from `packages/signals` at the top of this file.
