"use client";

/**
 * useOnboardingForm — extracted state + API logic for the onboarding flow.
 *
 * The page.tsx is a thin orchestrator that renders StepShell + step
 * components. All business logic lives here.
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";

declare global {
	interface Window {
		Paddle: any;
	}
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type BusinessType = "ecommerce" | "lead_gen" | "saas" | "hybrid";
export type ConversionModel = "checkout" | "whatsapp" | "form" | "external";
export type IndustryVertical = "fashion" | "food" | "health" | "electronics" | "education" | "services" | "home_garden" | "other";
export type StepId = "org" | "domain" | "business_type" | "industry" | "conversion_model" | "revenue" | "ticket" | "plan";

export interface OnboardState {
	organizationName: string;
	domain: string;
	ownershipConfirmed: boolean;
	businessType: BusinessType;
	industryVertical: IndustryVertical | "";
	monthlyRevenue: number;
	averageTicket: number;
	conversionModel: ConversionModel;
}

export interface Plan {
	key: string;
	name: string;
	price: string;
	paddlePriceId: string;
	features: string[];
	recommended: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const DOMAIN_REGEX =
	/^(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+)(?:\/.*)?$/;

function isValidDomainFormat(input: string): boolean {
	return DOMAIN_REGEX.test(input.trim());
}

async function validateDomainReachability(
	domain: string,
): Promise<{ ok: boolean; error?: string }> {
	const normalized = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
	try {
		const res = await fetch(
			`/api/validate-domain?domain=${encodeURIComponent(normalized)}`,
		);
		return await res.json();
	} catch {
		return { ok: true };
	}
}

export function parseRevenue(value: string): number | null {
	const cleaned = value.replace(/[^0-9.]/g, "");
	const num = parseFloat(cleaned);
	if (isNaN(num)) return null;
	if (value.toLowerCase().includes("k")) return num * 1000;
	if (value.toLowerCase().includes("m")) return num * 1000000;
	return num;
}

// ---------------------------------------------------------------------------
// Step sequence
// ---------------------------------------------------------------------------
// SaaS and Hybrid skip conversion_model — they have multiple conversion
// mechanisms by nature (checkout + form + external). Ecommerce and Lead Gen
// benefit from specifying their primary conversion path.
const SKIP_CONVERSION_MODEL = new Set(["saas", "hybrid"]);
// Industry vertical is relevant for ecommerce and lead_gen (not SaaS/hybrid
// where industry is implied or too diverse to categorize simply).
const SHOW_INDUSTRY = new Set(["ecommerce", "lead_gen"]);

function getSteps(hasActiveOrg: boolean, businessType?: string): StepId[] {
	const includeConversion = !SKIP_CONVERSION_MODEL.has(businessType || "");
	const includeIndustry = SHOW_INDUSTRY.has(businessType || "");
	if (hasActiveOrg) {
		const steps: StepId[] = ["domain", "business_type"];
		if (includeIndustry) steps.push("industry");
		if (includeConversion) steps.push("conversion_model");
		steps.push("revenue", "ticket");
		return steps;
	}
	const steps: StepId[] = ["org", "domain", "business_type"];
	if (includeIndustry) steps.push("industry");
	if (includeConversion) steps.push("conversion_model");
	steps.push("revenue", "ticket", "plan");
	return steps;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
const DRAFT_KEY = "vestigio_onboard_draft";

export default function useOnboardingForm() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { data: session, update: updateSession } = useSession();
	const t = useTranslations("console.onboard");
	const paymentSuccess = searchParams.get("payment_success") === "true";

	// ── Admin-provisioned detection ──
	const hasActiveOrg = (session?.user as any)?.hasOrganization === true;

	// Steps computed after form state (below) — needs form.businessType

	// ── Saved draft ──
	const savedDraft = useMemo(() => {
		if (typeof window === "undefined") return null;
		try {
			const raw = sessionStorage.getItem(DRAFT_KEY);
			return raw ? JSON.parse(raw) : null;
		} catch {
			return null;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// ── Domain prefill from MiniCalc ──
	const prefillDomain = useMemo(() => {
		if (typeof window === "undefined") return "";
		try {
			const saved = localStorage.getItem("vestigio_onboard_domain");
			if (saved) {
				localStorage.removeItem("vestigio_onboard_domain");
				return saved;
			}
		} catch {}
		return "";
	}, []);

	// ── Form state ──
	const defaultForm: OnboardState = {
		organizationName: "",
		domain: prefillDomain,
		ownershipConfirmed: false,
		businessType: "ecommerce",
		industryVertical: "",
		monthlyRevenue: 100000,
		averageTicket: 300,
		conversionModel: "checkout",
	};

	const [form, setForm] = useState<OnboardState>(() => ({
		...defaultForm,
		...(savedDraft?.form ?? {}),
		...(prefillDomain ? { domain: prefillDomain } : {}),
	}));

	// ── Steps (dynamic based on business type — SaaS/Hybrid skip conversion model) ──
	const steps = useMemo(() => getSteps(hasActiveOrg, form.businessType), [hasActiveOrg, form.businessType]);
	const totalSteps = steps.length;

	const [stepIndex, setStepIndex] = useState(savedDraft?.stepIndex ?? 0);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [activating, setActivating] = useState(paymentSuccess);

	// Domain validation
	const [domainError, setDomainError] = useState<string | null>(null);
	const [domainChecking, setDomainChecking] = useState(false);
	const [domainWarning, setDomainWarning] = useState<string | null>(null);

	// ── Prefill from existing lead/profile data ──
	// If the user was promoted from a lead (promoteLeadToOrg), their
	// BusinessProfile + Environment already exist. Fetch and prefill
	// the form so they don't re-enter data. Skip to last step if complete.
	const [prefillLoaded, setPrefillLoaded] = useState(false);
	useEffect(() => {
		if (prefillLoaded) return;
		async function loadPrefill() {
			try {
				const res = await fetch("/api/onboard/prefill");
				if (!res.ok) return;
				const { prefill } = await res.json();
				if (!prefill) return;

				const updates: Partial<OnboardState> = {};
				if (prefill.domain) updates.domain = prefill.domain;
				if (prefill.businessModel) updates.businessType = prefill.businessModel;
				if (prefill.conversionModel) updates.conversionModel = prefill.conversionModel;
				if (prefill.monthlyRevenue) updates.monthlyRevenue = prefill.monthlyRevenue;
				if (prefill.averageOrderValue) updates.averageTicket = prefill.averageOrderValue;

				// BUG-12 fix: If environment is ALREADY activated, the user is
				// stuck here due to a stale JWT (hasActivatedEnv=false in token).
				// Force session refresh and redirect to the app.
				if (prefill.activated) {
					await updateSession();
					router.replace("/app");
					return;
				}

				if (Object.keys(updates).length > 0) {
					setForm((prev) => ({ ...prev, ...updates }));

					// If all key data exists, skip to the last step (activate)
					if (prefill.domain && prefill.businessModel && prefill.monthlyRevenue) {
						const lastIdx = steps.length - 1;
						setStepIndex(lastIdx);
					}
				}
			} catch {
				// Non-fatal — proceed without prefill
			} finally {
				setPrefillLoaded(true);
			}
		}
		loadPrefill();
	}, [prefillLoaded, steps.length]);

	// Plans
	const defaultPlans = useMemo<Plan[]>(
		() =>
			(["vestigio", "pro", "max"] as const).map((key) => ({
				key,
				name: t(`plan.plans.${key}.name`),
				price: t(`plan.plans.${key}.price`),
				paddlePriceId: "",
				features: t.raw(`plan.plans.${key}.features`) as string[],
				recommended: key === "pro",
			})),
		[t],
	);
	const [plans, setPlans] = useState<Plan[]>(defaultPlans);
	const [selectedPlan, setSelectedPlan] = useState<Plan>(
		defaultPlans.find((p) => p.recommended) || defaultPlans[0],
	);

	// Fetch plans from API
	useEffect(() => {
		async function fetchPlans() {
			try {
				const res = await fetch("/api/pricing");
				if (!res.ok) return;
				const data = await res.json();
				if (data.plans && data.plans.length > 0) {
					const mapped: Plan[] = data.plans.map((p: any, idx: number) => ({
						key: p.key,
						name: t.has(`plan.plans.${p.key}.name`)
							? t(`plan.plans.${p.key}.name`)
							: p.label,
						price: `$${Math.round(p.monthlyPriceCents / 100)}`,
						paddlePriceId: p.paddlePriceId || "",
						features: [
							p.maxEnvironments === 1
								? t("plan.features.domain_singular")
								: t("plan.features.domain_plural", { count: p.maxEnvironments }),
							idx === 0
								? t("plan.features.agentic_insights")
								: idx === 1
									? t("plan.features.agentic_insights_5x")
									: t("plan.features.agentic_insights_20x"),
							...(p.continuousAudits
								? [t("plan.features.continuous_audits")]
								: [t("plan.features.full_analysis")]),
							...(p.creditsEnabled ? [t("plan.features.credits_system")] : []),
							...(p.key === "max" ? [t("plan.features.priority_support")] : []),
							...(p.key === "vestigio"
								? [t("plan.features.impact_quantification")]
								: []),
							...(p.key === "pro" ? [t("plan.features.root_cause_maps")] : []),
						],
						recommended: p.key === "pro",
					}));
					setPlans(mapped);
					const recommended = mapped.find((p) => p.recommended);
					setSelectedPlan(recommended || mapped[0]);
				}
			} catch {
				// Keep default plans
			}
		}
		fetchPlans();
	}, [t]);

	// ── Redirect if already onboarded ──
	useEffect(() => {
		if ((session?.user as any)?.hasOrganization === true) {
			const envActivated = (session?.user as any)?.hasActivatedEnv === true;
			fetch("/api/usage")
				.then((r) => (r.ok ? r.json() : null))
				.then((data) => {
					if (!paymentSuccess && data?.domain && envActivated) {
						try {
							sessionStorage.removeItem(DRAFT_KEY);
						} catch {}
						router.replace("/app/findings");
					}
				})
				.catch(() => {});
		}
	}, [session, paymentSuccess, router]);

	// ── Payment success polling ──
	useEffect(() => {
		if (!paymentSuccess) return;
		setActivating(true);
		let attempts = 0;
		const interval = setInterval(async () => {
			attempts++;
			await updateSession();
			if (attempts >= 30) {
				clearInterval(interval);
				setActivating(false);
				setError(t("errors.activation_delayed"));
			}
		}, 2000);
		return () => clearInterval(interval);
	}, [paymentSuccess, t, updateSession]);

	// React to session change after polling
	useEffect(() => {
		if (paymentSuccess && (session?.user as any)?.hasOrganization === true) {
			setActivating(false);
			try {
				sessionStorage.removeItem(DRAFT_KEY);
			} catch {}
			const orgId = searchParams.get("org") || "";
			router.replace(
				`/app/onboarding/thank-you${orgId ? `?org=${encodeURIComponent(orgId)}` : ""}`,
			);
		}
	}, [session, paymentSuccess, router, searchParams]);

	// ── Persist draft ──
	useEffect(() => {
		try {
			sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ form, stepIndex }));
		} catch {}
	}, [form, stepIndex]);

	// ── Current step ──
	const currentStep = steps[stepIndex] || steps[0];
	const isFinalStep = stepIndex === totalSteps - 1;

	// ── Update helper ──
	const update = useCallback(
		<K extends keyof OnboardState>(key: K, value: OnboardState[K]) => {
			setForm((f) => ({ ...f, [key]: value }));
		},
		[],
	);

	// ── Navigation ──
	const next = useCallback(async () => {
		// Domain step validation
		if (currentStep === "domain") {
			setDomainError(null);
			setDomainWarning(null);

			if (!isValidDomainFormat(form.domain)) {
				setDomainError(t("domain.validation_error"));
				return;
			}

			setDomainChecking(true);
			const result = await validateDomainReachability(form.domain);
			setDomainChecking(false);

			if (!result.ok) {
				setDomainWarning(result.error || t("domain.warning_unreachable"));
			}
		}

		setStepIndex((s: number) => Math.min(s + 1, totalSteps - 1));
	}, [currentStep, form.domain, t, totalSteps]);

	const prev = useCallback(() => {
		setStepIndex((s: number) => Math.max(s - 1, 0));
	}, []);

	// ── Activation ──
	const handleActivate = useCallback(async () => {
		// Client-side validation before attempting API call
		if (!form.domain?.trim()) {
			setError(t("errors.domain_required"));
			return;
		}
		if (!form.businessType) {
			setError(t("errors.business_type_required"));
			return;
		}

		setLoading(true);
		setError(null);

		if (hasActiveOrg) {
			// Admin-provisioned: direct activate
			try {
				const response = await fetch("/api/environments/activate", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						domain: form.domain,
						businessModel: form.businessType,
						conversionModel: form.conversionModel,
						monthlyRevenue: form.monthlyRevenue,
						averageOrderValue: form.averageTicket || null,
						targetIndustry: form.industryVertical || null,
					}),
				});

				const data = await response.json();

				if (!response.ok) {
					setError(data.message || t("errors.something_wrong"));
					return;
				}

				await updateSession();
				try {
					sessionStorage.removeItem(DRAFT_KEY);
				} catch {}
				const target = data.redirectTo || "/app/inventory";
				const cycleQuery = data.cycle?.id
					? `?cycle=${encodeURIComponent(data.cycle.id)}`
					: "";
				router.replace(`${target}${cycleQuery}`);
			} catch {
				setError(t("errors.network_error"));
			} finally {
				setLoading(false);
			}
			return;
		}

		// Self-serve: create org + open Paddle
		try {
			const response = await fetch("/api/onboard", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					organizationName: form.organizationName,
					domain: form.domain,
					businessModel: form.businessType,
					monthlyRevenue: form.monthlyRevenue,
					averageOrderValue: form.averageTicket,
					conversionModel: form.conversionModel,
					priceId: selectedPlan.paddlePriceId,
					paymentProvider: "paddle",
				}),
			});

			const data = await response.json();

			if (!response.ok) {
				setError(data.message || t("errors.something_wrong"));
				return;
			}

			const orgId = data.organizationId;

			if (!window.Paddle) {
				setError(t("errors.payment_loading"));
				return;
			}

			window.Paddle.Checkout.open({
				items: [{ priceId: selectedPlan.paddlePriceId, quantity: 1 }],
				customData: {
					userId: (session?.user as any)?.id || "",
					organizationId: orgId,
					onboarding: "true",
				},
				successUrl: `${window.location.origin}/app/onboarding?payment_success=true&org=${orgId}`,
				settings: { displayMode: "overlay" },
			});
		} catch {
			setError(t("errors.network_error"));
		} finally {
			setLoading(false);
		}
	}, [hasActiveOrg, form, selectedPlan, session, t, updateSession, router]);

	// ── Can advance? ──
	const canAdvance =
		(currentStep === "org" && form.organizationName.length > 0) ||
		(currentStep === "domain" &&
			form.domain.length > 0 &&
			form.ownershipConfirmed &&
			!domainChecking) ||
		currentStep === "business_type" ||
		currentStep === "conversion_model" ||
		currentStep === "revenue" ||
		currentStep === "ticket";

	return {
		// State
		form,
		update,
		stepIndex,
		totalSteps,
		currentStep,
		steps,
		isFinalStep,
		hasActiveOrg,
		canAdvance,
		// Navigation
		next,
		prev,
		// Domain
		domainError,
		domainChecking,
		domainWarning,
		setDomainError,
		setDomainWarning,
		// Plans
		plans,
		selectedPlan,
		setSelectedPlan,
		// Activation
		handleActivate,
		loading,
		error,
		activating,
		// i18n
		t,
	};
}
