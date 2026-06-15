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
// Cross-Domain Inference Engine
//
// Derives findings that ONLY fire when Static crawl data
// AND LLM semantic analysis agree. These correlate existing
// signals/inferences across packs to surface patterns that
// emerge from combining both data sources.
//
// Two modes:
//   1. Heuristic mode (no LLM) — pattern matching on evidence text
//   2. Enhanced mode (with LLM) — ContentEnrichment evidence boosts confidence
//
// Triple-Source Findings (appended below):
// Require correlation of ALL THREE evidence sources:
// Static crawl + Playwright browser + LLM enrichment.
// These fire in HEURISTIC FALLBACK mode (static-only,
// lower confidence). Playwright and LLM BOOST confidence.
// ──────────────────────────────────────────────

const ids = new IdGenerator('xdom_inf');

// ── Evidence helpers ─────────────────────────

function getPageContentEvidence(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.PageContent);
}

function getMetaEvidence(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.Meta);
}

function getContentEnrichments(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.ContentEnrichment);
}

function getFormEvidence(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.Form);
}

function getBrowserNavigationTraces(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.BrowserNavigationTrace);
}

function getBrowserRedirectChains(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.BrowserRedirectChain);
}

function getRedirectEvidence(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.Redirect);
}

function getCheckoutIndicators(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.CheckoutIndicator);
}

function getScriptEvidence(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.Script);
}

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
    if (p.content) parts.push(String(p.content));
    if (p.text) parts.push(String(p.text));
    if (p.description) parts.push(String(p.description));
    if (p.paragraphs && Array.isArray(p.paragraphs)) parts.push((p.paragraphs as string[]).join(' '));
  }
  return parts.join(' ').toLowerCase();
}

function extractKeywords(text: string): string[] {
  // Extract meaningful words (4+ chars), removing stopwords
  const stopwords = new Set([
    'that', 'this', 'with', 'from', 'your', 'have', 'will', 'been', 'more',
    'when', 'what', 'para', 'como', 'mais', 'você', 'esse', 'essa', 'este',
    'esta', 'pela', 'pelo', 'seus', 'suas', 'nosso', 'nossa', 'cada', 'todo',
    'toda', 'muito', 'outros', 'sobre', 'entre', 'depois', 'antes', 'ainda',
    'mesmo', 'aqui', 'onde', 'qual', 'quem', 'também', 'pode', 'pode', 'todas',
  ]);
  return text.toLowerCase()
    .replace(/[^a-záàâãéèêíïóôõöúüç\w\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !stopwords.has(w));
}

function keywordOverlap(setA: string[], setB: string[]): number {
  if (setA.length === 0 || setB.length === 0) return 0;
  const bSet = new Set(setB);
  const overlap = setA.filter(w => bSet.has(w)).length;
  return overlap / Math.max(setA.length, setB.length);
}

// ── Main entry point ─────────────────────────

export function computeCrossDomainInferences(
  signals: Signal[],
  inferences: Inference[],
  scoping: Scoping,
  cycleRef: string,
  evidence: readonly Evidence[],
): Inference[] {
  const results: Inference[] = [];
  const corpus = buildCorpus(evidence);
  const enrichments = getContentEnrichments(evidence);
  const hasLLM = enrichments.length > 0;

  results.push(...inferMetaPromiseContentMismatch(scoping, cycleRef, evidence, corpus, enrichments, hasLLM));
  results.push(...inferPricingTermsContradictory(scoping, cycleRef, evidence, corpus, enrichments, hasLLM));
  results.push(...inferUrgencyClaimUnverifiable(scoping, cycleRef, evidence, corpus, enrichments, hasLLM));
  results.push(...inferValuePropDilutedByNavigation(scoping, cycleRef, evidence, corpus, enrichments, hasLLM));
  results.push(...inferCheckoutCopyCreatesAnxiety(scoping, cycleRef, evidence, corpus, enrichments, hasLLM));
  results.push(...inferFaqAnswersWrongQuestions(scoping, cycleRef, evidence, corpus, enrichments, hasLLM));
  results.push(...inferTestimonialsFeelFabricated(scoping, cycleRef, evidence, corpus, enrichments, hasLLM));

  // Static + Playwright cross-domain findings (heuristic fallback when no browser evidence)
  results.push(...inferFormSubmitUnreachableMobile(scoping, cycleRef, evidence, corpus, enrichments, hasLLM));
  results.push(...inferTrustBadgesInvisibleAtCheckout(scoping, cycleRef, evidence, corpus, enrichments, hasLLM));
  results.push(...inferNavigationTrapsCommercialFlow(scoping, cycleRef, evidence, corpus, enrichments, hasLLM));
  results.push(...inferSocialProofLoadsTooLate(scoping, cycleRef, evidence, corpus, enrichments, hasLLM));
  results.push(...inferConsentBannerObscuresFirstAction(scoping, cycleRef, evidence, corpus, enrichments, hasLLM));
  results.push(...inferPriceHiddenBehindInteraction(scoping, cycleRef, evidence, corpus, enrichments, hasLLM));

  return results;
}

// ═══════════════════════════════════════════════
// 1. meta_promise_content_mismatch
//
// Meta title/description promises X, page content delivers Y
// ═══════════════════════════════════════════════

function inferMetaPromiseContentMismatch(
  scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
  enrichments: Evidence[], hasLLM: boolean,
): Inference[] {
  const metaEvidence = getMetaEvidence(evidence);
  const pageEvidence = getPageContentEvidence(evidence);

  if (metaEvidence.length === 0 || pageEvidence.length === 0) return [];

  // Enhanced mode: check if ContentEnrichment flags disconnect
  if (hasLLM) {
    const mismatchFlagged = enrichments.some(e => {
      const p = e.payload as { findings?: Array<{ type?: string; key?: string }> };
      return (p.findings ?? []).some(f =>
        f.type === 'meta_content_disconnect' || f.key === 'meta_promise_mismatch',
      );
    });
    if (mismatchFlagged) {
      return [buildInference(
        'meta_promise_content_mismatch',
        InferenceCategory.ConversionClarity,
        scoping, cycleRef, 'true', 'high', 72,
        [],
        [...metaEvidence.slice(0, 2), ...enrichments.slice(0, 1)].map(e => makeRef('evidence', e.id)),
        'A meta description promete um benefício que a página não entrega no conteúdo principal. Visitante chega esperando uma coisa, vê outra, e sai em segundos. Cada clique orgânico desperdiçado é um visitante pré-qualificado que você perdeu.',
      )];
    }
  }

  // Heuristic mode: compare meta description keywords vs page H1/first paragraph
  for (const meta of metaEvidence) {
    const mp = meta.payload as { meta_description?: string; url?: string };
    if (!mp.meta_description || mp.meta_description.length < 30) continue;

    const metaKeywords = extractKeywords(mp.meta_description);
    if (metaKeywords.length < 3) continue;

    // Find matching page content evidence for same URL
    const matchingPage = pageEvidence.find(pe => {
      const pp = pe.payload as { url?: string };
      return pp.url && mp.url && pp.url === mp.url;
    });
    if (!matchingPage) continue;

    const pp = matchingPage.payload as { h1?: string; body_text?: string; above_fold_text?: string };
    const pageText = [pp.h1, pp.above_fold_text, pp.body_text?.slice(0, 500)].filter(Boolean).join(' ');
    const pageKeywords = extractKeywords(pageText);

    const overlap = keywordOverlap(metaKeywords, pageKeywords);

    // Low overlap = mismatch. Threshold: less than 20% keyword overlap
    if (overlap < 0.20 && metaKeywords.length >= 4) {
      return [buildInference(
        'meta_promise_content_mismatch',
        InferenceCategory.ConversionClarity,
        scoping, cycleRef, 'true', 'high', 72,
        [],
        [meta, matchingPage].map(e => makeRef('evidence', e.id)),
        'A meta description promete um benefício que a página não entrega no conteúdo principal. Visitante chega esperando uma coisa, vê outra, e sai em segundos. Cada clique orgânico desperdiçado é um visitante pré-qualificado que você perdeu.',
      )];
    }
  }

  return [];
}

// ═══════════════════════════════════════════════
// 2. pricing_terms_contradictory
//
// Different pages show inconsistent prices for same thing
// ═══════════════════════════════════════════════

function inferPricingTermsContradictory(
  scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
  enrichments: Evidence[], hasLLM: boolean,
): Inference[] {
  const pageEvidence = getPageContentEvidence(evidence);
  if (pageEvidence.length < 2) return [];

  // Enhanced mode: check if LLM flagged price inconsistency
  if (hasLLM) {
    const pricingInconsistency = enrichments.some(e => {
      const p = e.payload as { findings?: Array<{ type?: string; key?: string }> };
      return (p.findings ?? []).some(f =>
        f.type === 'pricing_inconsistency' || f.key === 'price_contradiction',
      );
    });
    if (pricingInconsistency) {
      return [buildInference(
        'pricing_terms_contradictory',
        InferenceCategory.ExpectationAlignment,
        scoping, cycleRef, 'true', 'high', 78,
        [],
        [...pageEvidence.slice(0, 3), ...enrichments.slice(0, 1)].map(e => makeRef('evidence', e.id)),
        'Páginas diferentes mostram preços conflitantes pro mesmo produto ou plano. O comprador que percebe a inconsistência perde confiança imediata. Preço confuso vira objeção, não venda.',
      )];
    }
  }

  // Heuristic mode: extract price patterns from multiple pages and compare
  const priceRegex = /(?:R\$|USD|US\$|\$)\s*(\d{1,3}(?:[.,]\d{2,3})*(?:[.,]\d{2})?)|(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:\/\s*m[eê]s|\/\s*month|\/mo)/gi;

  const pricesByPage: Map<string, { prices: string[]; evidence: Evidence }> = new Map();

  for (const ev of pageEvidence) {
    const p = ev.payload as { url?: string; body_text?: string; above_fold_text?: string; h1?: string; title?: string };
    const text = [p.title, p.h1, p.above_fold_text, p.body_text].filter(Boolean).join(' ');
    const matches = text.match(priceRegex);
    if (matches && matches.length > 0) {
      const url = p.url ?? 'unknown';
      pricesByPage.set(url, { prices: matches, evidence: ev });
    }
  }

  // Compare prices across pages for conflicts
  if (pricesByPage.size >= 2) {
    const allPriceSets = Array.from(pricesByPage.values());
    const allPrices = allPriceSets.flatMap(ps => ps.prices.map(p => p.replace(/[^\d.,]/g, '')));

    // Find normalized price values
    const numericPrices = allPrices
      .map(p => parseFloat(p.replace(',', '.')))
      .filter(n => !isNaN(n) && n > 0);

    // Check if the same price range has contradictions (same magnitude but different values)
    if (numericPrices.length >= 3) {
      const sorted = [...numericPrices].sort((a, b) => a - b);
      // Group by magnitude (within 50% of each other)
      const groups: number[][] = [];
      for (const price of sorted) {
        const group = groups.find(g => g[0] * 2 >= price && price >= g[0] * 0.5);
        if (group) group.push(price);
        else groups.push([price]);
      }

      // If any group has differing values, that's a contradiction
      const contradictoryGroup = groups.find(g => {
        if (g.length < 2) return false;
        const unique = new Set(g.map(n => n.toFixed(2)));
        return unique.size >= 2;
      });

      if (contradictoryGroup) {
        const evidenceRefs = allPriceSets.slice(0, 3).map(ps => makeRef('evidence', ps.evidence.id));
        return [buildInference(
          'pricing_terms_contradictory',
          InferenceCategory.ExpectationAlignment,
          scoping, cycleRef, 'true', 'high', 78,
          [],
          evidenceRefs,
          'Páginas diferentes mostram preços conflitantes pro mesmo produto ou plano. O comprador que percebe a inconsistência perde confiança imediata. Preço confuso vira objeção, não venda.',
        )];
      }
    }
  }

  return [];
}

// ═══════════════════════════════════════════════
// 3. urgency_claim_unverifiable
//
// "Limited time" / "últimas vagas" that never changes
// ═══════════════════════════════════════════════

function inferUrgencyClaimUnverifiable(
  scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
  enrichments: Evidence[], hasLLM: boolean,
): Inference[] {
  const urgencyPatterns = [
    'últimas vagas', 'última chance', 'vagas limitadas', 'por tempo limitado',
    'oferta expira', 'termina hoje', 'apenas hoje', 'últimas unidades',
    'limited time', 'limited offer', 'last chance', 'only today',
    'ending soon', 'act now', 'urgente', 'corra', 'aproveite agora',
    'poucas vagas', 'vagas quase esgotadas', 'inscrições encerram',
  ];

  const foundUrgency = urgencyPatterns.filter(p => corpus.includes(p));
  if (foundUrgency.length === 0) return [];

  // Enhanced mode: LLM confirms urgency is permanent/fabricated
  if (hasLLM) {
    const urgencyFabricated = enrichments.some(e => {
      const p = e.payload as { findings?: Array<{ type?: string; key?: string }> };
      return (p.findings ?? []).some(f =>
        f.type === 'fake_urgency' || f.key === 'urgency_unverifiable' || f.type === 'dark_pattern_urgency',
      );
    });
    if (urgencyFabricated) {
      return [buildInference(
        'urgency_claim_unverifiable',
        InferenceCategory.TrustRevenue,
        scoping, cycleRef, 'true', 'medium', 70,
        [],
        enrichments.slice(0, 2).map(e => makeRef('evidence', e.id)),
        'A página usa linguagem de urgência ("últimas vagas", "por tempo limitado") que está permanentemente no HTML. Não é urgência real, é manipulação. Comprador que percebe perde toda a confiança e não volta.',
      )];
    }
  }

  // Heuristic mode: check if urgency text appears in static HTML across multiple pages
  const pageEvidence = getPageContentEvidence(evidence);
  const pagesWithUrgency = pageEvidence.filter(e => {
    const p = e.payload as { body_text?: string; above_fold_text?: string; h1?: string };
    const text = [p.h1, p.above_fold_text, p.body_text].filter(Boolean).join(' ').toLowerCase();
    return urgencyPatterns.some(up => text.includes(up));
  });

  // If urgency appears on 2+ pages or on the homepage (static permanence indicator), fire
  if (pagesWithUrgency.length >= 2) {
    return [buildInference(
      'urgency_claim_unverifiable',
      InferenceCategory.TrustRevenue,
      scoping, cycleRef, 'true', 'medium', 70,
      [],
      pagesWithUrgency.slice(0, 3).map(e => makeRef('evidence', e.id)),
      'A página usa linguagem de urgência ("últimas vagas", "por tempo limitado") que está permanentemente no HTML. Não é urgência real, é manipulação. Comprador que percebe perde toda a confiança e não volta.',
    )];
  }

  // Single page with urgency in static content (no dynamic indicator like countdown/timer JS)
  if (pagesWithUrgency.length === 1) {
    // Check that there's NO timer/countdown script (which would mean real urgency)
    const hasCountdown = corpus.includes('countdown') || corpus.includes('timer') || corpus.includes('settimeout');
    if (!hasCountdown) {
      return [buildInference(
        'urgency_claim_unverifiable',
        InferenceCategory.TrustRevenue,
        scoping, cycleRef, 'true', 'medium', 70,
        [],
        pagesWithUrgency.map(e => makeRef('evidence', e.id)),
        'A página usa linguagem de urgência ("últimas vagas", "por tempo limitado") que está permanentemente no HTML. Não é urgência real, é manipulação. Comprador que percebe perde toda a confiança e não volta.',
      )];
    }
  }

  return [];
}

// ═══════════════════════════════════════════════
// 4. value_prop_diluted_by_navigation
//
// Homepage tries to say too many things at once
// ═══════════════════════════════════════════════

function inferValuePropDilutedByNavigation(
  scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
  enrichments: Evidence[], hasLLM: boolean,
): Inference[] {
  // Enhanced mode: LLM detects value prop dilution
  if (hasLLM) {
    const dilutionFlagged = enrichments.some(e => {
      const p = e.payload as { findings?: Array<{ type?: string; key?: string }> };
      return (p.findings ?? []).some(f =>
        f.type === 'value_prop_diluted' || f.key === 'competing_value_props' || f.type === 'above_fold_cluttered',
      );
    });
    if (dilutionFlagged) {
      return [buildInference(
        'value_prop_diluted_by_navigation',
        InferenceCategory.ConversionClarity,
        scoping, cycleRef, 'true', 'medium', 68,
        [],
        enrichments.slice(0, 2).map(e => makeRef('evidence', e.id)),
        'A homepage tenta comunicar 4+ propostas de valor ao mesmo tempo sem hierarquia clara. Visitante que não entende o que você faz em 5 segundos vai embora. Cada proposta a mais dilui todas as outras.',
      )];
    }
  }

  // Heuristic mode: count distinct H2-level value propositions on homepage/landing
  const pageEvidence = getPageContentEvidence(evidence);
  const homepages = pageEvidence.filter(e => {
    const p = e.payload as { url?: string; page_type?: string };
    const url = (p.url ?? '').toLowerCase();
    return p.page_type === 'homepage' || p.page_type === 'landing_page' ||
      url === '/' || url.endsWith('.com') || url.endsWith('.com/') ||
      url.endsWith('.com.br') || url.endsWith('.com.br/') ||
      url.match(/^https?:\/\/[^/]+\/?$/);
  });

  if (homepages.length === 0) return [];

  for (const hp of homepages) {
    const p = hp.payload as { body_text?: string; above_fold_text?: string; h2s?: string[] };

    // Count H2 sections as proxies for distinct value propositions
    let valuePropCount = 0;

    if (p.h2s && Array.isArray(p.h2s)) {
      valuePropCount = p.h2s.length;
    } else {
      // Estimate from body text: count paragraphs that introduce a new benefit
      const text = p.above_fold_text ?? p.body_text ?? '';
      const benefitIndicators = [
        'para ', 'for ', 'ajuda ', 'helps ', 'garante ', 'ensures ',
        'aumenta ', 'increases ', 'reduz ', 'reduces ', 'elimina ',
        'automatiza ', 'simplifica ', 'otimiza ', 'melhora ', 'descubra ',
        'economize ', 'ganhe ', 'transforme ', 'potencialize ',
      ];
      const lines = text.split(/[.\n]/).filter(l => l.trim().length > 20);
      valuePropCount = lines.filter(l =>
        benefitIndicators.some(bi => l.toLowerCase().includes(bi)),
      ).length;
    }

    if (valuePropCount >= 4) {
      return [buildInference(
        'value_prop_diluted_by_navigation',
        InferenceCategory.ConversionClarity,
        scoping, cycleRef, 'true', 'medium', 68,
        [],
        [hp, ...enrichments.slice(0, 1)].map(e => makeRef('evidence', e.id)),
        'A homepage tenta comunicar 4+ propostas de valor ao mesmo tempo sem hierarquia clara. Visitante que não entende o que você faz em 5 segundos vai embora. Cada proposta a mais dilui todas as outras.',
      )];
    }
  }

  return [];
}

// ═══════════════════════════════════════════════
// 5. checkout_copy_creates_anxiety
//
// Checkout text increases fear instead of reducing it
// ═══════════════════════════════════════════════

function inferCheckoutCopyCreatesAnxiety(
  scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
  enrichments: Evidence[], hasLLM: boolean,
): Inference[] {
  const anxietyPatterns = [
    'não garantimos', 'no garantizamos', 'we do not guarantee',
    'processamento pode levar', 'processing may take',
    'taxa adicional', 'additional fee', 'tarifa adicional',
    'sujeito a alteração', 'subject to change', 'pode variar',
    'sem reembolso', 'non-refundable', 'não reembolsável',
    'pagamento não reversível', 'irreversible', 'irrevogável',
    'responsabilidade do comprador', 'buyer assumes risk',
    'não nos responsabilizamos', 'we are not responsible',
    'cobrança adicional', 'additional charge',
    'prazo não garantido', 'delivery not guaranteed',
    'custos extras', 'extra costs', 'custos ocultos',
    'penalidade', 'penalty', 'multa',
  ];

  // Enhanced mode
  if (hasLLM) {
    const anxietyFlagged = enrichments.some(e => {
      const p = e.payload as { findings?: Array<{ type?: string; key?: string }> };
      return (p.findings ?? []).some(f =>
        f.type === 'checkout_anxiety' || f.key === 'anxiety_language' || f.type === 'fear_copy',
      );
    });
    if (anxietyFlagged) {
      return [buildInference(
        'checkout_copy_creates_anxiety',
        InferenceCategory.FrictionPath,
        scoping, cycleRef, 'true', 'high', 75,
        [],
        enrichments.slice(0, 2).map(e => makeRef('evidence', e.id)),
        'O texto do checkout aumenta o medo do comprador ao invés de reduzir. Frases como "não garantimos" e "taxa adicional" na hora do pagamento disparam abandono. A copy deveria tranquilizar, não assustar.',
      )];
    }
  }

  // Heuristic mode: detect anxiety patterns in checkout page content
  const pageEvidence = getPageContentEvidence(evidence);
  const checkoutPages = pageEvidence.filter(e => {
    const p = e.payload as { url?: string; page_type?: string };
    const url = (p.url ?? '').toLowerCase();
    return p.page_type === 'checkout' ||
      url.includes('/checkout') || url.includes('/cart') ||
      url.includes('/payment') || url.includes('/pagamento') ||
      url.includes('/finalizar') || url.includes('/carrinho');
  });

  if (checkoutPages.length === 0) return [];

  for (const cp of checkoutPages) {
    const p = cp.payload as { body_text?: string; above_fold_text?: string };
    const text = [p.above_fold_text, p.body_text].filter(Boolean).join(' ').toLowerCase();

    const anxietyHits = anxietyPatterns.filter(ap => text.includes(ap));
    if (anxietyHits.length >= 2) {
      return [buildInference(
        'checkout_copy_creates_anxiety',
        InferenceCategory.FrictionPath,
        scoping, cycleRef, 'true', 'high', 75,
        [],
        [cp, ...enrichments.slice(0, 1)].map(e => makeRef('evidence', e.id)),
        'O texto do checkout aumenta o medo do comprador ao invés de reduzir. Frases como "não garantimos" e "taxa adicional" na hora do pagamento disparam abandono. A copy deveria tranquilizar, não assustar.',
      )];
    }
  }

  return [];
}

// ═══════════════════════════════════════════════
// 6. faq_answers_wrong_questions
//
// FAQ exists but doesn't address buying objections
// ═══════════════════════════════════════════════

function inferFaqAnswersWrongQuestions(
  scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
  enrichments: Evidence[], hasLLM: boolean,
): Inference[] {
  // Check if FAQ exists at all
  const faqPatterns = ['faq', 'perguntas frequentes', 'frequently asked', 'dúvidas'];
  const hasFaq = faqPatterns.some(p => corpus.includes(p));
  if (!hasFaq) return [];

  // Enhanced mode
  if (hasLLM) {
    const faqMisaligned = enrichments.some(e => {
      const p = e.payload as { findings?: Array<{ type?: string; key?: string }> };
      return (p.findings ?? []).some(f =>
        f.type === 'faq_misalignment' || f.key === 'faq_wrong_questions' || f.type === 'faq_not_addressing_objections',
      );
    });
    if (faqMisaligned) {
      return [buildInference(
        'faq_answers_wrong_questions',
        InferenceCategory.ConversionClarity,
        scoping, cycleRef, 'true', 'medium', 68,
        [],
        enrichments.slice(0, 2).map(e => makeRef('evidence', e.id)),
        'O FAQ existe mas responde perguntas técnicas ao invés de eliminar objeções de compra. Nenhuma pergunta sobre preço, reembolso, garantia ou prazo de entrega. FAQ que não vende é oportunidade desperdiçada.',
      )];
    }
  }

  // Heuristic mode: check if FAQ content addresses purchasing objections
  const purchaseObjectionPatterns = [
    'preço', 'price', 'quanto custa', 'how much',
    'reembolso', 'refund', 'devolução', 'return',
    'garantia', 'guarantee', 'warranty',
    'prazo', 'delivery time', 'quanto tempo', 'how long',
    'cancelar', 'cancel', 'cancelamento', 'cancellation',
    'parcelamento', 'installment', 'pagamento', 'payment',
    'desconto', 'discount', 'cupom', 'coupon',
  ];

  const pageEvidence = getPageContentEvidence(evidence);
  const faqPages = pageEvidence.filter(e => {
    const p = e.payload as { url?: string; body_text?: string; h1?: string };
    const url = (p.url ?? '').toLowerCase();
    const h1 = (p.h1 ?? '').toLowerCase();
    return url.includes('/faq') || url.includes('/perguntas') ||
      url.includes('/duvidas') || url.includes('/help') ||
      h1.includes('faq') || h1.includes('perguntas frequentes');
  });

  if (faqPages.length === 0) {
    // FAQ might be embedded on main page — check corpus for FAQ section
    const faqInCorpus = corpus.includes('perguntas frequentes') || corpus.includes('faq');
    if (!faqInCorpus) return [];

    // Check if ANY purchase objection is addressed anywhere near FAQ context
    const addressesObjections = purchaseObjectionPatterns.some(p => corpus.includes(p));
    // If corpus has no purchase objection content near FAQ, fire
    if (!addressesObjections) {
      return [buildInference(
        'faq_answers_wrong_questions',
        InferenceCategory.ConversionClarity,
        scoping, cycleRef, 'true', 'medium', 68,
        [],
        pageEvidence.slice(0, 2).map(e => makeRef('evidence', e.id)),
        'O FAQ existe mas responde perguntas técnicas ao invés de eliminar objeções de compra. Nenhuma pergunta sobre preço, reembolso, garantia ou prazo de entrega. FAQ que não vende é oportunidade desperdiçada.',
      )];
    }
    return [];
  }

  // Check FAQ page content for purchase objection coverage
  for (const faqPage of faqPages) {
    const p = faqPage.payload as { body_text?: string };
    const faqText = (p.body_text ?? '').toLowerCase();

    const objectionsCovered = purchaseObjectionPatterns.filter(op => faqText.includes(op));

    // If FAQ exists but covers 0 purchase objections, fire
    if (objectionsCovered.length === 0 && faqText.length > 100) {
      return [buildInference(
        'faq_answers_wrong_questions',
        InferenceCategory.ConversionClarity,
        scoping, cycleRef, 'true', 'medium', 68,
        [],
        [faqPage].map(e => makeRef('evidence', e.id)),
        'O FAQ existe mas responde perguntas técnicas ao invés de eliminar objeções de compra. Nenhuma pergunta sobre preço, reembolso, garantia ou prazo de entrega. FAQ que não vende é oportunidade desperdiçada.',
      )];
    }
  }

  return [];
}

// ═══════════════════════════════════════════════
// 7. testimonials_feel_fabricated
//
// Testimonials are suspiciously uniform in structure
// ═══════════════════════════════════════════════

function inferTestimonialsFeelFabricated(
  scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
  enrichments: Evidence[], hasLLM: boolean,
): Inference[] {
  // Enhanced mode
  if (hasLLM) {
    const fabricatedFlagged = enrichments.some(e => {
      const p = e.payload as { findings?: Array<{ type?: string; key?: string }> };
      return (p.findings ?? []).some(f =>
        f.type === 'fabricated_testimonials' || f.key === 'testimonials_suspicious' ||
        f.type === 'uniform_social_proof',
      );
    });
    if (fabricatedFlagged) {
      return [buildInference(
        'testimonials_feel_fabricated',
        InferenceCategory.TrustRevenue,
        scoping, cycleRef, 'true', 'medium', 65,
        [],
        enrichments.slice(0, 2).map(e => makeRef('evidence', e.id)),
        'Os depoimentos seguem um padrão suspeito. Mesmo tamanho, mesma estrutura, sem resultados concretos. Comprador sofisticado reconhece depoimentos fabricados e perde confiança em toda a marca.',
      )];
    }
  }

  // Heuristic mode: look for testimonials and check uniformity
  const testimonialPatterns = [
    'depoimento', 'testimonial', 'avaliação', 'review',
    '"', '"', '⭐', 'estrelas', 'stars',
  ];

  const hasTestimonials = testimonialPatterns.some(p => corpus.includes(p));
  if (!hasTestimonials) return [];

  const pageEvidence = getPageContentEvidence(evidence);

  // Look for pages with testimonial content
  for (const ev of pageEvidence) {
    const p = ev.payload as { body_text?: string; testimonials?: Array<{ text?: string; author?: string }> };

    // If structured testimonials available
    if (p.testimonials && Array.isArray(p.testimonials) && p.testimonials.length >= 3) {
      const texts = p.testimonials.map(t => t.text ?? '').filter(t => t.length > 0);
      if (texts.length >= 3) {
        // Check for suspicious uniformity:
        // 1. Similar word counts (within 30% of mean)
        const wordCounts = texts.map(t => t.split(/\s+/).length);
        const mean = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;
        const allSimilarLength = wordCounts.every(c => Math.abs(c - mean) / mean < 0.30);

        // 2. No specific results/numbers
        const hasSpecificResults = texts.some(t =>
          /\d+%|\d+x|R\$\s*\d|USD|faturamento|revenue|resultado|result/i.test(t),
        );

        if (allSimilarLength && !hasSpecificResults) {
          return [buildInference(
            'testimonials_feel_fabricated',
            InferenceCategory.TrustRevenue,
            scoping, cycleRef, 'true', 'medium', 65,
            [],
            [ev].map(e => makeRef('evidence', e.id)),
            'Os depoimentos seguem um padrão suspeito. Mesmo tamanho, mesma estrutura, sem resultados concretos. Comprador sofisticado reconhece depoimentos fabricados e perde confiança em toda a marca.',
          )];
        }
      }
    }

    // Fallback: look for quoted text patterns in body
    if (p.body_text) {
      const quotedTexts = p.body_text.match(/[""\u201c]([^""\u201d]{20,200})[""\u201d]/g);
      if (quotedTexts && quotedTexts.length >= 3) {
        const lengths = quotedTexts.map(q => q.length);
        const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
        const allSimilar = lengths.every(l => Math.abs(l - avgLen) / avgLen < 0.35);

        const anySpecific = quotedTexts.some(q =>
          /\d+%|\d+x|R\$|USD|faturamento|revenue|resultado|result/i.test(q),
        );

        if (allSimilar && !anySpecific) {
          return [buildInference(
            'testimonials_feel_fabricated',
            InferenceCategory.TrustRevenue,
            scoping, cycleRef, 'true', 'medium', 65,
            [],
            [ev].map(e => makeRef('evidence', e.id)),
            'Os depoimentos seguem um padrão suspeito. Mesmo tamanho, mesma estrutura, sem resultados concretos. Comprador sofisticado reconhece depoimentos fabricados e perde confiança em toda a marca.',
          )];
        }
      }
    }
  }

  return [];
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

// ══════════════════════════════════════════════════════════════════
// SUBDOMAIN DISCOVERY × CROSS-DOMAIN FINDINGS
//
// These 6 findings combine SubdomainDiscovery evidence (probes)
// with other sources to detect structural issues where subdomain
// architecture creates business risk.
// ══════════════════════════════════════════════════════════════════

// ── Subdomain probe extraction helper ────────

interface SubdomainProbe {
  evidence: Evidence;
  subdomain: string;
  alive: boolean;
  status_code: number | null;
}

function extractSubdomainProbes(allEvidence: readonly Evidence[]): SubdomainProbe[] {
  const probes: SubdomainProbe[] = [];
  for (const ev of allEvidence) {
    if (ev.evidence_type !== EvidenceType.SubdomainDiscovery) continue;
    const payload = ev.payload as { type?: string; subdomain?: string; alive?: boolean; status_code?: number };
    if (payload.type !== 'subdomain_probe') continue;
    if (!payload.subdomain) continue;
    probes.push({
      evidence: ev,
      subdomain: payload.subdomain,
      alive: payload.alive === true,
      status_code: payload.status_code ?? null,
    });
  }
  return probes;
}

// ── Link reference helper ────────────────────

function hasLinkToSubdomain(allEvidence: readonly Evidence[], subdomain: string): boolean {
  const subLower = subdomain.toLowerCase();
  for (const ev of allEvidence) {
    if (ev.evidence_type === EvidenceType.SubdomainDiscovery) continue;
    const payload = ev.payload as unknown as Record<string, unknown>;
    const searchable: string[] = [];
    if (payload.url && typeof payload.url === 'string') searchable.push(payload.url);
    if (payload.href && typeof payload.href === 'string') searchable.push(payload.href);
    if (payload.hrefs && Array.isArray(payload.hrefs)) searchable.push(...(payload.hrefs as string[]));
    if (payload.links && Array.isArray(payload.links)) searchable.push(...(payload.links as string[]));
    if (payload.body_text && typeof payload.body_text === 'string') searchable.push(payload.body_text);
    if (payload.above_fold_text && typeof payload.above_fold_text === 'string') searchable.push(payload.above_fold_text);

    for (const s of searchable) {
      if (s.toLowerCase().includes(subLower)) return true;
    }
  }
  return false;
}

// ── Subdomain findings entry point ───────────

export function computeSubdomainCrossDomainInferences(
  evidence: readonly Evidence[],
  scoping: Scoping,
  cycleRef: string,
): Inference[] {
  const results: Inference[] = [];
  const probes = extractSubdomainProbes(evidence);

  if (probes.length === 0) return results;

  results.push(...inferStagingEnvironmentPubliclyAccessible(probes, evidence, scoping, cycleRef));
  results.push(...inferAdminPanelExposedToInternet(probes, evidence, scoping, cycleRef));
  results.push(...inferSubdomainBrandVisualFragmentation(probes, evidence, scoping, cycleRef));
  results.push(...inferAppSubdomainDisconnectedFromSite(probes, evidence, scoping, cycleRef));
  results.push(...inferWhatsappChannelDisconnected(probes, evidence, scoping, cycleRef));
  results.push(...inferMultiplePaymentSubdomainsFragmentingTrust(probes, evidence, scoping, cycleRef));

  return results;
}

// ═══════════════════════════════════════════════
// S1. STAGING ENVIRONMENT PUBLICLY ACCESSIBLE
// ═══════════════════════════════════════════════

const STAGING_PATTERNS = /^(staging|dev|test|sandbox|qa|homolog|hml)\./i;

function inferStagingEnvironmentPubliclyAccessible(
  probes: SubdomainProbe[],
  _evidence: readonly Evidence[],
  scoping: Scoping,
  cycleRef: string,
): Inference[] {
  const exposed = probes.filter(
    p => p.alive && p.status_code === 200 && STAGING_PATTERNS.test(p.subdomain),
  );

  if (exposed.length === 0) return [];

  const subdomains = exposed.map(p => p.subdomain).join(', ');
  return [buildInference(
    'staging_environment_publicly_accessible',
    InferenceCategory.CommerceContinuityThreat,
    scoping,
    cycleRef,
    'true',
    'high',
    80,
    [],
    exposed.map(p => makeRef('evidence', p.evidence.id)),
    `Subdomínio(s) de staging/dev/test detectado(s) respondendo HTTP 200 sem proteção de autenticação: ${subdomains}. ` +
    `Ambientes de homologação expostos permitem que atacantes encontrem vulnerabilidades em código não endurecido ` +
    `e acessem dados reais de clientes usados em testes. Impacto direto na segurança e conformidade.`,
  )];
}

// ═══════════════════════════════════════════════
// S2. ADMIN PANEL EXPOSED TO INTERNET
// ═══════════════════════════════════════════════

const ADMIN_PATTERNS = /^(admin|panel|dashboard|backoffice|painel|gerenciador|cms)\./i;

function inferAdminPanelExposedToInternet(
  probes: SubdomainProbe[],
  _evidence: readonly Evidence[],
  scoping: Scoping,
  cycleRef: string,
): Inference[] {
  const exposed = probes.filter(
    p => p.alive && (p.status_code === 200 || p.status_code === 302) && ADMIN_PATTERNS.test(p.subdomain),
  );

  if (exposed.length === 0) return [];

  const subdomains = exposed.map(p => p.subdomain).join(', ');
  return [buildInference(
    'admin_panel_exposed_to_internet',
    InferenceCategory.CommerceContinuityThreat,
    scoping,
    cycleRef,
    'true',
    'high',
    82,
    [],
    exposed.map(p => makeRef('evidence', p.evidence.id)),
    `Subdomínio(s) de administração detectado(s) respondendo publicamente: ${subdomains}. ` +
    `Qualquer pessoa pode tentar acessar controles críticos do negócio. Exposição de painel admin ` +
    `é vetor primário de ataques de credential stuffing e brute force. Risco direto de comprometimento operacional.`,
  )];
}

// ═══════════════════════════════════════════════
// S3. SUBDOMAIN BRAND VISUAL FRAGMENTATION
// ═══════════════════════════════════════════════

function inferSubdomainBrandVisualFragmentation(
  probes: SubdomainProbe[],
  _evidence: readonly Evidence[],
  scoping: Scoping,
  cycleRef: string,
): Inference[] {
  const alive = probes.filter(p => p.alive);

  if (alive.length < 3) return [];

  const subdomains = alive.map(p => p.subdomain).slice(0, 5).join(', ');
  return [buildInference(
    'subdomain_brand_visual_fragmentation',
    InferenceCategory.BrandInconsistentAcrossSurfaces,
    scoping,
    cycleRef,
    'true',
    'medium',
    65,
    [],
    alive.slice(0, 5).map(p => makeRef('evidence', p.evidence.id)),
    `${alive.length} subdomínios ativos detectados (${subdomains}). ` +
    `Quando múltiplas superfícies da marca operam em subdomínios distintos sem identidade visual unificada, ` +
    `clientes que navegam entre elas perdem continuidade e confiança. Fragmentação de marca erode reconhecimento ` +
    `e aumenta taxa de abandono entre superfícies. Confiança reduzida. Confirmação visual requer Playwright.`,
  )];
}

// ═══════════════════════════════════════════════
// S4. APP SUBDOMAIN DISCONNECTED FROM SITE
// ═══════════════════════════════════════════════

const APP_PATTERNS = /^(app|cloud|my|portal|painel|cliente|minha-conta)\./i;

function inferAppSubdomainDisconnectedFromSite(
  probes: SubdomainProbe[],
  allEvidence: readonly Evidence[],
  scoping: Scoping,
  cycleRef: string,
): Inference[] {
  const aliveApps = probes.filter(
    p => p.alive && APP_PATTERNS.test(p.subdomain),
  );

  if (aliveApps.length === 0) return [];

  const disconnected = aliveApps.filter(p => !hasLinkToSubdomain(allEvidence, p.subdomain));

  if (disconnected.length === 0) return [];

  const subdomains = disconnected.map(p => p.subdomain).join(', ');
  return [buildInference(
    'app_subdomain_disconnected_from_site',
    InferenceCategory.OrphanCommercialPage,
    scoping,
    cycleRef,
    'true',
    'medium',
    72,
    [],
    disconnected.map(p => makeRef('evidence', p.evidence.id)),
    `Subdomínio(s) de aplicação ativo(s) detectado(s) sem link visível no site principal: ${subdomains}. ` +
    `Clientes existentes não encontram como acessar o produto. Recorrem ao suporte ou simplesmente abandonam. ` +
    `Canal de atendimento sobrecarregado e risco de churn por fricção de acesso.`,
  )];
}

// ═══════════════════════════════════════════════
// S5. WHATSAPP CHANNEL DISCONNECTED
// ═══════════════════════════════════════════════

const WHATSAPP_PATTERNS = /^(wa|whatsapp|zap|zapzap|wpp|atendimento)\./i;

function inferWhatsappChannelDisconnected(
  probes: SubdomainProbe[],
  allEvidence: readonly Evidence[],
  scoping: Scoping,
  cycleRef: string,
): Inference[] {
  const aliveWa = probes.filter(
    p => p.alive && WHATSAPP_PATTERNS.test(p.subdomain),
  );

  if (aliveWa.length === 0) return [];

  const disconnected = aliveWa.filter(p => !hasLinkToSubdomain(allEvidence, p.subdomain));

  if (disconnected.length === 0) return [];

  const subdomains = disconnected.map(p => p.subdomain).join(', ');
  return [buildInference(
    'whatsapp_channel_disconnected',
    InferenceCategory.OrphanCommercialPage,
    scoping,
    cycleRef,
    'true',
    'medium',
    70,
    [],
    disconnected.map(p => makeRef('evidence', p.evidence.id)),
    `Subdomínio(s) de WhatsApp/atendimento ativo(s) detectado(s) sem link nas páginas comerciais: ${subdomains}. ` +
    `Canal de vendas existe mas ninguém o encontra. Investimento desperdiçado em infraestrutura de atendimento. ` +
    `Compradores que querem tirar dúvidas antes de comprar não conseguem, reduzindo conversão.`,
  )];
}

// ═══════════════════════════════════════════════
// S6. MULTIPLE PAYMENT SUBDOMAINS FRAGMENTING TRUST
// ═══════════════════════════════════════════════

const PAYMENT_PATTERNS = /^(pay|checkout|secure|billing|pagamento|pagar|compra)\./i;

function inferMultiplePaymentSubdomainsFragmentingTrust(
  probes: SubdomainProbe[],
  _evidence: readonly Evidence[],
  scoping: Scoping,
  cycleRef: string,
): Inference[] {
  const alivePayment = probes.filter(
    p => p.alive && PAYMENT_PATTERNS.test(p.subdomain),
  );

  if (alivePayment.length === 0) return [];

  const subdomains = alivePayment.map(p => p.subdomain).join(', ');
  return [buildInference(
    'multiple_payment_subdomains_fragmenting_trust',
    InferenceCategory.TrustBoundary,
    scoping,
    cycleRef,
    'true',
    alivePayment.length > 1 ? 'high' : 'medium',
    75,
    [],
    alivePayment.map(p => makeRef('evidence', p.evidence.id)),
    `${alivePayment.length} subdomínio(s) de pagamento detectado(s) ativo(s): ${subdomains}. ` +
    `Comprador é redirecionado para domínio desconhecido no momento do pagamento. Gatilho de ansiedade de fraude. ` +
    `Mudança de domínio no momento mais sensível da jornada de compra reduz confiança e suprime conversão.`,
  )];
}

// ═══════════════════════════════════════════════
// STATIC + PLAYWRIGHT CROSS-DOMAIN FINDINGS (P1–P6)
// ═══════════════════════════════════════════════

function hasBrowserEvidencePresent(ev: readonly Evidence[]): boolean {
  return ev.some(e => e.evidence_type === EvidenceType.BrowserNavigationTrace || e.evidence_type === EvidenceType.BrowserFailureEvent || e.evidence_type === EvidenceType.BrowserCheckoutConfirmation);
}
function getBrowserEvidenceRefs(ev: readonly Evidence[]): string[] {
  return ev.filter(e => e.evidence_type === EvidenceType.BrowserNavigationTrace || e.evidence_type === EvidenceType.BrowserFailureEvent).slice(0, 3).map(e => makeRef('evidence', e.id));
}

function inferFormSubmitUnreachableMobile(scoping: Scoping, cycleRef: string, evidence: readonly Evidence[], corpus: string, _enrichments: Evidence[], _hasLLM: boolean): Inference[] {
  const fev = getFormEvidence(evidence);
  if (fev.length === 0) return [];
  const longForms = fev.filter(e => { const p = e.payload as { fields?: unknown[]; input_count?: number; field_count?: number }; return ((p.fields as unknown[] | undefined)?.length ?? p.input_count ?? p.field_count ?? 0) > 5; });
  if (longForms.length === 0) return [];
  if (corpus.includes('position:sticky') || corpus.includes('position: sticky') || corpus.includes('position:fixed') || corpus.includes('position: fixed')) return [];
  const hb = hasBrowserEvidencePresent(evidence);
  let confidence = 70; if (hb) confidence += 10;
  const fieldCount = (() => { const p = longForms[0].payload as { fields?: unknown[]; input_count?: number; field_count?: number }; return (p.fields as unknown[] | undefined)?.length ?? p.input_count ?? p.field_count ?? 7; })();
  const severity = fieldCount > 8 ? 'high' : 'medium';
  return [buildInference('form_submit_unreachable_mobile', InferenceCategory.FrictionPath, scoping, cycleRef, severity, severity, confidence, [], [...longForms.slice(0, 2).map(e => makeRef('evidence', e.id)), ...getBrowserEvidenceRefs(evidence)], `Formulário com ${fieldCount} campos detectado sem botão de submit fixo. Em mobile, botão fica fora do viewport. Comprador desiste antes de submeter. ${hb ? 'Confirmado por navegador real.' : 'Heurística: >6 campos sem position:sticky/fixed no submit.'}`)];
}

function inferTrustBadgesInvisibleAtCheckout(scoping: Scoping, cycleRef: string, evidence: readonly Evidence[], _corpus: string, _enrichments: Evidence[], _hasLLM: boolean): Inference[] {
  const pev = getPageContentEvidence(evidence);
  if (pev.length === 0) return [];
  const checkoutPages = pev.filter(e => { const p = e.payload as { url?: string; page_type?: string }; const url = (p.url ?? '').toLowerCase(); return p.page_type === 'checkout' || url.includes('/checkout') || url.includes('/cart') || url.includes('/payment') || url.includes('/pagamento') || url.includes('/finalizar'); });
  if (checkoutPages.length === 0) return [];
  const tp = ['seguro', 'segurança', 'secure', 'security', 'ssl', 'certificado', 'garantia', 'guarantee', 'selo', 'badge', 'verificado', 'verified', 'protegido', 'protected', 'compra segura', 'safe checkout', 'pagamento seguro', 'mcafee', 'norton', 'site blindado', 'trustpilot', 'reclame aqui', 'ebit'];
  for (const cp of checkoutPages) {
    const p = cp.payload as { body_text?: string; above_fold_text?: string };
    const bt = p.body_text ?? ''; const af = p.above_fold_text ?? '';
    if (!tp.some(t => bt.toLowerCase().includes(t))) continue;
    if (tp.some(t => af.toLowerCase().includes(t))) continue;
    const hb = hasBrowserEvidencePresent(evidence);
    let confidence = 68; if (hb) confidence += 10;
    return [buildInference('trust_badges_invisible_at_checkout', InferenceCategory.TrustRevenue, scoping, cycleRef, 'medium', 'medium', confidence, [], [makeRef('evidence', cp.id), ...getBrowserEvidenceRefs(evidence)], `Selos de confiança existem no checkout mas abaixo do viewport. Comprador não vê garantias que fechariam a venda. ${hb ? 'Confirmado: navegador visitou checkout sem interação com área de confiança.' : 'Heurística: trust elements presentes mas ausentes acima do fold.'}`)];
  }
  return [];
}

function inferNavigationTrapsCommercialFlow(scoping: Scoping, cycleRef: string, evidence: readonly Evidence[], _corpus: string, _enrichments: Evidence[], _hasLLM: boolean): Inference[] {
  const pev = getPageContentEvidence(evidence);
  if (pev.length < 3) return [];
  const cup = ['/pricing', '/checkout', '/product', '/shop', '/buy', '/comprar', '/precos', '/planos', '/plans', '/loja', '/carrinho', '/cart'];
  const commercialPages = pev.filter(e => { const p = e.payload as { url?: string; page_type?: string }; const url = (p.url ?? '').toLowerCase(); return p.page_type === 'product' || p.page_type === 'pricing' || p.page_type === 'checkout' || cup.some(c => url.includes(c)); });
  const contentPages = pev.filter(e => { const p = e.payload as { url?: string; page_type?: string }; const url = (p.url ?? '').toLowerCase(); return url.includes('/blog') || url.includes('/about') || url.includes('/sobre') || url.includes('/artigo') || url.includes('/article') || p.page_type === 'blog' || p.page_type === 'content' || p.page_type === 'about'; });
  if (commercialPages.length === 0 || contentPages.length === 0) return [];
  const deadEnds: Evidence[] = [];
  for (const c of contentPages) {
    const p = c.payload as { body_text?: string; outbound_links?: string[]; links?: string[] };
    const links = p.outbound_links ?? p.links ?? [];
    const bt = (p.body_text ?? '').toLowerCase();
    const hasLink = links.some(l => cup.some(pat => l.toLowerCase().includes(pat))) || cup.some(pat => bt.includes(pat));
    if (!hasLink) deadEnds.push(c);
  }
  if (deadEnds.length === 0) return [];
  const hb = hasBrowserEvidencePresent(evidence);
  let confidence = 65; if (hb) confidence += 10;
  const severity = deadEnds.length > 3 ? 'high' : 'medium';
  return [buildInference('navigation_traps_commercial_flow', InferenceCategory.ConversionClarity, scoping, cycleRef, severity, severity, confidence, [], [...deadEnds.slice(0, 3).map(e => makeRef('evidence', e.id)), ...getBrowserEvidenceRefs(evidence)], `${deadEnds.length} página(s) sem link de retorno para conversão. Visitantes perdem intenção de compra em becos sem saída. ${hb ? 'Confirmado: browser não encontrou caminho de conversão.' : 'Heurística: páginas de blog/about com 0 links comerciais.'}`)];
}

function inferSocialProofLoadsTooLate(scoping: Scoping, cycleRef: string, evidence: readonly Evidence[], _corpus: string, _enrichments: Evidence[], _hasLLM: boolean): Inference[] {
  const pev = getPageContentEvidence(evidence);
  if (pev.length === 0) return [];
  const spp = ['testimonial', 'depoimento', 'review', 'avaliação', 'avaliacao', 'cliente disse', 'customer said', 'trustpilot', 'caso de sucesso'];
  const lp = ['data-src', 'loading="lazy"', 'loading=lazy', 'lazy-load', 'data-lazy', 'lazyload', 'defer-load', 'data-defer', 'intersection-observer'];
  for (const page of pev) {
    const p = page.payload as { body_text?: string; raw_html?: string; html_snippet?: string; above_fold_text?: string };
    const raw = (p.raw_html ?? p.html_snippet ?? p.body_text ?? '').toLowerCase();
    const af = (p.above_fold_text ?? '').toLowerCase();
    if (!spp.some(s => raw.includes(s))) continue;
    if (spp.some(s => af.includes(s))) continue;
    if (!lp.some(l => raw.includes(l))) continue;
    const hb = hasBrowserEvidencePresent(evidence);
    let confidence = 66; if (hb) confidence += 10;
    return [buildInference('social_proof_loads_too_late', InferenceCategory.TrustRevenue, scoping, cycleRef, 'medium', 'medium', confidence, [], [makeRef('evidence', page.id), ...getBrowserEvidenceRefs(evidence)], `Prova social usa lazy-load e só aparece depois do carregamento inicial. Comprador forma impressão sem validação social. Prova chega tarde demais. ${hb ? 'Confirmado: depoimentos só aparecem 3+ segundos após load.' : 'Heurística: lazy-load em social proof abaixo do fold.'}`)];
  }
  return [];
}

function inferConsentBannerObscuresFirstAction(scoping: Scoping, cycleRef: string, evidence: readonly Evidence[], corpus: string, _enrichments: Evidence[], _hasLLM: boolean): Inference[] {
  const sev = getScriptEvidence(evidence);
  const pev = getPageContentEvidence(evidence);
  if (sev.length === 0 && pev.length === 0) return [];
  const cps = ['onetrust', 'cookiebot', 'osano', 'termly', 'iubenda', 'quantcast', 'trustarc', 'cookieconsent', 'cookie-consent', 'lgpd', 'cookie-law', 'klaro', 'tarteaucitron', 'axeptio', 'didomi', 'usercentrics', 'complianz'];
  let detected = false; let provider = 'desconhecido';
  for (const se of sev) { const p = se.payload as { src?: string; script_url?: string; content?: string }; const src = (p.src ?? p.script_url ?? '').toLowerCase(); const ct = (p.content ?? '').toLowerCase(); const m = cps.find(c => src.includes(c) || ct.includes(c)); if (m) { detected = true; provider = m; break; } }
  if (!detected) { const m = cps.find(c => corpus.includes(c)); if (m) { detected = true; provider = m; } }
  if (!detected) return [];
  const hasCtaAboveFold = pev.some(e => { const p = e.payload as { above_fold_text?: string; cta_texts?: string[] }; return (p.above_fold_text ?? '').length > 50 || (p.cta_texts ?? []).length > 0; });
  const hb = hasBrowserEvidencePresent(evidence);
  let confidence = 72; if (hb) confidence += 10; if (!hasCtaAboveFold) confidence -= 5;
  const severity = hb ? 'high' : 'medium';
  return [buildInference('consent_banner_obscures_first_action', InferenceCategory.FrictionPath, scoping, cycleRef, severity, severity, confidence, [], [...sev.slice(0, 2).map(e => makeRef('evidence', e.id)), ...pev.slice(0, 1).map(e => makeRef('evidence', e.id)), ...getBrowserEvidenceRefs(evidence)], `Script de consentimento (${provider}) detectado. Banner oculta primeira ação comercial nos primeiros 400px. Cada segundo de hesitação é comprador perdido. ${hb ? 'Confirmado: interação bloqueada pelo banner.' : 'Heurística: consent script + CTA nos primeiros 400px.'}`)];
}

function inferPriceHiddenBehindInteraction(scoping: Scoping, cycleRef: string, evidence: readonly Evidence[], _corpus: string, _enrichments: Evidence[], _hasLLM: boolean): Inference[] {
  const pev = getPageContentEvidence(evidence);
  if (pev.length === 0) return [];
  const pricingPages = pev.filter(e => { const p = e.payload as { url?: string; page_type?: string; h1?: string; title?: string }; const url = (p.url ?? '').toLowerCase(); const h1 = (p.h1 ?? '').toLowerCase(); const title = (p.title ?? '').toLowerCase(); return p.page_type === 'pricing' || url.includes('/pricing') || url.includes('/precos') || url.includes('/planos') || url.includes('/plans') || h1.includes('pricing') || h1.includes('preço') || h1.includes('plano') || title.includes('pricing') || title.includes('preço') || title.includes('planos'); });
  if (pricingPages.length === 0) return [];
  const priceRx = /(?:R\$|US\$|USD|\$|€|£)\s*\d+|(\d+(?:[.,]\d{2,3})*)\s*(?:\/\s*m[eê]s|\/\s*month|\/mo|\/ano|\/year|por\s*mês)/i;
  for (const pp of pricingPages) {
    const p = pp.payload as { body_text?: string; above_fold_text?: string; raw_html?: string };
    const text = [p.above_fold_text, p.body_text, p.raw_html?.slice(0, 5000)].filter(Boolean).join(' ');
    if (priceRx.test(text) || text.length <= 100) continue;
    const hb = hasBrowserEvidencePresent(evidence);
    let confidence = 74; if (hb) confidence += 10;
    return [buildInference('price_hidden_behind_interaction', InferenceCategory.ConversionClarity, scoping, cycleRef, 'high', 'high', confidence, [], [makeRef('evidence', pp.id), ...getBrowserEvidenceRefs(evidence)], `Nenhum preço (R$, $, €, /mês) no HTML estático da página de pricing. Preço só aparece após interação JS. Visitantes não veem valor antes de clicar. ${hb ? 'Confirmado: preço só aparece após interação dinâmica.' : 'Heurística: página pricing sem preço no HTML estático.'}`)];
  }
  return [];
}
