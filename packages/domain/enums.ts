// ──────────────────────────────────────────────
// Canonical enums — single source of truth
// ──────────────────────────────────────────────

export enum EffectiveSeverity {
  None = 'none',
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

export enum DecisionImpact {
  Observe = 'observe',
  Optimize = 'optimize',
  FixBeforeScale = 'fix_before_scale',
  BlockLaunch = 'block_launch',
  Incident = 'incident',
}

export enum DecisionStatus {
  Created = 'created',
  Confirmed = 'confirmed',
  Stale = 'stale',
  Resolved = 'resolved',
  Regressed = 'regressed',
}

export enum DecisionClass {
  Risk = 'risk',
  Gate = 'gate',
  Opportunity = 'opportunity',
  State = 'state',
}

export enum FreshnessState {
  Fresh = 'fresh',
  Stale = 'stale',
  Expired = 'expired',
  Unknown = 'unknown',
}

export enum CycleType {
  Full = 'full',
  Incremental = 'incremental',
  Verification = 'verification',
}

export enum BusinessModel {
  Ecommerce = 'ecommerce',
  LeadGen = 'lead_gen',
  SaaS = 'saas',
  Hybrid = 'hybrid',
}

export enum CheckoutMode {
  Hosted = 'hosted',
  Embedded = 'embedded',
  Redirect = 'redirect',
  Native = 'native',
}

export enum ImpactType {
  RevenueUplift = 'revenue_uplift',
  ChargebackReduction = 'chargeback_reduction',
  ChurnReduction = 'churn_reduction',
  ConversionUplift = 'trust_conversion_uplift',
  TrafficWasteAvoidance = 'traffic_waste_avoidance',
}

export enum BasisType {
  Heuristic = 'heuristic',
  Mixed = 'mixed',
  DataDriven = 'data_driven',
}

export enum IncidentStatus {
  Opened = 'opened',
  Acknowledged = 'acknowledged',
  Mitigated = 'mitigated',
  Verified = 'verified',
  Closed = 'closed',
}

export enum OpportunityStatus {
  Identified = 'identified',
  Sized = 'sized',
  Accepted = 'accepted',
  Implemented = 'implemented',
  Verified = 'verified',
  Archived = 'archived',
}

export enum PreflightOverallStatus {
  Ready = 'ready',
  ReadyWithRisks = 'ready_with_risks',
  Blocker = 'blocker',
  NA = 'na',
}

export enum PreflightVersionStatus {
  Ready = 'ready',
  Stale = 'stale',
  Unavailable = 'unavailable',
}

export enum VerificationType {
  ReuseOnly = 'reuse_only',
  LightProbe = 'light_probe',
  BrowserVerification = 'browser_verification',
  IntegrationPull = 'integration_pull',
  AuthenticatedJourneyVerification = 'authenticated_journey_verification',
  /**
   * Dispatch a heavy external scanner (Katana deep discovery, Nuclei
   * vuln scan, brand-intelligence lookup). Used for findings whose
   * detection depends on external scan coverage. Minutes, not seconds.
   */
  ExternalScan = 'external_scan',
}

export enum EvidenceType {
  HttpResponse = 'http_response',
  PageContent = 'page_content',
  Redirect = 'redirect',
  Script = 'script',
  Form = 'form',
  Link = 'link',
  Iframe = 'iframe',
  Stylesheet = 'stylesheet',
  Meta = 'meta',
  Certificate = 'certificate',
  DnsRecord = 'dns_record',
  PolicyPage = 'policy_page',
  CheckoutIndicator = 'checkout_indicator',
  ProviderIndicator = 'provider_indicator',
  PlatformIndicator = 'platform_indicator',
  BehavioralEvent = 'behavioral_event',
  IntegrationSnapshot = 'integration_snapshot',
  BrowserNavigationTrace = 'browser_navigation_trace',
  BrowserCheckoutConfirmation = 'browser_checkout_confirmation',
  BrowserFailureEvent = 'browser_failure_event',
  BrowserRedirectChain = 'browser_redirect_chain',
  AuthenticatedSessionAttempt = 'authenticated_session_attempt',
  AuthenticationBlockedEvent = 'authentication_blocked_event',
  PrerequisiteMissingEvent = 'prerequisite_missing_event',
  // SaaS Intelligence (authenticated)
  AuthenticatedPageView = 'authenticated_page_view',
  ActivationStepObserved = 'activation_step_observed',
  EmptyStateObserved = 'empty_state_observed',
  UpgradeSurfaceObserved = 'upgrade_surface_observed',
  FeatureUsageSurface = 'feature_usage_surface',
  NavigationStructureObserved = 'navigation_structure_observed',
  // Phase 2: Deepened collection
  InlineScriptContent = 'inline_script_content',
  StructuredDataItem = 'structured_data_item',
  TechnologyDetected = 'technology_detected',
  // Phase 2B: Mobile & runtime
  MobileVerificationResult = 'mobile_verification_result',
  ClassifiedRuntimeErrors = 'classified_runtime_errors',
  // Phase 3A: Nuclei-derived evidence
  NucleiMatch = 'nuclei_match',
  // Phase 3B: Katana deep discovery evidence
  KatanaDiscovery = 'katana_discovery',
  // Phase 2D: Network analysis evidence
  NetworkAnalysis = 'network_analysis',
  // Phase 3E: Brand impersonation evidence
  BrandImpersonationMatch = 'brand_impersonation_match',
  // Phase 4A: Shopify integration evidence
  ShopifyStoreMetrics = 'shopify_store_metrics',
  // Phase 4B: Behavioral intelligence evidence
  BehavioralSession = 'behavioral_session',
  SurfaceVitality = 'surface_vitality',
  // Wave 3.1: LLM enrichment evidence
  ContentEnrichment = 'content_enrichment',
}

export enum SourceKind {
  Crawl = 'crawl',
  HttpFetch = 'http_fetch',
  Pixel = 'pixel',
  Heartbeat = 'heartbeat',
  Integration = 'integration',
  BrowserVerification = 'browser_verification',
  Manual = 'manual',
  NucleiScan = 'nuclei_scan',
  KatanaCrawl = 'katana_crawl',
  BrandIntelScan = 'brand_intel_scan',
  ShopifyIntegration = 'shopify_integration',
  BehavioralSnippet = 'behavioral_snippet',
}

export enum CollectionMethod {
  StaticFetch = 'static_fetch',
  DynamicRender = 'dynamic_render',
  ApiCall = 'api_call',
  PassiveCollection = 'passive_collection',
  ManualInput = 'manual_input',
  ExternalToolScan = 'external_tool_scan',
  // Wave 5 Fase 3 — evidence rows cloned from the previous completed
  // cycle's evidence when the new cycle didn't re-crawl the page (hot/
  // warm allow-lists exclude non-critical pages). Downstream quality
  // scoring + signal extraction treat these the same as the original
  // collection, but the marker lets operators see at a glance which
  // rows came from carry-forward when debugging cycle output.
  CarriedForward = 'carried_forward',
}

export enum PageType {
  Homepage = 'homepage',
  Landing = 'landing',
  Product = 'product',
  Category = 'category',
  Cart = 'cart',
  Checkout = 'checkout',
  Login = 'login',
  Account = 'account',
  Contact = 'contact',
  Support = 'support',
  Policy = 'policy',
  Blog = 'blog',
  About = 'about',
  Pricing = 'pricing',
  ThankYou = 'thank_you',
  Unknown = 'unknown',
}

export enum PageTier {
  Critical = 'critical',
  Important = 'important',
  Standard = 'standard',
  Low = 'low',
}

export enum SubjectType {
  Workspace = 'workspace',
  Environment = 'environment',
  Website = 'website',
  Host = 'host',
  Page = 'page',
  Journey = 'journey',
  CheckoutPath = 'checkout_path',
  PreflightProfile = 'preflight_profile',
}

export enum SignalCategory {
  Checkout = 'checkout',
  Policy = 'policy',
  Trust = 'trust',
  Measurement = 'measurement',
  Journey = 'journey',
  Platform = 'platform',
  Operational = 'operational',
  Revenue = 'revenue',
  Friction = 'friction',
  Clarity = 'clarity',
  Support = 'support',
  Expectation = 'expectation',
  // SaaS-specific
  Activation = 'activation',
  Onboarding = 'onboarding',
  Upgrade = 'upgrade',
  ProductUx = 'product_ux',
  // Phase 3E
  Discoverability = 'discoverability',
  BrandIntegrity = 'brand_integrity',
  // Phase 4B
  Behavioral = 'behavioral',
  // Wave 3.3: Security posture
  Security = 'security',
  // Phase 4A: Commerce context
  Commerce = 'commerce',
}

export enum InferenceCategory {
  CommerceContext = 'commerce_context',
  TrustBoundary = 'trust_boundary',
  PolicyGap = 'policy_gap',
  RevenuePath = 'revenue_path',
  MeasurementCoverage = 'measurement_coverage',
  CheckoutIntegrity = 'checkout_integrity',
  ConversionFlow = 'conversion_flow',
  FrictionPath = 'friction_path',
  RevenueLeakage = 'revenue_leakage',
  TrustRevenue = 'trust_revenue',
  MeasurementBlindspot = 'measurement_blindspot',
  ConversionClarity = 'conversion_clarity',
  RefundPolicyRisk = 'refund_policy_risk',
  SupportAccessibility = 'support_accessibility',
  ExpectationAlignment = 'expectation_alignment',
  DisputeRisk = 'dispute_risk',
  // SaaS-specific
  ActivationBlocked = 'activation_blocked',
  ActivationFriction = 'activation_friction',
  UnclearNextStep = 'unclear_next_step',
  EmptyStateNoGuidance = 'empty_state_no_guidance',
  NavigationOvercomplex = 'navigation_overcomplex',
  FeatureDiscoveryPoor = 'feature_discovery_poor',
  UpgradeInvisible = 'upgrade_invisible',
  UpgradeTimingWrong = 'upgrade_timing_wrong',
  NoExpansionPath = 'no_expansion_path',
  LandingAppMismatch = 'landing_app_mismatch',
  // Phase 30: New finding categories
  CriticalPathBroken = 'critical_path_broken',
  ProviderFragmentation = 'provider_fragmentation',
  DataBoundaryRisk = 'data_boundary_risk',
  // Phase 30B: Extended finding categories
  RedirectTrustErosion = 'redirect_trust_erosion',
  LanguageDiscontinuity = 'language_discontinuity',
  OrphanCommercialPage = 'orphan_commercial_page',
  CommercialMeasurementBlind = 'commercial_measurement_blind',
  UntrustedEmbed = 'untrusted_embed',
  PostPurchaseGap = 'post_purchase_gap',
  PlatformCheckoutRisk = 'platform_checkout_risk',
  // Phase 2: Collection deepening findings
  ThinPolicyContent = 'thin_policy_content',
  HiddenSupportWidget = 'hidden_support_widget',
  TrustSignalsThin = 'trust_signals_thin',
  TrackingStackIncomplete = 'tracking_stack_incomplete',
  ConsentMeasurementConflict = 'consent_measurement_conflict',
  MobileCheckoutDegraded = 'mobile_checkout_degraded',
  // Phase 2B: Mobile & runtime findings
  MobilePathBlocked = 'mobile_path_blocked',
  MobileTrustDegraded = 'mobile_trust_degraded',
  RuntimePurchaseInterruption = 'runtime_purchase_interruption',
  RuntimeMeasurementBreak = 'runtime_measurement_break',
  SecondaryFlowBypassing = 'secondary_flow_bypassing',
  // Phase 2C: Composite findings
  RefundProcessUnclear = 'refund_process_unclear',
  PostPurchaseProofWeak = 'post_purchase_proof_weak',
  SupportLateInJourney = 'support_late_in_journey',
  HiddenReassuranceRoutes = 'hidden_reassurance_routes',
  AlternateFlowMeasurementGap = 'alternate_flow_measurement_gap',
  RuntimeReassuranceBreak = 'runtime_reassurance_break',
  ProviderPathWeak = 'provider_path_weak',
  TrustMeasurementCompoundBreak = 'trust_measurement_compound_break',
  // Phase 3A: Channel integrity / abuse exposure
  PaymentSurfaceScriptExposure = 'payment_surface_script_exposure',
  ChannelHijackExposure = 'channel_hijack_exposure',
  CommerceContinuityThreat = 'commerce_continuity_threat',
  LowTrustTechnicalPosture = 'low_trust_technical_posture',
  ChannelCompromisePattern = 'channel_compromise_pattern',
  AbuseExposureConditions = 'abuse_exposure_conditions',
  CheckoutInfrastructureBrittle = 'checkout_infrastructure_brittle',
  EconomicExploitationExposure = 'economic_exploitation_exposure',
  // Phase 3B: Katana deep discovery findings
  PromotionLogicExposed = 'promotion_logic_exposed',
  CartVariantWeakControl = 'cart_variant_weak_control',
  HiddenDiscountRefundRoute = 'hidden_discount_refund_route',
  GuessableBusinessEndpoint = 'guessable_business_endpoint',
  AlternatePricingSafeguardBypass = 'alternate_pricing_safeguard_bypass',
  JsDiscoveredPurchaseVariant = 'js_discovered_purchase_variant',
  DynamicRouteWeakControl = 'dynamic_route_weak_control',
  HiddenSupportBurden = 'hidden_support_burden',
  AlternateVariantControlBreakdown = 'alternate_variant_control_breakdown',
  DeepCommerceExploitationRisk = 'deep_commerce_exploitation_risk',
  // Phase 2D: Network analysis findings
  CheckoutApiLatencyDegraded = 'checkout_api_latency_degraded',
  CommercialPagesSlow = 'commercial_pages_slow',
  PaidLandingOverloaded = 'paid_landing_overloaded',
  ThirdPartyWeightDelaysTrust = 'third_party_weight_delays_trust',
  CheckoutBrittleThirdParty = 'checkout_brittle_third_party',
  PurchaseBlockedFailingRequests = 'purchase_blocked_failing_requests',
  MeasurementBreaksRevenuePath = 'measurement_breaks_revenue_path',
  PurchaseBeforeDepsReady = 'purchase_before_deps_ready',
  TrustAssetsLateLoad = 'trust_assets_late_load',
  MobileHeavyRuntimeChain = 'mobile_heavy_runtime_chain',
  MobileTrustPaymentDepsFailing = 'mobile_trust_payment_deps_failing',
  TrustSurfacesUnstableDeps = 'trust_surfaces_unstable_deps',
  // Phase 3E: Discoverability findings
  CommercialPagesWeakSearchRepresentation = 'commercial_pages_weak_search_representation',
  SocialPreviewsFailCommercialValue = 'social_previews_fail_commercial_value',
  BrandInconsistentAcrossSurfaces = 'brand_inconsistent_across_surfaces',
  CommercialPagesUnlikelyIndexed = 'commercial_pages_unlikely_indexed',
  WeakSemanticIntentSignals = 'weak_semantic_intent_signals',
  PreviewsDisconnectedFromConversion = 'previews_disconnected_from_conversion',
  CommercialPagesNotExposedForDiscovery = 'commercial_pages_not_exposed_for_discovery',
  // Phase 3E: Brand integrity findings
  LookalikeDomainCompetingForTraffic = 'lookalike_domain_competing_for_traffic',
  ExternalSitesMimickingBrand = 'external_sites_mimicking_brand',
  BrandTrafficExposedToDeceptiveSurfaces = 'brand_traffic_exposed_to_deceptive_surfaces',
  SuspiciousDomainsCapturingPurchaseIntent = 'suspicious_domains_capturing_purchase_intent',
  CustomersExposedToPhishingSurfaces = 'customers_exposed_to_phishing_surfaces',
  BrandPresenceDilutedAcrossVariants = 'brand_presence_diluted_across_variants',
  // Phase 4B: Behavioral intelligence findings
  PolicyViewThenAbandonment = 'policy_view_then_abandonment',
  HighIntentDetourBeforeAbandonment = 'high_intent_detour_before_abandonment',
  SupportDiscoveredTooLateToConvert = 'support_discovered_too_late_to_convert',
  CtaVisibleButBehaviorallyDead = 'cta_visible_but_behaviorally_dead',
  PurchaseHesitationWithBacktrack = 'purchase_hesitation_with_backtrack',
  CriticalStepRetriesBeforeAbandonment = 'critical_step_retries_before_abandonment',
  MobileFailsFirstCommercialAction = 'mobile_fails_first_commercial_action',
  FunnelStepAliveButNotAdvancing = 'funnel_step_alive_but_not_advancing',
  // Phase 4B Hardening: 12 new behavioral findings
  HesitationBeforeConversionMissingTrust = 'hesitation_before_conversion_missing_trust',
  PricingHesitationUnclearValue = 'pricing_hesitation_unclear_value',
  PolicyDetourBeforeConversion = 'policy_detour_before_conversion',
  CtaViewedNotEngaged = 'cta_viewed_not_engaged',
  SensitiveInputAbandonment = 'sensitive_input_abandonment',
  FormExcessiveFieldsBeforeConversion = 'form_excessive_fields_before_conversion',
  FormSubmissionRetryFriction = 'form_submission_retry_friction',
  SurfaceOscillationBeforeDropoff = 'surface_oscillation_before_dropoff',
  ConversionFinalStepRetry = 'conversion_final_step_retry',
  CtaLateAvailabilityDelaysAction = 'cta_late_availability_delays_action',
  CheckoutAbandonNoFeedback = 'checkout_abandon_no_feedback',
  SensitiveInputPerceivedRiskDropoff = 'sensitive_input_perceived_risk_dropoff',
  // Behavioral workspace findings (pixel-dependent)
  // First Impression Revenue
  FirstSessionMilestoneStall = 'first_session_milestone_stall',
  FirstSessionTrustBarrier = 'first_session_trust_barrier',
  FirstSessionCtaTimingGap = 'first_session_cta_timing_gap',
  // Action Value Map
  LowValueActionDominates = 'low_value_action_dominates',
  HighValueActionUnderexposed = 'high_value_action_underexposed',
  DeadWeightSurfaceTraffic = 'dead_weight_surface_traffic',
  // Acquisition Integrity
  PaidTrafficFrictionElevated = 'paid_traffic_friction_elevated',
  PaidTrafficTrustGap = 'paid_traffic_trust_gap',
  PaidMobileCompoundingWaste = 'paid_mobile_compounding_waste',
  // Mobile Revenue Exposure
  MobileConversionGap = 'mobile_conversion_gap',
  MobileFormFrictionElevated = 'mobile_form_friction_elevated',
  MobileCtaTimingDegraded = 'mobile_cta_timing_degraded',
  // Friction Tax
  FunnelStepFrictionCost = 'funnel_step_friction_cost',
  OscillationDecisionCost = 'oscillation_decision_cost',
  CheckoutEntryFriction = 'checkout_entry_friction',
  // Trust Revenue Gap
  TrustDeficitConversionDrag = 'trust_deficit_conversion_drag',
  ReassuranceSeekingElevated = 'reassurance_seeking_elevated',
  SensitiveInputTrustGap = 'sensitive_input_trust_gap',
  // Path to Purchase Efficiency
  PathLengthExceedsEfficient = 'path_length_exceeds_efficient',
  IntentAbsorberDetected = 'intent_absorber_detected',
  IntentDecayTimeExcessive = 'intent_decay_time_excessive',
  // Wave 3.3: Security posture
  SecurityHeaderWeakness = 'security_header_weakness',
  MixedContentExposure = 'mixed_content_exposure',
  OpenRedirectIndicator = 'open_redirect_indicator',
  SensitiveEndpointExposed = 'sensitive_endpoint_exposed',
  // Wave 3.3 expansion: cybersecurity pack
  CheckoutScriptHijackRisk = 'checkout_script_hijack_risk',
  BuyerSessionTheftRisk = 'buyer_session_theft_risk',
  CheckoutClickjackRisk = 'checkout_clickjack_risk',
  PaymentDataUnencrypted = 'payment_data_unencrypted',
  ErrorPageInformationLeak = 'error_page_information_leak',
  EmailDeliverabilityRisk = 'email_deliverability_risk',
  CorsMisconfigurationRisk = 'cors_misconfiguration_risk',
  RateLimitingAbsent = 'rate_limiting_absent_on_commerce',
  PredictableOrderUrls = 'predictable_order_urls',
  // Tier 1 Copy Analysis
  CheckoutTrustLanguageAbsent = 'checkout_trust_language_absent',
  CtaClarityWeak = 'cta_clarity_weak',
  ProductPageCopyGeneric = 'product_page_copy_generic',
  PricingPageFramingUnclear = 'pricing_page_framing_unclear',
  // Tier 2 LLM enrichment findings
  SocialProofGeneric = 'social_proof_generic',
  FormErrorMessagesUnhelpful = 'form_error_messages_unhelpful',
  OnboardingNoQuickWin = 'onboarding_no_quick_win',
  // Wave 3.10 Copy Analysis Pack
  ValuePropositionBuried = 'value_proposition_buried',
  SocialProofIneffective = 'social_proof_ineffective',
  ObjectionUnaddressed = 'objection_unaddressed',
  UrgencyDarkPattern = 'urgency_dark_pattern',
  OnboardingCopyWeak = 'onboarding_copy_weak',
  NavigationConfusing = 'navigation_confusing',
  AboveFoldCluttered = 'above_fold_cluttered',
  CopyCrossPageInconsistent = 'copy_cross_page_inconsistent',
  // Wave 3.10 Fase 4 — Polish enrichments
  LocalizationPersuasionLost = 'localization_persuasion_lost',
  MicroCopyFrictionHigh = 'micro_copy_friction_high',
  SeoConversionConflict = 'seo_conversion_conflict',
  CopyStaleReferences = 'copy_stale_references',
  // Phase 4A: Commerce context findings (Shopify-powered)
  CheckoutAbandonmentRevenueLeak = 'checkout_abandonment_revenue_leak',
  PromotedProductOutOfStock = 'promoted_product_out_of_stock',
  HighRefundRateErodingRevenue = 'high_refund_rate_eroding_revenue',
  SinglePaymentGatewayRisk = 'single_payment_gateway_risk',
  DiscountAbusePattern = 'discount_abuse_pattern',
  AdSpendPlatformConcentrationRisk = 'ad_spend_platform_concentration_risk',
  AdsWithoutConversionVisibility = 'ads_without_conversion_visibility',
  AdCreativeDeadDestination = 'ad_creative_dead_destination',
  AdCreativeLandingTrustGap = 'ad_creative_landing_trust_gap',
  AdCreativeFormFrictionWaste = 'ad_creative_form_friction_waste',
  AdCreativeMobileCheckoutDegraded = 'ad_creative_mobile_checkout_degraded',
  AdCreativeMessageMismatch = 'ad_creative_message_mismatch',
  LowRepeatPurchaseRate = 'low_repeat_purchase_rate',
  DeadWeightProducts = 'dead_weight_products',
}
