// ──────────────────────────────────────────────
// Pack: security_posture (Wave 3.3)
//
// Inferences about browser-trust signals, mixed content, sensitive
// endpoint exposure, script hijack risks, payment data encryption,
// CORS misconfiguration, rate limiting absence, and predictable
// data URL patterns. Each function looks up specific signal_keys
// and emits at most one inference.
//
// Note: inferOpenRedirectIndicator (line 80 in this file) has zero
// call sites — it's defined here for code-organizational purposes
// but is not invoked by the orchestrator. Marked dead in
// docs/ENGINE_MAP.md §B as a Wave 20.6 follow-up to delete.
//
// Wave 20.6 — migrated verbatim from packages/inference/engine.ts:317-720.
// ──────────────────────────────────────────────

import {
  Inference,
  InferenceCategory,
  Signal,
  Scoping,
  IdGenerator,
  makeRef,
} from "../../domain";
import { createInference } from "../shared/builders";
import type { PackInput } from "../shared/types";

function inferSecurityHeaderWeakness(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const score = byKey.get('security_headers_score');
  const hstsMissing = byKey.get('hsts_missing');
  const cspWeak = byKey.get('csp_missing_or_weak');
  // clickjack_protection_missing removed — now handled by checkout_clickjack_risk

  if (!score && !hstsMissing && !cspWeak) return [];

  const factors: string[] = [];
  const relevant: Signal[] = [];

  if (score) {
    relevant.push(score);
    factors.push(`headers score ${score.numeric_value}/100`);
  }
  if (hstsMissing) { relevant.push(hstsMissing); factors.push('HSTS missing'); }
  if (cspWeak) { relevant.push(cspWeak); factors.push(cspWeak.value === 'weak' ? 'CSP weak (unsafe-inline/eval)' : 'CSP missing'); }

  const numericScore = score?.numeric_value ?? 100;
  const severity = numericScore < 30 ? 'high' : numericScore < 60 ? 'medium' : 'low';

  return [createInference({
    inference_key: 'security_header_weakness',
    category: InferenceCategory.SecurityHeaderWeakness,
    conclusion: 'security_header_weakness',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: 85,
    scoping, cycle_ref, ids,
    signal_refs: relevant.map(s => makeRef('signal', s.id)),
    evidence_refs: relevant.flatMap(s => s.evidence_refs),
    reasoning: `Browser trust signals ${severity}. ${factors.join('; ')}. Browsers show "Not Secure" warnings and remove the padlock when these headers are missing — buyers see these signals and abandon.`,
    reasoning_slots: { severity, factors: factors.join('; ') },
  })];
}

function inferMixedContentExposure(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const mixedScript = byKey.get('mixed_content_script');
  const mixedForm = byKey.get('mixed_content_form_action');
  const mixedCheckout = byKey.get('mixed_content_on_checkout');

  if (!mixedScript && !mixedForm && !mixedCheckout) return [];

  const factors: string[] = [];
  const relevant: Signal[] = [];

  if (mixedScript) { relevant.push(mixedScript); factors.push(`${mixedScript.numeric_value} mixed script(s)`); }
  if (mixedForm) { relevant.push(mixedForm); factors.push(`${mixedForm.numeric_value} insecure form action(s)`); }
  if (mixedCheckout) { relevant.push(mixedCheckout); factors.push(`mixed content on ${mixedCheckout.numeric_value} commercial page(s)`); }

  const severity = mixedCheckout ? 'high' : (mixedForm || mixedScript) ? 'medium' : 'low';

  return [createInference({
    inference_key: 'mixed_content_exposure',
    category: InferenceCategory.MixedContentExposure,
    conclusion: 'mixed_content_exposure',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: 95,
    scoping, cycle_ref, ids,
    signal_refs: relevant.map(s => makeRef('signal', s.id)),
    evidence_refs: relevant.flatMap(s => s.evidence_refs),
    reasoning: `Checkout breakage risk ${severity}. ${factors.join('; ')}. Payment scripts, forms, and trust badges loaded over HTTP are silently blocked on HTTPS pages — the buyer clicks Pay and nothing happens.`,
    reasoning_slots: { severity, factors: factors.join('; ') },
  })];
}

function inferOpenRedirectIndicator(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const urlParam = byKey.get('redirect_with_url_parameter');
  const crossDomain = byKey.get('redirect_chain_to_unknown_domain');

  if (!urlParam && !crossDomain) return [];

  const factors: string[] = [];
  const relevant: Signal[] = [];

  if (urlParam) { relevant.push(urlParam); factors.push(`${urlParam.numeric_value} URL-parameter redirect(s)`); }
  if (crossDomain) { relevant.push(crossDomain); factors.push(`${crossDomain.numeric_value} cross-domain redirect(s) to unknown destinations`); }

  const severity = (urlParam && crossDomain) ? 'high' : 'medium';

  return [createInference({
    inference_key: 'open_redirect_indicator',
    category: InferenceCategory.OpenRedirectIndicator,
    conclusion: 'open_redirect_indicator',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: 70,
    scoping, cycle_ref, ids,
    signal_refs: relevant.map(s => makeRef('signal', s.id)),
    evidence_refs: relevant.flatMap(s => s.evidence_refs),
    reasoning: `Domain phishing risk ${severity}. ${factors.join('; ')}. Attackers create legitimate-looking links on your domain that redirect buyers to fake checkout pages — real customers lose money thinking they are on your site.`,
    reasoning_slots: { severity, factors: factors.join('; ') },
  })];
}

function inferSensitiveEndpointExposed(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const adminExposed = byKey.get('admin_panel_exposed');
  const sensitiveFile = byKey.get('sensitive_file_accessible');
  const apiDocs = byKey.get('api_docs_public');

  if (!adminExposed && !sensitiveFile && !apiDocs) return [];

  const factors: string[] = [];
  const relevant: Signal[] = [];

  if (sensitiveFile) { relevant.push(sensitiveFile); factors.push(`${sensitiveFile.numeric_value} sensitive file(s) publicly accessible`); }
  if (adminExposed) { relevant.push(adminExposed); factors.push(`${adminExposed.numeric_value} admin path(s) exposed`); }
  if (apiDocs) { relevant.push(apiDocs); factors.push(`${apiDocs.numeric_value} API doc endpoint(s) public`); }

  const severity = sensitiveFile ? 'high' : (adminExposed || apiDocs) ? 'medium' : 'low';

  return [createInference({
    inference_key: 'sensitive_endpoint_exposed',
    category: InferenceCategory.SensitiveEndpointExposed,
    conclusion: 'sensitive_endpoint_exposed',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: 90,
    scoping, cycle_ref, ids,
    signal_refs: relevant.map(s => makeRef('signal', s.id)),
    evidence_refs: relevant.flatMap(s => s.evidence_refs),
    reasoning: `Infrastructure exposure ${severity}. ${factors.join('; ')}. Publicly accessible credentials and admin panels mean one breach away from total commerce shutdown — revenue goes to zero.`,
    reasoning_slots: { severity, factors: factors.join('; ') },
  })];
}

function inferCheckoutScriptHijackRisk(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const hijackRisk = byKey.get('checkout_script_hijack_risk');
  if (!hijackRisk) return [];

  const count = hijackRisk.numeric_value || 0;
  const severity = count >= 3 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'checkout_script_hijack_risk',
    category: InferenceCategory.CheckoutScriptHijackRisk,
    conclusion: 'checkout_script_hijack_risk',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: hijackRisk.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', hijackRisk.id)],
    evidence_refs: hijackRisk.evidence_refs,
    reasoning: `Checkout hijack risk ${severity}. ${count} unvetted external script(s) load on payment pages without CSP protection. A single compromised script can silently replace the payment form, redirect card data to an attacker, or inject fake checkout flows — buyers see your domain and trust it.`,
    reasoning_slots: { severity, count },
  })];
}

function inferBuyerSessionTheftRisk(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const cookieWeak = byKey.get('cookie_security_weak');
  if (!cookieWeak) return [];

  const count = cookieWeak.numeric_value || 0;
  const severity = count >= 3 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'buyer_session_theft_risk',
    category: InferenceCategory.BuyerSessionTheftRisk,
    conclusion: 'buyer_session_theft_risk',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: cookieWeak.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', cookieWeak.id)],
    evidence_refs: cookieWeak.evidence_refs,
    reasoning: `Session theft risk ${severity}. ${count} cookie(s) on commercial pages lack Secure, HttpOnly, or SameSite flags. Attackers can steal buyer sessions via XSS or network sniffing, make purchases with saved payment methods, or access account data — all without the buyer knowing.`,
    reasoning_slots: { severity, count },
  })];
}

function inferCheckoutClickjackRisk(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const clickjackMissing = byKey.get('clickjack_protection_missing');
  const checkoutDetected = first('checkout.detected');

  if (!clickjackMissing || !checkoutDetected) return [];

  const count = clickjackMissing.numeric_value || 0;
  const severity = count >= 3 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'checkout_clickjack_risk',
    category: InferenceCategory.CheckoutClickjackRisk,
    conclusion: 'checkout_clickjack_risk',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: clickjackMissing.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', clickjackMissing.id)],
    evidence_refs: clickjackMissing.evidence_refs,
    reasoning: `Clickjack risk ${severity}. Clickjacking protection missing on ${count} page(s) and commercial checkout exists. Attackers can embed your checkout page inside a fake site using an invisible iframe — buyers think they are clicking on the attacker's page but are actually authorizing payments on yours.`,
    reasoning_slots: { severity, count },
  })];
}

function inferPaymentDataUnencrypted(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const insecureTarget = byKey.get('payment_form_insecure_target');
  if (!insecureTarget) return [];

  const count = insecureTarget.numeric_value || 0;
  const severity = count >= 2 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'payment_data_unencrypted',
    category: InferenceCategory.PaymentDataUnencrypted,
    conclusion: 'payment_data_unencrypted',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: insecureTarget.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', insecureTarget.id)],
    evidence_refs: insecureTarget.evidence_refs,
    reasoning: `Payment data exposure ${severity}. ${count} payment form(s) submit to insecure or untrusted destinations. Card numbers, CVVs, and personal data cross an unencrypted boundary where any network observer — coffee shop WiFi, ISP, compromised router — can capture them in plaintext.`,
    reasoning_slots: { severity, count },
  })];
}

function inferErrorPageInformationLeak(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const leaks = byKey.get('error_page_leaks_internals');
  if (!leaks) return [];

  const count = leaks.numeric_value || 0;
  const severity = count >= 3 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'error_page_information_leak',
    category: InferenceCategory.ErrorPageInformationLeak,
    conclusion: 'error_page_information_leak',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: leaks.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', leaks.id)],
    evidence_refs: leaks.evidence_refs,
    reasoning: `Error page information leak ${severity}. ${count} error page(s) return verbose responses (> 2 KB) on 4xx/5xx status codes. These likely expose stack traces, framework versions, database connection details, or internal file paths — giving attackers a detailed map of the system architecture to craft targeted exploits.`,
    reasoning_slots: { severity, count },
  })];
}

function inferEmailDeliverabilityRisk(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const emailAbsent = byKey.get('email_infrastructure_absent');
  if (!emailAbsent) return [];

  const checkoutExists = first('checkout.detected') || first('checkout.mode');
  const severity = checkoutExists ? 'high' : 'medium';

  return [createInference({
    inference_key: 'email_deliverability_risk',
    category: InferenceCategory.EmailDeliverabilityRisk,
    conclusion: 'email_deliverability_risk',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: emailAbsent.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', emailAbsent.id)],
    evidence_refs: emailAbsent.evidence_refs,
    reasoning: `Email deliverability risk ${severity}. Commerce site with checkout but no detectable email infrastructure (ESP, transactional email provider). Without SPF/DKIM/DMARC configured through a reputable email provider, order confirmation emails land in spam — buyers assume the purchase failed or was fraudulent and file chargebacks.`,
    reasoning_slots: { severity },
  })];
}

function inferCorsMisconfigurationRisk(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const corsWildcard = byKey.get('cors_wildcard_on_commercial');
  if (!corsWildcard) return [];

  const count = corsWildcard.numeric_value || 0;
  const severity = count >= 3 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'cors_misconfiguration_risk',
    category: InferenceCategory.CorsMisconfigurationRisk,
    conclusion: 'cors_misconfiguration_risk',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: corsWildcard.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', corsWildcard.id)],
    evidence_refs: corsWildcard.evidence_refs,
    reasoning: `CORS misconfiguration risk ${severity}. ${count} commercial page(s) return Access-Control-Allow-Origin: *. Wildcard CORS on payment endpoints lets any website make authenticated cross-origin requests — malicious sites can read session data, initiate purchases, and extract customer information using the buyer's authenticated session.`,
    reasoning_slots: { severity, count },
  })];
}

function inferRateLimitingAbsent(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const noRateLimit = byKey.get('no_rate_limit_headers_commercial');
  if (!noRateLimit) return [];

  const count = noRateLimit.numeric_value || 0;
  const severity = count >= 3 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'rate_limiting_absent_on_commerce',
    category: InferenceCategory.RateLimitingAbsent,
    conclusion: 'rate_limiting_absent_on_commerce',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: noRateLimit.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', noRateLimit.id)],
    evidence_refs: noRateLimit.evidence_refs,
    reasoning: `Rate limiting risk ${severity}. No rate-limit headers detected on ${count} commercial endpoint(s). Without rate limiting, fraud bots can test thousands of stolen cards per minute, hoard inventory through automated cart requests, and scrape pricing — generating chargebacks, stock manipulation, and operational chaos.`,
    reasoning_slots: { severity, count },
  })];
}

function inferPredictableOrderUrls(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const predictable = byKey.get('predictable_data_url_pattern');
  if (!predictable) return [];

  const count = predictable.numeric_value || 0;
  const severity = count >= 3 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'predictable_order_urls',
    category: InferenceCategory.PredictableOrderUrls,
    conclusion: 'predictable_order_urls',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: predictable.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', predictable.id)],
    evidence_refs: predictable.evidence_refs,
    reasoning: `Predictable URL exposure ${severity}. ${count} URL(s) matching sequential patterns (e.g. /order/123, /invoice/456) return HTTP 200. Sequential URLs let anyone enumerate orders, invoices, and customer profiles — exposing personal and financial data at scale without authentication barriers.`,
    reasoning_slots: { severity, count },
  })];
}

// ──────────────────────────────────────────────
// Pack entry point — orchestrator calls this once per cycle.
// Order preserved from the pre-Wave-20.6 inline call sequence
// to keep IdGenerator counter-order identical to the monolith.
// inferOpenRedirectIndicator intentionally NOT called (dead code
// inherited from the monolith — preserved here pending explicit
// delete decision).
// ──────────────────────────────────────────────

export function computeSecurityPosturePack(input: PackInput): Inference[] {
  const { first, byKey, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];
  out.push(...inferSecurityHeaderWeakness(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferMixedContentExposure(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferSensitiveEndpointExposed(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferCheckoutScriptHijackRisk(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferBuyerSessionTheftRisk(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferCheckoutClickjackRisk(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferPaymentDataUnencrypted(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferErrorPageInformationLeak(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferEmailDeliverabilityRisk(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferCorsMisconfigurationRisk(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferRateLimitingAbsent(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferPredictableOrderUrls(first, byKey, scoping, cycle_ref, ids));
  return out;
}
