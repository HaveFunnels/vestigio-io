"use client";

/**
 * Onboarding — premium one-question-per-screen flow.
 *
 * Self-serve:         org → domain → business type → conversion → revenue → plan
 * Admin-provisioned:  domain → business type → conversion → revenue
 *
 * All business logic lives in useOnboardingForm. This file is a thin
 * orchestrator that renders the shared step components.
 */

import {
	StepShell,
	TextInputStep,
	CardSelectionStep,
	SliderInputStep,
	PlanSelectionStep,
	MirrorMoment,
} from "@/components/form-steps";
import type { CardOption } from "@/components/form-steps";
import {
	TShirt as FashionIcon,
	CookingPot as FoodIcon,
	Heartbeat as HealthIcon,
	Desktop as ElectronicsIcon,
	GraduationCap as EducationIcon,
	Briefcase as ServicesIcon,
	Plant as HomeGardenIcon,
	DotsThreeCircle as OtherIcon,
} from "@phosphor-icons/react/dist/ssr";
import CustomSelect, { type SelectOption } from "@/components/console/CustomSelect";
import useOnboardingForm from "./useOnboardingForm";
import type { BusinessType, ConversionModel, IndustryVertical } from "./useOnboardingForm";

// ---------------------------------------------------------------------------
// Card options (static — labels come from i18n inside the component)
// ---------------------------------------------------------------------------

export default function OnboardPage() {
	const f = useOnboardingForm();

	// ── Card options (translated) ──
	const businessTypeOptions: CardOption<BusinessType>[] = [
		{
			value: "ecommerce",
			label: f.t("business_context.types.ecommerce"),
			description: f.t("business_context.types.ecommerce_desc"),
		},
		{
			value: "lead_gen",
			label: f.t("business_context.types.lead_gen"),
			description: f.t("business_context.types.lead_gen_desc"),
		},
		{
			value: "saas",
			label: f.t("business_context.types.saas"),
			description: f.t("business_context.types.saas_desc"),
		},
		{
			value: "hybrid",
			label: f.t("business_context.types.hybrid"),
			description: f.t("business_context.types.hybrid_desc"),
		},
	];

	const conversionOptions: CardOption<ConversionModel>[] = [
		{
			value: "checkout",
			label: f.t("business_context.conversion_models.checkout"),
			description: f.t("business_context.conversion_models.checkout_desc"),
		},
		{
			value: "whatsapp",
			label: f.t("business_context.conversion_models.whatsapp"),
			description: f.t("business_context.conversion_models.whatsapp_desc"),
		},
		{
			value: "form",
			label: f.t("business_context.conversion_models.form"),
			description: f.t("business_context.conversion_models.form_desc"),
		},
		{
			value: "external",
			label: f.t("business_context.conversion_models.external"),
			description: f.t("business_context.conversion_models.external_desc"),
		},
	];

	// ── Activation loading screen ──
	if (f.activating) {
		return (
			<div className="flex min-h-[100dvh] items-center justify-center bg-[#090911] px-4">
				<div className="space-y-4 text-center">
					<div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-500" />
					<h2 className="text-lg font-semibold text-white">
						{f.t("activation.title")}
					</h2>
					<p className="text-sm text-zinc-400">
						{f.t("activation.subtitle")}
					</p>
					{f.error && (
						<div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
							{f.error}
						</div>
					)}
				</div>
			</div>
		);
	}

	// ── Wait for prefill before showing steps ──
	if (!f.prefillLoaded) {
		return (
			<div className="flex min-h-[60vh] items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
					<p className="text-sm text-zinc-500">Carregando...</p>
				</div>
			</div>
		);
	}

	// ── Value-mirror dispatch ──
	// When the user just submitted a step that has a mirror, render
	// the MirrorMoment in place of the next step's form. The
	// useOnboardingForm hook holds the gate state; clicking "Entendi"
	// inside the mirror advances stepIndex.
	function answerFor(step: typeof f.showMirrorFor): string {
		switch (step) {
			case "business_type":
				return f.t(`business_context.types.${f.form.businessType}`);
			case "industry":
				return f.t(`industry_vertical.industries.${f.form.industryVertical}`);
			case "conversion_model":
				return f.t(`business_context.conversion_models.${f.form.conversionModel}`);
			case "revenue":
				return new Intl.NumberFormat("pt-BR", {
					style: "currency",
					currency: "BRL",
					maximumFractionDigits: 0,
				}).format(f.form.monthlyRevenue);
			case "ticket":
				return new Intl.NumberFormat("pt-BR", {
					style: "currency",
					currency: "BRL",
					maximumFractionDigits: 0,
				}).format(f.form.averageTicket);
			default:
				return "";
		}
	}

	// ── Step rendering ──
	return (
		<StepShell
			stepIndex={f.stepIndex}
			totalSteps={f.totalSteps}
			onBack={f.prev}
			steps={f.steps as any}
		>
			{f.showMirrorFor && (
				<MirrorMoment
					answer={answerFor(f.showMirrorFor)}
					headline={f.t(`mirror.${f.showMirrorFor}.headline`)}
					body={f.t(`mirror.${f.showMirrorFor}.body`)}
					continueLabel={f.t("mirror.continue")}
					onContinue={f.dismissMirror}
				/>
			)}
			{/* ── Org Name ── */}
			{!f.showMirrorFor && f.currentStep === "org" && (
				<TextInputStep
					title={f.t("org_name.title")}
					subtitle={f.t("org_name.subtitle")}
					value={f.form.organizationName}
					onChange={(v) => f.update("organizationName", v)}
					placeholder={f.t("org_name.placeholder")}
					buttonLabel={f.t("continue")}
					onSubmit={f.next}
					disabled={f.form.organizationName.length === 0}
				/>
			)}

			{/* ── Domain ── */}
			{!f.showMirrorFor && f.currentStep === "domain" && (
				<TextInputStep
					title={f.t("domain.title")}
					subtitle={f.t("domain.subtitle")}
					inputType="url"
					value={f.form.domain}
					onChange={(v) => {
						f.update("domain", v);
						f.setDomainError(null);
						f.setDomainWarning(null);
					}}
					placeholder={f.t("domain.placeholder")}
					error={f.domainError}
					warning={
						f.domainWarning ? (
							<>
								{f.domainWarning}{" "}
								<span className="text-amber-600">
									{f.t("domain.warning_continue")}
								</span>
							</>
						) : undefined
					}
					buttonLabel={f.t("continue")}
					onSubmit={f.next}
					disabled={
						f.form.domain.length === 0 ||
						!f.form.ownershipConfirmed ||
						f.domainChecking
					}
					loading={f.domainChecking}
				>
					{/* Ownership checkbox */}
					<label className="flex cursor-pointer items-center gap-3">
						<div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
							<input
								type="checkbox"
								checked={f.form.ownershipConfirmed}
								onChange={(e) =>
									f.update("ownershipConfirmed", e.target.checked)
								}
								className="peer sr-only"
							/>
							<div className="h-5 w-5 rounded-md border-2 border-zinc-300 bg-white transition-colors peer-checked:border-zinc-900 peer-checked:bg-zinc-900 peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-400 peer-focus-visible:ring-offset-2" />
							<svg
								viewBox="0 0 12 12"
								fill="none"
								stroke="white"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="pointer-events-none absolute h-3 w-3 opacity-0 transition-opacity peer-checked:opacity-100"
							>
								<path d="M2.5 6L5 8.5L9.5 3.5" />
							</svg>
						</div>
						<div>
							<span className="text-sm font-medium text-zinc-700">
								{f.t("domain.ownership_title")}
							</span>
							<p className="mt-0.5 text-xs text-zinc-400">
								{f.t("domain.ownership_description")}
							</p>
						</div>
					</label>
				</TextInputStep>
			)}

			{/* ── Business Type (cards) ── */}
			{!f.showMirrorFor && f.currentStep === "business_type" && (
				<CardSelectionStep
					title={f.t("business_context.title")}
					subtitle={f.t("business_context.subtitle")}
					options={businessTypeOptions}
					onSelect={(v) => {
						f.update("businessType", v);
						f.next();
					}}
				/>
			)}

			{/* ── Industry Vertical (dropdown with icons) ── */}
			{!f.showMirrorFor && f.currentStep === "industry" && (
				<IndustryStep
					value={f.form.industryVertical}
					onChange={(v) => f.update("industryVertical", v)}
					onContinue={f.next}
					t={f.t}
				/>
			)}

			{/* ── Conversion Model (cards) ── */}
			{!f.showMirrorFor && f.currentStep === "conversion_model" && (
				<CardSelectionStep
					title={f.t("business_context.conversion_title")}
					subtitle={f.t("business_context.conversion_subtitle")}
					options={conversionOptions}
					onSelect={(v) => {
						f.update("conversionModel", v);
						f.next();
					}}
				/>
			)}

			{/* ── Revenue (slider) ── */}
			{!f.showMirrorFor && f.currentStep === "revenue" && (
				<SliderInputStep
					title={f.t("revenue.title")}
					subtitle={f.t("revenue.subtitle")}
					min={5000}
					max={10000000}
					step={5000}
					defaultValue={f.form.monthlyRevenue}
					formatValue={(v) => `R$${v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : `${Math.round(v / 1000)}k`}`}
					minLabel="R$5k"
					maxLabel="R$10M"
					buttonLabel={f.t("continue")}
					onSubmit={(v) => {
						f.update("monthlyRevenue", v);
						f.next();
					}}
				/>
			)}

			{/* ── Average Ticket (slider) ── */}
			{!f.showMirrorFor && f.currentStep === "ticket" && (
				<SliderInputStep
					title={f.t("ticket.title")}
					subtitle={f.t("ticket.subtitle")}
					min={20}
					max={40000}
					step={10}
					defaultValue={f.form.averageTicket}
					formatValue={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
					minLabel="R$20"
					maxLabel="R$40k"
					buttonLabel={
						f.hasActiveOrg
							? f.t("review.activate_environment")
							: f.t("continue")
					}
					onSubmit={(v) => {
						f.update("averageTicket", v);
						f.hasActiveOrg ? f.handleActivate() : f.next();
					}}
					loading={f.loading}
				/>
			)}

			{/* ── Plan Selection ── */}
			{!f.showMirrorFor && f.currentStep === "plan" && (
				<PlanSelectionStep
					title={f.t("plan.title")}
					subtitle={f.t("plan.subtitle")}
					plans={f.plans}
					selectedPlan={f.selectedPlan}
					onPlanSelect={f.setSelectedPlan}
					onActivate={f.handleActivate}
					loading={f.loading}
					error={f.error}
					activateLabel={
						f.loading
							? f.t("plan.opening_checkout")
							: f.t("plan.activate", {
									plan: f.selectedPlan.name,
									price: f.selectedPlan.price,
								})
					}
					recommendedLabel={f.t("plan.recommended")}
					securePaymentLabel={f.t("plan.secure_payment")}
					perMonthLabel={f.t("plan.per_month")}
				/>
			)}
		</StepShell>
	);
}

// ──────────────────────────────────────────────
// IndustryStep — dropdown with icons, mobile-optimized
// No scrolling needed: a single select + skip button fits any viewport.
// ──────────────────────────────────────────────

const INDUSTRY_OPTIONS: (SelectOption & { icon: React.ComponentType<any> })[] = [
	{ value: "fashion", label: "Moda & Vestuário", icon: FashionIcon },
	{ value: "food", label: "Alimentos & Bebidas", icon: FoodIcon },
	{ value: "health", label: "Saúde & Bem-estar", icon: HealthIcon },
	{ value: "electronics", label: "Eletrônicos & Tech", icon: ElectronicsIcon },
	{ value: "education", label: "Educação & Cursos", icon: EducationIcon },
	{ value: "services", label: "Serviços & Consultorias", icon: ServicesIcon },
	{ value: "home_garden", label: "Casa & Jardim", icon: HomeGardenIcon },
	{ value: "other", label: "Outro segmento", icon: OtherIcon },
];

function IndustryStep({
	value,
	onChange,
	onContinue,
	t,
}: {
	value: string;
	onChange: (v: IndustryVertical) => void;
	onContinue: () => void;
	t: ReturnType<typeof useOnboardingForm>["t"];
}) {
	return (
		<div className="flex flex-1 flex-col">
			{/* Title */}
			<div>
				<h2 className="text-[1.625rem] font-bold text-zinc-900 sm:text-3xl">
					{t("industry.title")}
				</h2>
				<p className="mt-2 text-[15px] text-zinc-500 sm:text-base">
					{t("industry.subtitle")}
				</p>
			</div>

			{/* Center: dropdown */}
			<div className="flex flex-1 items-center">
				<div className="w-full">
					<CustomSelect
						size="md"
						value={value}
						onChange={(v) => onChange(v as IndustryVertical)}
						options={INDUSTRY_OPTIONS.map((o) => ({ value: o.value, label: o.label, icon: o.icon }))}
						placeholder={t("industry.placeholder")}
						className="w-full"
					/>
				</div>
			</div>

			{/* Bottom: buttons */}
			<div className="flex flex-col gap-3">
				<button
					type="button"
					onClick={onContinue}
					disabled={!value}
					className={`w-full rounded-xl px-6 py-3.5 text-sm font-semibold transition-all ${
						value
							? "bg-zinc-900 text-white hover:bg-zinc-800 active:scale-[0.98]"
							: "cursor-not-allowed bg-zinc-200 text-zinc-400"
					}`}
				>
					{t("continue")}
				</button>
				<button
					type="button"
					onClick={() => {
						onChange("other");
						onContinue();
					}}
					className="text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-600"
				>
					{t("industry.skip")}
				</button>
			</div>
		</div>
	);
}
