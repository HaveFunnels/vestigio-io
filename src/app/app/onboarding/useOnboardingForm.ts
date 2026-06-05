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
// Wave-22.6 onboarding redesign — JTBD discovery embedded in the
// form. Stable IDs; new entries can be appended without breaking
// persisted rows. Used downstream to (a) re-rank findings, (b)
// inject MCP context, (c) personalize the Monthly Strategy Plan
// narrative.
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
export type StepId =
	| "org"
	| "domain"
	| "business_type"
	| "concern"
	| "current_method"
	| "why_now"
	| "industry"
	| "conversion_model"
	| "revenue"
	| "ticket"
	| "plan";

export interface OnboardState {
	organizationName: string;
	domain: string;
	ownershipConfirmed: boolean;
	businessType: BusinessType;
	primaryConcern: PrimaryConcern | "";
	currentOptimizationMethod: CurrentOptimizationMethod | "";
	whyNow: WhyNow | "";
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

function getSteps(hasActiveOrg: boolean, _businessType?: string): StepId[] {
	// Wave-22.6 onboarding redesign — 6-step minimum (7 with plan
	// for self-serve). Earlier versions ran 11 steps and felt like an
	// interrogation by the time the user reached "ticket". The cuts:
	//   - org           → auto-derived from domain at submit time
	//   - industry      → deferred to Settings (also inferable from crawl)
	//   - conversion_model → inferred from the crawl, ask later if needed
	//   - ticket        → deferred to Settings; not load-bearing for
	//                     the first audit's impact estimates
	//
	// JTBD trio (concern → current_method → why_now) is grouped
	// in a single "wave" so the user feels like they had ONE
	// conversation, not three pop-ups. Mirrors only fire at the end
	// of each natural phase, not after every question.
	const JTBD_STEPS: StepId[] = ["concern", "current_method", "why_now"];
	const coreSteps: StepId[] = ["domain", "business_type", ...JTBD_STEPS, "revenue"];
	return hasActiveOrg ? coreSteps : [...coreSteps, "plan"];
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

	// ── MiniCalc handoff prefills ──
	// The homepage MiniCalculator captures domain + revenue + business type.
	// Before this fix only `domain` survived the signup hop, so visitors
	// had to re-type the other two. All three are now stashed in
	// localStorage at CTA click and consumed (then cleared) here.
	const prefill = useMemo<{
		domain: string;
		revenue: number | null;
		businessType: BusinessType | null;
		primaryConcern: PrimaryConcern | null;
		currentOptimizationMethod: CurrentOptimizationMethod | null;
		whyNow: WhyNow | null;
	}>(() => {
		if (typeof window === "undefined") {
			return {
				domain: "",
				revenue: null,
				businessType: null,
				primaryConcern: null,
				currentOptimizationMethod: null,
				whyNow: null,
			};
		}
		const read = (key: string): string => {
			try {
				const v = localStorage.getItem(key);
				if (v) localStorage.removeItem(key);
				return v ?? "";
			} catch {
				return "";
			}
		};
		const domain = read("vestigio_onboard_domain");
		const revenueRaw = read("vestigio_onboard_revenue");
		const businessTypeRaw = read("vestigio_onboard_business_type");
		const concernRaw = read("vestigio_onboard_concern");
		const currentMethodRaw = read("vestigio_onboard_current_method");
		const whyNowRaw = read("vestigio_onboard_why_now");
		const revenue = revenueRaw ? Number(revenueRaw) : null;
		// MiniCalc has six business types; onboarding accepts four. Map the
		// less-specific ones to the closest match so the prefill survives
		// without sneaking an invalid value past the form.
		const businessTypeMap: Record<string, BusinessType> = {
			ecommerce: "ecommerce",
			saas: "saas",
			services: "lead_gen",
			institutional: "lead_gen",
			app_download: "saas",
			blog: "lead_gen",
			lead_gen: "lead_gen",
			hybrid: "hybrid",
		};
		const businessType: BusinessType | null = businessTypeRaw
			? businessTypeMap[businessTypeRaw] ?? null
			: null;
		// Wave-22.6 — JTBD handoff from the LP audit form. Each value is
		// either a known ID (mirrored from BusinessProfile) or null.
		const VALID_CONCERN = new Set<PrimaryConcern>([
			"traffic_no_sales", "low_conversion", "unknown_leak",
			"scale_efficiency", "prioritization",
		]);
		const VALID_METHOD = new Set<CurrentOptimizationMethod>([
			"analytics_tools", "session_replay", "agency_consultant",
			"team_judgment", "spreadsheets", "nothing",
		]);
		const VALID_WHY = new Set<WhyNow>([
			"scaling_paid_traffic", "recent_drop", "prove_roi",
			"competitive_pressure", "chronic_pain", "exploring",
		]);
		return {
			domain,
			revenue: revenue != null && Number.isFinite(revenue) ? revenue : null,
			businessType,
			primaryConcern: VALID_CONCERN.has(concernRaw as PrimaryConcern) ? (concernRaw as PrimaryConcern) : null,
			currentOptimizationMethod: VALID_METHOD.has(currentMethodRaw as CurrentOptimizationMethod) ? (currentMethodRaw as CurrentOptimizationMethod) : null,
			whyNow: VALID_WHY.has(whyNowRaw as WhyNow) ? (whyNowRaw as WhyNow) : null,
		};
	}, []);

	const prefillDomain = prefill.domain;

	// ── Form state ──
	const defaultForm: OnboardState = {
		organizationName: "",
		domain: prefillDomain,
		ownershipConfirmed: false,
		businessType: prefill.businessType ?? "ecommerce",
		primaryConcern: prefill.primaryConcern ?? "",
		currentOptimizationMethod: prefill.currentOptimizationMethod ?? "",
		whyNow: prefill.whyNow ?? "",
		industryVertical: "",
		monthlyRevenue: prefill.revenue ?? 100000,
		averageTicket: 300,
		conversionModel: "checkout",
	};

	const [form, setForm] = useState<OnboardState>(() => ({
		...defaultForm,
		...(savedDraft?.form ?? {}),
		...(prefillDomain ? { domain: prefillDomain } : {}),
		// MiniCalc/LP audit handoff wins over the saved draft for any
		// freshly-captured field: the visitor just answered them seconds
		// ago, so that's the freshest signal.
		...(prefill.businessType ? { businessType: prefill.businessType } : {}),
		...(prefill.revenue != null ? { monthlyRevenue: prefill.revenue } : {}),
		...(prefill.primaryConcern ? { primaryConcern: prefill.primaryConcern } : {}),
		...(prefill.currentOptimizationMethod ? { currentOptimizationMethod: prefill.currentOptimizationMethod } : {}),
		...(prefill.whyNow ? { whyNow: prefill.whyNow } : {}),
	}));

	// ── Steps (dynamic based on business type — SaaS/Hybrid skip conversion model) ──
	const steps = useMemo(() => getSteps(hasActiveOrg, form.businessType), [hasActiveOrg, form.businessType]);
	const totalSteps = steps.length;

	const [stepIndex, setStepIndex] = useState(savedDraft?.stepIndex ?? 0);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [activating, setActivating] = useState(paymentSuccess);
	// Value-mirror state. When the user submits a step that has a
	// mirror, we set this to that step's id and render the
	// MirrorMoment interstitial instead of advancing. dismissMirror()
	// clears it AND advances to the next step.
	const [showMirrorFor, setShowMirrorFor] = useState<StepId | null>(null);

	// Domain validation
	const [domainError, setDomainError] = useState<string | null>(null);
	const [domainChecking, setDomainChecking] = useState(false);
	const [domainWarning, setDomainWarning] = useState<string | null>(null);

	// Wave 22 Fase B — new-env flow flag. Read once here so every gate
	// below (prefill, redirect, submit) can branch on it consistently.
	const isNewEnvFlow = searchParams.get("new_env") === "true";

	// ── Prefill from existing lead/profile data ──
	// If the user was promoted from a lead (promoteLeadToOrg), their
	// BusinessProfile + Environment already exist. Fetch and prefill
	// the form so they don't re-enter data. Skip to last step if complete.
	const [prefillLoaded, setPrefillLoaded] = useState(false);
	useEffect(() => {
		if (prefillLoaded) return;
		// Wave 22 Fase B — new-env flow already pre-filled the domain via
		// localStorage from the AddEnvironmentPanel handoff. Skipping the
		// onboard/prefill round-trip here avoids overwriting the freshly
		// entered domain with the *first* env's domain (the prefill
		// endpoint reads the oldest env by createdAt asc, not the active
		// one). Other prefill fields (business profile) DO apply to this
		// flow but the user can re-confirm in the wizard.
		if (isNewEnvFlow) {
			setPrefillLoaded(true);
			return;
		}
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
				// Wave 22 Fase B — exception: new-env flow MUST stay on the
				// onboarding wizard even when a sibling env is activated.
				if (prefill.activated && !isNewEnvFlow) {
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
		if (isNewEnvFlow) return; // setup-then-audit flow for new env
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
	}, [session, paymentSuccess, router, isNewEnvFlow]);

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

	// Steps that earn a value-mirror after submission. Each entry's
	// answer is meaningful enough that the user benefits from seeing
	// "and this means we can now do X" before being pushed forward.
	// Skip on: org (name doesn't unlock anything), domain (the crawl
	// loading screen is its own moment), plan (activation is the
	// final moment).
	// Mirror cadence — strategically placed at end of each "wave",
	// not after every step. The JTBD trio (concern + current_method
	// + why_now) feels like ONE conversation because only the last
	// step gets a mirror that synthesizes all three answers.
	//   business_type → confirms technical setup
	//   why_now       → synthesizes the entire JTBD conversation
	//   revenue       → confirms financial calibration
	const MIRROR_STEPS = new Set<StepId>([
		"business_type",
		"why_now",
		"revenue",
	]);

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

		// If this step has a mirror, show it BEFORE advancing.
		// dismissMirror() handles the actual advance.
		if (MIRROR_STEPS.has(currentStep)) {
			setShowMirrorFor(currentStep);
			return;
		}

		setStepIndex((s: number) => Math.min(s + 1, totalSteps - 1));
	}, [currentStep, form.domain, t, totalSteps]);

	const dismissMirror = useCallback(() => {
		setShowMirrorFor(null);
		setStepIndex((s: number) => Math.min(s + 1, totalSteps - 1));
	}, [totalSteps]);

	const prev = useCallback(() => {
		// Going back from a mirror just clears it — user lands back on
		// the step they just submitted, can edit and re-submit.
		if (showMirrorFor) {
			setShowMirrorFor(null);
			return;
		}
		setStepIndex((s: number) => Math.max(s - 1, 0));
	}, [showMirrorFor]);

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
						primaryConcern: form.primaryConcern || null,
						currentOptimizationMethod: form.currentOptimizationMethod || null,
						whyNow: form.whyNow || null,
						monthlyRevenue: form.monthlyRevenue,
						averageOrderValue: form.averageTicket || null,
						targetIndustry: form.industryVertical || null,
						ownershipConfirmed: form.ownershipConfirmed,
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

		// Self-serve: create org + open Paddle.
		// Wave-22.6 — org name auto-derived from the domain so we
		// don't need a dedicated step. "havefunnels.com" → "Have
		// Funnels". User can rename in Settings afterward.
		const autoOrgName =
			form.organizationName ||
			form.domain
				.replace(/^https?:\/\//, "")
				.replace(/\/.*$/, "")
				.split(".")[0]
				.split("-")
				.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
				.join(" ");
		try {
			const response = await fetch("/api/onboard", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					organizationName: autoOrgName,
					domain: form.domain,
					businessModel: form.businessType,
					monthlyRevenue: form.monthlyRevenue,
					averageOrderValue: form.averageTicket,
					conversionModel: form.conversionModel,
					primaryConcern: form.primaryConcern || null,
					currentOptimizationMethod: form.currentOptimizationMethod || null,
					whyNow: form.whyNow || null,
					priceId: selectedPlan.paddlePriceId,
					paymentProvider: "paddle",
					targetIndustry: form.industryVertical || null,
					ownershipConfirmed: form.ownershipConfirmed,
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
		(currentStep === "domain" &&
			form.domain.length > 0 &&
			form.ownershipConfirmed &&
			!domainChecking) ||
		currentStep === "business_type" ||
		currentStep === "concern" ||
		currentStep === "current_method" ||
		currentStep === "why_now" ||
		currentStep === "revenue";

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
		// Value-mirror
		showMirrorFor,
		dismissMirror,
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
		// Prefill
		prefillLoaded,
		// i18n
		t,
	};
}
