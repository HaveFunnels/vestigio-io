// ──────────────────────────────────────────────
// Pack: evidence_derived (Phase 30 / 30B / 2 / 2B / 2C bundle)
//
// Structural inferences derived from existing evidence — twenty-eight
// functions across five original phase blocks. They share the trait of
// being NOT tied to a single surface (revenue, security, trust, etc.)
// but instead detecting cross-surface structural patterns:
//   - Phase 30  — critical path, form data leakage, provider fragmentation
//   - Phase 30B — redirect erosion, language discontinuity, orphan
//                 commercial pages, untrusted embeds, platform checkout
//                 risk, post-purchase gaps, commercial measurement blind
//   - Phase 2   — thin policy, hidden support, weak trust, tracking
//                 incomplete, consent/measurement conflict
//   - Phase 2B  — mobile path blocked, mobile trust degraded, runtime
//                 purchase interruption, runtime measurement break,
//                 secondary flow bypass
//   - Phase 2C  — refund process unclear, post-purchase proof weak,
//                 support late in journey, hidden reassurance routes,
//                 alternate flow measurement gap, runtime reassurance
//                 break, provider path weak, trust+measurement compound
//
// Wave 20.6 — migrated from the pre-split inference monolith (see git log for engine.ts before commit f987895).
// Future: this bundle MAY be split per-phase if the migration tooling
// (INFERENCE_TO_PACK) maps each inference to a more topical pack.
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

// ──────────────────────────────────────────────
// Phase 30: New Inference Rules from Existing Evidence
// ──────────────────────────────────────────────

function inferCriticalPathBroken(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const criticalError = byKey.get('critical_page_error');
  if (!criticalError) return [];

  const count = criticalError.numeric_value || 0;
  const severity = count >= 3 ? 'high' : count >= 1 ? 'medium' : 'low';

  return [createInference({
    inference_key: 'critical_path_broken',
    category: InferenceCategory.CriticalPathBroken,
    conclusion: 'critical_path_broken',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: 85,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', criticalError.id)],
    evidence_refs: criticalError.evidence_refs,
    reasoning: `${count} revenue-critical page(s) (checkout, cart, pricing, login) are returning HTTP errors. These pages are directly on the conversion path — every visitor hitting an error page is a lost transaction. This is not a generic SEO concern; it is an active break in the revenue path.`,
    reasoning_slots: { severity, count },
  })];
}

function inferFormDataLeavesDomain(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const exposure = byKey.get('external_form_data_exposure');
  if (!exposure) return [];

  const isPayment = exposure.value === 'high';
  const severity = isPayment ? 'high' : 'medium';

  return [createInference({
    inference_key: 'form_data_leaves_domain',
    category: InferenceCategory.DataBoundaryRisk,
    conclusion: 'form_data_leaves_domain',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: exposure.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', exposure.id)],
    evidence_refs: exposure.evidence_refs,
    reasoning: `${exposure.numeric_value} form(s) submit user data to unrecognized external domains. ${isPayment ? 'Payment fields are included — this is a direct trust and compliance risk at the conversion point.' : 'User data leaves the domain boundary without a recognized payment provider, creating trust and privacy concerns.'} This is distinct from a known provider redirect (Stripe, PayPal) — these are unrecognized external endpoints.`,
    reasoning_slots: { severity, count: exposure.numeric_value || 0 },
  })];
}

function inferProviderFragmentation(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  signals: Signal[],
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const fragmentation = byKey.get('multiple_payment_providers');
  if (!fragmentation) return [];

  const count = fragmentation.numeric_value || 0;
  const severity = count >= 4 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'checkout_provider_fragmented',
    category: InferenceCategory.ProviderFragmentation,
    conclusion: 'checkout_provider_fragmented',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: 65,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', fragmentation.id)],
    evidence_refs: fragmentation.evidence_refs,
    reasoning: `${count} distinct payment providers detected on the site. While offering payment choice can be positive, ${count}+ competing provider scripts create inconsistent checkout experiences, increase page weight, and fragment the user's path to purchase. Different providers may show conflicting UI patterns, currencies, or trust signals.`,
    reasoning_slots: { severity, count },
  })];
}

// ──────────────────────────────────────────────
// Phase 30B: Extended Inference Rules
// ──────────────────────────────────────────────

function inferRedirectTrustErosion(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('checkout_redirect_trust_erosion');
  const urlParam = byKey.get('redirect_with_url_parameter');
  const crossDomain = byKey.get('redirect_chain_to_unknown_domain');

  if (!sig && !urlParam && !crossDomain) return [];

  const factors: string[] = [];
  const relevant: Signal[] = [];
  let hops = 0;

  if (sig) {
    relevant.push(sig);
    hops = sig.numeric_value || 0;
    factors.push(`${hops} redirect hop(s) crossing domains on checkout path`);
  }
  if (urlParam) {
    relevant.push(urlParam);
    factors.push(`${urlParam.numeric_value} URL-parameter redirect(s) exposing open redirect risk`);
  }
  if (crossDomain) {
    relevant.push(crossDomain);
    factors.push(`${crossDomain.numeric_value} cross-domain redirect(s) to unknown destinations`);
  }

  const severity = (hops >= 3 || (urlParam && crossDomain)) ? 'high'
    : (sig || urlParam || crossDomain) ? 'medium' : 'low';

  const confidence = sig ? sig.confidence : 70;

  return [createInference({
    inference_key: 'redirect_chain_erodes_checkout_trust',
    category: InferenceCategory.RedirectTrustErosion,
    conclusion: 'redirect_chain_erodes_checkout_trust',
    conclusion_value: severity,
    severity_hint: severity,
    confidence,
    scoping, cycle_ref, ids,
    signal_refs: relevant.map(s => makeRef('signal', s.id)),
    evidence_refs: relevant.flatMap(s => s.evidence_refs),
    reasoning: `Redirect trust erosion ${severity}. ${factors.join('; ')}. Industry data shows each redirect loses 5-15% of users. On the path to payment, this compounds into direct revenue loss as buyers interpret domain changes as untrustworthy.`,
    reasoning_slots: { severity, factors: factors.join('; ') },
  })];
}

function inferLanguageDiscontinuity(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('language_discontinuity_commercial');
  if (!sig) return [];

  const count = sig.numeric_value || 0;
  const severity = count >= 2 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'commercial_journey_language_break',
    category: InferenceCategory.LanguageDiscontinuity,
    conclusion: 'commercial_journey_language_break',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `${count} commercial page(s) switch language compared to the homepage. When a buyer moves from browsing in one language to a checkout or pricing page in another, it creates confusion, reduces trust, and increases abandonment — especially in markets where the primary audience does not speak the checkout language.`,
    reasoning_slots: { severity, count },
  })];
}

function inferOrphanCommercialPage(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('orphan_commercial_page');
  if (!sig) return [];

  const count = sig.numeric_value || 0;
  const severity = count >= 2 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'commercial_pages_disconnected',
    category: InferenceCategory.OrphanCommercialPage,
    conclusion: 'commercial_pages_disconnected',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `${count} commercial page(s) (checkout, pricing, login, billing) have no inbound navigation links from the main site. These pages exist but visitors cannot reach them through normal browsing. Revenue-critical surfaces that are unreachable from the main journey represent direct conversion leakage.`,
    reasoning_slots: { severity, count },
  })];
}

function inferUntrustedEmbed(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('untrusted_embed_on_commercial');
  if (!sig) return [];

  const count = sig.numeric_value || 0;
  const severity = count >= 3 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'untrusted_embeds_near_purchase',
    category: InferenceCategory.UntrustedEmbed,
    conclusion: 'untrusted_embeds_near_purchase',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `${count} unrecognized external iframe(s) embedded on commercial pages. Unlike known payment providers (Stripe, PayPal), these embeds are not recognized trust signals. External content from unknown sources near the purchase moment undermines buyer confidence and may introduce security perception risk.`,
    reasoning_slots: { severity, count },
  })];
}

function inferPlatformCheckoutRisk(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('platform_checkout_risk');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'platform_checkout_risk_unaddressed',
    category: InferenceCategory.PlatformCheckoutRisk,
    conclusion: 'platform_checkout_risk_unaddressed',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: sig.description || 'Platform-specific checkout patterns creating unresolved risk.',
    reasoning_slots: { severity },
  })];
}

function inferPostPurchaseGap(
  byKey: Map<string, Signal>,
  first: (attr: string) => Signal | undefined,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('post_purchase_gap_compound');
  if (!sig) return [];

  return [createInference({
    inference_key: 'post_purchase_confirmation_absent',
    category: InferenceCategory.PostPurchaseGap,
    conclusion: 'post_purchase_confirmation_absent',
    conclusion_value: 'high',
    severity_hint: 'high',
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `No order confirmation page and no refund policy detected. This compound gap means customers who just paid have no immediate proof their order was received and no way to understand return terms. The result is "did my order go through?" support contacts and "I don't recognize this charge" disputes — the two highest-volume chargeback drivers.`,
    reasoning_slots: { severity: 'high' },
  })];
}

function inferCommercialMeasurementBlind(
  first: (attr: string) => Signal | undefined,
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  // Fires when: checkout/payment pages exist AND no analytics on those pages
  // This is distinct from measurement_blindspot (sitewide) — this is specifically about
  // high-intent surfaces operating without conversion visibility
  const missingCommercial = byKey.get('missing_tracking_on_commercial');
  const hasCheckout = first('checkout.mode') != null;

  if (!missingCommercial || !hasCheckout) return [];

  const measurement = first('measurement.coverage');
  // Only fire if sitewide measurement exists but commercial pages are blind
  // (If no measurement anywhere, the existing measurement_blindspot finding covers it)
  if (measurement?.value === 'none') return [];

  return [createInference({
    inference_key: 'high_intent_surfaces_blind',
    category: InferenceCategory.CommercialMeasurementBlind,
    conclusion: 'high_intent_surfaces_blind',
    conclusion_value: 'high',
    severity_hint: 'high',
    confidence: 65,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', missingCommercial.id), ...(measurement ? [makeRef('signal', measurement.id)] : [])],
    evidence_refs: missingCommercial.evidence_refs,
    reasoning: `Analytics tools are present on the site but absent from checkout and payment pages. The highest-intent surfaces — where conversion actually happens — are operating without measurement. Ad spend optimization, attribution, and conversion rate improvement are impossible on the pages that generate revenue.`,
    reasoning_slots: { severity: 'high' },
  })];
}

// ──────────────────────────────────────────────
// Phase 2: Inference Rules from Deepened Collection
// ──────────────────────────────────────────────

function inferThinPolicyContent(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('thin_refund_policy');
  if (!sig) return [];

  const wordCount = sig.numeric_value || 0;
  const severity = wordCount < 100 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'refund_terms_too_thin',
    category: InferenceCategory.ThinPolicyContent,
    conclusion: 'refund_terms_too_thin',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `The refund/return policy is ${wordCount} words — too thin to defuse buyer disputes. A policy this brief cannot meaningfully explain return windows, refund processes, or exception handling. When dissatisfied customers cannot find clear terms, they bypass the merchant and file chargebacks.`,
    reasoning_slots: { severity, count: wordCount },
  })];
}

function inferHiddenSupportWidget(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('support_widget_hidden_from_checkout');
  if (!sig) return [];

  return [createInference({
    inference_key: 'support_hidden_at_purchase',
    category: InferenceCategory.HiddenSupportWidget,
    conclusion: 'support_hidden_at_purchase',
    conclusion_value: 'medium',
    severity_hint: 'medium',
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `A live support widget exists on the site but is absent from checkout and payment pages. Buyers who hesitate at the purchase moment — with questions about shipping, returns, or product fit — have no way to get immediate answers. This pushes uncertain buyers toward abandonment instead of resolution.`,
    reasoning_slots: { severity: 'medium' },
  })];
}

function inferTrustSignalsThin(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('trust_signals_thin_on_commercial');
  if (!sig) return [];

  const count = sig.numeric_value || 0;
  const severity = count === 0 ? 'high' : 'medium';

  return [createInference({
    inference_key: 'trust_surface_too_thin',
    category: InferenceCategory.TrustSignalsThin,
    conclusion: 'trust_surface_too_thin',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Only ${count} trust-building signal(s) found across the commercial surface (business schema, policy pages, recognized providers). Buyers evaluate trust through visible signals — business identity, review presence, policy accessibility, recognized checkout partners. A thin trust surface directly reduces checkout confidence and increases abandonment.`,
    reasoning_slots: { severity, count },
  })];
}

function inferTrackingStackIncomplete(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('tracking_stack_incomplete');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'tracking_stack_gaps',
    category: InferenceCategory.TrackingStackIncomplete,
    conclusion: 'tracking_stack_gaps',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: sig.description || 'Commerce tracking infrastructure has gaps preventing full conversion visibility and optimization.',
    reasoning_slots: { severity },
  })];
}

function inferConsentMeasurementConflict(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('consent_measurement_conflict');
  if (!sig) return [];

  return [createInference({
    inference_key: 'consent_undermining_measurement',
    category: InferenceCategory.ConsentMeasurementConflict,
    conclusion: 'consent_undermining_measurement',
    conclusion_value: 'medium',
    severity_hint: 'medium',
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `A consent management platform is present but no tag manager was detected. Without a consent-aware tag firing mechanism, analytics scripts may be blocked entirely for users who consent — creating a silent gap in conversion data. The site appears to have measurement, but the consent layer may be preventing it from actually working for a portion of visitors.`,
    reasoning_slots: { severity: 'medium' },
  })];
}

// ──────────────────────────────────────────────
// Phase 2B: Mobile & Runtime Inference Rules
// ──────────────────────────────────────────────

function inferMobilePathBlocked(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('mobile_commercial_path_blocked');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'mobile_commercial_path_blocked',
    category: InferenceCategory.MobilePathBlocked,
    conclusion: 'mobile_commercial_path_blocked',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `The commercial path is blocked or degraded on mobile. Mobile visitors — who represent the majority of traffic for most sites — cannot reach checkout, pricing, or key conversion pages. This is not a layout issue; it is a revenue path that does not exist for mobile buyers.`,
    reasoning_slots: { severity },
  })];
}

function inferMobileTrustDegraded(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('mobile_trust_weaker_than_desktop');
  if (!sig) return [];

  return [createInference({
    inference_key: 'mobile_trust_weaker_than_desktop',
    category: InferenceCategory.MobileTrustDegraded,
    conclusion: 'mobile_trust_weaker_than_desktop',
    conclusion_value: 'medium',
    severity_hint: 'medium',
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Mobile buyers experience a weaker trust surface than desktop visitors. Trust indicators, policy visibility, or provider signals present on desktop are absent or degraded on mobile. When mobile users see fewer reasons to trust, they abandon at higher rates.`,
    reasoning_slots: { severity: 'medium' },
  })];
}

function inferRuntimePurchaseInterruption(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('runtime_purchase_interrupted');
  if (!sig) return [];

  return [createInference({
    inference_key: 'runtime_errors_interrupt_purchase',
    category: InferenceCategory.RuntimePurchaseInterruption,
    conclusion: 'runtime_errors_interrupt_purchase',
    conclusion_value: 'high',
    severity_hint: 'high',
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `JavaScript runtime errors are directly interrupting the purchase journey. Payment provider scripts, checkout flow logic, or transaction-critical code is failing at execution time. Every instance is a buyer who wanted to pay but could not complete the transaction.`,
    reasoning_slots: { severity: 'high' },
  })];
}

function inferRuntimeMeasurementBreak(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('runtime_tracking_broken');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'runtime_measurement_broken',
    category: InferenceCategory.RuntimeMeasurementBreak,
    conclusion: 'runtime_measurement_broken',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Analytics, pixel, or tag manager scripts are failing at runtime on commercial pages. The tracking infrastructure appears to be present in the source code, but JavaScript errors prevent it from actually executing. Conversion data is silently dropping — the site thinks it has measurement, but the runtime tells a different story.`,
    reasoning_slots: { severity },
  })];
}

function inferSecondaryFlowBypassing(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('secondary_commercial_flows_detected');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'secondary_flows_bypass_trust_path',
    category: InferenceCategory.SecondaryFlowBypassing,
    conclusion: 'secondary_flows_bypass_trust_path',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Multiple distinct entry points lead to commercial conversion pages, suggesting secondary or alternate checkout flows that bypass the main trust, support, and measurement path. Revenue flowing through these secondary paths may escape policy coverage, support visibility, and analytics tracking.`,
    reasoning_slots: { severity },
  })];
}

// ──────────────────────────────────────────────
// Phase 2C: Composite Inference Rules
// ──────────────────────────────────────────────

function inferRefundProcessUnclear(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('refund_process_vague');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'refund_process_unclear',
    category: InferenceCategory.RefundProcessUnclear,
    conclusion: 'refund_process_unclear',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `A refund/return policy page exists but is missing ${sig.numeric_value} critical detail(s) that buyers need when something goes wrong. Without a clear return window, a described refund process, and contact information for returns, the policy exists in name only — it cannot actually guide a dissatisfied customer through resolution. The gap between "policy present" and "policy useful" is where chargebacks happen.`,
    reasoning_slots: { severity },
  })];
}

function inferPostPurchaseProofWeak(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('post_purchase_proof_weak');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'post_purchase_proof_too_weak',
    category: InferenceCategory.PostPurchaseProofWeak,
    conclusion: 'post_purchase_proof_too_weak',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `An order confirmation page exists but contains only ${sig.numeric_value} words — too little to serve as meaningful purchase proof. A confirmation page that does not clearly show order details, expected delivery timeline, and next steps leaves the buyer uncertain whether the purchase was actually processed. This uncertainty drives "I didn't order this" and "I never received it" disputes. The page exists, but it does not reassure.`,
    reasoning_slots: { severity },
  })];
}

function inferSupportLateInJourney(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('support_late_in_journey');
  if (!sig) return [];

  return [createInference({
    inference_key: 'support_reassurance_too_late',
    category: InferenceCategory.SupportLateInJourney,
    conclusion: 'support_reassurance_too_late',
    conclusion_value: 'medium',
    severity_hint: 'medium',
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Support and help pages exist on the site but are not accessible from the commercial journey (checkout, pricing, cart). Buyers who hesitate — with questions about sizing, shipping, returns, or product fit — have no reassurance pathway available at the moment of decision. They must leave the purchase flow to find help, and most will not return.`,
    reasoning_slots: { severity: 'medium' },
  })];
}

function inferHiddenReassuranceRoutes(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('hidden_reassurance_routes');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'reassurance_routes_disconnected',
    category: InferenceCategory.HiddenReassuranceRoutes,
    conclusion: 'reassurance_routes_disconnected',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Help, FAQ, confirmation, or warranty pages were discovered but have no navigation links from the main commercial journey. These pages were built to reduce buyer anxiety — but buyers cannot find them. The investment in reassurance content is wasted because the content is disconnected from the path where anxiety occurs.`,
    reasoning_slots: { severity },
  })];
}

function inferAlternateFlowMeasurementGap(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('alternate_flow_measurement_gap');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'alternate_flows_unmeasured',
    category: InferenceCategory.AlternateFlowMeasurementGap,
    conclusion: 'alternate_flows_unmeasured',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Some commercial pages lack analytics coverage while others have it. Revenue flowing through the untracked paths cannot be attributed, measured, or optimized. The ad spend driving traffic to these paths is unaccountable — the business cannot tell whether these routes convert, leak, or waste budget.`,
    reasoning_slots: { severity },
  })];
}

function inferRuntimeReassuranceBreak(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('runtime_reassurance_broken');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'runtime_breaking_reassurance',
    category: InferenceCategory.RuntimeReassuranceBreak,
    conclusion: 'runtime_breaking_reassurance',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Support widgets, chat tools, or consent managers are failing at runtime on commercial pages. These are the reassurance mechanisms that convert hesitant buyers — live chat answers last-minute questions, consent tools enable tracking. When they fail, buyers lose their reassurance channel at the exact moment they need it most.`,
    reasoning_slots: { severity },
  })];
}

function inferProviderPathWeak(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('provider_path_weaker_than_expected');
  if (!sig) return [];

  const severity = sig.value === 'high' ? 'high' : 'medium';

  return [createInference({
    inference_key: 'checkout_provider_path_weak',
    category: InferenceCategory.ProviderPathWeak,
    conclusion: 'checkout_provider_path_weak',
    conclusion_value: severity,
    severity_hint: severity,
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `The checkout redirects buyers to an external domain, but no recognized payment provider (Stripe, PayPal, etc.) was detected on the destination. Combined with thin policy coverage, this creates a payment handoff that looks weaker than what buyers expect. Legitimate payment flows typically display recognized provider branding — this one does not.`,
    reasoning_slots: { severity },
  })];
}

function inferTrustMeasurementCompoundBreak(
  byKey: Map<string, Signal>,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  const sig = byKey.get('alternate_flow_trust_measurement_compound');
  if (!sig) return [];

  return [createInference({
    inference_key: 'trust_and_measurement_both_absent',
    category: InferenceCategory.TrustMeasurementCompoundBreak,
    conclusion: 'trust_and_measurement_both_absent',
    conclusion_value: 'high',
    severity_hint: 'high',
    confidence: sig.confidence,
    scoping, cycle_ref, ids,
    signal_refs: [makeRef('signal', sig.id)],
    evidence_refs: sig.evidence_refs,
    reasoning: `Multiple commercial paths operate without both trust infrastructure (policies, business identity) and measurement coverage (analytics, tracking). This is the worst compound scenario: revenue cannot convert well because trust is thin, and the business cannot see the problem because measurement is absent. Optimization is impossible on paths where both the experience and the visibility are broken.`,
    reasoning_slots: { severity: 'high' },
  })];
}

export function computeEvidenceDerivedPack(input: PackInput): Inference[] {
  const { byKey, signals, first, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];

  // Phase 30: New inference rules from existing evidence
  out.push(...inferCriticalPathBroken(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferFormDataLeavesDomain(first, byKey, scoping, cycle_ref, ids));
  out.push(...inferProviderFragmentation(first, byKey, signals, scoping, cycle_ref, ids));

  // Phase 30B: Extended inference rules
  out.push(...inferRedirectTrustErosion(byKey, scoping, cycle_ref, ids));
  out.push(...inferLanguageDiscontinuity(byKey, scoping, cycle_ref, ids));
  out.push(...inferOrphanCommercialPage(byKey, scoping, cycle_ref, ids));
  out.push(...inferUntrustedEmbed(byKey, scoping, cycle_ref, ids));
  out.push(...inferPlatformCheckoutRisk(byKey, scoping, cycle_ref, ids));
  out.push(...inferPostPurchaseGap(byKey, first, scoping, cycle_ref, ids));
  out.push(...inferCommercialMeasurementBlind(first, byKey, scoping, cycle_ref, ids));

  // Phase 2: Inference rules from deepened collection
  out.push(...inferThinPolicyContent(byKey, scoping, cycle_ref, ids));
  out.push(...inferHiddenSupportWidget(byKey, scoping, cycle_ref, ids));
  out.push(...inferTrustSignalsThin(byKey, scoping, cycle_ref, ids));
  out.push(...inferTrackingStackIncomplete(byKey, scoping, cycle_ref, ids));
  out.push(...inferConsentMeasurementConflict(byKey, scoping, cycle_ref, ids));

  // Phase 2B: Mobile & runtime inference rules
  out.push(...inferMobilePathBlocked(byKey, scoping, cycle_ref, ids));
  out.push(...inferMobileTrustDegraded(byKey, scoping, cycle_ref, ids));
  out.push(...inferRuntimePurchaseInterruption(byKey, scoping, cycle_ref, ids));
  out.push(...inferRuntimeMeasurementBreak(byKey, scoping, cycle_ref, ids));
  out.push(...inferSecondaryFlowBypassing(byKey, scoping, cycle_ref, ids));

  // Phase 2C: Composite inference rules
  out.push(...inferRefundProcessUnclear(byKey, scoping, cycle_ref, ids));
  out.push(...inferPostPurchaseProofWeak(byKey, scoping, cycle_ref, ids));
  out.push(...inferSupportLateInJourney(byKey, scoping, cycle_ref, ids));
  out.push(...inferHiddenReassuranceRoutes(byKey, scoping, cycle_ref, ids));
  out.push(...inferAlternateFlowMeasurementGap(byKey, scoping, cycle_ref, ids));
  out.push(...inferRuntimeReassuranceBreak(byKey, scoping, cycle_ref, ids));
  out.push(...inferProviderPathWeak(byKey, scoping, cycle_ref, ids));
  out.push(...inferTrustMeasurementCompoundBreak(byKey, scoping, cycle_ref, ids));

  return out;
}
