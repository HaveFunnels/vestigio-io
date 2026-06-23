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
import type { BusinessContext } from '../perception/business-context';

// ──────────────────────────────────────────────
// Vertical Inference Engine
//
// Derives findings that ONLY matter for specific business
// types (verticals). Gated by businessModel parameter.
//
// Verticals covered:
//   - Fashion/E-commerce ("ecommerce")
//   - SaaS ("saas")
//   - Food/Restaurant ("food")
//   - Health/Beauty ("health", "beauty")
//   - Education/Courses ("education")
//   - B2B Services ("services")
// ──────────────────────────────────────────────

const ids = new IdGenerator('vert_inf');

/** PV.6 keystone — find crawled URLs whose perceived purpose matches one of
 *  `purposes`. Lets vertical detectors locate "the booking surface" /
 *  "the services page" by perceived purpose instead of brittle URL regex.
 *  Returns [] when perception is absent (detector simply doesn't fire). */
export function surfacesByPurpose(
  businessContext: BusinessContext | null | undefined,
  ...purposes: string[]
): string[] {
  if (!businessContext) return [];
  const want = new Set(purposes);
  return businessContext.surfaces
    .filter((s) => want.has(s.purpose))
    .map((s) => s.url);
}

// ── Evidence text search helper ──────────────

function evidenceContains(evidence: readonly Evidence[], patterns: string[]): boolean {
  const lower = patterns.map(p => p.toLowerCase());
  for (const ev of evidence) {
    if (ev.evidence_type !== EvidenceType.PageContent) continue;
    const payload = ev.payload as { type: string; title?: string | null; meta_description?: string | null; h1?: string | null };
    const searchable = [payload.title, payload.meta_description, payload.h1]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (lower.some(p => searchable.includes(p))) return true;
  }
  return false;
}

function evidenceContainsAny(evidence: readonly Evidence[], patterns: string[]): boolean {
  return evidenceContains(evidence, patterns);
}

function evidenceContainsAll(evidence: readonly Evidence[], patterns: string[]): boolean {
  const lower = patterns.map(p => p.toLowerCase());
  const corpus = buildCorpus(evidence);
  return lower.every(p => corpus.includes(p));
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
  }
  return parts.join(' ').toLowerCase();
}

function getFormEvidence(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.Form);
}

function getCopyElements(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => {
    const p = e.payload as { type?: string };
    return p.type === 'copy_elements';
  });
}

function getContentEnrichments(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.ContentEnrichment);
}

function getPageContentEvidence(evidence: readonly Evidence[]): Evidence[] {
  return evidence.filter(e => e.evidence_type === EvidenceType.PageContent);
}

// ── Main entry point ─────────────────────────

export function computeVerticalInferences(
  signals: Signal[],
  scoping: Scoping,
  cycleRef: string,
  businessModel: string | null,
  evidence: readonly Evidence[],
  // PV.6 keystone — perceived surfaces, so detectors find the booking/services
  // surface by purpose (via surfacesByPurpose) instead of URL regex. Optional;
  // null → surface-dependent detectors don't fire (degrade-safe).
  businessContext?: BusinessContext | null,
): Inference[] {
  if (!businessModel) return [];

  const inferences: Inference[] = [];
  const sigMap = new Map<string, Signal>();
  for (const s of signals) sigMap.set(s.signal_key, s);

  const model = businessModel.toLowerCase();
  const corpus = buildCorpus(evidence);

  // ── Fashion/E-commerce ──────────────────────
  if (model.includes('ecommerce')) {
    inferences.push(...inferSizeGuideMissing(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferProductImagesInsufficient(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferNoUrgencyIndicators(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferCrossSellAbsent(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferReturnPolicyNotOnProduct(sigMap, scoping, cycleRef, evidence, corpus));
  }

  // ── SaaS ────────────────────────────────────
  if (model === 'saas') {
    inferences.push(...inferNoFreeTrialOffered(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferIntegrationEcosystemInvisible(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferChangelogStaleOrMissing(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferAnnualDiscountNotHighlighted(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferNoProductScreenshotVisible(sigMap, scoping, cycleRef, evidence, corpus));
  }

  // ── Food/Restaurant ─────────────────────────
  if (model === 'food' || model.includes('food')) {
    inferences.push(...inferMenuRequiresSignup(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferNoFoodPhotos(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferDeliveryAreaUnclear(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferDeliveryTimeNotShown(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferAllergenInfoMissing(sigMap, scoping, cycleRef, evidence, corpus));
  }

  // ── Health/Beauty ───────────────────────────
  if (model.includes('health') || model.includes('beauty')) {
    inferences.push(...inferIngredientsNotListed(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferNoClinicalEndorsement(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferUsageInstructionsAbsent(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferSubscriptionNotOffered(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferNoResultsEvidence(sigMap, scoping, cycleRef, evidence, corpus));
  }

  // ── Education/Courses ───────────────────────
  if (model === 'education' || model.includes('education')) {
    inferences.push(...inferCurriculumNotVisible(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferInstructorCredentialsMissing(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferCompletionCertificateAbsent(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferTimeCommitmentUnclear(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferNoSampleContent(sigMap, scoping, cycleRef, evidence, corpus));
  }

  // ── B2B Services ────────────────────────────
  if (model === 'services' || model.includes('services') || model.includes('form')) {
    inferences.push(...inferNoCaseStudyWithMetrics(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferMethodologyNotExplained(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferEnterpriseSignalsMissing(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferContactFormExcessiveFields(sigMap, scoping, cycleRef, evidence, corpus));
    inferences.push(...inferResponseTimeNotPromised(sigMap, scoping, cycleRef, evidence, corpus));
  }

  // ── Local service (appointment/visit-driven: clinics, salons, mechanics) ──
  if (model === 'local_service' || model.includes('local')) {
    inferences.push(...inferBookingAbsentOrPhoneOnly(sigMap, scoping, cycleRef, evidence, corpus, businessContext));
    inferences.push(...inferContactFrictionHigh(sigMap, scoping, cycleRef, evidence, corpus, businessContext));
    inferences.push(...inferBookingIntakeExcessive(sigMap, scoping, cycleRef, evidence, corpus, businessContext));
    inferences.push(...inferServicePricingOpaque(sigMap, scoping, cycleRef, evidence, corpus, businessContext));
  }

  return inferences;
}

// ═══════════════════════════════════════════════
// LOCAL SERVICE (appointment/visit-driven: clinics, salons, mechanics, etc.)
// ═══════════════════════════════════════════════

function inferBookingAbsentOrPhoneOnly(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  _evidence: readonly Evidence[], corpus: string,
  businessContext: BusinessContext | null | undefined,
): Inference[] {
  // Online booking present (a perceived booking surface OR a booking widget) → no gap.
  if (surfacesByPurpose(businessContext, 'booking').length > 0) return [];
  const bookingWidget = ['calendly', 'acuity', 'simplybook', 'agendor', 'agendamento online', 'agende online', 'book now', 'schedule online'];
  if (bookingWidget.some((p) => corpus.includes(p))) return [];

  return [buildInference(
    'booking_absent_or_phone_only',
    InferenceCategory.ConversionFlow,
    scoping, cycleRef, 'true', 'high', 72,
    [],
    [],
    'Negócio de agendamento sem caminho de marcação online: o cliente é forçado a ligar ou mandar mensagem. Quem busca fora do horário, ou está com pressa, desiste e vai pro concorrente que deixa marcar em dois cliques. Cada agendamento dependente de telefone é receita que vaza no momento de maior intenção.',
  )];
}

function inferContactFrictionHigh(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  _evidence: readonly Evidence[], corpus: string,
  _businessContext: BusinessContext | null | undefined,
): Inference[] {
  // Immediate contact for a local buyer: phone / WhatsApp visible in the page text.
  if (/whatsapp|wa\.me|telefone|\bligue\b|fale conosco|\(\d{2}\)\s?\d{4,5}/i.test(corpus)) return [];
  return [buildInference(
    'contact_friction_high',
    InferenceCategory.FrictionPath,
    scoping, cycleRef, 'true', 'high', 70,
    [],
    [],
    'Negócio local sem canal de contato imediato visível (telefone clicável ou WhatsApp). O cliente de alta intenção quer ligar ou mandar mensagem agora; sem isso, fecha a aba e vai pro concorrente que responde num clique. Cada contato que não acontece no pico de intenção é cliente perdido.',
  )];
}

function inferBookingIntakeExcessive(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], _corpus: string,
  _businessContext: BusinessContext | null | undefined,
): Inference[] {
  const excessive = getFormEvidence(evidence).filter((e) => {
    const p = e.payload as { field_names?: string[] };
    return (p.field_names?.length ?? 0) >= 6;
  });
  if (excessive.length === 0) return [];
  return [buildInference(
    'booking_intake_excessive',
    InferenceCategory.FrictionPath,
    scoping, cycleRef, 'true', 'high', 76,
    [],
    excessive.slice(0, 2).map((e) => makeRef('evidence', e.id)),
    'O formulário de agendamento/contato pede campos demais (6+). Cada campo extra depois do 3º derruba a conclusão; num agendamento o cliente só quer marcar, não fazer cadastro. Peça o mínimo (nome + telefone/horário) e colete o resto na consulta.',
  )];
}

function inferServicePricingOpaque(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  _evidence: readonly Evidence[], corpus: string,
  _businessContext: BusinessContext | null | undefined,
): Inference[] {
  if (/r\$|a partir de|preç|tabela|investimento/i.test(corpus)) return [];
  return [buildInference(
    'service_pricing_opaque',
    InferenceCategory.ConversionFlow,
    scoping, cycleRef, 'true', 'medium', 66,
    [],
    [],
    'Nenhum sinal de preço ou faixa de valor no site. O cliente local compara antes de marcar; sem âncora ("a partir de R$X", "primeira avaliação gratuita"), assume caro ou desiste de perguntar. Mostrar ao menos uma faixa ou um ponto de entrada reduz o atrito de "quanto custa?".',
  )];
}

// ═══════════════════════════════════════════════
// FASHION / E-COMMERCE
// ═══════════════════════════════════════════════

function inferSizeGuideMissing(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const sizePatterns = ['guia de medidas', 'size guide', 'size chart', 'tabela de medidas', 'medidas', 'tamanho'];
  if (sizePatterns.some(p => corpus.includes(p))) return [];

  const productPages = evidence.filter(e =>
    e.evidence_type === EvidenceType.PageContent &&
    ((e.payload as { url?: string }).url ?? '').match(/\/product|\/produto|\/item/i),
  );
  if (productPages.length === 0) return [];

  return [buildInference(
    'size_guide_missing',
    InferenceCategory.ConversionFlow,
    scoping, cycleRef, 'true', 'high', 75,
    [],
    productPages.map(e => makeRef('evidence', e.id)),
    'Compradores de moda devolvem 52% dos produtos por problemas de tamanho. Sem guia de medidas, cada venda vira risco de devolução e custo logístico reverso que consome a margem.',
  )];
}

function inferProductImagesInsufficient(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const copyEls = getCopyElements(evidence);
  const productPages = evidence.filter(e =>
    e.evidence_type === EvidenceType.PageContent &&
    ((e.payload as { url?: string }).url ?? '').match(/\/product|\/produto|\/item/i),
  );

  if (productPages.length === 0) return [];

  // Heuristic: product pages without "gallery", "zoom", "foto" in nearby evidence
  const imagePatterns = ['gallery', 'galeria', 'zoom', 'lightbox', 'carousel', 'carrossel'];
  if (imagePatterns.some(p => corpus.includes(p))) return [];

  return [buildInference(
    'product_images_insufficient',
    InferenceCategory.ConversionFlow,
    scoping, cycleRef, 'true', 'high', 72,
    [],
    productPages.slice(0, 3).map(e => makeRef('evidence', e.id)),
    'Produtos com menos de 3 fotos vendem 40% menos. O comprador não consegue avaliar textura, caimento ou detalhe e abandona antes de arriscar.',
  )];
}

function inferNoUrgencyIndicators(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const urgencyPatterns = [
    'estoque', 'últimas unidades', 'poucas unidades', 'limited', 'stock',
    'últimos', 'esgotando', 'restam', 'countdown', 'timer', 'oferta termina',
    'limited time', 'while supplies last', 'low stock',
  ];
  if (urgencyPatterns.some(p => corpus.includes(p))) return [];

  const copyEls = getCopyElements(evidence);
  const hasUrgencyCopy = copyEls.some(e => {
    const p = e.payload as { urgency_indicators?: string[] };
    return (p.urgency_indicators ?? []).length > 0;
  });
  if (hasUrgencyCopy) return [];

  return [buildInference(
    'no_urgency_indicators',
    InferenceCategory.ConversionFlow,
    scoping, cycleRef, 'true', 'medium', 68,
    [],
    copyEls.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sem indicadores de escassez ou urgência, o visitante adia a compra "para depois". E 70% não volta. Cada sessão sem gatilho de decisão é receita adiada indefinidamente.',
  )];
}

function inferCrossSellAbsent(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const crossSellPatterns = [
    'complete o look', 'complete the look', 'combina com', 'você também pode gostar',
    'related products', 'produtos relacionados', 'quem comprou', 'frequentemente comprados juntos',
    'frequently bought', 'recommended for you', 'recomendados', 'cross-sell',
  ];
  if (crossSellPatterns.some(p => corpus.includes(p))) return [];

  const productPages = evidence.filter(e =>
    e.evidence_type === EvidenceType.PageContent &&
    ((e.payload as { url?: string }).url ?? '').match(/\/product|\/produto|\/item/i),
  );
  if (productPages.length === 0) return [];

  return [buildInference(
    'cross_sell_absent',
    InferenceCategory.RevenuePath,
    scoping, cycleRef, 'true', 'medium', 70,
    [],
    productPages.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sem recomendações de "complete o look" ou produtos relacionados, o ticket médio fica limitado a 1 item. Lojas com cross-sell aumentam AOV em 10-30%.',
  )];
}

function inferReturnPolicyNotOnProduct(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  // Check if policy exists at all
  const policyPages = evidence.filter(e => e.evidence_type === EvidenceType.PolicyPage);
  const hasRefundPolicy = policyPages.some(e => {
    const p = e.payload as { policy_type?: string; detected?: boolean };
    return p.policy_type === 'refund' && p.detected;
  });
  if (!hasRefundPolicy) return []; // Different problem. Not this inference's job

  // Check if return info appears on product pages
  const productReturnPatterns = [
    'troca', 'devolução', 'devolver', 'return', 'exchange', 'frete grátis para devolver',
    'free return', 'garantia', 'satisfação',
  ];
  const productPages = evidence.filter(e =>
    e.evidence_type === EvidenceType.PageContent &&
    ((e.payload as { url?: string }).url ?? '').match(/\/product|\/produto|\/item/i),
  );
  if (productPages.length === 0) return [];

  // If return language found broadly (likely on product pages), skip
  const productCorpus = productPages
    .map(e => [(e.payload as { title?: string }).title, (e.payload as { h1?: string }).h1].filter(Boolean).join(' '))
    .join(' ')
    .toLowerCase();

  // The policy exists but only in footer/policy page — not embedded on product
  if (productReturnPatterns.some(p => productCorpus.includes(p))) return [];

  return [buildInference(
    'return_policy_not_on_product',
    InferenceCategory.ConversionClarity,
    scoping, cycleRef, 'true', 'medium', 72,
    [],
    [...policyPages.slice(0, 1), ...productPages.slice(0, 1)].map(e => makeRef('evidence', e.id)),
    'A política de devolução existe mas fica escondida no rodapé. 67% dos compradores verificam condições de troca ANTES de comprar. Sem essa informação na página do produto, a dúvida vira abandono.',
  )];
}

// ═══════════════════════════════════════════════
// SAAS
// ═══════════════════════════════════════════════

function inferNoFreeTrialOffered(
  sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const trialPatterns = [
    'free trial', 'trial gratuito', 'teste grátis', 'teste gratuito',
    'freemium', 'free plan', 'plano gratuito', 'start free', 'começar grátis',
    'demo', 'self-serve', 'try for free', 'experimentar',
  ];
  if (trialPatterns.some(p => corpus.includes(p))) return [];

  const copyEls = getCopyElements(evidence);
  const ctaTexts = copyEls.flatMap(e => {
    const p = e.payload as { cta_texts?: string[] };
    return (p.cta_texts ?? []).map(t => t.toLowerCase());
  });
  if (trialPatterns.some(p => ctaTexts.some(cta => cta.includes(p)))) return [];

  return [buildInference(
    'no_free_trial_offered',
    InferenceCategory.ActivationBlocked,
    scoping, cycleRef, 'true', 'high', 78,
    [],
    copyEls.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sem trial, freemium ou demo self-serve, o visitante precisa confiar cegamente antes de pagar. SaaS com trial gratuito convertem 2-5x mais que os que exigem cartão imediato.',
  )];
}

function inferIntegrationEcosystemInvisible(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const integrationPatterns = [
    'integração', 'integration', 'integrations', 'integrações', 'connect',
    'zapier', 'slack', 'hubspot', 'salesforce', 'google analytics',
    'api', 'webhook', 'marketplace', 'app store', 'plugins',
  ];
  if (integrationPatterns.some(p => corpus.includes(p))) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'integration_ecosystem_invisible',
    InferenceCategory.ConversionClarity,
    scoping, cycleRef, 'true', 'medium', 70,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Nenhuma menção a integrações ou ecossistema. Compradores B2B descartam ferramentas que não conectam com seu stack existente. Sem logos ou lista de integrações, o visitante assume incompatibilidade.',
  )];
}

function inferChangelogStaleOrMissing(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const changelogPatterns = [
    'changelog', 'release notes', 'what\'s new', 'novidades', 'atualizações',
    'updates', 'versão', 'version', 'v2.', 'v3.', 'lançamento',
  ];
  if (changelogPatterns.some(p => corpus.includes(p))) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'changelog_stale_or_missing',
    InferenceCategory.ExpectationAlignment,
    scoping, cycleRef, 'true', 'medium', 68,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sem changelog ou atualizações visíveis, o comprador não sabe se o produto está ativo. Software sem sinais de evolução parece abandonado e perde contra concorrentes que mostram ritmo de entrega.',
  )];
}

function inferAnnualDiscountNotHighlighted(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const annualPatterns = [
    'anual', 'annual', 'yearly', 'save', 'economy', 'desconto',
    'discount', '20% off', '2 meses grátis', '2 months free',
    'billed annually', 'cobrado anualmente', 'per year',
  ];
  // Must have pricing page context
  const hasPricingPage = corpus.includes('pricing') || corpus.includes('preço') || corpus.includes('plano');
  if (!hasPricingPage) return [];
  if (annualPatterns.some(p => corpus.includes(p))) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'annual_discount_not_highlighted',
    InferenceCategory.RevenuePath,
    scoping, cycleRef, 'true', 'medium', 70,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sem destaque para economia do plano anual, clientes escolhem mensal por padrão. Churn mensal é 3-4x maior que anual. Cada assinante mensal que poderia ser anual é receita em risco a cada 30 dias.',
  )];
}

function inferNoProductScreenshotVisible(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const screenshotPatterns = [
    'screenshot', 'product screenshot', 'app screenshot', 'interface',
    'dashboard', 'captura de tela', 'print', 'preview', 'demo',
    'plataforma', 'platform view',
  ];
  // Focus on homepage/hero context
  const copyEls = getCopyElements(evidence);
  const homeCopy = copyEls.filter(e => {
    const p = e.payload as { page_type?: string };
    return p.page_type === 'homepage' || p.page_type === 'landing_page';
  });

  if (homeCopy.length === 0) return [];

  // Check above-fold text for product visual references
  const aboveFold = homeCopy
    .map(e => ((e.payload as { above_fold_text?: string }).above_fold_text ?? '').toLowerCase())
    .join(' ');

  if (screenshotPatterns.some(p => aboveFold.includes(p))) return [];
  // If generic corpus has these it may be elsewhere — still flag hero
  if (screenshotPatterns.some(p => corpus.includes(p)) && aboveFold.length > 100) return [];

  return [buildInference(
    'no_product_screenshot_visible',
    InferenceCategory.ConversionClarity,
    scoping, cycleRef, 'true', 'high', 75,
    [],
    homeCopy.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'A hero da página não mostra o produto em uso. Visitantes B2B precisam "ver antes de experimentar". Sem screenshot real, a proposta de valor fica abstrata e a taxa de cadastro cai 30-50%.',
  )];
}

// ═══════════════════════════════════════════════
// FOOD / RESTAURANT
// ═══════════════════════════════════════════════

function inferMenuRequiresSignup(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const menuPatterns = ['cardápio', 'menu', 'pratos', 'dishes'];
  const gatePatterns = ['login', 'cadastr', 'signup', 'sign up', 'registr', 'download', 'baixar', 'app'];

  const hasMenu = menuPatterns.some(p => corpus.includes(p));
  if (!hasMenu) return [];

  // Check if menu access is gated
  const formEvidence = getFormEvidence(evidence);
  const menuGated = formEvidence.some(e => {
    const p = e.payload as { page_url?: string };
    return menuPatterns.some(mp => (p.page_url ?? '').toLowerCase().includes(mp));
  });

  const corpusGated = gatePatterns.some(p => corpus.includes(p)) && menuPatterns.some(p => corpus.includes(p));

  if (!menuGated && !corpusGated) return [];

  return [buildInference(
    'menu_requires_signup',
    InferenceCategory.FrictionPath,
    scoping, cycleRef, 'true', 'high', 72,
    [],
    formEvidence.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'O cardápio exige login ou download para ser visto. 80% dos clientes de restaurante abandonam se não conseguem ver os pratos em 2 cliques. Cada barreira entre fome e decisão é um pedido perdido.',
  )];
}

function inferNoFoodPhotos(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const photoPatterns = ['foto', 'photo', 'imagem', 'image', 'gallery', 'galeria'];
  const foodPatterns = ['prato', 'dish', 'comida', 'food', 'refeição', 'meal'];

  // If we see food context but no photo references
  const hasFoodContext = foodPatterns.some(p => corpus.includes(p));
  if (!hasFoodContext) return [];
  if (photoPatterns.some(p => corpus.includes(p))) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'no_food_photos',
    InferenceCategory.ConversionFlow,
    scoping, cycleRef, 'true', 'high', 72,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Itens do cardápio sem fotos vendem 30% menos. O cliente come com os olhos primeiro. Sem imagem, a decisão depende apenas de texto descritivo e o ticket médio cai porque ninguém arrisca o desconhecido.',
  )];
}

function inferDeliveryAreaUnclear(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const deliveryPatterns = ['delivery', 'entrega', 'envio', 'pedido online'];
  const areaPatterns = [
    'área de entrega', 'delivery area', 'zona de entrega', 'raio de entrega',
    'cep', 'zip code', 'região', 'bairro', 'km', 'quilômetros',
    'we deliver to', 'entregamos em', 'cobertura',
  ];

  const hasDelivery = deliveryPatterns.some(p => corpus.includes(p));
  if (!hasDelivery) return [];
  if (areaPatterns.some(p => corpus.includes(p))) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'delivery_area_unclear',
    InferenceCategory.ConversionClarity,
    scoping, cycleRef, 'true', 'medium', 70,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'O site menciona delivery mas não informa a área de cobertura. Clientes fora da zona descobrem só no checkout e abandonam frustrados. Cada sessão desperdiçada é custo de aquisição sem retorno.',
  )];
}

function inferDeliveryTimeNotShown(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const deliveryPatterns = ['delivery', 'entrega', 'envio'];
  const timePatterns = [
    'tempo de entrega', 'delivery time', 'minutos', 'minutes', 'min',
    'estimativa', 'estimate', '30-45', '40-60', 'prazo',
    'chega em', 'arrives in', 'estimated delivery',
  ];

  const hasDelivery = deliveryPatterns.some(p => corpus.includes(p));
  if (!hasDelivery) return [];
  if (timePatterns.some(p => corpus.includes(p))) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'delivery_time_not_shown',
    InferenceCategory.ExpectationAlignment,
    scoping, cycleRef, 'true', 'medium', 68,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sem tempo estimado de entrega, o cliente não sabe se vai esperar 30 minutos ou 2 horas. A incerteza favorece o concorrente que mostra prazo. Expectativa não gerenciada vira avaliação negativa.',
  )];
}

function inferAllergenInfoMissing(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const allergenPatterns = [
    'alérgeno', 'allergen', 'glúten', 'gluten', 'lactose', 'vegano', 'vegan',
    'vegetariano', 'vegetarian', 'sem glúten', 'gluten-free', 'dairy-free',
    'contém', 'contains', 'restrição alimentar', 'dietary', 'intolerância',
  ];
  if (allergenPatterns.some(p => corpus.includes(p))) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'allergen_info_missing',
    InferenceCategory.PolicyGap,
    scoping, cycleRef, 'true', 'high', 75,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sem informações de alérgenos ou restrições alimentares, famílias com restrições descartam o restaurante imediatamente. Além do risco legal, cada cliente alérgico que desiste representa o grupo inteiro (4-5 pessoas) perdido.',
  )];
}

// ═══════════════════════════════════════════════
// HEALTH / BEAUTY
// ═══════════════════════════════════════════════

function inferIngredientsNotListed(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const ingredientPatterns = [
    'ingredientes', 'ingredients', 'composição', 'composition', 'inci',
    'fórmula', 'formula', 'princípio ativo', 'active ingredient',
    'contém', 'contains', 'componentes',
  ];
  if (ingredientPatterns.some(p => corpus.includes(p))) return [];

  const productPages = evidence.filter(e =>
    e.evidence_type === EvidenceType.PageContent &&
    ((e.payload as { url?: string }).url ?? '').match(/\/product|\/produto|\/item/i),
  );
  if (productPages.length === 0) return [];

  return [buildInference(
    'ingredients_not_listed',
    InferenceCategory.ConversionClarity,
    scoping, cycleRef, 'true', 'high', 75,
    [],
    productPages.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Produtos sem lista de ingredientes perdem o comprador consciente. 73% dos consumidores de cosméticos checam composição antes de comprar. Sem transparência, o visitante vai para quem mostra.',
  )];
}

function inferNoClinicalEndorsement(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const clinicalPatterns = [
    'dermatologista', 'dermatologist', 'clinicamente testado', 'clinically tested',
    'aprovado por', 'approved by', 'recomendado por', 'recommended by',
    'hipoalergênico', 'hypoallergenic', 'testado dermatologicamente',
    'dermatologically tested', 'não testado em animais', 'cruelty free',
    'anvisa', 'fda', 'certificado', 'certified',
  ];
  if (clinicalPatterns.some(p => corpus.includes(p))) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'no_clinical_endorsement',
    InferenceCategory.TrustRevenue,
    scoping, cycleRef, 'true', 'medium', 70,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sem menção a teste dermatológico ou endosso clínico, o produto compete apenas por preço. Marcas com selo "dermatologicamente testado" convertem 25-40% mais porque eliminam o medo de reação adversa.',
  )];
}

function inferUsageInstructionsAbsent(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const usagePatterns = [
    'como usar', 'how to use', 'modo de uso', 'instruções', 'instructions',
    'aplicar', 'apply', 'passo a passo', 'step by step', 'usage',
    'rotina', 'routine', 'dica de uso', 'tip',
  ];
  if (usagePatterns.some(p => corpus.includes(p))) return [];

  const productPages = evidence.filter(e =>
    e.evidence_type === EvidenceType.PageContent &&
    ((e.payload as { url?: string }).url ?? '').match(/\/product|\/produto|\/item/i),
  );
  if (productPages.length === 0) return [];

  return [buildInference(
    'usage_instructions_absent',
    InferenceCategory.ConversionFlow,
    scoping, cycleRef, 'true', 'medium', 68,
    [],
    productPages.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sem instruções de uso, o comprador não se imagina utilizando o produto. E a dúvida sobre resultado gera hesitação. Produtos com tutoriais integrados têm taxa de recompra 35% maior.',
  )];
}

function inferSubscriptionNotOffered(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const subscriptionPatterns = [
    'assinatura', 'subscription', 'subscribe', 'assinar', 'recorrente',
    'recurring', 'mensal', 'monthly', 'auto-replenish', 'reposição automática',
    'receba todo mês', 'deliver every', 'refill',
  ];
  if (subscriptionPatterns.some(p => corpus.includes(p))) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'subscription_not_offered',
    InferenceCategory.RevenuePath,
    scoping, cycleRef, 'true', 'medium', 68,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Produtos de uso recorrente (skincare, suplementos) sem opção de assinatura forçam o cliente a lembrar de recomprar. Taxa de recompra cai 60% sem automação, e cada falha é abertura para o concorrente.',
  )];
}

function inferNoResultsEvidence(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const resultsPatterns = [
    'antes e depois', 'before and after', 'resultado', 'results',
    'transformação', 'transformation', 'progresso', 'progress',
    'depoimento', 'testimonial', 'antes/depois', 'comprovado',
    'proven', '% das pessoas', '% of users',
  ];
  if (resultsPatterns.some(p => corpus.includes(p))) return [];

  const copyEls = getCopyElements(evidence);
  const hasSocialProof = copyEls.some(e => {
    const p = e.payload as { social_proof_elements?: string[] };
    return (p.social_proof_elements ?? []).length > 0;
  });
  if (hasSocialProof) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'no_results_evidence',
    InferenceCategory.TrustRevenue,
    scoping, cycleRef, 'true', 'high', 75,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sem prova de resultado (antes/depois, dados clínicos, depoimentos com métricas), o produto é promessa sem evidência. Marcas de saúde/beleza com prova visual convertem 4x mais que as que só descrevem benefícios.',
  )];
}

// ═══════════════════════════════════════════════
// EDUCATION / COURSES
// ═══════════════════════════════════════════════

function inferCurriculumNotVisible(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const curriculumPatterns = [
    'módulo', 'module', 'aula', 'lesson', 'conteúdo programático', 'curriculum',
    'ementa', 'syllabus', 'capítulo', 'chapter', 'tópicos', 'topics',
    'o que você vai aprender', 'what you will learn', 'grade curricular',
  ];
  if (curriculumPatterns.some(p => corpus.includes(p))) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'curriculum_not_visible',
    InferenceCategory.ConversionClarity,
    scoping, cycleRef, 'true', 'high', 78,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sem lista de módulos ou aulas visível, o aluno não sabe o que vai receber pelo investimento. Cursos com ementa detalhada convertem 3x mais porque eliminam a dúvida "será que cobre o que preciso?".',
  )];
}

function inferInstructorCredentialsMissing(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const credentialPatterns = [
    'instrutor', 'instructor', 'professor', 'teacher', 'mentor',
    'especialista', 'expert', 'experiência', 'experience', 'anos de',
    'years of', 'formação', 'background', 'certificação', 'certification',
    'linkedin', 'currículo', 'bio', 'sobre o professor',
  ];
  if (credentialPatterns.some(p => corpus.includes(p))) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'instructor_credentials_missing',
    InferenceCategory.TrustRevenue,
    scoping, cycleRef, 'true', 'high', 75,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sem bio verificável do instrutor, o aluno não sabe se quem ensina tem autoridade real. Cursos com credenciais visíveis (linkedin, publicações, resultados) vendem 2-3x mais porque confiança é pré-requisito para educação.',
  )];
}

function inferCompletionCertificateAbsent(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const certPatterns = [
    'certificado', 'certificate', 'certificação', 'certification',
    'diploma', 'badge', 'selo', 'credencial', 'credential',
    'ao concluir', 'upon completion', 'conclusão',
  ];
  if (certPatterns.some(p => corpus.includes(p))) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'completion_certificate_absent',
    InferenceCategory.ConversionFlow,
    scoping, cycleRef, 'true', 'medium', 70,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sem menção a certificado de conclusão, o investimento no curso não tem "prova tangível" para o aluno. Certificados são o segundo fator de decisão depois do conteúdo, e sua ausência favorece concorrentes que oferecem.',
  )];
}

function inferTimeCommitmentUnclear(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const timePatterns = [
    'horas', 'hours', 'duração', 'duration', 'carga horária', 'workload',
    'tempo', 'time commitment', 'semanas', 'weeks', 'meses', 'months',
    'minutos por aula', 'minutes per lesson', 'ritmo', 'pace', 'dedicação',
  ];
  if (timePatterns.some(p => corpus.includes(p))) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'time_commitment_unclear',
    InferenceCategory.ExpectationAlignment,
    scoping, cycleRef, 'true', 'medium', 70,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sem informação de duração ou carga horária, o aluno não sabe se o curso cabe na rotina. A dúvida "vou conseguir terminar?" é o principal motivo de abandono e pedido de reembolso em educação online.',
  )];
}

function inferNoSampleContent(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const samplePatterns = [
    'aula grátis', 'free lesson', 'aula gratuita', 'preview', 'prévia',
    'assista grátis', 'watch free', 'amostra', 'sample', 'degustação',
    'experimentar', 'try', 'conteúdo aberto', 'open content', 'aula demonstrativa',
  ];
  if (samplePatterns.some(p => corpus.includes(p))) return [];

  const copyEls = getCopyElements(evidence);
  const ctaTexts = copyEls.flatMap(e => {
    const p = e.payload as { cta_texts?: string[] };
    return (p.cta_texts ?? []).map(t => t.toLowerCase());
  });
  if (samplePatterns.some(p => ctaTexts.some(cta => cta.includes(p)))) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'no_sample_content',
    InferenceCategory.ActivationBlocked,
    scoping, cycleRef, 'true', 'high', 75,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sem aula demonstrativa ou preview gratuito, o aluno compra no escuro. Plataformas de educação com conteúdo de amostra convertem 4-6x mais porque o aluno experimenta a didática antes de investir.',
  )];
}

// ═══════════════════════════════════════════════
// B2B SERVICES
// ═══════════════════════════════════════════════

function inferNoCaseStudyWithMetrics(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const caseStudyPatterns = [
    'case study', 'caso de sucesso', 'case de sucesso', 'estudo de caso',
    'roi', 'resultado', 'result', 'cliente alcançou', 'client achieved',
    'aumento de', 'increase of', 'redução de', 'reduction of',
    '% de melhoria', '% improvement', 'retorno sobre investimento',
  ];
  if (caseStudyPatterns.some(p => corpus.includes(p))) return [];

  const copyEls = getCopyElements(evidence);
  const hasSocialProof = copyEls.some(e => {
    const p = e.payload as { social_proof_elements?: string[] };
    return (p.social_proof_elements ?? []).some(sp =>
      sp.toLowerCase().includes('roi') || sp.toLowerCase().includes('%') || sp.toLowerCase().includes('resultado'),
    );
  });
  if (hasSocialProof) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'no_case_study_with_metrics',
    InferenceCategory.TrustRevenue,
    scoping, cycleRef, 'true', 'high', 78,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sem case de sucesso com métricas concretas de ROI, o serviço é promessa sem prova. Decisores B2B precisam justificar o investimento internamente, e sem números, perdem a argumentação para aprovar.',
  )];
}

function inferMethodologyNotExplained(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const methodologyPatterns = [
    'metodologia', 'methodology', 'processo', 'process', 'como funciona',
    'how it works', 'etapas', 'steps', 'framework', 'abordagem', 'approach',
    'fase', 'phase', 'diagnóstico', 'diagnosis', 'entrega', 'deliverable',
  ];
  if (methodologyPatterns.some(p => corpus.includes(p))) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'methodology_not_explained',
    InferenceCategory.ConversionClarity,
    scoping, cycleRef, 'true', 'medium', 70,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sem explicação do processo ou metodologia, o comprador B2B não consegue avaliar competência. Serviços que mostram "como entregam" reduzem ciclo de venda em 40% porque antecipam perguntas do comitê.',
  )];
}

function inferEnterpriseSignalsMissing(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const enterprisePatterns = [
    'sso', 'single sign-on', 'sla', 'compliance', 'conformidade',
    'lgpd', 'gdpr', 'iso', 'soc 2', 'soc2', 'enterprise', 'corporativo',
    'segurança', 'security', 'uptime', 'disponibilidade', 'audit',
    'auditoria', 'data protection', 'proteção de dados',
  ];
  if (enterprisePatterns.some(p => corpus.includes(p))) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'enterprise_signals_missing',
    InferenceCategory.TrustRevenue,
    scoping, cycleRef, 'true', 'medium', 68,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sem menções a SSO, SLA ou compliance (LGPD/SOC2), empresas médias e grandes descartam o fornecedor na triagem inicial. O time de segurança/jurídico veta antes mesmo de uma demo acontecer.',
  )];
}

function inferContactFormExcessiveFields(
  sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], _corpus: string,
): Inference[] {
  const formEvidence = getFormEvidence(evidence);

  const excessiveForms = formEvidence.filter(e => {
    const p = e.payload as { field_names?: string[]; page_url?: string };
    const fields = p.field_names ?? [];
    const isContact = (p.page_url ?? '').match(/\/contact|\/contato|\/fale-conosco|\/demo|\/request/i);
    return isContact && fields.length >= 7;
  });

  if (excessiveForms.length === 0) {
    // Also check behavioral evidence for excessive form signals
    const formFriction = sigs.get('form_excessive_fields');
    if (!formFriction) return [];

    return [buildInference(
      'contact_form_excessive_fields',
      InferenceCategory.FrictionPath,
      scoping, cycleRef, 'true', 'high', 78,
      [makeRef('signal', formFriction.id)],
      formFriction.evidence_refs,
      'Formulário de contato com 7+ campos perde 50% dos leads qualificados. Cada campo adicional após o 4o reduz conversão em 10%. O lead quente desiste antes de pedir ajuda.',
    )];
  }

  return [buildInference(
    'contact_form_excessive_fields',
    InferenceCategory.FrictionPath,
    scoping, cycleRef, 'true', 'high', 80,
    [],
    excessiveForms.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Formulário de contato com 7+ campos perde 50% dos leads qualificados. Cada campo adicional após o 4o reduz conversão em 10%. O lead quente desiste antes de pedir ajuda.',
  )];
}

function inferResponseTimeNotPromised(
  _sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string,
  evidence: readonly Evidence[], corpus: string,
): Inference[] {
  const responseTimePatterns = [
    'respondemos em', 'we respond within', 'tempo de resposta', 'response time',
    'até 24h', 'within 24h', 'retorno em', 'sla de atendimento',
    'prazo de resposta', 'business hours', 'horário comercial',
    'em até', 'no máximo', 'within minutes', 'em minutos',
  ];
  if (responseTimePatterns.some(p => corpus.includes(p))) return [];

  // Only relevant if there's a contact surface
  const hasContactSurface = corpus.includes('contato') || corpus.includes('contact') ||
    corpus.includes('fale conosco') || corpus.includes('get in touch');
  if (!hasContactSurface) return [];

  const pageContent = getPageContentEvidence(evidence);

  return [buildInference(
    'response_time_not_promised',
    InferenceCategory.ExpectationAlignment,
    scoping, cycleRef, 'true', 'medium', 68,
    [],
    pageContent.slice(0, 2).map(e => makeRef('evidence', e.id)),
    'Sem SLA de tempo de resposta prometido, o lead qualificado não sabe quando terá retorno. E vai procurar o concorrente que promete "resposta em até 2h". A ansiedade pós-envio de formulário é onde se perde o deal.',
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
