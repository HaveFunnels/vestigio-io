// ──────────────────────────────────────────────
// Shared form field type definitions.
//
// These types are referenced by both /onboard and /lp/audit so the two
// funnels stay in lockstep. If a field's domain changes (e.g. new
// business model added), edit it here and both forms pick it up.
// ──────────────────────────────────────────────

export type BusinessType = "ecommerce" | "lead_gen" | "saas" | "hybrid";
export type ConversionModel = "checkout" | "whatsapp" | "form" | "external";

export interface BusinessTypeOption {
	value: BusinessType;
	label: string;
	description: string;
}

export const BUSINESS_TYPE_OPTIONS: BusinessTypeOption[] = [
	{ value: "ecommerce", label: "Ecommerce", description: "Direct online sales" },
	{ value: "lead_gen", label: "Lead Gen", description: "Lead capture and nurture" },
	{ value: "saas", label: "SaaS", description: "Subscription software" },
	{ value: "hybrid", label: "Hybrid", description: "Mixed business model" },
];

export interface ConversionModelOption {
	value: ConversionModel;
	label: string;
}

export const CONVERSION_MODEL_OPTIONS: ConversionModelOption[] = [
	{ value: "checkout", label: "Checkout (on-site purchase)" },
	{ value: "whatsapp", label: "WhatsApp / Messaging" },
	{ value: "form", label: "Form Submission" },
	{ value: "external", label: "External Redirect" },
];

// ──────────────────────────────────────────────
// Revenue parser — accepts "$50k", "50000", "1.5m", "R$ 200k" etc.
// Returns null on unparseable input. Used by both onboard and /lp/audit
// to normalize the optional monthly revenue field into a number.
// ──────────────────────────────────────────────
export function parseRevenue(value: string): number | null {
	if (!value) return null;
	const cleaned = value.replace(/[^0-9.]/g, "");
	const num = parseFloat(cleaned);
	if (isNaN(num)) return null;
	if (value.toLowerCase().includes("k")) return num * 1000;
	if (value.toLowerCase().includes("m")) return num * 1_000_000;
	return num;
}

// ──────────────────────────────────────────────
// Phone validator — accepts E.164 with optional formatting.
// ──────────────────────────────────────────────
export function isValidPhone(p: string): boolean {
	if (!p) return true; // empty is valid (field is optional)
	const cleaned = p.replace(/[\s\-()]/g, "");
	return /^\+?[1-9]\d{6,14}$/.test(cleaned);
}

// ──────────────────────────────────────────────
// Domain format validator (regex only — no DNS check here).
// DNS reachability is verified by /api/validate-domain.
// ──────────────────────────────────────────────
const DOMAIN_REGEX = /^(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+)(?:\/.*)?$/;

export function isValidDomainFormat(input: string): boolean {
	return DOMAIN_REGEX.test(input.trim());
}
