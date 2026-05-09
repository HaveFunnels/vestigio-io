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

export interface LeadState {
	domain: string;
	ownershipConfirmed: boolean;
	businessModel: BusinessType;
	conversionModel: ConversionModel;
	monthlyRevenue: number;
	averageTicket: number;
	email: string;
}

// Infer conversion model from business type — fewer questions for the user
const DEFAULT_CONVERSION: Record<BusinessType, ConversionModel> = {
	ecommerce: "checkout",
	lead_gen: "form",
	saas: "checkout",
	hybrid: "checkout",
};

// Default ticket by business type — avoids asking
const DEFAULT_TICKET: Record<BusinessType, number> = {
	ecommerce: 250,
	lead_gen: 500,
	saas: 300,
	hybrid: 350,
};

// Frontend screens → backend step mapping (v3 — 3 screens)
//   Screen 1 (domain)        → Backend step 1
//   Screen 2 (business_type) → batched with inferred conversion_model into backend step 2
//   Screen 3 (email)         → submits revenue+ticket as backend step 3, then email as step 4
type ScreenId = "domain" | "business_type" | "email";
const SCREENS: ScreenId[] = ["domain", "business_type", "email"];
const TOTAL_SCREENS = SCREENS.length;

function backendStepForScreen(screen: ScreenId): number | null {
	switch (screen) {
		case "domain": return 1;
		case "business_type": return 2; // submits businessModel + inferred conversionModel
		case "email": return null; // handled specially — submits steps 3 + 4 + fires audit
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
	const [form, setForm] = useState<LeadState>({
		domain: "",
		ownershipConfirmed: true, // no longer gated by checkbox
		businessModel: "ecommerce",
		conversionModel: "checkout",
		monthlyRevenue: 100000,
		averageTicket: 250,
		email: "",
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
			version: 2,
			formToken,
			behavioral: buildBehavioralPayload(),
			website: honeypot,
			domain: form.domain,
			ownershipConfirmed: form.ownershipConfirmed,
			businessModel: form.businessModel,
			conversionModel: form.conversionModel,
			monthlyRevenue: String(form.monthlyRevenue),
			averageTicket: String(form.averageTicket),
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

		// Determine if this screen needs a backend submission
		const backendStep = backendStepForScreen(currentScreen);

		if (backendStep !== null) {
			const ok = await submitToBackend(backendStep);
			if (!ok) {
				setSubmitting(false);
				inFlightRef.current = false;
				return;
			}
		}

		// Last screen (email): submit revenue+ticket (step 3), email (step 4), then fire audit
		if (currentScreen === "email") {
			const step3ok = await submitToBackend(3);
			if (!step3ok) { setSubmitting(false); inFlightRef.current = false; return; }
			const step4ok = await submitToBackend(4);
			if (!step4ok) { setSubmitting(false); inFlightRef.current = false; return; }
			const ok = await fireAudit();
			if (ok) {
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
	}, [currentScreen, checkDomainReachability, submitToBackend, fireAudit, leadId, router]);

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
