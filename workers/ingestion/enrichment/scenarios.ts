import type { VerificationScenario } from "../../verification/browser-types";

// ──────────────────────────────────────────────
// Stage D — Business-Aware Scenario Templates
//
// Each business model gets a small set of scenarios that:
//   1. Confirm a commercial path (varies by model)
//   2. Validate chargeback resilience (support indicators) — shared
//   3. Stays within BROWSER_LIMITS (max 5 scenarios, 20 steps total)
//
// Why business-aware: an ecommerce site has product → cart → checkout;
// a SaaS site has signup → trial → app; a lead-gen site has form →
// thank-you. Running an "ecommerce checkout probe" against a B2B SaaS
// page wastes a Playwright run on something that doesn't exist.
//
// What this is NOT: aggressive funnel-walking with form fills, payment
// attempts, or anything that mutates customer state. Those flows are
// handled by the manual verification path (Wave 0.6) which uses the
// AI-driven playwright-mcp and charges user credits.
//
// All selectors below are intentionally LANGUAGE-AGNOSTIC where possible
// (English + PT-BR + ES patterns) so the scenarios work for the
// LATAM-focused customer base.
// ──────────────────────────────────────────────

/**
 * Build the support-reach probe scenario.
 *
 * Same for every business model — every site needs support indicators
 * for chargeback resilience. We check for: phone link, email link,
 * contact page link, return/refund link.
 *
 * Each assert_visible step's success/failure becomes a signal in the
 * resulting BrowserNavigationTrace evidence (the failed steps tell us
 * which indicators are missing — that's the chargeback signal).
 */
export function buildSupportReachScenario(landingUrl: string): VerificationScenario {
  return {
    name: "support_reach_probe",
    steps: [
      { type: "navigate", url: landingUrl },
      // Wait for JS to render — many sites mount footers post-DOM-ready
      { type: "wait_ms", ms: 2500 },
      { type: "screenshot", label: "support_reach_landing_loaded" },
      // Phone indicator — tel: links are universal
      { type: "assert_visible", selector: 'a[href^="tel:"]' },
      // Email indicator — mailto: links are universal
      { type: "assert_visible", selector: 'a[href^="mailto:"]' },
      // Contact page link — broad multi-language selector
      {
        type: "assert_visible",
        selector:
          'a[href*="contact"], a[href*="contato"], a[href*="contacto"], a[href*="fale-conosco"], a[href*="atendimento"]',
      },
      // Return / refund policy — chargeback resilience signal
      {
        type: "assert_visible",
        selector:
          'a[href*="return"], a[href*="refund"], a[href*="reembolso"], a[href*="trocas"], a[href*="devolu"]',
      },
    ],
  };
}

/**
 * Ecommerce commercial path probe.
 *
 * Goal: navigate landing → category/product → cart-reachable. We DO NOT
 * actually add items to cart or attempt checkout — that's manual
 * verification's job. We just confirm the path EXISTS and the
 * pages render with JS enabled.
 *
 * The browser worker will capture: title, redirect chain, network
 * requests (which Stage D's network analysis layer will classify into
 * payment/measurement/trust/commerce buckets), console errors.
 */
export function buildEcommerceCommercialPath(landingUrl: string): VerificationScenario {
  return {
    name: "ecommerce_commercial_path",
    steps: [
      { type: "navigate", url: landingUrl },
      { type: "wait_ms", ms: 2500 },
      { type: "screenshot", label: "ecom_landing" },
      // Look for any product/category link — the broad selector matches
      // most ecommerce sites in EN/PT/ES
      {
        type: "assert_visible",
        selector:
          'a[href*="product"], a[href*="produto"], a[href*="category"], a[href*="categoria"], a[href*="shop"], a[href*="loja"], a[href*="tienda"]',
      },
      // Look for any cart/checkout entry point
      {
        type: "assert_visible",
        selector:
          'a[href*="cart"], a[href*="carrinho"], a[href*="carrito"], a[href*="checkout"], a[href*="bag"], a[href*="basket"]',
      },
    ],
  };
}

/**
 * Lead-gen commercial path probe.
 *
 * Goal: confirm a primary CTA exists and the destination form/contact
 * page renders with JS. We don't fill the form.
 */
export function buildLeadGenCommercialPath(landingUrl: string): VerificationScenario {
  return {
    name: "leadgen_commercial_path",
    steps: [
      { type: "navigate", url: landingUrl },
      { type: "wait_ms", ms: 2500 },
      { type: "screenshot", label: "leadgen_landing" },
      // Primary CTA — broad multi-language match
      {
        type: "assert_visible",
        selector:
          'a[href*="demo"], a[href*="quote"], a[href*="orcamento"], a[href*="cotacao"], a[href*="presupuesto"], a[href*="trial"], a[href*="agendar"], a[href*="schedule"], a[href*="book"], button[type="submit"]',
      },
      // Form rendered after JS mount
      { type: "assert_visible", selector: "form" },
    ],
  };
}

/**
 * SaaS commercial path probe.
 *
 * Goal: confirm the signup/trial entry exists, pricing visible without
 * auth, dashboard / app entry present.
 */
export function buildSaasCommercialPath(landingUrl: string): VerificationScenario {
  return {
    name: "saas_commercial_path",
    steps: [
      { type: "navigate", url: landingUrl },
      { type: "wait_ms", ms: 2500 },
      { type: "screenshot", label: "saas_landing" },
      // Signup / start / trial CTA
      {
        type: "assert_visible",
        selector:
          'a[href*="signup"], a[href*="sign-up"], a[href*="register"], a[href*="get-started"], a[href*="start"], a[href*="trial"], a[href*="cadastro"], a[href*="registro"], a[href*="comenzar"]',
      },
      // Pricing visibility
      {
        type: "assert_visible",
        selector:
          'a[href*="pricing"], a[href*="plans"], a[href*="precos"], a[href*="planos"], a[href*="precios"], a[href*="planes"]',
      },
    ],
  };
}

/**
 * Hybrid / unknown business model — generic commercial probe.
 * Used when we don't know the business type or it's a mix.
 */
export function buildHybridCommercialPath(landingUrl: string): VerificationScenario {
  return {
    name: "hybrid_commercial_path",
    steps: [
      { type: "navigate", url: landingUrl },
      { type: "wait_ms", ms: 2500 },
      { type: "screenshot", label: "hybrid_landing" },
      // Anything commercial — broadest possible selector
      {
        type: "assert_visible",
        selector:
          'a[href*="checkout"], a[href*="cart"], a[href*="buy"], a[href*="comprar"], a[href*="signup"], a[href*="trial"], a[href*="demo"], a[href*="pricing"], a[href*="plans"], a[href*="precos"]',
      },
    ],
  };
}

/**
 * Pick the right commercial-path scenario for the given business model.
 *
 * Falls back to the hybrid scenario when:
 *   - business_model is null (no onboarding profile yet)
 *   - business_model is an unrecognized string
 *
 * Returns null is NEVER acceptable here — Stage D always wants at least
 * one commercial probe scenario.
 */
export function pickCommercialPathScenario(
  businessModel: string | null,
  landingUrl: string,
): VerificationScenario {
  switch (businessModel) {
    case "ecommerce":
      return buildEcommerceCommercialPath(landingUrl);
    case "lead_gen":
      return buildLeadGenCommercialPath(landingUrl);
    case "saas":
      return buildSaasCommercialPath(landingUrl);
    case "hybrid":
    default:
      return buildHybridCommercialPath(landingUrl);
  }
}

/**
 * Build the full Stage D scenario set for a given business model.
 * Returns 2 scenarios: commercial path probe + support reach probe.
 *
 * Total step count is bounded — each scenario is ~5-7 steps so the
 * combined run sits well under BROWSER_LIMITS.max_steps_per_run (20).
 */
export function buildStageDScenarios(
  businessModel: string | null,
  landingUrl: string,
): VerificationScenario[] {
  return [
    pickCommercialPathScenario(businessModel, landingUrl),
    buildSupportReachScenario(landingUrl),
  ];
}
