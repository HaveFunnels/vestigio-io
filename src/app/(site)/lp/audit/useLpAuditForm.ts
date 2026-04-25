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
	monthlyRevenue: string;
	email: string;
}

// Frontend screens → backend step mapping (v2)
// Screens 2+3 (business type + conversion model) are batched into one
// backend step, submitted when the user completes screen 3.
type ScreenId = "domain" | "business_type" | "conversion_model" | "revenue" | "email";
const SCREENS: ScreenId[] = ["domain", "business_type", "conversion_model", "revenue", "email"];
const TOTAL_SCREENS = SCREENS.length;

// Which backend step to submit after each screen
function backendStepForScreen(screen: ScreenId): number | null {
	switch (screen) {
		case "domain": return 1;
		case "business_type": return null; // batched — submitted with conversion_model
		case "conversion_model": return 2; // submits both businessModel + conversionModel
		case "revenue": return 3;
		case "email": return 4;
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
		ownershipConfirmed: false,
		businessModel: "ecommerce",
		conversionModel: "checkout",
		monthlyRevenue: "",
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
		setForm((f) => ({ ...f, [key]: value }));
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
			monthlyRevenue: form.monthlyRevenue,
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
		if (!leadId || !formToken) return false;
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
				return;
			}
		}

		// If this is the last screen (email), fire the audit
		if (currentScreen === "email") {
			const ok = await fireAudit();
			if (ok) {
				router.push(`/lp/audit/result/${leadId}`);
			} else {
				setSubmitting(false);
			}
			return;
		}

		// Advance
		setStepIndex((s) => Math.min(s + 1, TOTAL_SCREENS - 1));
		setSubmitting(false);
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
