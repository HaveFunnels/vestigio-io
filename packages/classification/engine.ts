import {
  ClassificationState,
  ClassificationInput,
  BusinessModelHypothesis,
  ConversionSurfaceHypothesis,
  ConfidenceLevel,
} from './types';

// ──────────────────────────────────────────────
// Classification Engine
//
// Computes probabilistic business classification.
//
// Rules:
// - NEVER binary classification
// - Always multiple hypotheses coexisting
// - Onboarding = prior (not truth)
// - Evidence adjusts confidence (posterior)
// - Ambiguity → low confidence + multiple candidates
//
// Signal mapping (evidence → hypothesis adjustment):
// - /login form → increases login surface (NOT defines SaaS)
// - checkout → increases checkout surface (NOT defines ecommerce)
// - forms → increases form surface (NOT defines leadgen)
// - pricing + trial → increases SaaS hypothesis
// ──────────────────────────────────────────────

const ONBOARDING_PRIOR = 0.4; // Onboarding selection provides moderate prior
const EVIDENCE_WEIGHT = 0.25; // Each evidence signal contributes this increment
const BASE_CONFIDENCE = 0.1;  // Every hypothesis starts with this baseline

export function computeClassification(input: ClassificationInput): ClassificationState {
  // ── Initialize with base confidence ─────────
  const bm: BusinessModelHypothesis = {
    saas: BASE_CONFIDENCE,
    ecommerce: BASE_CONFIDENCE,
    leadgen: BASE_CONFIDENCE,
    services: BASE_CONFIDENCE,
    content: BASE_CONFIDENCE,
  };

  const cs: ConversionSurfaceHypothesis = {
    checkout: BASE_CONFIDENCE,
    form: BASE_CONFIDENCE,
    whatsapp: BASE_CONFIDENCE,
    chat: BASE_CONFIDENCE,
    booking: BASE_CONFIDENCE,
    login: BASE_CONFIDENCE,
  };

  // ── Apply onboarding prior ──────────────────
  if (input.onboarding_business_model) {
    const key = mapOnboardingModel(input.onboarding_business_model);
    if (key && key in bm) {
      (bm as any)[key] += ONBOARDING_PRIOR;
    }
  }

  if (input.onboarding_conversion_model) {
    const key = mapOnboardingConversion(input.onboarding_conversion_model);
    if (key && key in cs) {
      (cs as any)[key] += ONBOARDING_PRIOR;
    }
  }

  // ── Apply evidence signals (posterior) ───────

  // Login form → SaaS + login surface
  if (input.has_login_form) {
    bm.saas += EVIDENCE_WEIGHT;
    cs.login += EVIDENCE_WEIGHT * 1.5;
  }

  // Checkout → ecommerce + checkout surface
  if (input.has_checkout) {
    bm.ecommerce += EVIDENCE_WEIGHT * 1.5;
    cs.checkout += EVIDENCE_WEIGHT * 1.5;
  }

  // External checkout → ecommerce (hosted checkout)
  if (input.has_external_checkout) {
    bm.ecommerce += EVIDENCE_WEIGHT;
    cs.checkout += EVIDENCE_WEIGHT;
  }

  // Payment forms → ecommerce
  if (input.has_payment_forms) {
    bm.ecommerce += EVIDENCE_WEIGHT;
    cs.checkout += EVIDENCE_WEIGHT;
  }

  // Contact forms → leadgen / services
  if (input.has_contact_forms) {
    bm.leadgen += EVIDENCE_WEIGHT;
    bm.services += EVIDENCE_WEIGHT * 0.5;
    cs.form += EVIDENCE_WEIGHT * 1.5;
  }

  // WhatsApp → leadgen + whatsapp surface
  if (input.has_whatsapp_links) {
    bm.leadgen += EVIDENCE_WEIGHT;
    cs.whatsapp += EVIDENCE_WEIGHT * 1.5;
  }

  // Booking → services
  if (input.has_booking_widget) {
    bm.services += EVIDENCE_WEIGHT * 1.5;
    cs.booking += EVIDENCE_WEIGHT * 1.5;
  }

  // Chat → services / leadgen
  if (input.has_chat_widget) {
    bm.services += EVIDENCE_WEIGHT * 0.5;
    bm.leadgen += EVIDENCE_WEIGHT * 0.5;
    cs.chat += EVIDENCE_WEIGHT * 1.5;
  }

  // Pricing page → SaaS indicator
  if (input.has_pricing_page) {
    bm.saas += EVIDENCE_WEIGHT;
  }

  // Trial signup → strong SaaS indicator
  if (input.has_trial_signup) {
    bm.saas += EVIDENCE_WEIGHT * 1.5;
    cs.login += EVIDENCE_WEIGHT;
  }

  // Many forms → leadgen signal
  if (input.form_count >= 3) {
    bm.leadgen += EVIDENCE_WEIGHT;
    cs.form += EVIDENCE_WEIGHT;
  }

  // Platform indicators
  for (const p of input.platform_indicators) {
    const lower = p.toLowerCase();
    if (lower.includes('shopify') || lower.includes('woocommerce') || lower.includes('magento')) {
      bm.ecommerce += EVIDENCE_WEIGHT;
    }
    if (lower.includes('wordpress') || lower.includes('ghost') || lower.includes('webflow')) {
      bm.content += EVIDENCE_WEIGHT * 0.5;
    }
  }

  // Provider indicators (payment providers → checkout)
  for (const p of input.provider_indicators) {
    const lower = p.toLowerCase();
    if (lower.includes('stripe') || lower.includes('paypal') || lower.includes('adyen')) {
      cs.checkout += EVIDENCE_WEIGHT * 0.5;
    }
  }

  // ── Normalize to 0-1 range ──────────────────
  normalize(bm as unknown as Record<string, number>);
  normalize(cs as unknown as Record<string, number>);

  // ── Compute metadata ────────────────────────
  const primary_model = getMaxKey(bm as unknown as Record<string, number>);
  const primary_surface = getMaxKey(cs as unknown as Record<string, number>);
  const confidence_level = computeConfidenceLevel(bm, primary_model);
  const ambiguity = isAmbiguous(bm);

  return {
    business_model: bm,
    conversion_surfaces: cs,
    confidence_level,
    ambiguity,
    primary_model,
    primary_surface,
  };
}

/**
 * Extract classification input from evidence arrays.
 */
export function extractClassificationInput(
  evidence: import('../domain').Evidence[],
  onboardingModel: string | null,
  onboardingConversion: string | null,
): ClassificationInput {
  let hasLoginForm = false;
  let hasCheckout = false;
  let hasExternalCheckout = false;
  let hasPaymentForms = false;
  let hasContactForms = false;
  let hasWhatsappLinks = false;
  let hasBookingWidget = false;
  let hasChatWidget = false;
  let hasPricingPage = false;
  let hasTrialSignup = false;
  let formCount = 0;
  let externalScriptCount = 0;
  const providers: string[] = [];
  const platforms: string[] = [];

  for (const e of evidence) {
    const p = e.payload as any;
    if (!p) continue;

    switch (p.type) {
      case 'page_content':
        if (p.has_forms) formCount += p.form_count || 0;
        externalScriptCount += p.external_script_count || 0;
        if (p.url?.includes('/login') || p.url?.includes('/signin')) hasLoginForm = true;
        if (p.url?.includes('/pricing')) hasPricingPage = true;
        break;
      case 'form':
        formCount++;
        if (p.has_payment_fields) hasPaymentForms = true;
        if (!p.has_payment_fields && !p.is_external) hasContactForms = true;
        break;
      case 'checkout_indicator':
        hasCheckout = true;
        if (p.is_external) hasExternalCheckout = true;
        break;
      case 'link':
        if (p.href?.includes('wa.me') || p.href?.includes('whatsapp')) hasWhatsappLinks = true;
        if (p.href?.includes('/signup') || p.href?.includes('/trial') || p.href?.includes('/register')) hasTrialSignup = true;
        break;
      case 'script':
        if (p.src?.includes('tidio') || p.src?.includes('intercom') || p.src?.includes('drift') || p.src?.includes('crisp')) hasChatWidget = true;
        if (p.src?.includes('calendly') || p.src?.includes('acuity')) hasBookingWidget = true;
        break;
      case 'provider_indicator':
        providers.push(p.provider_name);
        break;
      case 'platform_indicator':
        platforms.push(p.platform_name);
        break;
    }
  }

  return {
    onboarding_business_model: onboardingModel,
    onboarding_conversion_model: onboardingConversion,
    has_login_form: hasLoginForm,
    has_checkout: hasCheckout,
    has_external_checkout: hasExternalCheckout,
    has_payment_forms: hasPaymentForms,
    has_contact_forms: hasContactForms,
    has_whatsapp_links: hasWhatsappLinks,
    has_booking_widget: hasBookingWidget,
    has_chat_widget: hasChatWidget,
    has_pricing_page: hasPricingPage,
    has_trial_signup: hasTrialSignup,
    form_count: formCount,
    external_script_count: externalScriptCount,
    provider_indicators: providers,
    platform_indicators: platforms,
  };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function mapOnboardingModel(model: string): string | null {
  const map: Record<string, string> = {
    ecommerce: 'ecommerce', lead_gen: 'leadgen', saas: 'saas',
    hybrid: 'ecommerce', services: 'services', content: 'content',
  };
  return map[model] || null;
}

function mapOnboardingConversion(model: string): string | null {
  const map: Record<string, string> = {
    checkout: 'checkout', form: 'form', whatsapp: 'whatsapp', external: 'checkout',
  };
  return map[model] || null;
}

function normalize(obj: Record<string, number>): void {
  const max = Math.max(...Object.values(obj), 0.01);
  for (const key of Object.keys(obj)) {
    obj[key] = Math.min(1, Math.round((obj[key] / max) * 100) / 100);
  }
}

function getMaxKey(obj: Record<string, number>): string {
  let maxKey = '';
  let maxVal = -1;
  for (const [k, v] of Object.entries(obj)) {
    if (v > maxVal) { maxVal = v; maxKey = k; }
  }
  return maxKey;
}

function computeConfidenceLevel(bm: BusinessModelHypothesis, primary: string): ConfidenceLevel {
  const primaryScore = (bm as any)[primary] || 0;
  if (primaryScore >= 0.8) return 'high';
  if (primaryScore >= 0.5) return 'medium';
  return 'low';
}

function isAmbiguous(bm: BusinessModelHypothesis): boolean {
  const scores = Object.values(bm).sort((a, b) => b - a);
  if (scores.length < 2) return false;
  // Ambiguous if top two are within 0.15 of each other
  return (scores[0] - scores[1]) < 0.15;
}
