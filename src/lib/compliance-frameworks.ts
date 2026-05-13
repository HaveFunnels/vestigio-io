/**
 * compliance-frameworks — Catalog of compliance requirements for
 * Wave 11.4a "Compliance Gap Analyzer".
 *
 * Each framework has 5-7 requirements that the system can evaluate
 * from existing data (cybersecurity findings + tech-stack detection).
 * We do NOT pretend to be a legal compliance audit — we surface the
 * mechanical gaps the platform can detect, and explicitly label
 * non-detectable requirements so the user knows what still needs
 * human review.
 *
 * Requirements use a small DSL of `check` shapes so the catalog
 * stays data-like and easy to extend.
 */

import type { FindingProjection } from "../../packages/projections/types";
import type {
	TechnologyCategory,
	TechnologyStackProjection,
} from "../../packages/technology-registry/types";

export type RequirementCheck =
	// PASS when there is NO negative finding for this inference_key
	| { type: "no_negative_for_inference"; key: string }
	// PASS when there is a positive finding for this inference_key
	| { type: "positive_finding_for_inference"; key: string }
	// PASS when any technology in the given category is detected
	| { type: "tech_category_detected"; category: TechnologyCategory }
	// PASS when any of the specific technology keys is detected
	| { type: "tech_key_detected_any"; keys: string[] };

export interface ComplianceRequirement {
	/** Stable id used for i18n key under
	 *  `console.workspaces.detail.compliance.requirements.<id>` */
	id: string;
	check: RequirementCheck;
}

export interface ComplianceFramework {
	/** Slug, also the i18n suffix under `compliance.frameworks` */
	id: "lgpd" | "gdpr" | "pci_dss" | "soc2";
	requirements: ComplianceRequirement[];
}

// PCI-DSS Level 1 payment providers (no card data ever touches the
// merchant servers when used in their hosted-fields/redirect modes).
const PCI_LEVEL_1_PROVIDERS = [
	"stripe",
	"adyen",
	"braintree",
	"paypal",
	"square",
	"mercadopago",
	"checkout_com",
	"worldpay",
];

export const COMPLIANCE_FRAMEWORKS: ComplianceFramework[] = [
	{
		id: "lgpd",
		requirements: [
			{ id: "consent_manager", check: { type: "tech_category_detected", category: "consent_manager" } },
			{ id: "https_everywhere", check: { type: "no_negative_for_inference", key: "https_everywhere" } },
			{ id: "tls_current", check: { type: "no_negative_for_inference", key: "tls_version_outdated" } },
			{ id: "cookie_security", check: { type: "no_negative_for_inference", key: "cookie_security_gap" } },
			{ id: "no_info_disclosure", check: { type: "no_negative_for_inference", key: "error_info_disclosure" } },
		],
	},
	{
		id: "gdpr",
		requirements: [
			{ id: "consent_manager", check: { type: "tech_category_detected", category: "consent_manager" } },
			{ id: "https_everywhere", check: { type: "no_negative_for_inference", key: "https_everywhere" } },
			{ id: "tls_current", check: { type: "no_negative_for_inference", key: "tls_version_outdated" } },
			{ id: "cookie_security", check: { type: "no_negative_for_inference", key: "cookie_security_gap" } },
			{ id: "no_predictable_urls", check: { type: "no_negative_for_inference", key: "predictable_urls" } },
			{ id: "no_info_disclosure", check: { type: "no_negative_for_inference", key: "error_info_disclosure" } },
		],
	},
	{
		id: "pci_dss",
		requirements: [
			{ id: "pci_certified_psp", check: { type: "tech_key_detected_any", keys: PCI_LEVEL_1_PROVIDERS } },
			{ id: "https_everywhere", check: { type: "no_negative_for_inference", key: "https_everywhere" } },
			{ id: "tls_current", check: { type: "no_negative_for_inference", key: "tls_version_outdated" } },
			{ id: "csp_present", check: { type: "no_negative_for_inference", key: "csp_missing" } },
			{ id: "no_mixed_content", check: { type: "no_negative_for_inference", key: "mixed_content_detected" } },
			{ id: "no_clickjack", check: { type: "no_negative_for_inference", key: "clickjack_protection" } },
		],
	},
	{
		id: "soc2",
		requirements: [
			{ id: "error_tracking", check: { type: "tech_category_detected", category: "error_tracking" } },
			{ id: "csp_present", check: { type: "no_negative_for_inference", key: "csp_missing" } },
			{ id: "hsts_present", check: { type: "no_negative_for_inference", key: "hsts_configured" } },
			{ id: "cookie_security", check: { type: "no_negative_for_inference", key: "cookie_security_gap" } },
			{ id: "no_info_disclosure", check: { type: "no_negative_for_inference", key: "error_info_disclosure" } },
			{ id: "rate_limiting", check: { type: "no_negative_for_inference", key: "rate_limiting_absent" } },
		],
	},
];

export interface RequirementResult {
	id: string;
	passed: boolean;
}

export interface FrameworkResult {
	id: ComplianceFramework["id"];
	passed: number;
	total: number;
	readinessPct: number;
	requirements: RequirementResult[];
}

export function evaluateRequirement(
	req: ComplianceRequirement,
	findings: FindingProjection[],
	stack: TechnologyStackProjection | null,
): boolean {
	const check = req.check;
	if (check.type === "no_negative_for_inference") {
		// PASS unless there's a negative finding matching this inference_key.
		return !findings.some(
			(f) => f.inference_key === check.key && f.polarity === "negative",
		);
	}
	if (check.type === "positive_finding_for_inference") {
		return findings.some(
			(f) => f.inference_key === check.key && f.polarity === "positive",
		);
	}
	if (check.type === "tech_category_detected") {
		if (!stack) return false;
		return (stack.by_category[check.category]?.length ?? 0) > 0;
	}
	if (check.type === "tech_key_detected_any") {
		if (!stack) return false;
		return stack.technologies.some((t) => check.keys.includes(t.key));
	}
	return false;
}

export function evaluateFramework(
	framework: ComplianceFramework,
	findings: FindingProjection[],
	stack: TechnologyStackProjection | null,
): FrameworkResult {
	const requirements = framework.requirements.map((req) => ({
		id: req.id,
		passed: evaluateRequirement(req, findings, stack),
	}));
	const passed = requirements.filter((r) => r.passed).length;
	const total = requirements.length;
	return {
		id: framework.id,
		passed,
		total,
		readinessPct: total === 0 ? 0 : Math.round((passed / total) * 100),
		requirements,
	};
}
