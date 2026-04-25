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
	PlanSelectionStep,
} from "@/components/form-steps";
import type { CardOption } from "@/components/form-steps";
import useOnboardingForm from "./useOnboardingForm";
import type { BusinessType, ConversionModel } from "./useOnboardingForm";

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

	// ── Step rendering ──
	return (
		<StepShell
			stepIndex={f.stepIndex}
			totalSteps={f.totalSteps}
			onBack={f.prev}
		>
			{/* ── Org Name ── */}
			{f.currentStep === "org" && (
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
			{f.currentStep === "domain" && (
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
					<label className="flex cursor-pointer items-start gap-3">
						<input
							type="checkbox"
							checked={f.form.ownershipConfirmed}
							onChange={(e) =>
								f.update("ownershipConfirmed", e.target.checked)
							}
							className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
						/>
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
			{f.currentStep === "business_type" && (
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

			{/* ── Conversion Model (cards) ── */}
			{f.currentStep === "conversion_model" && (
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

			{/* ── Revenue ── */}
			{f.currentStep === "revenue" && (
				<TextInputStep
					title={f.t("revenue.title")}
					subtitle={f.t("revenue.subtitle")}
					value={f.form.monthlyRevenue}
					onChange={(v) => f.update("monthlyRevenue", v)}
					placeholder={f.t("revenue.placeholder")}
					hint={f.t("revenue.hint")}
					buttonLabel={
						f.hasActiveOrg
							? f.t("review.activate_environment")
							: f.t("continue")
					}
					onSubmit={
						f.hasActiveOrg ? f.handleActivate : f.next
					}
					loading={f.loading}
				/>
			)}

			{/* ── Plan Selection ── */}
			{f.currentStep === "plan" && (
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
