// Shared types for the LP audit funnel.
// Lifted out of `useLpAuditForm.ts` to break the import cycle
//   interstitial-registry ←→ useLpAuditForm ←→ types/interstitial
// — both consumers now reach for these via a pure-type module that
// doesn't pull the hook's runtime graph.

export type BusinessType =
	| "ecommerce"
	| "lead_gen"
	| "saas"
	| "services"
	| "app_conversion"
	| "enterprise"
	| "hybrid";

export type ConversionModel = "checkout" | "whatsapp" | "form" | "external";

// Wave-22.6 mini-audit JTBD — same IDs as BusinessProfile so the
// localStorage handoff into the paid onboarding form is 1:1.
export type PrimaryConcern =
	| "traffic_no_sales"
	| "low_conversion"
	| "unknown_leak"
	| "scale_efficiency"
	| "prioritization";

export type CurrentOptimizationMethod =
	| "analytics_tools"
	| "session_replay"
	| "agency_consultant"
	| "team_judgment"
	| "spreadsheets"
	| "nothing";

export type WhyNow =
	| "scaling_paid_traffic"
	| "recent_drop"
	| "prove_roi"
	| "competitive_pressure"
	| "chronic_pain"
	| "exploring";

// Services-only sub-segmentation. The categories are written for the
// BR SMB market — each one a recognizable professional segment with
// distinct funnel + trust patterns (e.g. healthcare needs CRO/ANVISA
// signals, legal needs OAB, accounting needs CRC). Used downstream to
// gate which services-vertical findings fire per visitor.
export type ServiceCategory =
	| "health"           // dentista, médico, fisioterapeuta, psicólogo, clínica
	| "legal"            // advogado, escritório de advocacia
	| "accounting"       // contador, escritório contábil
	| "software_house"   // desenvolvimento sob demanda, TI especializada
	| "marketing_agency" // agência, growth, social media
	| "consulting"       // consultoria de negócios, estratégia, RH
	| "security"         // vigilância patrimonial, segurança eletrônica
	| "other";

// App-conversion sub-segmentation. Each platform combination has its
// own optimization surface: iOS needs Smart App Banner, Android needs
// App Links, both-platform funnels have to make the platform choice
// invisible to the visitor. Detectors gate on this.
export type AppPlatform =
	| "ios_only"
	| "android_only"
	| "both";

// Enterprise sub-segmentation. Each vertical has distinct compliance,
// trust, and procurement signals that drive enterprise-finding
// firing. Audience here is CTO/Head of Growth/CISO — technical copy
// is appropriate and expected.
export type EnterpriseSegment =
	| "fintech"        // bank, payments, lending, insurance-tech
	| "insurance"      // seguradora, prev privada, planos
	| "retail_chain"   // varejo nacional, e-commerce de escala
	| "industrial"     // indústria, manufatura, logística
	| "healthcare"     // operadora de saúde, redes hospitalares
	| "telecom"        // telecom, ISP
	| "other_enterprise";

export interface LeadState {
	domain: string;
	ownershipConfirmed: boolean;
	businessModel: BusinessType;
	conversionModel: ConversionModel;
	monthlyRevenue: number;
	averageTicket: number;
	primaryConcern: PrimaryConcern | "";
	currentOptimizationMethod: CurrentOptimizationMethod | "";
	whyNow: WhyNow | "";
	email: string;
	/** Only populated when businessModel === "services". Empty otherwise. */
	serviceCategory: ServiceCategory | "";
	/** Only populated when businessModel === "app_conversion". Empty otherwise. */
	appPlatform: AppPlatform | "";
	/** Only populated when businessModel === "enterprise". Empty otherwise. */
	enterpriseSegment: EnterpriseSegment | "";
}
