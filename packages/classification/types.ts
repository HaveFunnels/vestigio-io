// ──────────────────────────────────────────────
// Classification Types
//
// Probabilistic business classification.
// NEVER binary — always multiple coexisting hypotheses.
// Onboarding = prior, evidence = posterior.
// ──────────────────────────────────────────────

/** 0 → 1 confidence score */
export type ConfidenceScore = number;

export interface BusinessModelHypothesis {
  saas: ConfidenceScore;
  ecommerce: ConfidenceScore;
  leadgen: ConfidenceScore;
  services: ConfidenceScore;
  content: ConfidenceScore;
}

export interface ConversionSurfaceHypothesis {
  checkout: ConfidenceScore;
  form: ConfidenceScore;
  whatsapp: ConfidenceScore;
  chat: ConfidenceScore;
  booking: ConfidenceScore;
  login: ConfidenceScore;
}

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface ClassificationState {
  business_model: BusinessModelHypothesis;
  conversion_surfaces: ConversionSurfaceHypothesis;
  confidence_level: ConfidenceLevel;
  ambiguity: boolean;
  primary_model: string;
  primary_surface: string;
}

export interface ClassificationInput {
  /** From onboarding — treated as prior, not truth */
  onboarding_business_model: string | null;
  onboarding_conversion_model: string | null;
  /** Structural signals from evidence */
  has_login_form: boolean;
  has_checkout: boolean;
  has_external_checkout: boolean;
  has_payment_forms: boolean;
  has_contact_forms: boolean;
  has_whatsapp_links: boolean;
  has_booking_widget: boolean;
  has_chat_widget: boolean;
  has_pricing_page: boolean;
  has_trial_signup: boolean;
  /** Evidence-derived counts */
  form_count: number;
  external_script_count: number;
  provider_indicators: string[];
  platform_indicators: string[];
}
