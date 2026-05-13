import {
  Signal,
  Inference,
  InferenceCategory,
  Evidence,
  EvidenceType,
  FreshnessState,
  Scoping,
  IdGenerator,
  makeRef,
} from '../domain';

// ──────────────────────────────────────────────
// Funnel-Moment Inference Engine
//
// Derives findings that analyze the BUYER'S JOURNEY
// through the site — not technical compliance.
//
// 25 findings across 5 funnel moments:
//   Moment 1: First Impression (0-5 sec)   — 4 findings
//   Moment 2: Consideration (exploring)    — 7 findings
//   Moment 3: Decision (pricing/checkout)  — 5 findings
//   Moment 4: Post-purchase (onboarding)   — 3 findings
//   Moment 5: Expansion (upgrade/referral) — 3 findings
//   Cross-journey                          — 3 findings
//
// businessModel gates expectations per vertical
// (e.g. SaaS expects trial CTA, ecommerce expects payment methods).
// ──────────────────────────────────────────────

const ids = new IdGenerator('funnel_inf');

// ── Evidence helpers ────────────────────────────

function buildCorpus(evidence: readonly Evidence[]): string {
  const parts: string[] = [];
  for (const ev of evidence) {
    const p = ev.payload as unknown as Record<string, unknown>;
    if (p.title) parts.push(String(p.title));
    if (p.meta_description) parts.push(String(p.meta_description));
    if (p.h1) parts.push(String(p.h1));
    if (p.url) parts.push(String(p.url));
    if (p.body_text) parts.push(String(p.body_text));
    if (p.above_fold_text) parts.push(String(p.above_fold_text));
    if (p.cta_texts && Array.isArray(p.cta_texts)) parts.push((p.cta_texts as string[]).join(' '));
  }
  return parts.join(' ').toLowerCase();
}

function getPageContentEvidence(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.PageContent);
}

// ── Multi-signal page type bucketing ──
// Priority: classifiedPageType from multi-signal classifier > URL regex fallback.
// If classifiedPages is provided and the URL is in the map, that result is authoritative.
// Falls back to URL regex only when classifiedPages is absent or the URL isn't in the map.

function isPageType(
  e: Evidence,
  classifiedPages: Map<string, string> | undefined,
  matchedTypes: string[],
  urlFallback: (url: string) => boolean,
): boolean {
  if (e.evidence_type !== EvidenceType.PageContent) return false;
  const rawUrl = (e.payload as { url?: string }).url ?? '';
  if (classifiedPages) {
    const classified = classifiedPages.get(rawUrl);
    if (classified !== undefined) {
      return matchedTypes.includes(classified);
    }
    // URL not in classification map — fall through to URL regex
  }
  return urlFallback(rawUrl.toLowerCase());
}

function getHomepageEvidence(evidence: readonly Evidence[], classifiedPages?: Map<string, string>): Evidence[] {
  return evidence.filter(e => isPageType(e, classifiedPages,
    ['homepage', 'landing'],
    url => url.endsWith('/') || /^https?:\/\/[^/]+\/?$/.test(url),
  ));
}

function getPricingEvidence(evidence: readonly Evidence[], classifiedPages?: Map<string, string>): Evidence[] {
  return evidence.filter(e => isPageType(e, classifiedPages,
    ['pricing'],
    url => url.includes('/pricing') || url.includes('/preco') || url.includes('/planos') || url.includes('/plans'),
  ));
}

function getCheckoutEvidence(evidence: readonly Evidence[], classifiedPages?: Map<string, string>): Evidence[] {
  return evidence.filter(e => isPageType(e, classifiedPages,
    ['checkout', 'cart'],
    url => url.includes('/checkout') || url.includes('/cart') || url.includes('/carrinho') || url.includes('/payment'),
  ));
}

function getSupportEvidence(evidence: readonly Evidence[], classifiedPages?: Map<string, string>): Evidence[] {
  return evidence.filter(e => isPageType(e, classifiedPages,
    ['support', 'contact'],
    url => url.includes('/help') || url.includes('/support') || url.includes('/suporte') ||
           url.includes('/contact') || url.includes('/contato') || url.includes('/faq'),
  ));
}

function getAppEvidence(evidence: readonly Evidence[], classifiedPages?: Map<string, string>): Evidence[] {
  return evidence.filter(e => isPageType(e, classifiedPages,
    ['account', 'onboarding'],
    url => url.includes('/app') || url.includes('/dashboard') || url.includes('/onboarding'),
  ));
}

function getNonCommercialEvidence(evidence: readonly Evidence[], classifiedPages?: Map<string, string>): Evidence[] {
  return evidence.filter(e => isPageType(e, classifiedPages,
    ['support', 'contact', 'about', 'blog'],
    url => url.includes('/help') || url.includes('/support') || url.includes('/suporte') ||
           url.includes('/about') || url.includes('/sobre') || url.includes('/docs') ||
           url.includes('/faq') || url.includes('/blog'),
  ));
}

function getCopyElements(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => {
    const p = e.payload as { type?: string };
    return p.type === 'copy_elements';
  });
}

function getFormEvidence(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.Form);
}

function getContentEnrichments(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.ContentEnrichment);
}

function corpusForPages(pages: Evidence[]): string {
  return pages
    .map(e => {
      const p = e.payload as unknown as Record<string, unknown>;
      return [p.title, p.h1, p.meta_description, p.body_text, p.above_fold_text]
        .filter(Boolean)
        .map(String)
        .join(' ');
    })
    .join(' ')
    .toLowerCase();
}

/**
 * Count occurrences of any pattern in a text.
 */
function countPatternHits(text: string, patterns: string[]): number {
  let count = 0;
  for (const p of patterns) {
    let idx = 0;
    while ((idx = text.indexOf(p, idx)) !== -1) {
      count++;
      idx += p.length;
    }
  }
  return count;
}

function isSaas(model: string): boolean {
  return model === 'saas';
}

function isEcommerce(model: string): boolean {
  return model.includes('ecommerce') || model.includes('ecom');
}

// ── Main entry point ─────────────────────────

export function computeFunnelMomentInferences(
  signals: Signal[],
  scoping: Scoping,
  cycleRef: string,
  businessModel: string | null,
  evidence: readonly Evidence[],
  classifiedPages?: Map<string, string>,
): Inference[] {
  const inferences: Inference[] = [];
  const sigMap = new Map<string, Signal>();
  for (const s of signals) sigMap.set(s.signal_key, s);

  const model = (businessModel ?? '').toLowerCase();
  const corpus = buildCorpus(evidence);
  const cp = classifiedPages; // short alias for threading

  // ── Moment 1: First Impression (0-5 seconds) — 4 findings ──
  inferences.push(...inferHeroOutcomeAbsent(sigMap, scoping, cycleRef, evidence, corpus, model, cp));
  inferences.push(...inferCognitiveLoadFirstScreen(sigMap, scoping, cycleRef, evidence, corpus, model, cp));
  inferences.push(...inferPrimaryCtaDelayed(sigMap, scoping, cycleRef, evidence, corpus, model, cp));
  inferences.push(...inferSpecificityDeficit(sigMap, scoping, cycleRef, evidence, corpus, model, cp));

  // ── Moment 2: Consideration (exploring the site) — 7 findings ──
  inferences.push(...inferProofOfWorkMissing(sigMap, scoping, cycleRef, evidence, corpus, model));
  inferences.push(...inferNavigationDeadEnds(sigMap, scoping, cycleRef, evidence, corpus, model, cp));
  inferences.push(...inferPageDepthBeforeConversion(sigMap, scoping, cycleRef, evidence, corpus, model, cp));
  inferences.push(...inferFeatureBenefitDisconnect(sigMap, scoping, cycleRef, evidence, corpus, model));
  inferences.push(...inferComparisonAbsent(sigMap, scoping, cycleRef, evidence, corpus, model));
  inferences.push(...inferObjectionEchoChamber(sigMap, scoping, cycleRef, evidence, corpus, model));
  inferences.push(...inferSocialChannelsDecorative(sigMap, scoping, cycleRef, evidence, corpus, model));

  // ── Moment 3: Decision (pricing/checkout) — 5 findings ──
  inferences.push(...inferPricingWithoutContext(sigMap, scoping, cycleRef, evidence, corpus, model, cp));
  inferences.push(...inferCheckoutIdentityBreak(sigMap, scoping, cycleRef, evidence, corpus, model));
  inferences.push(...inferPaymentOptionsInvisible(sigMap, scoping, cycleRef, evidence, corpus, model, cp));
  inferences.push(...inferGuaranteeInvisibleAtDecision(sigMap, scoping, cycleRef, evidence, corpus, model, cp));
  inferences.push(...inferUrgencyMechanicsAbsent(sigMap, scoping, cycleRef, evidence, corpus, model));

  // ── Moment 4: Post-purchase (onboarding/retention) — 3 findings ──
  inferences.push(...inferFirstValuePathUnclear(sigMap, scoping, cycleRef, evidence, corpus, model, cp));
  inferences.push(...inferSupportResponseExpectationGap(sigMap, scoping, cycleRef, evidence, corpus, model, cp));
  inferences.push(...inferBillingTransparencyAbsent(sigMap, scoping, cycleRef, evidence, corpus, model));

  // ── Moment 5: Expansion (upgrade/referral) — 3 findings ──
  inferences.push(...inferUpgradeValueGap(sigMap, scoping, cycleRef, evidence, corpus, model, cp));
  inferences.push(...inferReferralPathNonexistent(sigMap, scoping, cycleRef, evidence, corpus, model));
  inferences.push(...inferSuccessStoryFeedbackLoopBroken(sigMap, scoping, cycleRef, evidence, corpus, model));

  // ── Cross-journey — 3 findings ──
  inferences.push(...inferToneShiftAcrossJourney(sigMap, scoping, cycleRef, evidence, corpus, model));
  inferences.push(...inferMobileJourneyFrictionCompound(sigMap, scoping, cycleRef, evidence, corpus, model));
  inferences.push(...inferTrustGradientInverted(sigMap, scoping, cycleRef, evidence, corpus, model, cp));

  return inferences;
}

// ═══════════════════════════════════════════════
// MOMENT 1: FIRST IMPRESSION (0-5 seconds)
// ═══════════════════════════════════════════════

/**
 * 1. hero_outcome_absent — H1/subtitle describe what product IS but not
 * what it DOES for the buyer. No measurable outcome in first screen.
 */
function inferHeroOutcomeAbsent(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], _corpus: string, _model: string,
  cp?: Map<string, string>,
): Inference[] {
  const homePages = getHomepageEvidence(evidence, cp);
  if (homePages.length === 0) return [];

  const homeCorpus = corpusForPages(homePages);

  // Outcome signals: numbers, percentages, timeframes, result verbs
  const outcomePatterns = [
    /\d+%/, /\d+x/, /\d+ vezes/,
    /em \d+ (dias?|horas?|minutos?|semanas?|meses?)/,
    /in \d+ (days?|hours?|minutes?|weeks?|months?)/,
    /\$\d+/, /r\$\s?\d+/,
    /reduz|reduza|reduce|increase|aument|save|economi|ganha|ganhe|gain|grow|boost|elimina|triplica|duplica|dobrando/,
  ];

  const hasOutcome = outcomePatterns.some(p => p.test(homeCorpus));
  if (hasOutcome) return [];

  // Additional check: above-fold text specifically
  const aboveFold = homePages
    .map(e => ((e.payload as { above_fold_text?: string }).above_fold_text ?? '').toLowerCase())
    .join(' ');

  const hasAboveFoldOutcome = outcomePatterns.some(p => p.test(aboveFold));
  if (hasAboveFoldOutcome) return [];

  return [buildInference(
    'hero_outcome_absent',
    InferenceCategory.ConversionClarity,
    scoping, cycleRef, 'true', 'high', 72,
    [],
    homePages.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'O título da sua página descreve o que seu produto é, mas não o que ele faz pelo comprador. Visitantes gastam 5 segundos decidindo se vale explorar — sem resultado concreto visível, a maioria fecha a aba.',
  )];
}

/**
 * 2. cognitive_load_first_screen — 5+ distinct H2 sections or value
 * propositions compete before the primary CTA. No visual hierarchy.
 */
function inferCognitiveLoadFirstScreen(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], _corpus: string, _model: string,
  cp?: Map<string, string>,
): Inference[] {
  const homePages = getHomepageEvidence(evidence, cp);
  if (homePages.length === 0) return [];

  // Count H2-like sections in above-fold text
  const aboveFold = homePages
    .map(e => ((e.payload as { above_fold_text?: string }).above_fold_text ?? ''))
    .join('\n');

  // Heuristic: count distinct short lines that look like headings (uppercase start, under 80 chars)
  // Also count via body_text structure looking for multiple value propositions
  const bodyText = homePages
    .map(e => ((e.payload as { body_text?: string }).body_text ?? ''))
    .join('\n');

  // Count H2 markers or section-heading patterns
  const h2Matches = bodyText.match(/(?:^|\n)\s*#{2}\s+/g) || [];
  const sectionBreaks = bodyText.split(/\n{2,}/).filter(s => s.trim().length > 0 && s.trim().length < 100);

  // CTA texts on homepage — used to find where the first CTA is
  const ctaTexts = homePages.flatMap(e => {
    const p = e.payload as { cta_texts?: string[] };
    return p.cta_texts ?? [];
  });

  // If CTA exists, count how many distinct sections appear before it
  // Heuristic: if body_text has 5+ short paragraphs (value props) this indicates clutter
  const shortSections = bodyText.split(/\n/).filter(line => {
    const trimmed = line.trim();
    return trimmed.length > 10 && trimmed.length < 120;
  });

  // If we can detect more than 5 distinct value proposition blocks, flag
  if (shortSections.length < 5 && h2Matches.length < 5) return [];

  // Additional enrichment check
  const enrichments = getContentEnrichments(evidence);
  const enrichedAboveFoldClutter = enrichments.some(e => {
    const p = e.payload as { above_fold_cluttered?: boolean; section_count?: number };
    return p.above_fold_cluttered || (p.section_count ?? 0) >= 5;
  });

  if (!enrichedAboveFoldClutter && shortSections.length < 8 && h2Matches.length < 5) return [];

  return [buildInference(
    'cognitive_load_first_screen',
    InferenceCategory.ConversionFlow,
    scoping, cycleRef, 'true', 'medium', 68,
    [],
    homePages.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sua homepage tenta comunicar tudo de uma vez. Quando 5 propostas competem por atenção, nenhuma recebe — o visitante sente sobrecarga e sai sem clicar em nada.',
  )];
}

/**
 * 3. primary_cta_delayed — First actionable button (not nav) appears
 * after 3+ content sections. Visitor must scroll to find what to do.
 */
function inferPrimaryCtaDelayed(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], _corpus: string, _model: string,
  cp?: Map<string, string>,
): Inference[] {
  const homePages = getHomepageEvidence(evidence, cp);
  if (homePages.length === 0) return [];

  // Check if CTA appears in above-fold text
  const aboveFold = homePages
    .map(e => ((e.payload as { above_fold_text?: string }).above_fold_text ?? '').toLowerCase())
    .join(' ');

  const ctaTexts = homePages.flatMap(e => {
    const p = e.payload as { cta_texts?: string[] };
    return (p.cta_texts ?? []).map(t => t.toLowerCase());
  });

  // If there's a CTA AND it appears in above-fold, no problem
  if (ctaTexts.length > 0 && aboveFold.length > 0) {
    const ctaInAboveFold = ctaTexts.some(cta => aboveFold.includes(cta));
    if (ctaInAboveFold) return [];
  }

  // If no CTA texts at all, that's a different problem — still flag delayed CTA
  if (ctaTexts.length === 0) {
    // No CTA anywhere — worse than delayed
    return [buildInference(
      'primary_cta_delayed',
      InferenceCategory.FrictionPath,
      scoping, cycleRef, 'true', 'high', 70,
      [],
      homePages.slice(0, 2).map(e => makeRef('evidence', e.id)),
      'O primeiro botão de ação do seu site aparece só depois de muitas seções de conteúdo. Visitantes que já decidiram comprar não encontram caminho rápido e desistem da busca.',
    )];
  }

  // If above fold is empty but we have CTAs, means CTA is below fold
  if (aboveFold.length < 50) {
    return [buildInference(
      'primary_cta_delayed',
      InferenceCategory.FrictionPath,
      scoping, cycleRef, 'true', 'high', 70,
      [],
      homePages.slice(0, 2).map(e => makeRef('evidence', e.id)),
      'O primeiro botão de ação do seu site aparece só depois de muitas seções de conteúdo. Visitantes que já decidiram comprar não encontram caminho rápido e desistem da busca.',
    )];
  }

  // Check enrichments for CTA position data
  const enrichments = getContentEnrichments(evidence);
  const ctaDelayed = enrichments.some(e => {
    const p = e.payload as { cta_below_fold?: boolean; sections_before_cta?: number };
    return p.cta_below_fold || (p.sections_before_cta ?? 0) >= 3;
  });

  if (!ctaDelayed) return [];

  return [buildInference(
    'primary_cta_delayed',
    InferenceCategory.FrictionPath,
    scoping, cycleRef, 'true', 'high', 70,
    [],
    homePages.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'O primeiro botão de ação do seu site aparece só depois de muitas seções de conteúdo. Visitantes que já decidiram comprar não encontram caminho rápido e desistem da busca.',
  )];
}

/**
 * 4. specificity_deficit — Commercial text uses empty adjectives without
 * numbers, timelines, or verifiable claims.
 */
function inferSpecificityDeficit(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], _corpus: string, _model: string,
  cp?: Map<string, string>,
): Inference[] {
  const homePages = getHomepageEvidence(evidence, cp);
  if (homePages.length === 0) return [];

  const homeCorpus = corpusForPages(homePages);

  // Vague adjectives
  const vaguePatterns = [
    'poderoso', 'completo', 'inovador', 'robusto', 'avançado', 'melhor', 'líder',
    'revolucionário', 'powerful', 'complete', 'innovative', 'robust', 'advanced',
    'best', 'leading', 'revolutionary', 'cutting-edge', 'de ponta', 'moderno',
    'eficiente', 'inteligente', 'smart', 'next-gen', 'próxima geração', 'superior',
    'excepcional', 'exceptional', 'incrível', 'incredible', 'amazing', 'world-class',
  ];

  // Specific claims (numbers, percentages, timeframes)
  const specificPatterns = [
    /\d+%/, /\d+x/, /r\$\s?\d+/, /\$\d+/, /\d+ (clientes?|empresas?|usuários?|customers?|users?|companies)/,
    /\d+ (dias?|horas?|minutos?|semanas?|meses?|days?|hours?|minutes?|weeks?|months?)/,
    /reduz em \d+/, /increase.*\d+/, /saves? \d+/, /economi.*\d+/,
  ];

  const vagueCount = countPatternHits(homeCorpus, vaguePatterns);
  const specificCount = specificPatterns.filter(p => p.test(homeCorpus)).length;

  // Flag if vague adjectives significantly outnumber specific claims
  if (vagueCount < 3) return [];
  if (specificCount >= vagueCount) return [];

  // Ratio check: if we have 3+ vague and less than half as many specific, flag
  if (specificCount > 0 && vagueCount / specificCount < 3) return [];

  return [buildInference(
    'specificity_deficit',
    InferenceCategory.ConversionClarity,
    scoping, cycleRef, 'true', 'medium', 68,
    [],
    homePages.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Seus textos comerciais usam adjetivos que todo concorrente também usa. Sem números ou provas específicas, o comprador não consegue diferenciar e escolhe pelo preço.',
  )];
}

// ═══════════════════════════════════════════════
// MOMENT 2: CONSIDERATION (exploring the site)
// ═══════════════════════════════════════════════

/**
 * 5. proof_of_work_missing — No page shows real customer results.
 */
function inferProofOfWorkMissing(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, _model: string,
): Inference[] {
  // Customer count / user count patterns
  const proofPatterns = [
    /\d+\+?\s*(clientes?|empresas?|usuários?|customers?|users?|companies|businesses)/,
    /\d+\+?\s*(lojas?|stores?|marcas?|brands?)/,
    'case study', 'caso de sucesso', 'case de sucesso', 'estudo de caso',
    'depoimento', 'testimonial', 'review', 'avaliação',
  ];

  // Check regex patterns
  const hasRegexProof = proofPatterns.some(p => {
    if (typeof p === 'string') return corpus.includes(p);
    return p.test(corpus);
  });
  if (hasRegexProof) return [];

  // Check for logo-like indicators (client logos)
  const logoPatterns = ['logo', 'client', 'customer', 'partner', 'parceiro', 'quem confia', 'trusted by', 'usado por', 'used by'];
  const hasLogos = logoPatterns.some(p => corpus.includes(p));
  if (hasLogos) return [];

  // Check copy elements for social proof
  const copyEls = getCopyElements(evidence);
  const hasSocialProof = copyEls.some(e => {
    const p = e.payload as { social_proof_elements?: string[] };
    return (p.social_proof_elements ?? []).length > 0;
  });
  if (hasSocialProof) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'proof_of_work_missing',
    InferenceCategory.TrustRevenue,
    scoping, cycleRef, 'true', 'high', 75,
    [],
    pageContent.slice(0, 3).map(e => makeRef('evidence', e.id)),
    'Nenhuma página do site mostra evidência de que outras empresas compraram e tiveram resultados. Compradores B2B precisam justificar internamente — sem prova de que funciona pra outros, a decisão é adiada indefinidamente.',
  )];
}

/**
 * 6. navigation_dead_ends — Support/help/docs pages exist but don't
 * link back to commercial pages.
 */
function inferNavigationDeadEnds(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], _corpus: string, _model: string,
  cp?: Map<string, string>,
): Inference[] {
  const nonCommercial = getNonCommercialEvidence(evidence, cp);
  if (nonCommercial.length === 0) return [];

  const commercialPatterns = ['/pricing', '/signup', '/checkout', '/register',
    '/cadastro', '/planos', '/preco', '/comprar', '/buy', '/cart', '/carrinho',
    '/trial', '/demo', '/contact', '/contato'];

  // Check if non-commercial pages contain links to commercial pages
  const deadEndPages: Evidence[] = [];
  for (const page of nonCommercial) {
    const pageCorpus = corpusForPages([page]);
    const linksToCommercial = commercialPatterns.some(p => pageCorpus.includes(p));
    if (!linksToCommercial) deadEndPages.push(page);
  }

  // Only flag if majority of non-commercial pages are dead ends
  if (deadEndPages.length === 0) return [];
  if (deadEndPages.length < nonCommercial.length * 0.6) return [];

  return [buildInference(
    'navigation_dead_ends',
    InferenceCategory.FrictionPath,
    scoping, cycleRef, 'true', 'medium', 70,
    [],
    deadEndPages.slice(0, 3).map(e => makeRef('evidence', e.id)),
    'Suas páginas de suporte e documentação são becos sem saída — o visitante que foi explorar "como funciona o suporte" não encontra caminho de volta pra comprar. Esse interesse alto vira aba abandonada.',
  )];
}

/**
 * 7. page_depth_before_conversion — Shortest path from homepage to
 * checkout requires 4+ clicks.
 */
function inferPageDepthBeforeConversion(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, _model: string,
  cp?: Map<string, string>,
): Inference[] {
  // Heuristic: check if homepage links to pricing, and pricing links to checkout
  // If we can't find direct homepage→checkout or homepage→pricing links, flag

  const homePages = getHomepageEvidence(evidence, cp);
  if (homePages.length === 0) return [];

  const checkoutPatterns = ['checkout', 'carrinho', 'cart', 'comprar', 'buy now', 'purchase'];
  const pricingPatterns = ['pricing', 'preço', 'planos', 'plans', 'price'];
  const signupPatterns = ['signup', 'sign up', 'cadastro', 'register', 'criar conta', 'create account', 'free trial', 'teste grátis'];

  const homeCorpus = corpusForPages(homePages);

  // Direct path: homepage mentions checkout/signup → depth ≤ 2
  const hasDirectCheckout = checkoutPatterns.some(p => homeCorpus.includes(p));
  const hasDirectSignup = signupPatterns.some(p => homeCorpus.includes(p));
  if (hasDirectCheckout || hasDirectSignup) return [];

  // Indirect path: homepage → pricing → checkout
  const hasPricingLink = pricingPatterns.some(p => homeCorpus.includes(p));

  if (hasPricingLink) {
    const pricingPages = getPricingEvidence(evidence, cp);
    if (pricingPages.length > 0) {
      const pricingCorpus = corpusForPages(pricingPages);
      const pricingLinksCheckout = checkoutPatterns.some(p => pricingCorpus.includes(p)) ||
                                   signupPatterns.some(p => pricingCorpus.includes(p));
      if (pricingLinksCheckout) return []; // depth ~3, borderline acceptable
    }
  }

  // CTA texts might link to conversion — check if CTAs exist at all
  const ctaTexts = homePages.flatMap(e => {
    const p = e.payload as { cta_texts?: string[] };
    return (p.cta_texts ?? []).map(t => t.toLowerCase());
  });

  const ctaLinksToConversion = ctaTexts.some(cta =>
    checkoutPatterns.some(p => cta.includes(p)) ||
    signupPatterns.some(p => cta.includes(p)) ||
    pricingPatterns.some(p => cta.includes(p)),
  );
  if (ctaLinksToConversion) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'page_depth_before_conversion',
    InferenceCategory.FrictionPath,
    scoping, cycleRef, 'true', 'medium', 72,
    [],
    [...homePages.slice(0, 1), ...pageContent.slice(0, 2)].map(e => makeRef('evidence', e.id)),
    'O caminho mais curto da homepage até o checkout exige muitos cliques. Cada etapa intermediária perde 20-30% dos visitantes — quanto mais longo o caminho, menos gente chega no final.',
  )];
}

/**
 * 8. feature_benefit_disconnect — Pages list technical features without
 * connecting each to a business outcome.
 */
function inferFeatureBenefitDisconnect(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, _model: string,
): Inference[] {
  // Feature patterns (technical terms)
  const featurePatterns = [
    'automação', 'automation', 'template', 'api', 'webhook', 'integração', 'integration',
    'dashboard', 'relatório', 'report', 'analytics', 'customiz', 'personaliz',
    'workflow', 'pipeline', 'importação', 'import', 'export', 'backup',
  ];

  // Benefit connector patterns (bridge from feature to outcome)
  const benefitConnectors = [
    'para que você', 'so you can', 'isso significa', 'this means', 'resulting in',
    'o que permite', 'which allows', 'economize', 'save', 'ganha', 'gain',
    'reduza', 'reduce', 'elimine', 'eliminate', 'sem precisar', 'without needing',
    'em vez de', 'instead of', 'horas por semana', 'hours per week',
    'aumente', 'increase', 'melhore', 'improve',
  ];

  const featureHits = countPatternHits(corpus, featurePatterns);
  if (featureHits < 3) return []; // Not enough features to analyze

  const benefitHits = countPatternHits(corpus, benefitConnectors);

  // If features significantly outnumber benefit connections
  if (benefitHits >= featureHits * 0.4) return []; // At least 40% of features have benefit context

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'feature_benefit_disconnect',
    InferenceCategory.ConversionClarity,
    scoping, cycleRef, 'true', 'medium', 68,
    [],
    pageContent.slice(0, 3).map(e => makeRef('evidence', e.id)),
    'Suas páginas listam funcionalidades técnicas sem explicar o que cada uma significa em resultado de negócio. O comprador vê "automação de emails" mas não vê "economize 15h/semana" — sem o "e daí?", não calcula o ROI.',
  )];
}

/**
 * 9. comparison_absent — No page positions the product vs alternatives.
 */
function inferComparisonAbsent(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, _model: string,
): Inference[] {
  // Check for comparison pages
  const comparisonUrlPatterns = ['/compare', '/vs', '/alternative', '/competitor',
    '/comparacao', '/comparar', '/alternativa', '/concorrente'];
  const hasComparisonPage = comparisonUrlPatterns.some(p => corpus.includes(p));
  if (hasComparisonPage) return [];

  // Check for comparison content
  const comparisonContentPatterns = [
    'vs ', 'versus', 'compared to', 'comparado a', 'diferente de', 'em vez de',
    'unlike', 'ao contrário de', 'alternativa', 'alternative', 'competitor',
    'concorrente', 'comparação', 'comparison', 'por que escolher', 'why choose',
    'por que nós', 'why us', 'o que nos diferencia', 'what makes us different',
  ];
  if (comparisonContentPatterns.some(p => corpus.includes(p))) return [];

  // Check for comparison table indicators
  const tablePatterns = ['tabela comparativa', 'comparison table', 'feature comparison'];
  if (tablePatterns.some(p => corpus.includes(p))) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'comparison_absent',
    InferenceCategory.ConversionClarity,
    scoping, cycleRef, 'true', 'medium', 65,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Nenhuma página posiciona seu produto contra alternativas. O comprador SEMPRE compara 3-5 opções — se você não controla essa narrativa, ele compara por preço e escolhe o mais barato.',
  )];
}

/**
 * 10. objection_echo_chamber — FAQ answers questions the company WANTS
 * to answer, not buying objections.
 */
function inferObjectionEchoChamber(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, _model: string,
): Inference[] {
  // First check if FAQ exists
  const faqPatterns = ['faq', 'perguntas frequentes', 'frequently asked', 'dúvidas', 'duvidas'];
  const hasFaq = faqPatterns.some(p => corpus.includes(p));
  if (!hasFaq) return []; // No FAQ → different finding, not this one

  // Check if FAQ addresses buying objections
  const objectionPatterns = [
    // Price/cost
    'preço', 'price', 'caro', 'expensive', 'custo', 'cost', 'barato', 'cheap',
    'investimento', 'investment', 'desconto', 'discount', 'promoção',
    // Risk/guarantee
    'risco', 'risk', 'garantia', 'guarantee', 'reembolso', 'refund', 'dinheiro de volta',
    'money back', 'cancelar', 'cancel', 'sem risco', 'risk-free',
    // Complexity/difficulty
    'difícil', 'difficult', 'complexo', 'complex', 'fácil', 'easy',
    'implementação', 'implementation', 'setup', 'configuração',
    // Time
    'quanto tempo', 'how long', 'demora', 'prazo', 'rápido', 'quick',
    'imediato', 'immediate', 'tempo de', 'time to',
  ];

  const faqAreaCorpus = corpus; // Use full corpus since FAQ content is part of it
  const addressesObjections = objectionPatterns.some(p => faqAreaCorpus.includes(p));
  if (addressesObjections) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'objection_echo_chamber',
    InferenceCategory.ConversionClarity,
    scoping, cycleRef, 'true', 'medium', 68,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Seu FAQ responde perguntas técnicas que a empresa quer responder, não as dúvidas que impedem a compra. As 4 objeções universais — "é caro", "é difícil", "é arriscado", "demora" — ficam sem resposta.',
  )];
}

/**
 * 11. social_channels_decorative — Social media links exist but point
 * to profiles with potential low activity.
 */
function inferSocialChannelsDecorative(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, model: string,
): Inference[] {
  // Check for social links
  const socialDomains = ['instagram.com', 'linkedin.com', 'twitter.com', 'x.com',
    'facebook.com', 'youtube.com', 'tiktok.com'];

  const hasSocialLinks = socialDomains.some(d => corpus.includes(d));
  if (!hasSocialLinks) return []; // No social links at all — different problem

  // Check for expected social channels based on business model
  const expectedChannels: string[] = [];
  if (isSaas(model)) {
    expectedChannels.push('linkedin.com', 'twitter.com', 'x.com');
  } else if (isEcommerce(model)) {
    expectedChannels.push('instagram.com');
  }

  // Check for generic social URLs (no handle/page specified)
  const genericSocialPatterns = [
    'instagram.com"', 'instagram.com/', 'linkedin.com"', 'linkedin.com/',
    'twitter.com"', 'twitter.com/', 'facebook.com"', 'facebook.com/',
  ];

  // Check for social link evidence — look for link evidence pointing to social domains
  const linkEvidence = evidence.filter(e => e.evidence_type === EvidenceType.Link);
  const socialLinks = linkEvidence.filter(e => {
    const p = e.payload as { href?: string; url?: string };
    const href = ((p.href ?? p.url) ?? '').toLowerCase();
    return socialDomains.some(d => href.includes(d));
  });

  // If social links are just domain roots (no specific profile), they're decorative
  const decorativeLinks = socialLinks.filter(e => {
    const p = e.payload as { href?: string; url?: string };
    const href = ((p.href ?? p.url) ?? '').toLowerCase();
    // A proper social link should have a handle/page after the domain
    return socialDomains.some(d => {
      if (!href.includes(d)) return false;
      const afterDomain = href.split(d)[1] ?? '';
      // Remove trailing slash and check if empty
      const path = afterDomain.replace(/^\//, '').replace(/\/$/, '').replace(/[?#].*$/, '');
      return path.length === 0;
    });
  });

  // If most social links point to generic profiles or have missing expected channels
  const missingExpected = expectedChannels.length > 0 &&
    !expectedChannels.some(ch => corpus.includes(ch));

  if (decorativeLinks.length === 0 && !missingExpected) return [];

  const refs = decorativeLinks.length > 0
    ? decorativeLinks.slice(0, 2).map(e => makeRef('evidence', e.id))
    : socialLinks.slice(0, 2).map(e => makeRef('evidence', e.id));

  // Fall back to page content if no link evidence
  if (refs.length === 0) {
    const pageContent = getPageContentEvidence(evidence);
    return [buildInference(
      'social_channels_decorative',
      InferenceCategory.TrustRevenue,
      scoping, cycleRef, 'true', 'medium', 65,
      [],
      pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
      'Seus links de redes sociais existem mas apontam para perfis inativos. Compradores B2B clicam no LinkedIn pra validar que a empresa é real e ativa — perfil abandonado é pior que sem perfil.',
    )];
  }

  return [buildInference(
    'social_channels_decorative',
    InferenceCategory.TrustRevenue,
    scoping, cycleRef, 'true', 'medium', 65,
    [],
    refs,
    'Seus links de redes sociais existem mas apontam para perfis inativos. Compradores B2B clicam no LinkedIn pra validar que a empresa é real e ativa — perfil abandonado é pior que sem perfil.',
  )];
}

// ═══════════════════════════════════════════════
// MOMENT 3: DECISION (pricing/checkout)
// ═══════════════════════════════════════════════

/**
 * 12. pricing_without_context — Pricing page shows values without
 * ROI context. SaaS / lead_gen only — ROI framing ("$X per day saved",
 * "payback in N months") is the B2B subscription/services frame. For
 * ecommerce, product pricing doesn't carry ROI per-unit framing.
 */
function inferPricingWithoutContext(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, model: string,
  cp?: Map<string, string>,
): Inference[] {
  if (!isSaas(model) && model !== 'lead_gen') return [];
  const pricingPages = getPricingEvidence(evidence, cp);
  if (pricingPages.length === 0) {
    // Check if pricing exists in generic content
    const hasPricing = corpus.includes('/pricing') || corpus.includes('/preco') ||
                       corpus.includes('/planos') || corpus.includes('/plans');
    if (!hasPricing) return [];
  }

  const pricingCorpus = pricingPages.length > 0 ? corpusForPages(pricingPages) : corpus;

  // ROI framing patterns
  const roiPatterns = [
    'por dia', 'per day', 'equivale a', 'economize', 'save', 'roi',
    'retorno', 'return', 'payback', 'vale', 'worth', 'investimento que',
    'investment that', 'paga-se em', 'pays for itself', 'economia de',
    'savings of', 'custo de não fazer', 'cost of inaction', 'comparado ao custo',
    'compared to the cost', 'por mês por', 'per month per',
  ];

  if (roiPatterns.some(p => pricingCorpus.includes(p))) return [];

  const refs = pricingPages.length > 0
    ? pricingPages.slice(0, 2).map(e => makeRef('evidence', e.id))
    : getPageContentEvidence(evidence).slice(0, 2).map(e => makeRef('evidence', e.id));

  return [buildInference(
    'pricing_without_context',
    InferenceCategory.ConversionClarity,
    scoping, cycleRef, 'true', 'high', 70,
    [],
    refs,
    'Sua página de preço mostra valores sem contexto de retorno. R$297/mês parece caro. "R$10/dia que gera R$3.000/mês em economia" parece barato. Sem contexto, o cérebro do comprador categoriza como custo, não investimento.',
  )];
}

/**
 * 13. checkout_identity_break — Domain, colors, logo, or language change
 * between site and checkout.
 */
function inferCheckoutIdentityBreak(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, _model: string,
): Inference[] {
  // Check for redirect evidence to external checkout domains
  const redirectEvidence = evidence.filter(e =>
    e.evidence_type === EvidenceType.Redirect ||
    e.evidence_type === EvidenceType.BrowserRedirectChain,
  );

  const checkoutIndicators = evidence.filter(e =>
    e.evidence_type === EvidenceType.CheckoutIndicator,
  );

  // Check if checkout domain differs from main domain
  const mainDomains = new Set<string>();
  const checkoutDomains = new Set<string>();

  for (const ev of evidence) {
    if (ev.evidence_type !== EvidenceType.PageContent) continue;
    const url = ((ev.payload as { url?: string }).url ?? '');
    try {
      const host = new URL(url).hostname;
      mainDomains.add(host);
    } catch { /* ignore */ }
  }

  // Check for external checkout redirects
  for (const ev of redirectEvidence) {
    const p = ev.payload as { to?: string; target_url?: string; final_url?: string };
    const target = p.to ?? p.target_url ?? p.final_url ?? '';
    try {
      const host = new URL(target).hostname;
      if (target.match(/checkout|cart|payment|pay\./i)) {
        checkoutDomains.add(host);
      }
    } catch { /* ignore */ }
  }

  // Check checkout indicators for external domains
  for (const ev of checkoutIndicators) {
    const p = ev.payload as { url?: string; domain?: string; external?: boolean };
    if (p.external) {
      try {
        const host = new URL(p.url ?? '').hostname;
        checkoutDomains.add(host);
      } catch { /* ignore */ }
    }
  }

  // Check for known external checkout patterns in corpus
  const externalCheckoutPatterns = [
    'hotmart.com', 'kiwify.com', 'eduzz.com', 'monetizze.com',
    'stripe.com/checkout', 'pay.hotmart', 'checkout.stripe',
    'pagseguro.uol', 'pagar.me', 'shopify.com/checkout',
  ];

  const hasExternalCheckout = externalCheckoutPatterns.some(p => corpus.includes(p));

  // If no external checkout signals, check for domain mismatch
  const hasDomainMismatch = checkoutDomains.size > 0 &&
    Array.from(checkoutDomains).some(cd => !mainDomains.has(cd));

  if (!hasExternalCheckout && !hasDomainMismatch) return [];

  const refs = [
    ...redirectEvidence.slice(0, 1),
    ...checkoutIndicators.slice(0, 1),
    ...getPageContentEvidence(evidence).slice(0, 1),
  ].map(e => makeRef('evidence', e.id));

  return [buildInference(
    'checkout_identity_break',
    InferenceCategory.CheckoutIntegrity,
    scoping, cycleRef, 'true', 'high', 72,
    [],
    refs.slice(0, 3),
    'A identidade visual muda entre o seu site e o checkout — domínio diferente, cores diferentes, até idioma diferente. O comprador sente que saiu do ambiente seguro e hesita em colocar dados de pagamento.',
  )];
}

/**
 * 14. payment_options_invisible — No information about accepted payment
 * methods appears before checkout. Ecommerce only — buyers comparing
 * cart-style commerce care about PIX/boleto/cards visibility. SaaS
 * pricing-page buyers know they'll pay by card or invoice.
 */
function inferPaymentOptionsInvisible(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, model: string,
  cp?: Map<string, string>,
): Inference[] {
  if (!isEcommerce(model)) return [];
  // Brazil-specific payment methods
  const brPaymentPatterns = ['pix', 'boleto', 'boleto bancário', 'cartão de crédito', 'cartão de débito'];
  // International payment methods
  const intlPaymentPatterns = [
    'visa', 'mastercard', 'paypal', 'stripe', 'american express', 'amex',
    'credit card', 'debit card', 'apple pay', 'google pay',
  ];

  const allPaymentPatterns = [...brPaymentPatterns, ...intlPaymentPatterns];

  // Check commercial pages (not checkout itself — we want to know if info appears BEFORE checkout)
  const commercialPages = evidence.filter(e => {
    if (e.evidence_type !== EvidenceType.PageContent) return false;
    const url = ((e.payload as { url?: string }).url ?? '').toLowerCase();
    return !url.includes('/checkout') && !url.includes('/cart');
  });

  const commercialCorpus = corpusForPages(commercialPages);

  if (allPaymentPatterns.some(p => commercialCorpus.includes(p))) return [];

  // Also check for payment-related images/icons in evidence
  const hasPaymentIcons = corpus.includes('payment') || corpus.includes('pagamento') ||
    corpus.includes('formas de pagamento') || corpus.includes('payment methods') ||
    corpus.includes('accepted payments') || corpus.includes('meios de pagamento');
  if (hasPaymentIcons) return [];

  const pricingPages = getPricingEvidence(evidence, cp);
  const refs = pricingPages.length > 0
    ? pricingPages.slice(0, 2).map(e => makeRef('evidence', e.id))
    : getPageContentEvidence(evidence).slice(0, 2).map(e => makeRef('evidence', e.id));

  return [buildInference(
    'payment_options_invisible',
    InferenceCategory.CheckoutIntegrity,
    scoping, cycleRef, 'true', 'high', 72,
    [],
    refs,
    'Nenhuma informação sobre métodos de pagamento aceitos aparece antes do checkout. No Brasil, 45% das compras online são por PIX ou boleto — se o comprador não vê que aceita o método dele, nem começa.',
  )];
}

/**
 * 15. guarantee_invisible_at_decision — Guarantee/trial exists somewhere
 * but doesn't appear near the buy button.
 */
function inferGuaranteeInvisibleAtDecision(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, _model: string,
  cp?: Map<string, string>,
): Inference[] {
  const guaranteePatterns = [
    'garantia', 'guarantee', 'satisfação', 'satisfaction', 'money back',
    'dinheiro de volta', 'reembolso', 'refund', 'trial', 'teste grátis',
    'sem compromisso', 'no obligation', 'risk-free', 'sem risco',
    '7 dias', '14 dias', '30 dias', '7 days', '14 days', '30 days',
  ];

  // Check if guarantee exists anywhere in the site
  const hasGuaranteeAnywhere = guaranteePatterns.some(p => corpus.includes(p));
  if (!hasGuaranteeAnywhere) return []; // No guarantee at all — different problem

  // Now check if it appears on pricing/checkout pages specifically
  const decisionPages = [...getPricingEvidence(evidence, cp), ...getCheckoutEvidence(evidence, cp)];

  if (decisionPages.length === 0) return []; // No pricing/checkout pages to check

  const decisionCorpus = corpusForPages(decisionPages);
  const hasGuaranteeAtDecision = guaranteePatterns.some(p => decisionCorpus.includes(p));

  if (hasGuaranteeAtDecision) return []; // Guarantee visible where it matters

  return [buildInference(
    'guarantee_invisible_at_decision',
    InferenceCategory.TrustRevenue,
    scoping, cycleRef, 'true', 'high', 70,
    [],
    decisionPages.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sua garantia de satisfação existe escondida nos termos, mas não aparece perto do botão de compra. Garantia visível ao lado do CTA aumenta conversão em 12-32% — enterrada nos termos equivale a sem garantia.',
  )];
}

/**
 * 16. urgency_mechanics_absent — No element indicates that acting NOW
 * is better than acting LATER.
 */
function inferUrgencyMechanicsAbsent(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, _model: string,
): Inference[] {
  const urgencyPatterns = [
    'expira', 'expires', 'limitado', 'limited', 'últimas', 'últimos',
    'desconto', 'discount', 'trial de', 'trial for', 'vagas', 'seats',
    'until', 'até dia', 'promoção', 'promotion', 'oferta', 'offer',
    'time-limited', 'por tempo limitado', 'restam', 'remaining',
    'countdown', 'timer', 'early bird', 'black friday', 'lançamento',
    'launch price', 'preço de lançamento', 'exclusivo', 'exclusive',
    'esgotando', 'selling fast', 'quase esgotado', 'almost sold out',
  ];

  if (urgencyPatterns.some(p => corpus.includes(p))) return [];

  // Check copy elements for urgency indicators
  const copyEls = getCopyElements(evidence);
  const hasUrgencyCopy = copyEls.some(e => {
    const p = e.payload as { urgency_indicators?: string[] };
    return (p.urgency_indicators ?? []).length > 0;
  });
  if (hasUrgencyCopy) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'urgency_mechanics_absent',
    InferenceCategory.ConversionFlow,
    scoping, cycleRef, 'true', 'medium', 65,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Não existe nenhum motivo para o visitante agir hoje em vez de amanhã. Sem razão concreta para agir agora, o comprador favorece a inércia — "vou pensar depois" e 70% nunca voltam.',
  )];
}

// ═══════════════════════════════════════════════
// MOMENT 4: POST-PURCHASE (onboarding/retention)
// ═══════════════════════════════════════════════

/**
 * 17. first_value_path_unclear — After login, no page/screen shows
 * in ≤3 steps how to reach first result. SaaS only.
 */
function inferFirstValuePathUnclear(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, model: string,
  cp?: Map<string, string>,
): Inference[] {
  if (!isSaas(model)) return [];

  const appPages = getAppEvidence(evidence, cp);
  if (appPages.length === 0) return []; // No authenticated pages crawled

  const appCorpus = corpusForPages(appPages);

  // Wizard/stepper patterns
  const onboardingPatterns = [
    'step 1', 'step 2', 'passo 1', 'passo 2', 'etapa 1', 'etapa 2',
    'começar', 'start here', 'get started', 'vamos começar', 'let\'s go',
    'welcome', 'bem-vindo', 'setup wizard', 'configuração inicial',
    'primeiro passo', 'first step', 'quick start', 'início rápido',
    'onboarding', 'tutorial', 'tour', 'guia',
  ];

  if (onboardingPatterns.some(p => appCorpus.includes(p))) return [];

  // Check for activation step evidence
  const activationSteps = evidence.filter(e =>
    e.evidence_type === EvidenceType.ActivationStepObserved,
  );
  if (activationSteps.length > 0) return []; // Has structured onboarding

  return [buildInference(
    'first_value_path_unclear',
    InferenceCategory.ActivationBlocked,
    scoping, cycleRef, 'true', 'high', 68,
    [],
    appPages.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Após o login, nenhuma tela mostra em passos claros como chegar ao primeiro resultado. Usuários que não atingem o primeiro valor em 24h têm 3x mais chance de cancelar na primeira semana.',
  )];
}

/**
 * 18. support_response_expectation_gap — Support page exists but doesn't
 * promise response time.
 */
function inferSupportResponseExpectationGap(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, _model: string,
  cp?: Map<string, string>,
): Inference[] {
  const supportPages = getSupportEvidence(evidence, cp);
  if (supportPages.length === 0) return []; // No support pages

  const supportCorpus = corpusForPages(supportPages);

  // Response time patterns
  const slaPatterns = [
    'respondemos em', 'we respond within', 'tempo de resposta', 'response time',
    'até 24h', 'within 24h', 'within 24 hours', 'em até', 'no máximo',
    'sla', 'within minutes', 'em minutos', 'retorno em', 'prazo de resposta',
    'horário comercial', 'business hours', 'suporte 24', '24/7 support',
    'chat ao vivo', 'live chat', 'atendimento imediato', 'immediate support',
  ];

  if (slaPatterns.some(p => supportCorpus.includes(p))) return [];

  // Check if support is actually just a Calendly/scheduling page
  const schedulingPatterns = ['calendly', 'agenda', 'schedule', 'agendar', 'booking', 'marcar'];
  const isJustScheduling = schedulingPatterns.some(p => supportCorpus.includes(p));

  // If support exists but has no SLA and is just scheduling, flag
  if (!isJustScheduling) {
    // Check broader corpus for SLA info
    if (slaPatterns.some(p => corpus.includes(p))) return [];
  }

  return [buildInference(
    'support_response_expectation_gap',
    InferenceCategory.SupportAccessibility,
    scoping, cycleRef, 'true', 'medium', 68,
    [],
    supportPages.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sua página de suporte não promete tempo de resposta e o canal de "chat" é um agendamento de chamada. Cliente com problema urgente não pode esperar 2 dias por uma call — pede reembolso em vez de esperar.',
  )];
}

/**
 * 19. billing_transparency_absent — No page clearly explains billing
 * cycle, how to cancel, or what happens to data after cancellation.
 * SaaS only.
 */
function inferBillingTransparencyAbsent(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, model: string,
): Inference[] {
  if (!isSaas(model)) return [];

  const billingPatterns = [
    'cancelar', 'cancel', 'cobrança', 'billing', 'ciclo de cobrança',
    'billing cycle', 'dados após cancelamento', 'data after cancellation',
    'como cancelar', 'how to cancel', 'renovação', 'renewal',
    'cobrança automática', 'automatic billing', 'recorrente', 'recurring',
    'cancelamento', 'cancellation', 'encerrar conta', 'close account',
    'excluir conta', 'delete account', 'política de cancelamento',
    'cancellation policy',
  ];

  if (billingPatterns.some(p => corpus.includes(p))) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'billing_transparency_absent',
    InferenceCategory.ExpectationAlignment,
    scoping, cycleRef, 'true', 'medium', 68,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Nenhuma página explica claramente como funciona a cobrança recorrente ou como cancelar. A incerteza sobre cobrança é barreira número 1 para SaaS — "vou ser cobrado sem aviso? posso cancelar fácil?" — sem resposta, o comprador não arrisca.',
  )];
}

// ═══════════════════════════════════════════════
// MOMENT 5: EXPANSION (upgrade/referral)
// ═══════════════════════════════════════════════

/**
 * 20. upgrade_value_gap — Pricing page lists features of higher plans
 * but doesn't explain the RESULT of having each feature. SaaS only.
 */
function inferUpgradeValueGap(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, model: string,
  cp?: Map<string, string>,
): Inference[] {
  if (!isSaas(model)) return [];

  const pricingPages = getPricingEvidence(evidence, cp);
  if (pricingPages.length === 0) return [];

  const pricingCorpus = corpusForPages(pricingPages);

  // Check if pricing page has plan tiers
  const planTierPatterns = ['pro', 'premium', 'enterprise', 'business', 'profissional',
    'avançado', 'advanced', 'plus', 'growth', 'team', 'scale'];
  const hasTiers = planTierPatterns.some(p => pricingCorpus.includes(p));
  if (!hasTiers) return []; // No tiered pricing

  // Check if higher tier features have benefit descriptions
  const benefitPatterns = [
    'ideal para', 'ideal for', 'perfeito para', 'perfect for',
    'para empresas que', 'for companies that', 'para quem precisa',
    'for those who need', 'inclui tudo do', 'includes everything in',
    'o que permite', 'which allows', 'desbloqueie', 'unlock',
    'acesse', 'access', 'ganhe', 'get', 'com esse plano', 'with this plan',
  ];

  if (benefitPatterns.some(p => pricingCorpus.includes(p))) return [];

  return [buildInference(
    'upgrade_value_gap',
    InferenceCategory.NoExpansionPath,
    scoping, cycleRef, 'true', 'medium', 65,
    [],
    pricingPages.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Seu plano superior lista funcionalidades extras mas não explica o RESULTADO de cada uma. O cliente atual não vê por que gastar mais — upgrade é a receita mais rentável (custo de aquisição zero) mas sem valor articulado, ninguém sobe de plano.',
  )];
}

/**
 * 21. referral_path_nonexistent — No page or section requests referrals
 * or facilitates sharing.
 */
function inferReferralPathNonexistent(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, _model: string,
): Inference[] {
  const referralPatterns = [
    '/referral', '/invite', '/indica', '/ambassador', '/partner',
    'indique', 'indica', 'refer', 'invite a friend', 'convide',
    'convite', 'referral program', 'programa de indicação',
    'ganhe desconto indicando', 'earn by referring', 'share and earn',
    'compartilhe e ganhe', 'ambassador program', 'programa de parceiros',
    'affiliate', 'afiliado',
  ];

  if (referralPatterns.some(p => corpus.includes(p))) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'referral_path_nonexistent',
    InferenceCategory.NoExpansionPath,
    scoping, cycleRef, 'true', 'medium', 65,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Nenhuma página pede indicação ou oferece benefício por referral. Clientes satisfeitos não têm mecanismo fácil para trazer outros — a empresa depende 100% de aquisição paga, que custa infinitamente mais.',
  )];
}

/**
 * 22. success_story_feedback_loop_broken — Product generates results
 * but site doesn't capture or display them.
 */
function inferSuccessStoryFeedbackLoopBroken(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, _model: string,
): Inference[] {
  const storyPatterns = [
    '/cases', '/customers', '/success', '/stories', '/testimonials',
    '/depoimentos', '/resultados', '/clientes',
    'case study', 'caso de sucesso', 'estudo de caso',
    'história de sucesso', 'success story',
  ];

  if (storyPatterns.some(p => corpus.includes(p))) return [];

  // Check for testimonials with metrics
  const testimonialMetricPatterns = [
    /\d+%.*client|customer|cliente|empresa/,
    /client|customer|cliente.*\d+%/,
    'nps', 'net promoter', 'review collection', 'coletar avaliação',
    'deixe sua avaliação', 'leave a review', 'rate us', 'avalie-nos',
  ];

  const hasTestimonialMetrics = testimonialMetricPatterns.some(p => {
    if (typeof p === 'string') return corpus.includes(p);
    return p.test(corpus);
  });
  if (hasTestimonialMetrics) return [];

  // Check copy elements for social proof
  const copyEls = getCopyElements(evidence);
  const hasSocialProof = copyEls.some(e => {
    const p = e.payload as { social_proof_elements?: string[] };
    return (p.social_proof_elements ?? []).length >= 3; // At least 3 proof elements
  });
  if (hasSocialProof) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'success_story_feedback_loop_broken',
    InferenceCategory.TrustRevenue,
    scoping, cycleRef, 'true', 'medium', 65,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Seu produto gera resultados mas o site não captura nem exibe esses resultados. Cada cliente satisfeito é uma prova social que nunca é coletada — novos compradores não veem evidência de sucesso e o ciclo de crescimento não gira.',
  )];
}

// ═══════════════════════════════════════════════
// CROSS-JOURNEY
// ═══════════════════════════════════════════════

/**
 * 23. tone_shift_across_journey — Tone changes radically between pages.
 */
function inferToneShiftAcrossJourney(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], _corpus: string, _model: string,
): Inference[] {
  const pageContent = getPageContentEvidence(evidence);
  if (pageContent.length < 3) return []; // Need at least 3 pages to detect tone shift

  // LLM-style heuristic: check for tone descriptor markers across pages
  // Informal markers
  const informalMarkers = [
    'você', 'vc', 'tá', 'né', 'bora', 'vamos', 'super', 'mega',
    'you', 'we\'re', 'let\'s', 'hey', 'awesome', 'cool', 'love',
    '!', '😊', '🚀', '💡', '❤️', ':)',
  ];

  // Formal markers
  const formalMarkers = [
    'prezado', 'senhor', 'senhora', 'solicitamos', 'informamos',
    'dear', 'sir', 'madam', 'hereby', 'pursuant', 'whereas',
    'termos e condições', 'terms and conditions', 'política de',
    'de acordo com', 'in accordance with', 'é necessário',
  ];

  // Robotic markers
  const roboticMarkers = [
    'erro:', 'error:', 'campo obrigatório', 'required field',
    'operação não permitida', 'operation not allowed', 'sessão expirada',
    'session expired', 'tente novamente', 'try again', 'contate o suporte',
    'contact support', 'indisponível', 'unavailable',
  ];

  // Score each page
  interface PageTone {
    informal: number;
    formal: number;
    robotic: number;
  }
  const pageTones: PageTone[] = [];

  for (const page of pageContent.slice(0, 8)) {
    const text = corpusForPages([page]);
    const informal = countPatternHits(text, informalMarkers);
    const formal = countPatternHits(text, formalMarkers);
    const robotic = countPatternHits(text, roboticMarkers);
    pageTones.push({ informal, formal, robotic });
  }

  if (pageTones.length < 3) return [];

  // Check for significant tone shifts between pages
  const maxInformal = Math.max(...pageTones.map(t => t.informal));
  const maxFormal = Math.max(...pageTones.map(t => t.formal));
  const maxRobotic = Math.max(...pageTones.map(t => t.robotic));
  const minInformal = Math.min(...pageTones.map(t => t.informal));
  const minFormal = Math.min(...pageTones.map(t => t.formal));

  // Detect significant shift: one page very informal, another very formal
  const hasInformalPages = pageTones.some(t => t.informal > 5);
  const hasFormalPages = pageTones.some(t => t.formal > 3);
  const hasRoboticPages = pageTones.some(t => t.robotic > 2);

  // Need at least two different tone profiles
  const distinctTones = [hasInformalPages, hasFormalPages, hasRoboticPages].filter(Boolean).length;
  if (distinctTones < 2) return [];

  return [buildInference(
    'tone_shift_across_journey',
    InferenceCategory.ConversionClarity,
    scoping, cycleRef, 'true', 'medium', 65,
    [],
    pageContent.slice(0, 3).map(e => makeRef('evidence', e.id)),
    'O tom do site muda radicalmente entre as páginas — homepage descontraída, checkout burocrático, suporte robótico. Cada mudança é um micro-sinal de "essa empresa não é coesa" — a soma dessas micro-dúvidas causa abandono.',
  )];
}

/**
 * 24. mobile_journey_friction_compound — Individually no mobile problem
 * is severe. But combined they create unbearable mobile experience.
 */
function inferMobileJourneyFrictionCompound(
  sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, _model: string,
): Inference[] {
  // Count mobile micro-frictions from various sources
  let frictionScore = 0;
  const frictionRefs: string[] = [];

  // 1. Forms without autocomplete
  const formEvidence = getFormEvidence(evidence);
  const formsWithoutAutocomplete = formEvidence.filter(e => {
    const p = e.payload as { autocomplete_attributes?: string[]; has_autocomplete?: boolean };
    return p.has_autocomplete === false || (p.autocomplete_attributes ?? []).length === 0;
  });
  if (formsWithoutAutocomplete.length > 0) {
    frictionScore += 1;
    frictionRefs.push(...formsWithoutAutocomplete.slice(0, 1).map(e => makeRef('evidence', e.id)));
  }

  // 2. Mobile verification issues
  const mobileVerification = evidence.filter(e =>
    e.evidence_type === EvidenceType.MobileVerificationResult,
  );
  const mobileIssues = mobileVerification.filter(e => {
    const p = e.payload as { issues?: string[]; tap_target_issues?: number; viewport_issues?: number };
    return (p.issues ?? []).length > 0 || (p.tap_target_issues ?? 0) > 0 || (p.viewport_issues ?? 0) > 0;
  });
  if (mobileIssues.length > 0) {
    frictionScore += 1;
    frictionRefs.push(...mobileIssues.slice(0, 1).map(e => makeRef('evidence', e.id)));
  }

  // 3. External checkout redirect (already detected)
  const hasExternalCheckout = corpus.includes('hotmart') || corpus.includes('kiwify') ||
    corpus.includes('eduzz') || corpus.includes('monetizze') ||
    corpus.includes('stripe.com/checkout');
  if (hasExternalCheckout) frictionScore += 1;

  // 4. Check for horizontal scroll indicators
  const horizontalScrollPatterns = ['overflow', 'scroll-x', 'horizontal'];
  const hasHorizontalScroll = mobileVerification.some(e => {
    const p = e.payload as { horizontal_scroll?: boolean };
    return p.horizontal_scroll;
  });
  if (hasHorizontalScroll) frictionScore += 1;

  // 5. Check mobile-related signals
  const mobileFrictionSignals = [
    'mobile_path_blocked', 'mobile_trust_degraded', 'mobile_checkout_degraded',
    'mobile_form_friction_elevated', 'mobile_cta_timing_degraded',
  ];
  for (const sigKey of mobileFrictionSignals) {
    if (sigs.has(sigKey)) {
      frictionScore += 1;
      frictionRefs.push(makeRef('signal', sigs.get(sigKey)!.id));
    }
  }

  // Need compound friction (3+ micro-frictions)
  if (frictionScore < 3) return [];

  return [buildInference(
    'mobile_journey_friction_compound',
    InferenceCategory.FrictionPath,
    scoping, cycleRef, 'true', 'high', 70,
    frictionRefs.filter(r => r.startsWith('signal:')),
    frictionRefs.filter(r => r.startsWith('evidence:')),
    'Nenhum problema mobile isolado é grave. Mas somados — botão apertado, formulário sem preenchimento automático, preço que exige scroll lateral, checkout em outro site — a experiência no celular se torna insuportável. 65% do tráfego é mobile.',
  )];
}

/**
 * 25. trust_gradient_inverted — Trust signals concentrated where buyer
 * already trusts (homepage) and absent where they need most (checkout).
 */
function inferTrustGradientInverted(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], _corpus: string, _model: string,
  cp?: Map<string, string>,
): Inference[] {
  const homePages = getHomepageEvidence(evidence, cp);
  const decisionPages = [...getPricingEvidence(evidence, cp), ...getCheckoutEvidence(evidence, cp)];

  if (homePages.length === 0 || decisionPages.length === 0) return [];

  // Trust signal patterns
  const trustPatterns = [
    'logo', 'badge', 'selo', 'certificado', 'certified', 'seguro', 'secure',
    'ssl', 'https', 'protegido', 'protected', 'verificado', 'verified',
    'depoimento', 'testimonial', 'review', 'avaliação', 'estrela', 'star',
    'garantia', 'guarantee', 'satisfação', 'satisfaction',
    'confiança', 'trust', 'trusted', 'parceiro', 'partner',
    'cliente', 'customer', 'resultado', 'result', '5 estrelas', '5 stars',
    'aprovado', 'approved', 'recomendado', 'recommended',
  ];

  // Count trust signals on homepage vs decision pages
  const homeCorpus = corpusForPages(homePages);
  const decisionCorpus = corpusForPages(decisionPages);

  const homeTrustCount = countPatternHits(homeCorpus, trustPatterns);
  const decisionTrustCount = countPatternHits(decisionCorpus, trustPatterns);

  // If homepage has significantly more trust signals than decision pages
  if (homeTrustCount === 0) return []; // No trust signals anywhere
  if (decisionTrustCount >= homeTrustCount * 0.5) return []; // Decision pages have decent trust

  // Homepage has 2x+ more trust signals than decision pages
  if (homeTrustCount < decisionTrustCount * 2) return [];

  return [buildInference(
    'trust_gradient_inverted',
    InferenceCategory.TrustRevenue,
    scoping, cycleRef, 'true', 'high', 72,
    [],
    [...homePages.slice(0, 1), ...decisionPages.slice(0, 2)].map(e => makeRef('evidence', e.id)),
    'Os sinais de confiança estão concentrados na homepage (onde o comprador já confia) e ausentes no checkout (onde ele precisa de mais segurança). O gradiente de confiança está invertido — confiança precisa CRESCER ao longo do funil, não diminuir.',
  )];
}

// ── Internal builder ─────────────────────────

function buildInference(
  key: string,
  category: InferenceCategory,
  scoping: Scoping,
  cycleRef: string,
  conclusionValue: string,
  severityHint: string,
  confidence: number,
  signalRefs: string[],
  evidenceRefs: string[],
  reasoning: string,
): Inference {
  const now = new Date();
  return {
    id: ids.next(),
    inference_key: key,
    category,
    scoping,
    cycle_ref: cycleRef,
    freshness: {
      observed_at: now,
      fresh_until: new Date(now.getTime() + 86400000),
      freshness_state: FreshnessState.Fresh,
      staleness_reason: null,
    },
    conclusion: key.replace(/_/g, ' '),
    conclusion_value: conclusionValue,
    severity_hint: severityHint,
    confidence,
    signal_refs: signalRefs,
    evidence_refs: evidenceRefs,
    reasoning,
    description: null,
    created_at: now,
    updated_at: now,
  };
}
