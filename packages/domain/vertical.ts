// ──────────────────────────────────────────────
// Perceived vertical + surface-purpose taxonomy (PV.0)
//
// Two distinct notions of "what this business is":
//
//   ONBOARDING model  — BusinessProfile.businessModel (per-org, user-declared).
//                        The trusted prior. Free string, coarse.
//   PERCEIVED vertical — Environment.perceivedVertical (per-domain, inferred by
//                        the perception pass, PV.2). Autonomous, confidence-scored.
//
// resolveEffectiveVertical() reconciles them: perception overrides the
// onboarding prior only when present AND confident enough. Until PV.2 ships,
// perceivedVertical is always null, so the resolver returns the onboarding
// value verbatim — wiring it in is behaviour-preserving.
//
// Both taxonomies below are CLOSED on purpose: the perception LLM emits labels
// from these sets only, never free text (anti-slop). Extend deliberately (PV.6),
// not at runtime.
// ──────────────────────────────────────────────

/**
 * Closed taxonomy of perceived business verticals.
 *
 * Inherits the model/industry blur already present in the engine
 * (vertical-inference.ts dispatches on a flat string that is sometimes a
 * business model — saas, ecommerce — and sometimes an industry — food,
 * health). PV.0 keeps that flat shape for representability; a cleaner
 * model×industry split is deferred. `local_service` and `professional` are
 * the new non-transactional buckets the onboarding `BusinessModel` enum
 * cannot represent (clinics, salons, trades / lawyers, accountants,
 * architects) — their detectors land in PV.6.
 */
export const PERCEIVED_VERTICALS = [
  'ecommerce',
  'saas',
  'lead_gen',
  'services', // B2B services closing offline (form / WhatsApp / call)
  'local_service', // clinics, salons, mechanics, trades — appointment-driven
  'professional', // lawyers, accountants, architects — credential/portfolio-driven
  'food', // restaurants, delivery
  'health', // health & BEAUTY PRODUCTS (cosmetics, supplements, pharmacy). A clinic/dentist = local_service.
  'education', // courses, schools
  'content', // media, publishers
  // PV.6 — broader coverage (each a distinct money mechanism)
  'infoproduct', // digital courses/products (infoprodutores) — proof-of-result → buy, no shipping
  'real_estate', // imobiliárias — listing browse → visit/lead, high ticket
  'marketplace', // two-sided (supply + demand liquidity, not one seller's checkout)
  'travel', // hotels / pousadas / tourism — date-availability → reservation
  'financial_services', // insurance / credit / accounting — trust + regulation → high-consideration lead
  'home_services', // contractors / plumbers / electricians — quote-driven (not slot-booking)
] as const;

export type PerceivedVertical = (typeof PERCEIVED_VERTICALS)[number];

export function isPerceivedVertical(v: string | null | undefined): v is PerceivedVertical {
  return v != null && (PERCEIVED_VERTICALS as readonly string[]).includes(v);
}

/**
 * Closed taxonomy of surface purposes — the semantic role of a page.
 *
 * Superset of classification's `SurfacePageType` (which is ecommerce/SaaS
 * shaped): adds the non-transactional surfaces the perception pass must be
 * able to label for service/local/professional businesses. Unifying this with
 * `SurfacePageType` into a single authoritative source is the "eleger pageType
 * autoritativo" debt and lands with PV.3 — do NOT let the two drift in the
 * meantime (string drift was exactly what broke the page-classifier wiring).
 */
export const SURFACE_PURPOSES = [
  // shared / transactional
  'homepage',
  'landing',
  'pricing',
  'product',
  'category',
  'cart',
  'checkout',
  'signup',
  'account',
  'onboarding',
  'thank_you',
  // content / trust
  'features',
  'blog',
  'about',
  'contact',
  'support',
  'policy',
  'testimonials',
  'case_study',
  'team',
  // non-transactional verticals (the gap perception must cover)
  'booking', // appointment / scheduling surface
  'service_listing', // "what we do" — offerings page
  'intake_form', // qualification / quote / lead intake
  'menu', // restaurant menu / catalog of offerings
  'location', // address / hours / map
  // PV.6 — broader-vertical surfaces
  'listing', // property / marketplace listing page
  'property_detail', // single property/item detail
  'availability', // date-availability / reservation (travel)
  'quote_simulation', // insurance / credit / reform quote or simulation
  'other',
] as const;

export type SurfacePurpose = (typeof SURFACE_PURPOSES)[number];

export function isSurfacePurpose(p: string | null | undefined): p is SurfacePurpose {
  return p != null && (SURFACE_PURPOSES as readonly string[]).includes(p);
}

/**
 * Closed taxonomy of perception CONTENT FLAGS (PV.8).
 *
 * Site-level boolean attributes the perception pass judges SEMANTICALLY (an LLM
 * that READ the pages), for the content-attribute detectors that have no surface
 * PURPOSE to gate on — a guarantee badge, a credential number, a reply-time SLA
 * are not page roles. Each flag is 1:1 with one such detector. The pass emits a
 * tri-state per flag: present:true / present:false / omitted (= unknown). Closed
 * set, anti-slop — extend deliberately, never at runtime.
 */
export const CONTENT_FLAGS = [
  'has_guarantee', // money-back / refund / satisfaction guarantee visible
  'shows_credentials', // professional registration / license / certification shown
  'shows_curriculum', // course modules / syllabus / "what you'll learn" shown
  'promises_response_time', // a reply-time / availability SLA on a contact surface
  'has_immediate_contact', // phone / WhatsApp / click-to-call — an instant channel
] as const;

export type ContentFlag = (typeof CONTENT_FLAGS)[number];

export function isContentFlag(f: string | null | undefined): f is ContentFlag {
  return f != null && (CONTENT_FLAGS as readonly string[]).includes(f);
}

// ── Reconciliation: perceived vs onboarding ──

/**
 * Minimum confidence (0–1) for a perceived vertical to OVERRIDE the
 * onboarding-declared model. Below this, onboarding stays the trusted prior.
 */
export const PERCEPTION_OVERRIDE_THRESHOLD = 0.7;

export interface EffectiveVertical {
  /** The vertical to use for dispatch (inference / scenario selection). */
  vertical: string | null;
  /** Which side won the reconciliation. */
  source: 'perceived' | 'onboarding' | 'none';
}

/**
 * Reconcile the autonomously-perceived vertical against the user-declared
 * onboarding model. Perception wins only when present AND confident enough;
 * otherwise onboarding is the trusted prior. Returns the onboarding value
 * verbatim when perception is absent (the state until PV.2 ships), so wiring
 * this in at the read points (PV.3) is behaviour-preserving.
 */
export function resolveEffectiveVertical(args: {
  onboarding: string | null;
  perceived: string | null;
  perceivedConfidence: number | null;
}): EffectiveVertical {
  const { onboarding, perceived, perceivedConfidence } = args;

  if (
    perceived != null &&
    perceived !== '' &&
    perceivedConfidence != null &&
    perceivedConfidence >= PERCEPTION_OVERRIDE_THRESHOLD
  ) {
    return { vertical: perceived, source: 'perceived' };
  }

  if (onboarding != null && onboarding !== '') {
    return { vertical: onboarding, source: 'onboarding' };
  }

  return { vertical: null, source: 'none' };
}
