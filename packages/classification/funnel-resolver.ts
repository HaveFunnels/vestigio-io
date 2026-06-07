// ──────────────────────────────────────────────
// Funnel Model Resolver — Business-model-aware funnel stages
//
// Maps the org's business model to a funnel stage definition
// that the user journey map and engine can consume.
// Replaces the hardcoded `stageOrder` in the journey API.
// ──────────────────────────────────────────────

import type { SurfacePageType } from './page-classifier';

// ── Types ──

export interface FunnelStageDefinition {
  key: string;
  label: string;
  order: number;
  pageTypes: SurfacePageType[];
  color: string; // Tailwind color token for the map node
}

export interface ResolvedFunnelModel {
  modelType: string;
  stages: FunnelStageDefinition[];
  commercialPageTypes: Set<SurfacePageType>;
}

// ── Funnel Templates ──

const ECOMMERCE_STAGES: FunnelStageDefinition[] = [
  { key: 'awareness', label: 'Awareness', order: 0, pageTypes: ['homepage', 'landing', 'blog'], color: 'blue' },
  { key: 'browse', label: 'Browse', order: 1, pageTypes: ['category', 'product'], color: 'violet' },
  { key: 'decision', label: 'Decision', order: 2, pageTypes: ['pricing', 'cart'], color: 'amber' },
  { key: 'purchase', label: 'Purchase', order: 3, pageTypes: ['checkout', 'thank_you'], color: 'red' },
  { key: 'retention', label: 'Retention', order: 4, pageTypes: ['account', 'onboarding', 'support'], color: 'emerald' },
];

const SAAS_STAGES: FunnelStageDefinition[] = [
  { key: 'awareness', label: 'Awareness', order: 0, pageTypes: ['homepage', 'landing', 'blog'], color: 'blue' },
  { key: 'consideration', label: 'Consideration', order: 1, pageTypes: ['features', 'about', 'support'], color: 'violet' },
  { key: 'evaluation', label: 'Evaluation', order: 2, pageTypes: ['pricing', 'demo'], color: 'amber' },
  { key: 'conversion', label: 'Conversion', order: 3, pageTypes: ['signup', 'checkout', 'thank_you'], color: 'red' },
  { key: 'activation', label: 'Activation', order: 4, pageTypes: ['onboarding', 'account'], color: 'emerald' },
];

const LEAD_GEN_STAGES: FunnelStageDefinition[] = [
  { key: 'awareness', label: 'Awareness', order: 0, pageTypes: ['homepage', 'landing', 'blog'], color: 'blue' },
  { key: 'education', label: 'Education', order: 1, pageTypes: ['features', 'about', 'blog'], color: 'violet' },
  { key: 'intent', label: 'Intent', order: 2, pageTypes: ['pricing', 'demo', 'contact'], color: 'amber' },
  { key: 'capture', label: 'Capture', order: 3, pageTypes: ['signup', 'contact', 'thank_you'], color: 'red' },
  { key: 'nurture', label: 'Nurture', order: 4, pageTypes: ['support', 'account', 'onboarding'], color: 'emerald' },
];

const SERVICES_STAGES: FunnelStageDefinition[] = [
  { key: 'discover', label: 'Discover', order: 0, pageTypes: ['homepage', 'landing', 'blog'], color: 'blue' },
  { key: 'learn', label: 'Learn', order: 1, pageTypes: ['features', 'about'], color: 'violet' },
  { key: 'evaluate', label: 'Evaluate', order: 2, pageTypes: ['pricing', 'support'], color: 'amber' },
  { key: 'contact', label: 'Contact', order: 3, pageTypes: ['contact', 'demo', 'signup', 'thank_you'], color: 'red' },
  { key: 'retain', label: 'Retain', order: 4, pageTypes: ['account', 'support', 'onboarding'], color: 'emerald' },
];

const MODEL_TEMPLATES: Record<string, FunnelStageDefinition[]> = {
  ecommerce: ECOMMERCE_STAGES,
  saas: SAAS_STAGES,
  lead_gen: LEAD_GEN_STAGES,
  leadgen: LEAD_GEN_STAGES,
  services: SERVICES_STAGES,
  // Wave-22.7 — vertical extensions. app_conversion funnels like
  // lead_gen because the website's job is to capture intent and
  // hand off to the store, mirroring contact-form → close offline.
  // enterprise funnels like saas because the relevant pages are
  // pricing / security / docs / demo-request, overlapping with
  // SaaS more than ecommerce.
  app_conversion: LEAD_GEN_STAGES,
  enterprise: SAAS_STAGES,
  content: LEAD_GEN_STAGES, // content businesses funnel like lead-gen
};

// ── Resolver ──

/**
 * Resolves the funnel model for an environment.
 * Priority: declared business model > inferred from classification > default ecommerce
 */
export function resolveFunnelModel(
  declaredBusinessModel: string | null | undefined,
  inferredBusinessModel: string | null | undefined,
  availablePageTypes?: Set<SurfacePageType>,
): ResolvedFunnelModel {
  // 1. Try declared model first (trusted — never overridden by page validation)
  let modelType = normalizeModelType(declaredBusinessModel);
  const isDeclared = !!modelType;

  // 2. Fall back to inferred
  if (!modelType) {
    modelType = normalizeModelType(inferredBusinessModel);
  }

  // 3. Only validate INFERRED models against pages — never override declared ones.
  // This prevents oscillation when a shallow crawl misses expected page types.
  if (modelType && availablePageTypes && !isDeclared) {
    modelType = validateModelAgainstPages(modelType, availablePageTypes);
  }

  // 4. Default to ecommerce if nothing resolved
  if (!modelType) {
    modelType = 'ecommerce';
  }

  const stages = MODEL_TEMPLATES[modelType] || ECOMMERCE_STAGES;
  const commercialPageTypes = new Set<SurfacePageType>();
  for (const stage of stages) {
    for (const pt of stage.pageTypes) {
      commercialPageTypes.add(pt);
    }
  }

  return { modelType, stages, commercialPageTypes };
}

function normalizeModelType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  const aliases: Record<string, string> = {
    'saas': 'saas',
    'sass': 'saas',
    'software': 'saas',
    'ecommerce': 'ecommerce',
    'e-commerce': 'ecommerce',
    'loja': 'ecommerce',
    'shop': 'ecommerce',
    'lead_gen': 'lead_gen',
    'leadgen': 'lead_gen',
    'lead generation': 'lead_gen',
    'services': 'services',
    'serviços': 'services',
    'agency': 'services',
    // Wave-22.7 — vertical extensions
    'app_conversion': 'app_conversion',
    'app_download': 'app_conversion',
    'mobile_app': 'app_conversion',
    'enterprise': 'enterprise',
    'b2b': 'enterprise',
    'content': 'content',
    'media': 'content',
    'hybrid': 'saas', // hybrid defaults to SaaS-like funnel
  };
  return aliases[lower] ?? null;
}

/**
 * Validates that the model matches what pages actually exist.
 * If model says "ecommerce" but there are no product/cart pages,
 * try to find a better fit.
 */
function validateModelAgainstPages(
  modelType: string,
  pageTypes: Set<SurfacePageType>,
): string {
  if (modelType === 'ecommerce') {
    // Ecommerce should have product or cart pages
    const hasEcomSignals = pageTypes.has('product') || pageTypes.has('cart') || pageTypes.has('category');
    if (!hasEcomSignals) {
      // Check if it looks more like SaaS
      const hasSaasSignals = pageTypes.has('features') || pageTypes.has('signup') || pageTypes.has('demo');
      if (hasSaasSignals) return 'saas';
      // Or lead-gen
      const hasLeadGenSignals = pageTypes.has('contact') || pageTypes.has('blog');
      if (hasLeadGenSignals) return 'lead_gen';
    }
  }

  if (modelType === 'saas') {
    // SaaS should have pricing or signup
    const hasSaasSignals = pageTypes.has('pricing') || pageTypes.has('signup') || pageTypes.has('features') || pageTypes.has('demo');
    if (!hasSaasSignals) {
      // Fall back to ecommerce if it has products
      if (pageTypes.has('product') || pageTypes.has('cart')) return 'ecommerce';
    }
  }

  return modelType;
}

/**
 * Get the funnel stage for a page type given a resolved model.
 * Returns null if the page type doesn't belong to any stage.
 */
export function getStageForPageType(
  pageType: SurfacePageType,
  model: ResolvedFunnelModel,
): FunnelStageDefinition | null {
  for (const stage of model.stages) {
    if (stage.pageTypes.includes(pageType)) {
      return stage;
    }
  }
  return null;
}

/**
 * Build the stageOrder map (for backward compatibility with journey API).
 * Maps pageType → numeric order.
 */
export function buildStageOrderMap(model: ResolvedFunnelModel): Record<string, number> {
  const map: Record<string, number> = {};
  for (const stage of model.stages) {
    for (const pt of stage.pageTypes) {
      map[pt] = stage.order;
    }
  }
  return map;
}

/**
 * Serialize the model for DB storage.
 */
export function serializeStageDefinitions(stages: FunnelStageDefinition[]): string {
  return JSON.stringify(stages);
}

/**
 * Deserialize from DB.
 */
export function deserializeStageDefinitions(json: string): FunnelStageDefinition[] {
  try {
    return JSON.parse(json) as FunnelStageDefinition[];
  } catch {
    return ECOMMERCE_STAGES;
  }
}
