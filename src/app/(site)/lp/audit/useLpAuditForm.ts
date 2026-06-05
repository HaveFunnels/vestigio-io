"use client";

/**
 * useLpAuditForm — extracted state + API + anti-bot logic for the
 * LP audit lead form.
 *
 * Preserves all 5 defense layers (token, header, honeypot, dwell
 * time, behavioral score) while the page.tsx handles rendering.
 *
 * V2 step mapping:
 *   Screen 1 (domain)      → Backend step 1
 *   Screen 2 (business)    → batched with screen 3 into backend step 2
 *   Screen 3 (conversion)  → batched with screen 2 into backend step 2
 *   Screen 4 (revenue)     → Backend step 3
 *   Screen 5 (email)       → Backend step 4
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type BusinessType = "ecommerce" | "lead_gen" | "saas" | "hybrid";
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
}

// Infer conversion model from business type — fewer questions for the user
const DEFAULT_CONVERSION: Record<BusinessType, ConversionModel> = {
	ecommerce: "checkout",
	lead_gen: "form",
	saas: "checkout",
	hybrid: "checkout",
};

// Default revenue per business_type — populates the slider so the
// visitor can keep moving with a sane number instead of starting at 0.
const DEFAULT_REVENUE: Record<BusinessType, number> = {
	ecommerce: 100000,
	lead_gen: 50000,
	saas: 80000,
	hybrid: 120000,
};

// Default ticket by business type — avoids asking
const DEFAULT_TICKET: Record<BusinessType, number> = {
	ecommerce: 250,
	lead_gen: 500,
	saas: 300,
	hybrid: 350,
};

// Frontend screens → backend step mapping (v3 — 7 screens).
//   Screen 1 (domain)         → Backend step 1
//   Screen 2 (business_type)  → Backend step 2 (conversionModel inferred client-side)
//   Screen 3 (revenue)        → Backend step 3
//   Screen 4 (concern)        → Backend step 4
//   Screen 5 (current_method) → Backend step 5
//   Screen 6 (why_now)        → Backend step 6
//   Screen 7 (email)          → Backend step 7 (terminal — fires audit)
type ScreenId =
	| "domain"
	| "business_type"
	| "revenue"
	| "concern"
	| "current_method"
	| "why_now"
	| "email";
const SCREENS: ScreenId[] = [
	"domain",
	"business_type",
	"revenue",
	"concern",
	"current_method",
	"why_now",
	"email",
];
const TOTAL_SCREENS = SCREENS.length;

function backendStepForScreen(screen: ScreenId): number {
	switch (screen) {
		case "domain": return 1;
		case "business_type": return 2;
		case "revenue": return 3;
		case "concern": return 4;
		case "current_method": return 5;
		case "why_now": return 6;
		case "email": return 7;
	}
}

// ---------------------------------------------------------------------------
// LocalStorage handoff — bridges the anon mini-audit and paid onboarding.
// The paid form reads the same keys; matching field names mean zero
// translation. Defensive try/catch — Safari private mode, full disk,
// blocked storage all return undefined and the form falls back to
// empty.
// ---------------------------------------------------------------------------
interface PrefillFromStorage {
	domain?: string;
	businessType?: BusinessType;
	revenue?: number;
	concern?: PrimaryConcern;
	currentMethod?: CurrentOptimizationMethod;
	whyNow?: WhyNow;
}

function readLocalStoragePrefill(): PrefillFromStorage {
	if (typeof window === "undefined") return {};
	try {
		const read = (key: string) => window.localStorage.getItem(key) || undefined;
		const businessType = read("vestigio_onboard_business_type") as BusinessType | undefined;
		const revenueRaw = read("vestigio_onboard_revenue");
		const revenue = revenueRaw ? Number(revenueRaw) : undefined;
		return {
			domain: read("vestigio_onboard_domain"),
			businessType: businessType && ["ecommerce", "lead_gen", "saas", "hybrid"].includes(businessType) ? businessType : undefined,
			revenue: revenue != null && Number.isFinite(revenue) && revenue > 0 ? revenue : undefined,
			concern: read("vestigio_onboard_concern") as PrimaryConcern | undefined,
			currentMethod: read("vestigio_onboard_current_method") as CurrentOptimizationMethod | undefined,
			whyNow: read("vestigio_onboard_why_now") as WhyNow | undefined,
		};
	} catch {
		return {};
	}
}

function writeLocalStorageHandoff(form: LeadState): void {
	if (typeof window === "undefined") return;
	try {
		const write = (key: string, value: string | number) => {
			window.localStorage.setItem(key, String(value));
		};
		write("vestigio_onboard_domain", form.domain);
		write("vestigio_onboard_business_type", form.businessModel);
		write("vestigio_onboard_revenue", form.monthlyRevenue);
		if (form.primaryConcern) write("vestigio_onboard_concern", form.primaryConcern);
		if (form.currentOptimizationMethod) write("vestigio_onboard_current_method", form.currentOptimizationMethod);
		if (form.whyNow) write("vestigio_onboard_why_now", form.whyNow);
	} catch {
		// best effort
	}
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export default function useLpAuditForm() {
	const router = useRouter();

	// ── Lead session ──
	const [leadId, setLeadId] = useState<string | null>(null);
	const [formToken, setFormToken] = useState<string | null>(null);

	// ── Step state ──
	const [stepIndex, setStepIndex] = useState(0);
	const [submitting, setSubmitting] = useState(false);
	// BUG-03 fix: useRef guard prevents double-submit race condition.
	// React state updates are async — two rapid clicks can both read
	// submitting=false before the first re-render sets it to true.
	const inFlightRef = useRef(false);
	const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
	const [globalError, setGlobalError] = useState<string | null>(null);

	// ── Domain ──
	const [domainWarning, setDomainWarning] = useState<string | null>(null);
	const [domainChecking, setDomainChecking] = useState(false);

	// ── Anti-bot: honeypot ──
	const [honeypot, setHoneypot] = useState("");

	// ── Anti-bot: behavioral signals ──
	const eventCountRef = useRef({ mousemove: 0, keydown: 0, focus: 0, scroll: 0 });

	// ── Form data ──
	// Wave-22.6 — prefill from localStorage handoff if MiniCalculator
	// stashed values, OR from a returning visitor's previous session.
	const [form, setForm] = useState<LeadState>(() => {
		const fromStorage = readLocalStoragePrefill();
		return {
			domain: fromStorage.domain ?? "",
			ownershipConfirmed: true, // no longer gated by checkbox
			businessModel: fromStorage.businessType ?? "ecommerce",
			conversionModel: DEFAULT_CONVERSION[fromStorage.businessType ?? "ecommerce"],
			monthlyRevenue: fromStorage.revenue ?? DEFAULT_REVENUE[fromStorage.businessType ?? "ecommerce"],
			averageTicket: DEFAULT_TICKET[fromStorage.businessType ?? "ecommerce"],
			primaryConcern: fromStorage.concern ?? "",
			currentOptimizationMethod: fromStorage.currentMethod ?? "",
			whyNow: fromStorage.whyNow ?? "",
			email: "",
		};
	});

	// ── Mount: start lead session + register event listeners ──
	useEffect(() => {
		let cancelled = false;

		fetch("/api/lead/start", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		})
			.then((r) => r.json())
			.then((data) => {
				if (cancelled) return;
				if (data.leadId && data.formToken) {
					setLeadId(data.leadId);
					setFormToken(data.formToken);
				} else {
					setGlobalError(data.message || "Não foi possível iniciar o diagnóstico. Atualize a página.");
				}
			})
			.catch(() => {
				if (!cancelled) setGlobalError("Erro de conexão. Verifique sua internet e atualize a página.");
			});

		const inc = (key: keyof typeof eventCountRef.current) => () => {
			eventCountRef.current[key]++;
		};
		const onMouse = inc("mousemove");
		const onKey = inc("keydown");
		const onFocus = inc("focus");
		const onScroll = inc("scroll");

		window.addEventListener("mousemove", onMouse, { passive: true });
		window.addEventListener("keydown", onKey, { passive: true });
		window.addEventListener("focusin", onFocus, { passive: true });
		window.addEventListener("scroll", onScroll, { passive: true });

		return () => {
			cancelled = true;
			window.removeEventListener("mousemove", onMouse);
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("focusin", onFocus);
			window.removeEventListener("scroll", onScroll);
		};
	}, []);

	// ── Helpers ──
	const update = useCallback(<K extends keyof LeadState>(key: K, value: LeadState[K]) => {
		setForm((f) => {
			const next = { ...f, [key]: value };
			// Auto-infer conversion model and ticket from business type
			if (key === "businessModel") {
				const bt = value as BusinessType;
				next.conversionModel = DEFAULT_CONVERSION[bt];
				next.averageTicket = DEFAULT_TICKET[bt];
			}
			return next;
		});
		if (fieldError && fieldError.field === key) setFieldError(null);
	}, [fieldError]);

	function buildBehavioralPayload() {
		const c = eventCountRef.current;
		return {
			eventCount: c.mousemove + c.keydown + c.focus + c.scroll,
			hasFormSessionHeader: true,
			hasMouseEvents: c.mousemove > 0,
			hasKeyboardEvents: c.keydown > 0,
		};
	}

	// ── Domain reachability check (warning only) ──
	const checkDomainReachability = useCallback(async () => {
		if (!form.domain) return;
		setDomainChecking(true);
		setDomainWarning(null);
		try {
			const res = await fetch(
				`/api/validate-domain?domain=${encodeURIComponent(form.domain)}`,
			);
			const data = await res.json();
			if (!data.ok) setDomainWarning(data.error || null);
		} catch {
			// Best-effort
		}
		setDomainChecking(false);
	}, [form.domain]);

	// ── Submit step to backend ──
	const submitToBackend = useCallback(async (backendStep: number): Promise<boolean> => {
		if (!leadId || !formToken) {
			// Dev mode without DB: skip backend validation, allow UI navigation
			if (process.env.NODE_ENV === "development") return true;
			setGlobalError("Formulário ainda carregando. Aguarde um momento.");
			return false;
		}

		const payload = {
			version: 3,
			formToken,
			behavioral: buildBehavioralPayload(),
			website: honeypot,
			domain: form.domain,
			ownershipConfirmed: form.ownershipConfirmed,
			businessModel: form.businessModel,
			conversionModel: form.conversionModel,
			monthlyRevenue: String(form.monthlyRevenue),
			averageTicket: String(form.averageTicket),
			primaryConcern: form.primaryConcern || undefined,
			currentOptimizationMethod: form.currentOptimizationMethod || undefined,
			whyNow: form.whyNow || undefined,
			email: form.email,
		};

		try {
			const res = await fetch(`/api/lead/${leadId}/step/${backendStep}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					"X-Vestigio-Form-Session": formToken,
				},
				body: JSON.stringify(payload),
			});
			const data = await res.json();

			if (!res.ok) {
				if (data.field) {
					setFieldError({ field: data.field, message: data.message || "Invalid input" });
				} else {
					setGlobalError(data.message || "Envio falhou. Tente novamente.");
				}
				return false;
			}
			return true;
		} catch {
			setGlobalError("Erro de conexão. Tente novamente.");
			return false;
		}
	}, [leadId, formToken, honeypot, form]);

	// ── Fire audit + redirect ──
	const fireAudit = useCallback(async (): Promise<boolean> => {
		if (!leadId || !formToken) {
			// Dev mode without DB: can't fire audit, just log
			if (process.env.NODE_ENV === "development") {
				console.log("[dev] Would fire audit here. Form data:", form);
				return false;
			}
			return false;
		}
		try {
			const res = await fetch(`/api/lead/${leadId}/run-audit`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Vestigio-Form-Session": formToken,
				},
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				setGlobalError(err.message || "Couldn't start the audit. Please try again.");
				return false;
			}
			return true;
		} catch {
			setGlobalError("Erro de conexão. Tente novamente.");
			return false;
		}
	}, [leadId, formToken]);

	// ── Advance to next screen ──
	const currentScreen = SCREENS[stepIndex];

	const next = useCallback(async () => {
		// BUG-03: Synchronous ref guard — prevents concurrent invocations
		if (inFlightRef.current) return;
		inFlightRef.current = true;
		setSubmitting(true);
		setFieldError(null);
		setGlobalError(null);

		// Domain DNS check on domain screen
		if (currentScreen === "domain") {
			await checkDomainReachability();
		}

		// Every screen in v3 corresponds 1:1 to a backend step.
		const backendStep = backendStepForScreen(currentScreen);
		const ok = await submitToBackend(backendStep);
		if (!ok) {
			setSubmitting(false);
			inFlightRef.current = false;
			return;
		}

		// Email is the terminal step — fire audit and persist the
		// JTBD answers to localStorage so the paid onboarding form
		// can prefill them and skip 5 of its 7 steps.
		if (currentScreen === "email") {
			writeLocalStorageHandoff(form);
			const fired = await fireAudit();
			if (fired) {
				router.push(`/lp/audit/result/${leadId}`);
			} else {
				setSubmitting(false);
				inFlightRef.current = false;
			}
			return;
		}

		// Advance
		setStepIndex((s) => Math.min(s + 1, TOTAL_SCREENS - 1));
		setSubmitting(false);
		inFlightRef.current = false;
	}, [currentScreen, checkDomainReachability, submitToBackend, fireAudit, leadId, router, form]);

	const prev = useCallback(() => {
		setFieldError(null);
		setGlobalError(null);
		setStepIndex((s) => Math.max(0, s - 1));
	}, []);

	return {
		// Form
		form,
		update,
		// Navigation
		stepIndex,
		totalSteps: TOTAL_SCREENS,
		currentScreen,
		next,
		prev,
		submitting,
		// Domain
		domainWarning,
		domainChecking,
		setDomainWarning,
		// Errors
		fieldError,
		globalError,
		// Anti-bot
		honeypot,
		setHoneypot,
		// Session
		leadId,
	};
}
