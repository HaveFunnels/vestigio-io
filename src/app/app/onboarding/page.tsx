"use client";

import { useState, useMemo, useEffect } from "react";
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
type BusinessType = "ecommerce" | "lead_gen" | "saas" | "hybrid";
type ConversionModel = "checkout" | "whatsapp" | "form" | "external";

interface OnboardState {
	organizationName: string;
	domain: string;
	ownershipConfirmed: boolean;
	businessType: BusinessType;
	monthlyRevenue: string;
	averageTicket: string;
	conversionModel: ConversionModel;
	// SaaS optional fields
	saasLoginUrl: string;
	saasEmail: string;
	saasAuthMethod: string;
	saasMfaMode: string;
	saasSkipped: boolean;
	// Notifications
	phone: string; // E.164 e.g. +5511999999999
	notifyEmail: boolean;
	notifySms: boolean;
	notifyWhatsapp: boolean;
}

interface Plan {
	key: string;
	name: string;
	price: string;
	paddlePriceId: string;
	features: string[];
	recommended: boolean;
}

// ---------------------------------------------------------------------------
// Domain validation
// ---------------------------------------------------------------------------
const DOMAIN_REGEX =
	/^(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+)(?:\/.*)?$/;

function isValidDomainFormat(input: string): boolean {
	return DOMAIN_REGEX.test(input.trim());
}

async function validateDomainReachability(
	domain: string
): Promise<{ ok: boolean; error?: string }> {
	const normalized = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
	try {
		const res = await fetch(
			`/api/validate-domain?domain=${encodeURIComponent(normalized)}`
		);
		const data = await res.json();
		return data;
	} catch {
		// Network error — don't block onboarding, just warn
		return { ok: true };
	}
}

function parseRevenue(value: string): number | null {
	const cleaned = value.replace(/[^0-9.]/g, "");
	const num = parseFloat(cleaned);
	if (isNaN(num)) return null;
	if (value.toLowerCase().includes("k")) return num * 1000;
	if (value.toLowerCase().includes("m")) return num * 1000000;
	return num;
}

// ---------------------------------------------------------------------------
// Step definitions: dynamic based on business type
// ---------------------------------------------------------------------------
type StepId =
	| "org"
	| "domain"
	| "business"
	| "saas_setup"
	| "notifications"
	| "review"
	| "plan";

function getSteps(
	businessType: BusinessType,
	hasActiveOrg: boolean,
): StepId[] {
	// Wave 5 Fase 2: admin-provisioned orgs already have a name + plan set
	// by the admin, so skip "org" (nothing to collect) AND skip "plan" (no
	// checkout needed). The final action on review calls
	// /api/environments/activate instead of opening Paddle.
	const base: StepId[] = hasActiveOrg ? ["domain", "business"] : ["org", "domain", "business"];
	if (businessType === "saas") {
		base.push("saas_setup");
	}
	base.push("notifications", "review");
	if (!hasActiveOrg) {
		base.push("plan");
	}
	return base;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function OnboardPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { data: session, update: updateSession } = useSession();
	const t = useTranslations("console.onboard");
	const paymentSuccess = searchParams.get("payment_success") === "true";

	const businessOptions = useMemo<
		{ value: BusinessType; label: string; description: string }[]
	>(
		() => [
			{
				value: "ecommerce",
				label: t("business_context.types.ecommerce"),
				description: t("business_context.types.ecommerce_desc"),
			},
			{
				value: "lead_gen",
				label: t("business_context.types.lead_gen"),
				description: t("business_context.types.lead_gen_desc"),
			},
			{
				value: "saas",
				label: t("business_context.types.saas"),
				description: t("business_context.types.saas_desc"),
			},
			{
				value: "hybrid",
				label: t("business_context.types.hybrid"),
				description: t("business_context.types.hybrid_desc"),
			},
		],
		[t]
	);

	const conversionOptions = useMemo<
		{ value: ConversionModel; label: string }[]
	>(
		() => [
			{
				value: "checkout",
				label: t("business_context.conversion_models.checkout"),
			},
			{
				value: "whatsapp",
				label: t("business_context.conversion_models.whatsapp"),
			},
			{ value: "form", label: t("business_context.conversion_models.form") },
			{
				value: "external",
				label: t("business_context.conversion_models.external"),
			},
		],
		[t]
	);

	const notificationChannels = useMemo(
		() => [
			{
				key: "notifyEmail" as const,
				label: t("notifications.channels.email.label"),
				desc: t("notifications.channels.email.description"),
				needsPhone: false,
			},
			{
				key: "notifySms" as const,
				label: t("notifications.channels.sms.label"),
				desc: t("notifications.channels.sms.description"),
				needsPhone: true,
			},
			{
				key: "notifyWhatsapp" as const,
				label: t("notifications.channels.whatsapp.label"),
				desc: t("notifications.channels.whatsapp.description"),
				needsPhone: true,
			},
		],
		[t]
	);

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
		[t]
	);

	const [stepIndex, setStepIndex] = useState(0);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [plans, setPlans] = useState<Plan[]>(defaultPlans);
	const [selectedPlan, setSelectedPlan] = useState<Plan>(defaultPlans[0]);
	const [activating, setActivating] = useState(paymentSuccess);
	const [domainError, setDomainError] = useState<string | null>(null);
	const [domainChecking, setDomainChecking] = useState(false);
	const [domainWarning, setDomainWarning] = useState<string | null>(null);

	// Fetch plans from API on mount
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
								: t("plan.features.domain_plural", {
										count: p.maxEnvironments,
									}),
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
					setSelectedPlan(mapped[0]);
				}
			} catch {
				// Keep default plans on error
			}
		}
		fetchPlans();
	}, [t]);

	// If user already has an active org WITH a domain and this is not a payment callback, redirect to app.
	// Users with an org but no domain (e.g. demo accounts) should be allowed to complete setup.
	// Wave 5 Fase 2: also respect hasActivatedEnv — admin-provisioned orgs may
	// already have a domain row (provisioned mode) but no activated env, and
	// those users MUST complete onboarding. Redirecting them to /app/analysis
	// would create a loop with the middleware gate.
	const [hasExistingDomain, setHasExistingDomain] = useState<boolean | null>(
		null
	);
	useEffect(() => {
		if ((session?.user as any)?.hasOrganization === true) {
			const envActivated = (session?.user as any)?.hasActivatedEnv === true;
			fetch("/api/usage")
				.then((r) => (r.ok ? r.json() : null))
				.then((data) => {
					setHasExistingDomain(!!data?.domain);
					if (!paymentSuccess && data?.domain && envActivated) {
						router.replace("/app/analysis");
					}
				})
				.catch(() => {});
		}
	}, [session, paymentSuccess, router]);

	// After payment success, poll session until org is activated by webhook
	useEffect(() => {
		if (!paymentSuccess) return;
		setActivating(true);

		let attempts = 0;
		const maxAttempts = 30; // 60 seconds max
		const interval = setInterval(async () => {
			attempts++;
			await updateSession(); // triggers JWT callback → re-checks membership from DB

			// Session will update reactively; check on next render cycle
			if (attempts >= maxAttempts) {
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
			// Hand off to the thank-you bridge page, which will then redirect
			// to /app/inventory where the audit progress banner is visible.
			const orgId = searchParams.get("org") || "";
			router.replace(
				`/app/onboarding/thank-you${orgId ? `?org=${encodeURIComponent(orgId)}` : ""}`
			);
		}
	}, [session, paymentSuccess, router, searchParams]);
	const [form, setForm] = useState<OnboardState>({
		organizationName: "",
		domain: "",
		ownershipConfirmed: false,
		businessType: "ecommerce",
		monthlyRevenue: "",
		averageTicket: "",
		conversionModel: "checkout",
		saasLoginUrl: "",
		saasEmail: "",
		saasAuthMethod: "unknown",
		saasMfaMode: "unknown",
		saasSkipped: false,
		phone: "",
		notifyEmail: true,
		notifySms: false,
		notifyWhatsapp: false,
	});

	const [phoneError, setPhoneError] = useState<string | null>(null);

	function isValidPhone(p: string): boolean {
		if (!p) return true; // optional
		const cleaned = p.replace(/[\s\-()]/g, "");
		return /^\+?[1-9]\d{6,14}$/.test(cleaned);
	}

	// True when the caller already has an active org (admin-provisioned
	// shell) — drives two changes: skip the plan picker, and swap the final
	// action from Paddle checkout to /api/environments/activate.
	const hasActiveOrg = (session?.user as any)?.hasOrganization === true;
	const steps = useMemo(
		() => getSteps(form.businessType, hasActiveOrg),
		[form.businessType, hasActiveOrg],
	);
	const totalSteps = steps.length;
	const currentStep = steps[stepIndex] || "org";

	const next = async () => {
		// Validate domain before advancing from domain step
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

		// Validate phone format on notifications step (allow empty)
		if (currentStep === "notifications") {
			setPhoneError(null);
			if (form.phone && !isValidPhone(form.phone)) {
				setPhoneError(t("notifications.invalid_phone"));
				return;
			}
			// Persist phone + prefs to user (best-effort, don't block)
			const cleanedPhone = form.phone
				? form.phone.replace(/[\s\-()]/g, "")
				: "";
			try {
				await Promise.all([
					fetch("/api/user/update", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ phone: cleanedPhone }),
					}),
					fetch("/api/user/notification-prefs", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							emailEnabled: form.notifyEmail,
							smsEnabled: form.notifySms && !!cleanedPhone,
							whatsappEnabled: form.notifyWhatsapp && !!cleanedPhone,
						}),
					}),
				]);
			} catch {
				// best-effort — user can configure later in Settings
			}
		}
		setStepIndex((s) => Math.min(s + 1, totalSteps - 1));
	};
	const prev = () => setStepIndex((s) => Math.max(s - 1, 0));

	const update = <K extends keyof OnboardState>(
		key: K,
		value: OnboardState[K]
	) => {
		setForm((f) => ({ ...f, [key]: value }));
	};

	const handleSkipSaas = () => {
		update("saasSkipped", true);
		next();
	};

	const handleActivate = async () => {
		setLoading(true);
		setError(null);

		// Wave 5 Fase 2 branch: admin-provisioned shell orgs already have a
		// plan + membership; all we need is env + BusinessProfile + first
		// audit cycle. No Paddle checkout.
		if (hasActiveOrg) {
			try {
				const saasPayload =
					form.businessType === "saas" &&
					!form.saasSkipped &&
					form.saasLoginUrl
						? {
								saasLoginUrl: form.saasLoginUrl,
								saasEmail: form.saasEmail,
								saasAuthMethod: form.saasAuthMethod,
								saasMfaMode: form.saasMfaMode,
							}
						: {};

				const response = await fetch("/api/environments/activate", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						domain: form.domain,
						businessModel: form.businessType,
						conversionModel: form.conversionModel,
						monthlyRevenue: parseRevenue(form.monthlyRevenue),
						averageOrderValue: parseRevenue(form.averageTicket),
						...saasPayload,
					}),
				});

				const data = await response.json();

				if (!response.ok) {
					setError(data.message || t("errors.something_wrong"));
					setLoading(false);
					return;
				}

				// Refresh the JWT so hasActivatedEnv flips to true. Without this,
				// the middleware would bounce the user back to /app/onboarding
				// on the next navigation even though the env is activated.
				await updateSession();

				// Hand off to inventory where the first-cycle progress banner
				// (wired via SSE) takes over. If the redirect arrived in the
				// response we honor it; otherwise default to inventory.
				const target = data.redirectTo || "/app/inventory";
				const cycleQuery = data.cycle?.id
					? `?cycle=${encodeURIComponent(data.cycle.id)}`
					: "";
				router.replace(`${target}${cycleQuery}`);
			} catch (err) {
				setError(t("errors.network_error"));
				setLoading(false);
			}
			return;
		}

		// Legacy self-serve flow — org doesn't exist yet, go through
		// /api/onboard which creates org+env+profile then opens Paddle.
		try {
			const response = await fetch("/api/onboard", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					organizationName: form.organizationName,
					domain: form.domain,
					businessModel: form.businessType,
					monthlyRevenue: parseRevenue(form.monthlyRevenue),
					averageOrderValue: parseRevenue(form.averageTicket),
					conversionModel: form.conversionModel,
					priceId: selectedPlan.paddlePriceId,
					paymentProvider: "paddle",
					// Pass SaaS fields if configured
					...(form.businessType === "saas" &&
					!form.saasSkipped &&
					form.saasLoginUrl
						? {
								saasLoginUrl: form.saasLoginUrl,
								saasEmail: form.saasEmail,
								saasAuthMethod: form.saasAuthMethod,
								saasMfaMode: form.saasMfaMode,
							}
						: {}),
				}),
			});

			const data = await response.json();

			if (!response.ok) {
				setError(data.message || t("errors.something_wrong"));
				setLoading(false);
				return;
			}

			const orgId = data.organizationId;

			// Step 2: Open Paddle checkout on client-side
			if (!window.Paddle) {
				setError(t("errors.payment_loading"));
				setLoading(false);
				return;
			}

			window.Paddle.Checkout.open({
				items: [
					{
						priceId: selectedPlan.paddlePriceId,
						quantity: 1,
					},
				],
				customData: {
					userId: (session?.user as any)?.id || "",
					organizationId: orgId,
					onboarding: "true",
				},
				successUrl: `${window.location.origin}/app/onboarding?payment_success=true&org=${orgId}`,
				settings: {
					displayMode: "overlay",
				},
			});

			setLoading(false);
		} catch (err) {
			setError(t("errors.network_error"));
			setLoading(false);
		}
	};

	const canAdvance =
		(currentStep === "org" && form.organizationName.length > 0) ||
		(currentStep === "domain" &&
			form.domain.length > 0 &&
			form.ownershipConfirmed &&
			!domainChecking) ||
		currentStep === "business" ||
		currentStep === "saas_setup" ||
		currentStep === "notifications" ||
		currentStep === "review";

	// Show activation loading screen while waiting for webhook
	if (activating) {
		return (
			<div className='flex min-h-full items-center justify-center px-4 py-20'>
				<div className='space-y-4 text-center'>
					<div className='mx-auto h-8 w-8 animate-spin rounded-full border-2 border-edge border-t-emerald-500' />
					<h2 className='text-lg font-semibold text-content'>
						{t("activation.title")}
					</h2>
					<p className='text-sm text-content-muted'>
						{t("activation.subtitle")}
					</p>
					{error && (
						<div className='rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400'>
							{error}
						</div>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className='flex min-h-full items-start justify-center px-4 py-12 sm:py-20'>
			<div className='w-full max-w-lg'>
				{/* Step indicator */}
				<div className='mb-8 text-center'>
					<span className='text-sm font-medium text-content-muted'>
						{t("step_indicator", { current: stepIndex + 1, total: totalSteps })}
					</span>
					<div className='mt-2 flex gap-1'>
						{Array.from({ length: totalSteps }).map((_, i) => (
							<div
								key={i}
								className={`h-1 flex-1 rounded-full transition-colors ${
									i <= stepIndex ? "bg-emerald-500" : "bg-surface-inset"
								}`}
							/>
						))}
					</div>
				</div>

				{/* ── Step: Organization Name ── */}
				{currentStep === "org" && (
					<section className='space-y-6'>
						<div>
							<h1 className='text-xl font-semibold text-content'>
								{t("org_name.title")}
							</h1>
							<p className='mt-1 text-sm text-content-muted'>
								{t("org_name.subtitle")}
							</p>
						</div>
						<div>
							<label
								htmlFor='orgName'
								className='mb-1.5 block text-sm font-medium text-content-secondary'
							>
								{t("org_name.label")}
							</label>
							<input
								id='orgName'
								type='text'
								value={form.organizationName}
								onChange={(e) => update("organizationName", e.target.value)}
								placeholder={t("org_name.placeholder")}
								className='w-full rounded-md border border-edge bg-surface-input px-4 py-2 text-sm text-content outline-none placeholder:text-content-faint focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
							/>
						</div>
					</section>
				)}

				{/* ── Step: Domain ── */}
				{currentStep === "domain" && (
					<section className='space-y-6'>
						<div>
							<h1 className='text-xl font-semibold text-content'>
								{t("domain.title")}
							</h1>
							<p className='mt-1 text-sm text-content-muted'>
								{t("domain.subtitle")}
							</p>
						</div>
						<div>
							<label
								htmlFor='domain'
								className='mb-1.5 block text-sm font-medium text-content-secondary'
							>
								{t("domain.label")}
							</label>
							<div className='relative'>
								<input
									id='domain'
									type='url'
									value={form.domain}
									onChange={(e) => {
										update("domain", e.target.value);
										setDomainError(null);
										setDomainWarning(null);
									}}
									placeholder={t("domain.placeholder")}
									className={`w-full rounded-md border bg-surface-input px-4 py-2 text-sm text-content outline-none placeholder:text-content-faint focus:ring-1 ${
										domainError
											? "border-red-500 focus:border-red-500 focus:ring-red-500"
											: "border-edge focus:border-emerald-600 focus:ring-emerald-600"
									}`}
								/>
								{domainChecking && (
									<div className='absolute right-3 top-1/2 -translate-y-1/2'>
										<div className='h-4 w-4 animate-spin rounded-full border-2 border-edge border-t-emerald-500' />
									</div>
								)}
							</div>
							{domainError && (
								<div className='mt-2 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400'>
									<svg className='mt-0.5 h-4 w-4 flex-shrink-0' viewBox='0 0 20 20' fill='currentColor'>
										<path fillRule='evenodd' d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z' clipRule='evenodd' />
									</svg>
									<span>{domainError}</span>
								</div>
							)}
							{domainWarning && (
								<div className='mt-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400'>
									<svg className='mt-0.5 h-4 w-4 flex-shrink-0' viewBox='0 0 20 20' fill='currentColor'>
										<path fillRule='evenodd' d='M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z' clipRule='evenodd' />
									</svg>
									<span>{domainWarning} — {t("domain.warning_continue")}</span>
								</div>
							)}
						</div>

						{/* Ownership confirmation — required before audit can run */}
						<div>
							<label className='flex cursor-pointer items-start gap-3 rounded-md border border-edge bg-surface-input px-4 py-3 transition-colors hover:border-edge-subtle'>
								<input
									type='checkbox'
									checked={form.ownershipConfirmed}
									onChange={(e) =>
										update("ownershipConfirmed", e.target.checked)
									}
									className='mt-0.5 h-4 w-4 cursor-pointer rounded border-edge-subtle bg-surface-inset accent-emerald-500'
								/>
								<div className='text-xs leading-relaxed text-content-muted'>
									<span className='block font-medium text-content-secondary'>
										{t("domain.ownership_title")}
									</span>
									<span className='mt-0.5 block text-content-muted'>
										{t("domain.ownership_description")}
									</span>
								</div>
							</label>
						</div>
					</section>
				)}

				{/* ── Step: Business Context ── */}
				{currentStep === "business" && (
					<section className='space-y-6'>
						<div>
							<h1 className='text-xl font-semibold text-content'>
								{t("business_context.title")}
							</h1>
							<p className='mt-1 text-sm text-content-muted'>
								{t("business_context.subtitle")}
							</p>
						</div>
						<div>
							<label className='mb-1.5 block text-sm font-medium text-content-secondary'>
								{t("business_context.business_type")}
							</label>
							<div className='grid grid-cols-2 gap-2'>
								{businessOptions.map((o) => (
									<button
										key={o.value}
										onClick={() => update("businessType", o.value)}
										className={`relative overflow-hidden rounded-xl border px-3 py-3 text-left text-sm transition-all ${
											form.businessType === o.value
												? "border-emerald-500 bg-emerald-500/[0.08] text-content shadow-[0_8px_24px_-12px_rgba(16,185,129,0.28)]"
												: "border-edge bg-surface-card text-content-muted hover:border-emerald-500/40 hover:bg-emerald-500/[0.04]"
										}`}
									>
										{form.businessType === o.value && (
											<div
												className='pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-500/[0.05] via-transparent to-transparent'
												aria-hidden
											/>
										)}
										<div className='relative font-medium'>{o.label}</div>
										<div className='relative text-xs text-content-muted'>
											{o.description}
										</div>
									</button>
								))}
							</div>
						</div>
						<div>
							<label
								htmlFor='monthlyRevenue'
								className='mb-1.5 block text-sm font-medium text-content-secondary'
							>
								{t("business_context.monthly_revenue")}{" "}
								<span className='text-content-muted'>
									{t("business_context.optional")}
								</span>
							</label>
							<input
								id='monthlyRevenue'
								type='text'
								value={form.monthlyRevenue}
								onChange={(e) => update("monthlyRevenue", e.target.value)}
								placeholder={t("business_context.monthly_revenue_placeholder")}
								className='w-full rounded-md border border-edge bg-surface-input px-4 py-2 text-sm text-content outline-none placeholder:text-content-faint focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
							/>
						</div>
						<div>
							<label
								htmlFor='averageTicket'
								className='mb-1.5 block text-sm font-medium text-content-secondary'
							>
								{t("business_context.avg_order_value")}{" "}
								<span className='text-content-muted'>
									{t("business_context.optional")}
								</span>
							</label>
							<input
								id='averageTicket'
								type='text'
								value={form.averageTicket}
								onChange={(e) => update("averageTicket", e.target.value)}
								placeholder={t("business_context.avg_order_value_placeholder")}
								className='w-full rounded-md border border-edge bg-surface-input px-4 py-2 text-sm text-content outline-none placeholder:text-content-faint focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
							/>
						</div>
						<div>
							<label className='mb-1.5 block text-sm font-medium text-content-secondary'>
								{t("business_context.conversion_model")}
							</label>
							<select
								value={form.conversionModel}
								onChange={(e) =>
									update("conversionModel", e.target.value as ConversionModel)
								}
								className='w-full rounded-md border border-edge bg-surface-input px-4 py-2 text-sm text-content outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
							>
								{conversionOptions.map((o) => (
									<option key={o.value} value={o.value}>
										{o.label}
									</option>
								))}
							</select>
						</div>
					</section>
				)}

				{/* ── Step: SaaS Setup (OPTIONAL) ── */}
				{currentStep === "saas_setup" && (
					<section className='space-y-6'>
						<div>
							<h1 className='text-xl font-semibold text-content'>
								{t("saas_access.title")}
							</h1>
							<p className='mt-1 whitespace-pre-line text-sm text-content-muted'>
								{t("saas_access.subtitle")}
							</p>
						</div>
						<div className='space-y-4 rounded-lg border border-edge bg-surface-card/50 p-4'>
							<div>
								<label className='mb-1.5 block text-sm font-medium text-content-secondary'>
									{t("saas_access.login_url")}
								</label>
								<input
									type='url'
									value={form.saasLoginUrl}
									onChange={(e) => update("saasLoginUrl", e.target.value)}
									placeholder={t("saas_access.login_url_placeholder")}
									className='w-full rounded-md border border-edge bg-surface-input px-4 py-2 text-sm text-content outline-none placeholder:text-content-faint focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
								/>
							</div>
							<div>
								<label className='mb-1.5 block text-sm font-medium text-content-secondary'>
									{t("saas_access.email")}
								</label>
								<input
									type='email'
									value={form.saasEmail}
									onChange={(e) => update("saasEmail", e.target.value)}
									placeholder={t("saas_access.email_placeholder")}
									className='w-full rounded-md border border-edge bg-surface-input px-4 py-2 text-sm text-content outline-none placeholder:text-content-faint focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
								/>
							</div>
							<div className='grid grid-cols-2 gap-3'>
								<div>
									<label className='mb-1.5 block text-sm font-medium text-content-secondary'>
										{t("saas_access.auth_method")}
									</label>
									<select
										value={form.saasAuthMethod}
										onChange={(e) => update("saasAuthMethod", e.target.value)}
										className='w-full rounded-md border border-edge bg-surface-input px-4 py-2 text-sm text-content outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
									>
										<option value='unknown'>
											{t("saas_access.auth_methods.unknown")}
										</option>
										<option value='password'>
											{t("saas_access.auth_methods.password")}
										</option>
										<option value='oauth'>
											{t("saas_access.auth_methods.oauth")}
										</option>
										<option value='magic_link'>
											{t("saas_access.auth_methods.magic_link")}
										</option>
									</select>
								</div>
								<div>
									<label className='mb-1.5 block text-sm font-medium text-content-secondary'>
										{t("saas_access.mfa")}
									</label>
									<select
										value={form.saasMfaMode}
										onChange={(e) => update("saasMfaMode", e.target.value)}
										className='w-full rounded-md border border-edge bg-surface-input px-4 py-2 text-sm text-content outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
									>
										<option value='unknown'>
											{t("saas_access.mfa_options.unknown")}
										</option>
										<option value='none'>
											{t("saas_access.mfa_options.none")}
										</option>
										<option value='optional'>
											{t("saas_access.mfa_options.optional")}
										</option>
										<option value='required'>
											{t("saas_access.mfa_options.required")}
										</option>
									</select>
								</div>
							</div>
						</div>
						<p className='text-xs text-content-muted'>
							{t("saas_access.skip_note")}
						</p>
					</section>
				)}

				{/* ── Step: Notifications (phone + channel prefs) ── */}
				{currentStep === "notifications" && (
					<section className='space-y-6'>
						<div>
							<h1 className='text-xl font-semibold text-content'>
								{t("notifications.title")}
							</h1>
							<p className='mt-1 text-sm text-content-muted'>
								{t("notifications.subtitle")}
							</p>
						</div>
						<div>
							<label
								htmlFor='phone'
								className='mb-1.5 block text-sm font-medium text-content-secondary'
							>
								{t("notifications.phone")}{" "}
								<span className='text-content-muted'>
									{t("business_context.optional")}
								</span>
							</label>
							<input
								id='phone'
								type='tel'
								value={form.phone}
								onChange={(e) => {
									update("phone", e.target.value);
									setPhoneError(null);
								}}
								placeholder={t("notifications.phone_placeholder")}
								className={`w-full rounded-md border bg-surface-input px-4 py-2 text-sm text-content outline-none placeholder:text-content-faint focus:ring-1 ${
									phoneError
										? "border-red-500 focus:border-red-500 focus:ring-red-500"
										: "border-edge focus:border-emerald-600 focus:ring-emerald-600"
								}`}
							/>
							{phoneError && (
								<div className='mt-2 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400'>
									<svg className='mt-0.5 h-4 w-4 flex-shrink-0' viewBox='0 0 20 20' fill='currentColor'>
										<path fillRule='evenodd' d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z' clipRule='evenodd' />
									</svg>
									<span>{phoneError}</span>
								</div>
							)}
							<p className='mt-1.5 text-xs text-content-muted'>
								{t("notifications.phone_help")}
							</p>
							{form.phone && !phoneError && (
								<p className='mt-1 text-xs text-content-faint'>
									{t("notifications.phone_format_hint")}
								</p>
							)}
						</div>
						<div className='space-y-2'>
							<label className='block text-sm font-medium text-content-secondary'>
								{t("notifications.notify_me_by")}
							</label>
							<div className='space-y-2'>
								{notificationChannels.map((channel) => {
									const enabled = form[channel.key];
									const disabled = channel.needsPhone && !form.phone;
									return (
										<button
											key={channel.key}
											type='button'
											disabled={disabled}
											onClick={() =>
												update(channel.key as "notifyEmail", !enabled)
											}
											className={`flex w-full items-center justify-between rounded-md border px-4 py-3 text-left transition-colors ${
												enabled && !disabled
													? "border-emerald-500 bg-emerald-500/10"
													: "border-edge bg-surface-input hover:border-edge-subtle"
											} ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
										>
											<div>
												<div className='text-sm font-medium text-content'>
													{channel.label}
												</div>
												<div className='text-xs text-content-muted'>
													{channel.desc}
													{disabled
														? ` — ${t("notifications.add_phone_first")}`
														: ""}
												</div>
											</div>
											<div
												className={`h-5 w-9 rounded-full p-0.5 transition-colors ${enabled && !disabled ? "bg-emerald-500" : "bg-surface-inset"}`}
											>
												<div
													className={`h-4 w-4 rounded-full bg-white transition-transform ${enabled && !disabled ? "translate-x-4" : ""}`}
												/>
											</div>
										</button>
									);
								})}
							</div>
						</div>
					</section>
				)}

				{/* ── Step: Review ── */}
				{currentStep === "review" && (
					<section className='space-y-6'>
						<div>
							<h1 className='text-xl font-semibold text-content'>
								{t("review.title")}
							</h1>
							<p className='mt-1 text-sm text-content-muted'>
								{t("review.subtitle")}
							</p>
						</div>
						<div className='space-y-2'>
							{[
								{
									label: t("review.organization"),
									value: form.organizationName || "—",
								},
								{ label: t("review.domain"), value: form.domain || "—" },
								{
									label: t("review.business_type"),
									value:
										businessOptions.find(
											(option) => option.value === form.businessType
										)?.label ?? form.businessType,
								},
								{
									label: t("review.monthly_revenue"),
									value: form.monthlyRevenue || t("review.not_provided"),
								},
								{
									label: t("review.avg_order_value"),
									value: form.averageTicket || t("review.not_provided"),
								},
								{
									label: t("review.conversion_model"),
									value:
										conversionOptions.find(
											(option) => option.value === form.conversionModel
										)?.label ?? form.conversionModel,
								},
								...(form.businessType === "saas"
									? [
											{
												label: t("review.saas_access"),
												value: form.saasSkipped
													? t("review.saas_skipped")
													: form.saasLoginUrl
														? `${form.saasLoginUrl} (${form.saasEmail || t("review.no_email_yet")})`
														: t("review.saas_not_configured"),
											},
										]
									: []),
								{
									label: t("review.notifications"),
									value:
										[
											form.notifyEmail &&
												t("notifications.channels.email.label"),
											form.notifySms &&
												form.phone &&
												t("notifications.channels.sms.label"),
											form.notifyWhatsapp &&
												form.phone &&
												t("notifications.channels.whatsapp.label"),
										]
											.filter(Boolean)
											.join(", ") || t("review.email_only"),
								},
							].map((item) => (
								<div
									key={item.label}
									className='flex items-center justify-between rounded-md border border-edge bg-surface-card/50 px-4 py-2'
								>
									<span className='text-xs text-content-muted'>
										{item.label}
									</span>
									<span className='text-sm text-content-secondary'>
										{item.value}
									</span>
								</div>
							))}
						</div>

						{/* Wave 5 Fase 2 — admin-provisioned orgs activate here
						    without going through Paddle. The cycle fires
						    fire-and-forget and we redirect to inventory where
						    an SSE-backed progress banner takes over. */}
						{hasActiveOrg && (
							<>
								{error && (
									<div className='rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400'>
										{error}
									</div>
								)}
								<button
									onClick={handleActivate}
									disabled={loading}
									className='w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(16,185,129,0.6)] transition-colors hover:bg-emerald-500 disabled:opacity-50 disabled:shadow-none'
								>
									{loading
										? t("plan.opening_checkout")
										: t("review.activate_environment")}
								</button>
								<p className='text-center text-xs text-content-faint'>
									{t("review.activate_hint")}
								</p>
							</>
						)}
					</section>
				)}

				{/* ── Step: Choose Plan + Checkout ── */}
				{currentStep === "plan" && (
					<section className='space-y-6'>
						<div>
							<h1 className='text-xl font-semibold text-content'>
								{t("plan.title")}
							</h1>
							<p className='mt-1 text-sm text-content-muted'>
								{t("plan.subtitle")}
							</p>
						</div>

						<div className='space-y-3'>
							{plans.map((plan) => (
								<button
									key={plan.key}
									onClick={() => setSelectedPlan(plan)}
									className={`relative w-full overflow-hidden rounded-xl border text-left transition-all ${
										selectedPlan.key === plan.key
											? "border-emerald-500 bg-emerald-500/[0.08] shadow-[0_12px_32px_-14px_rgba(16,185,129,0.35)]"
											: "border-edge bg-surface-card hover:border-emerald-500/40 hover:bg-emerald-500/[0.04]"
									}`}
								>
									{selectedPlan.key === plan.key && (
										<div
											className='pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-500/[0.06] via-transparent to-transparent'
											aria-hidden
										/>
									)}
									<div className='relative px-4 py-4'>
										<div className='flex items-center justify-between'>
											<div className='flex items-center gap-2'>
												<span className='text-sm font-semibold text-content'>
													{plan.name}
												</span>
												{plan.recommended && (
													<span className='rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400'>
														{t("plan.recommended")}
													</span>
												)}
											</div>
											<span className='font-mono text-sm font-bold tabular-nums text-content'>
												{plan.price}
												<span className='text-xs font-normal text-content-muted'>
													{t("plan.per_month")}
												</span>
											</span>
										</div>
										<ul className='mt-2 flex flex-wrap gap-x-3 gap-y-1'>
											{plan.features.map((f) => (
												<li
													key={f}
													className='flex items-center gap-1 text-xs text-content-muted'
												>
													<span className='text-emerald-500'>+</span> {f}
												</li>
											))}
										</ul>
									</div>
								</button>
							))}
						</div>

						{error && (
							<div className='rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400'>
								{error}
							</div>
						)}

						<button
							onClick={handleActivate}
							disabled={loading}
							className='w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(16,185,129,0.6)] transition-colors hover:bg-emerald-500 disabled:opacity-50 disabled:shadow-none'
						>
							{loading
								? t("plan.opening_checkout")
								: t("plan.activate", {
										plan: selectedPlan.name,
										price: selectedPlan.price,
									})}
						</button>

						<p className='text-center text-xs text-content-faint'>
							{t("plan.secure_payment")}
						</p>
					</section>
				)}

				{/* ── Navigation ── */}
				{/* Hidden on plan step (has its own CTA) and on review+hasActiveOrg
				    (the inline "Activate environment" CTA is the final action). */}
				{currentStep !== "plan" && !(currentStep === "review" && hasActiveOrg) && (
					<div className='mt-8 flex justify-between'>
						<button
							onClick={prev}
							disabled={stepIndex === 0}
							className='rounded-md border border-edge px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-card-hover disabled:opacity-30 disabled:hover:bg-transparent'
						>
							{t("nav.previous")}
						</button>
						<div className='flex gap-2'>
							{currentStep === "saas_setup" && (
								<button
									onClick={handleSkipSaas}
									className='rounded-md border border-edge px-4 py-2 text-sm font-medium text-content-muted transition-colors hover:bg-surface-card-hover'
								>
									{t("saas_access.skip")}
								</button>
							)}
							<button
								onClick={next}
								disabled={!canAdvance || domainChecking}
								className='rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-30'
							>
								{domainChecking ? t("nav.checking_domain") : t("nav.next")}
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
