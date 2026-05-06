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
// Triple-Source Inference Engine
//
// Derives findings that correlate ALL THREE evidence
// sources: Static crawl + Playwright browser + LLM enrichment.
//
// CRITICAL: Every finding operates in HEURISTIC FALLBACK
// mode (static-only, lower confidence). Playwright and LLM
// BOOST confidence when present but are never required.
//
// Confidence model:
//   let confidence = BASE_CONFIDENCE;
//   if (hasBrowserEvidence) confidence += 5;
//   if (hasLlmEvidence) confidence += 5;
//   // Max confidence = BASE + 10 when all sources confirm
// ──────────────────────────────────────────────

const ids = new IdGenerator('triple_inf');

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

function getPageContent(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.PageContent);
}

function getForms(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.Form);
}

function getEnrichments(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.ContentEnrichment);
}

function getNavTraces(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.BrowserNavigationTrace);
}

function getRedirChains(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.BrowserRedirectChain);
}

function getMeta(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.Meta);
}

function getRedirects(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.Redirect);
}

function getCheckoutInd(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.CheckoutIndicator);
}

function getScripts(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.Script);
}

function extractKeywords(text: string): string[] {
  const stopwords = new Set([
    'that', 'this', 'with', 'from', 'your', 'have', 'will', 'been', 'more',
    'when', 'what', 'para', 'como', 'mais', 'você', 'esse', 'essa', 'este',
    'esta', 'pela', 'pelo', 'seus', 'suas', 'nosso', 'nossa', 'cada', 'todo',
    'toda', 'muito', 'outros', 'sobre', 'entre', 'depois', 'antes', 'ainda',
  ]);
  return text.toLowerCase()
    .replace(/[^a-záàâãéèêíïóôõöúüç\w\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !stopwords.has(w));
}

// ── Main entry point ─────────────────────────

export function computeTripleSourceInferences(
  signals: Signal[],
  scoping: Scoping,
  cycleRef: string,
  evidence: readonly Evidence[],
): Inference[] {
  const results: Inference[] = [];
  const corpus = buildCorpus(evidence);
  const enrichments = getEnrichments(evidence);

  results.push(...inferBrandTrustCliffAtPayment(scoping, cycleRef, evidence, corpus, enrichments));
  results.push(...inferAdLandingExperienceDisconnect(scoping, cycleRef, evidence, corpus, enrichments));
  results.push(...inferCheckoutFormMobileHostile(scoping, cycleRef, evidence, corpus, enrichments));
  results.push(...inferPricingPageComplexityParalysis(scoping, cycleRef, evidence, corpus, enrichments));
  results.push(...inferSupportPromiseImpossibleToFulfill(scoping, cycleRef, evidence, corpus, enrichments));
  results.push(...inferTrustJourneyInconsistency(scoping, cycleRef, evidence, corpus, enrichments));
  results.push(...inferMultilingualConversionLeak(scoping, cycleRef, evidence, corpus, enrichments));

  return results;
}

// ═══════════════════════════════════════════════
// T1. brand_trust_cliff_at_payment
// ═══════════════════════════════════════════════

function inferBrandTrustCliffAtPayment(
  scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, enrichments: Evidence[],
): Inference[] {
  const BASE_CONFIDENCE = 66;
  const redirects = getRedirects(evidence);
  const ckInd = getCheckoutInd(evidence);
  const pc = getPageContent(evidence);

  const ckPages = pc.filter(e => {
    const p = e.payload as { url?: string };
    return (p.url ?? '').match(/\/checkout|\/cart|\/pay|\/pagamento|\/compra/i);
  });

  const domainChanges = redirects.filter(e => {
    const p = e.payload as { from_url?: string; to_url?: string };
    if (!p.from_url || !p.to_url) return false;
    try {
      const fh = new URL(p.from_url).hostname.replace(/^www\./, '');
      const th = new URL(p.to_url).hostname.replace(/^www\./, '');
      return fh !== th;
    } catch { return false; }
  });

  const hasCtx = corpus.includes('checkout') || corpus.includes('pagamento') || corpus.includes('compra') || corpus.includes('payment');
  const hasDomChg = domainChanges.length > 0 || (ckPages.length > 0 && ckInd.some(e => {
    const p = e.payload as { provider_domain?: string; site_domain?: string };
    return p.provider_domain && p.site_domain && p.provider_domain !== p.site_domain;
  }));

  if (!hasCtx || !hasDomChg) return [];

  const trustPats = ['selo', 'badge', 'seguro', 'secure', 'ssl', 'certificado', 'confiança', 'trust', 'verified', 'verificado', 'garantia'];
  const ckCorpus = ckPages.map(e => [(e.payload as { title?: string }).title, (e.payload as { h1?: string }).h1].filter(Boolean).join(' ')).join(' ').toLowerCase();
  if (trustPats.some(p => ckCorpus.includes(p))) return [];

  const navTraces = getNavTraces(evidence);
  const hasBrowser = navTraces.some(e => {
    const p = e.payload as { domain_changes?: number };
    return (p.domain_changes ?? 0) > 0;
  }) || getRedirChains(evidence).length > 0;

  const hasLlm = enrichments.some(e => {
    const p = e.payload as { branding_inconsistency?: boolean; issues?: string[] };
    return p.branding_inconsistency || (p.issues ?? []).some(i => i.toLowerCase().includes('brand') || i.toLowerCase().includes('marca'));
  });

  let confidence = BASE_CONFIDENCE;
  if (hasBrowser) confidence += 5;
  if (hasLlm) confidence += 5;

  const refs = [...domainChanges.slice(0, 2), ...ckPages.slice(0, 1), ...ckInd.slice(0, 1)].map(e => makeRef('evidence', e.id));

  return [mk('brand_trust_cliff_at_payment', InferenceCategory.TrustBoundary, scoping, cycleRef, 'true', 'high', confidence, [], refs,
    'O comprador navega no seu domínio, cria confiança com sua marca, e no momento do pagamento é jogado para outro domínio sem qualquer selo ou elemento de confiança. Essa quebra abrupta é como trocar de loja na hora de pagar — 40% dos compradores abandonam quando percebem a mudança de URL porque associam a um golpe.',
  )];
}

// ═══════════════════════════════════════════════
// T2. ad_landing_experience_disconnect
// ═══════════════════════════════════════════════

function inferAdLandingExperienceDisconnect(
  scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, enrichments: Evidence[],
): Inference[] {
  const BASE_CONFIDENCE = 62;
  const metaEv = getMeta(evidence);
  const pc = getPageContent(evidence);

  const metaDescs: string[] = [];
  for (const e of metaEv) {
    const p = e.payload as { name?: string; content?: string; property?: string };
    if (p.name === 'description' && p.content) metaDescs.push(p.content.toLowerCase());
    if (p.property === 'og:title' && p.content) metaDescs.push(p.content.toLowerCase());
    if (p.property === 'og:description' && p.content) metaDescs.push(p.content.toLowerCase());
  }
  for (const e of pc) {
    const p = e.payload as { meta_description?: string | null };
    if (p.meta_description) metaDescs.push(p.meta_description.toLowerCase());
  }
  if (metaDescs.length === 0) return [];

  const metaKw = extractKeywords(metaDescs.join(' ')).filter(w => w.length > 5);
  if (metaKw.length < 3) return [];

  const h1s: string[] = [];
  const abFold: string[] = [];
  for (const e of pc) {
    const p = e.payload as { h1?: string | null; above_fold_text?: string };
    if (p.h1) h1s.push(p.h1.toLowerCase());
    if (p.above_fold_text) abFold.push(p.above_fold_text.toLowerCase().slice(0, 200));
  }
  if (h1s.length === 0 && abFold.length === 0) return [];

  const pgText = [...h1s, ...abFold].join(' ');
  const matching = metaKw.filter(w => pgText.includes(w));
  if (1 - (matching.length / metaKw.length) < 0.6) return [];

  const hasBrowser = getNavTraces(evidence).length > 0;
  const hasLlm = enrichments.some(e => {
    const p = e.payload as { message_mismatch?: boolean; issues?: string[] };
    return p.message_mismatch || (p.issues ?? []).some(i => i.toLowerCase().includes('mismatch') || i.toLowerCase().includes('disconnect') || i.toLowerCase().includes('inconsist'));
  });

  let confidence = BASE_CONFIDENCE;
  if (hasBrowser) confidence += 5;
  if (hasLlm) confidence += 5;

  const refs = [...metaEv.slice(0, 2), ...pc.slice(0, 2)].map(e => makeRef('evidence', e.id));

  return [mk('ad_landing_experience_disconnect', InferenceCategory.ExpectationAlignment, scoping, cycleRef, 'true', 'medium', confidence, [], refs,
    'As meta tags e OG tags prometem benefícios específicos que a página não entrega acima da dobra. O visitante chega esperando ver exatamente o que o Google ou redes sociais mostraram — quando a mensagem não bate, o cérebro registra "isca" e a taxa de rejeição dispara nos primeiros 5 segundos. Cada clique pago que encontra essa desconexão é dinheiro jogado fora duas vezes.',
  )];
}

// ═══════════════════════════════════════════════
// T3. checkout_form_mobile_hostile
// ═══════════════════════════════════════════════

function inferCheckoutFormMobileHostile(
  scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], _corpus: string, enrichments: Evidence[],
): Inference[] {
  const BASE_CONFIDENCE = 64;
  const formEv = getForms(evidence);

  const hostile = formEv.filter(e => {
    const p = e.payload as { field_names?: string[]; field_count?: number; has_autocomplete?: boolean; input_types?: string[]; page_url?: string };
    const fc = p.field_count ?? (p.field_names ?? []).length;
    const isChk = (p.page_url ?? '').match(/\/checkout|\/cart|\/pay|\/pagamento|\/compra|\/pedido/i);
    const hasAC = p.has_autocomplete ?? false;
    const hasSpecial = (p.input_types ?? []).some(t => ['email', 'tel', 'number'].includes(t));
    return isChk && fc > 4 && !hasAC && !hasSpecial;
  });

  const big = hostile.length > 0 ? hostile : formEv.filter(e => {
    const p = e.payload as { field_names?: string[]; field_count?: number; has_autocomplete?: boolean; input_types?: string[] };
    const fc = p.field_count ?? (p.field_names ?? []).length;
    return fc > 4 && !(p.has_autocomplete ?? false) && !(p.input_types ?? []).some(t => ['email', 'tel', 'number'].includes(t));
  });

  if (big.length === 0) return [];

  const hasBrowser = getNavTraces(evidence).some(e => {
    const p = e.payload as { viewport?: string; mobile?: boolean };
    return p.mobile || (p.viewport ?? '').includes('mobile');
  });
  const hasLlm = enrichments.some(e => {
    const p = e.payload as { form_issues?: string[]; issues?: string[] };
    return (p.form_issues ?? []).length > 0 || (p.issues ?? []).some(i => i.toLowerCase().includes('form') || i.toLowerCase().includes('label') || i.toLowerCase().includes('campo'));
  });

  let confidence = BASE_CONFIDENCE;
  if (hasBrowser) confidence += 5;
  if (hasLlm) confidence += 5;

  return [mk('checkout_form_mobile_hostile', InferenceCategory.FrictionPath, scoping, cycleRef, 'true', 'high', confidence, [], big.slice(0, 3).map(e => makeRef('evidence', e.id)),
    'O formulário de checkout tem mais de 4 campos sem autocomplete e sem tipos especializados (email, tel). No mobile, isso significa digitar tudo manualmente em teclado genérico — cada campo extra aumenta 10% o abandono. Com 60%+ do tráfego vindo de celular, formulários hostis ao mobile são o maior destruidor silencioso de conversão.',
  )];
}

// ═══════════════════════════════════════════════
// T4. pricing_page_complexity_paralysis
// ═══════════════════════════════════════════════

function inferPricingPageComplexityParalysis(
  scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, enrichments: Evidence[],
): Inference[] {
  const BASE_CONFIDENCE = 60;
  const pc = getPageContent(evidence);

  const pricingPages = pc.filter(e => {
    const p = e.payload as { url?: string; title?: string; h1?: string };
    return (p.url ?? '').match(/\/pricing|\/precos|\/planos|\/plans/i) ||
      (p.title ?? '').toLowerCase().match(/pricing|preços|planos|plans/) ||
      (p.h1 ?? '').toLowerCase().match(/pricing|preços|planos|plans/);
  });
  if (pricingPages.length === 0) return [];

  const planPats = ['basic', 'starter', 'pro', 'premium', 'enterprise', 'business', 'free', 'profissional', 'empresarial', 'avançado', 'plus', 'team', 'growth'];
  if (planPats.filter(p => corpus.includes(p)).length < 4) return [];

  const featPats = ['✓', '✗', '✔', '×', 'incluso', 'included', 'unlimited', 'ilimitado'];
  if (featPats.reduce((s, p) => s + (corpus.split(p).length - 1), 0) < 10) return [];

  const recPats = ['recomendado', 'recommended', 'popular', 'mais popular', 'best value', 'melhor custo', 'destaque'];
  if (recPats.some(p => corpus.includes(p))) return [];

  const hasBrowser = getNavTraces(evidence).length > 0;
  const hasLlm = enrichments.some(e => {
    const p = e.payload as { pricing_clarity?: string; issues?: string[] };
    return p.pricing_clarity === 'confusing' || (p.issues ?? []).some(i => i.toLowerCase().includes('pric') || i.toLowerCase().includes('plano') || i.toLowerCase().includes('confus'));
  });

  let confidence = BASE_CONFIDENCE;
  if (hasBrowser) confidence += 5;
  if (hasLlm) confidence += 5;

  return [mk('pricing_page_complexity_paralysis', InferenceCategory.ConversionClarity, scoping, cycleRef, 'true', 'medium', confidence, [], pricingPages.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'A página de preços apresenta 4+ planos com 10+ linhas de funcionalidades sem nenhum destaque de "recomendado". O paradoxo da escolha paralisa o visitante — quando tudo parece igual mas diferente, ninguém escolhe. Pesquisas mostram que reduzir opções de 4 para 3 com destaque claro aumenta conversão em 25%.',
  )];
}

// ═══════════════════════════════════════════════
// T5. support_promise_impossible_to_fulfill
// ═══════════════════════════════════════════════

function inferSupportPromiseImpossibleToFulfill(
  scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string, enrichments: Evidence[],
): Inference[] {
  const BASE_CONFIDENCE = 58;
  const slaP = ['respond in', 'respondemos em', 'resposta em até', 'within 1 hour', 'em até 1h', '24/7', '24 horas', 'suporte 24h', 'tempo de resposta', 'response time', 'atendimento imediato', 'resposta imediata', 'chat ao vivo', 'live chat', 'suporte em tempo real', 'real-time support'];
  if (!slaP.some(p => corpus.includes(p))) return [];

  const scripts = getScripts(evidence);
  const chatPats = ['intercom', 'crisp', 'tawk', 'drift', 'hubspot', 'zendesk', 'livechat', 'tidio', 'freshchat', 'olark', 'chatwoot'];
  if (scripts.some(e => { const p = e.payload as { url?: string; src?: string }; const src = (p.url ?? p.src ?? '').toLowerCase(); return chatPats.some(cw => src.includes(cw)); })) return [];

  const formEv = getForms(evidence);
  const supportForms = formEv.filter(e => { const p = e.payload as { page_url?: string }; return (p.page_url ?? '').match(/\/support|\/suporte|\/contact|\/contato|\/help|\/ajuda/i); });
  if (supportForms.length > 0) {
    const aggSla = ['1h', 'imediato', 'immediate', 'instant', 'real-time', 'tempo real'];
    if (!aggSla.some(p => corpus.includes(p))) return [];
  }

  const hasBrowser = getNavTraces(evidence).some(e => { const p = e.payload as { widget_errors?: number; chat_loaded?: boolean }; return p.widget_errors != null || p.chat_loaded === false; });
  const hasLlm = enrichments.some(e => { const p = e.payload as { issues?: string[]; support_issues?: string[] }; return (p.support_issues ?? []).length > 0 || (p.issues ?? []).some(i => i.toLowerCase().includes('support') || i.toLowerCase().includes('suporte') || i.toLowerCase().includes('sla')); });

  let confidence = BASE_CONFIDENCE;
  if (hasBrowser) confidence += 5;
  if (hasLlm) confidence += 5;

  const pc = getPageContent(evidence);
  const supPg = pc.filter(e => { const p = e.payload as { url?: string }; return (p.url ?? '').match(/\/support|\/suporte|\/contact|\/contato|\/help|\/ajuda/i); });
  const refs = supPg.length > 0 ? supPg.slice(0, 2).map(e => makeRef('evidence', e.id)) : pc.slice(0, 1).map(e => makeRef('evidence', e.id));

  return [mk('support_promise_impossible_to_fulfill', InferenceCategory.SupportAccessibility, scoping, cycleRef, 'true', 'medium', confidence, [], refs,
    'O site promete atendimento rápido ou 24/7 mas não tem canal funcional para cumprir. Promessas de SLA quebradas geram mais raiva do que não prometer nada — o cliente que esperava resposta em 1h e não recebeu vai direto pro chargeback ao invés de esperar. Cada promessa impossível é um convite para disputa.',
  )];
}

// ═══════════════════════════════════════════════
// T6. trust_journey_inconsistency
// ═══════════════════════════════════════════════

function inferTrustJourneyInconsistency(
  scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], _corpus: string, enrichments: Evidence[],
): Inference[] {
  const BASE_CONFIDENCE = 62;
  const pc = getPageContent(evidence);
  if (pc.length < 2) return [];

  const tPats = ['testimonial', 'depoimento', 'review', 'avaliação', 'estrela', 'star', 'badge', 'selo', 'certificado', 'certificate', 'trust', 'confiança', 'seguro', 'secure', 'garantia', 'guarantee', 'verified', 'verificado', 'reclame aqui', 'google reviews', 'trustpilot'];

  const home = pc.filter(e => { const p = e.payload as { url?: string }; const u = p.url ?? ''; return u.match(/^https?:\/\/[^/]+\/?$/) || (u.endsWith('/') && !u.includes('/product') && !u.includes('/checkout')); });
  const chk = pc.filter(e => { const p = e.payload as { url?: string }; return (p.url ?? '').match(/\/checkout|\/cart|\/pay|\/pagamento|\/compra/i); });
  const prod = pc.filter(e => { const p = e.payload as { url?: string }; return (p.url ?? '').match(/\/product|\/produto|\/item|\/pricing|\/precos/i); });

  function ct(pages: Evidence[]): number {
    let c = 0;
    for (const e of pages) {
      const p = e.payload as { title?: string; h1?: string; body_text?: string; above_fold_text?: string };
      const t = [p.title, p.h1, p.body_text, p.above_fold_text].filter(Boolean).join(' ').toLowerCase();
      for (const pat of tPats) { if (t.includes(pat)) c++; }
    }
    return c;
  }

  if (ct(home) < 2 || !((chk.length > 0 && ct(chk) === 0) || (prod.length > 0 && ct(prod) === 0))) return [];

  const hasBrowser = getNavTraces(evidence).length > 0;
  const hasLlm = enrichments.some(e => { const p = e.payload as { issues?: string[]; trust_inconsistency?: boolean }; return p.trust_inconsistency || (p.issues ?? []).some(i => i.toLowerCase().includes('trust') || i.toLowerCase().includes('confiança') || i.toLowerCase().includes('inconsist')); });

  let confidence = BASE_CONFIDENCE;
  if (hasBrowser) confidence += 5;
  if (hasLlm) confidence += 5;

  const refs = [...home.slice(0, 1), ...chk.slice(0, 1), ...prod.slice(0, 1)].map(e => makeRef('evidence', e.id));

  return [mk('trust_journey_inconsistency', InferenceCategory.TrustRevenue, scoping, cycleRef, 'true', 'medium', confidence, [], refs,
    'Elementos de confiança (selos, depoimentos, avaliações) existem na homepage mas desaparecem nas páginas críticas de decisão. O comprador constrói confiança navegando mas ao chegar no checkout ou produto, não encontra nada que confirme a segurança. Essa inconsistência funciona como um "alarme silencioso" — o cérebro detecta a ausência e ativa o modo defensivo justo na hora de pagar.',
  )];
}

// ═══════════════════════════════════════════════
// T7. multilingual_conversion_leak
// ═══════════════════════════════════════════════

function inferMultilingualConversionLeak(
  scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], _corpus: string, enrichments: Evidence[],
): Inference[] {
  const BASE_CONFIDENCE = 65;
  const pc = getPageContent(evidence);
  const metaEv = getMeta(evidence);
  if (pc.length < 2) return [];

  const langAttrs: Set<string> = new Set();
  for (const e of metaEv) {
    const p = e.payload as { name?: string; content?: string; property?: string };
    if ((p.name === 'lang' || p.property === 'lang') && p.content) langAttrs.add(p.content.toLowerCase().slice(0, 2));
  }

  const ptI = ['você', 'comprar', 'adicionar', 'carrinho', 'pagamento', 'não', 'são', 'está', 'também'];
  const enI = ['you', 'buy', 'add to cart', 'checkout', 'payment', 'your', 'our', 'get started'];
  const esI = ['usted', 'comprar', 'añadir', 'carrito', 'también', 'nuestro', 'comenzar'];

  const pageLangs: { page: Evidence; lang: string }[] = [];
  for (const e of pc) {
    const p = e.payload as { title?: string; h1?: string; body_text?: string; above_fold_text?: string };
    const t = [p.title, p.h1, p.body_text, p.above_fold_text].filter(Boolean).join(' ').toLowerCase();
    const pt = ptI.filter(w => t.includes(w)).length;
    const en = enI.filter(w => t.includes(w)).length;
    const es = esI.filter(w => t.includes(w)).length;
    const mx = Math.max(pt, en, es);
    if (mx < 2) continue;
    let l = 'unknown';
    if (pt === mx) l = 'pt';
    else if (en === mx) l = 'en';
    else if (es === mx) l = 'es';
    pageLangs.push({ page: e, lang: l });
  }

  const detected = new Set(pageLangs.map(pl => pl.lang));
  if (detected.size <= 1 && langAttrs.size <= 1) return [];

  const crit = pageLangs.filter(pl => { const p = pl.page.payload as { url?: string }; return (p.url ?? '').match(/\/checkout|\/cart|\/product|\/produto|\/pricing|\/pay/i); });
  const nonCrit = pageLangs.filter(pl => { const p = pl.page.payload as { url?: string }; return !(p.url ?? '').match(/\/checkout|\/cart|\/product|\/produto|\/pricing|\/pay/i); });
  const cL = new Set(crit.map(pl => pl.lang));
  const nL = new Set(nonCrit.map(pl => pl.lang));
  const conflict = [...cL].some(l => !nL.has(l)) || [...nL].some(l => !cL.has(l));
  if (!conflict && langAttrs.size < 2) return [];

  const bt = getNavTraces(evidence);
  const hasBrowser = bt.some(e => { const p = e.payload as { language_changes?: number }; return (p.language_changes ?? 0) > 0; }) || bt.length > 0;
  const hasLlm = enrichments.some(e => { const p = e.payload as { issues?: string[]; language_mismatch?: boolean }; return p.language_mismatch || (p.issues ?? []).some(i => i.toLowerCase().includes('language') || i.toLowerCase().includes('idioma') || i.toLowerCase().includes('língua')); });

  let confidence = BASE_CONFIDENCE;
  if (hasBrowser) confidence += 5;
  if (hasLlm) confidence += 5;

  const refs = pageLangs.slice(0, 3).map(pl => makeRef('evidence', pl.page.id));

  return [mk('multilingual_conversion_leak', InferenceCategory.LanguageDiscontinuity, scoping, cycleRef, 'true', 'high', confidence, [], refs,
    'O idioma muda entre páginas do funil sem aviso. O visitante começa em uma língua e encontra outra na hora de decidir ou pagar. Mudanças de idioma mid-funnel destroem a fluidez cognitiva — o comprador precisa "recalcular" mentalmente e esse esforço extra é suficiente para abandonar. Sites multilíngues que mantêm consistência de idioma por sessão convertem 30% mais.',
  )];
}

// ── Internal builder ─────────────────────────

function mk(
  key: string, category: InferenceCategory, scoping: Scoping, cycleRef: string,
  conclusionValue: string, severityHint: string, confidence: number,
  signalRefs: string[], evidenceRefs: string[], reasoning: string,
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
