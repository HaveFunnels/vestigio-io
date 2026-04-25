"use client";

/**
 * /lp/audit — premium one-question-per-screen lead form.
 *
 * Screen 1: Domain + ownership
 * Screen 2: Business type (cards, auto-advance)
 * Screen 3: Conversion model (cards, auto-advance)
 * Screen 4: Monthly revenue
 * Screen 5: Email → fires mini-audit → redirect to result
 *
 * All anti-bot defenses preserved (token, header, honeypot, dwell
 * time, behavioral score). Logic lives in useLpAuditForm hook.
 */

import {
	StepShell,
	TextInputStep,
	CardSelectionStep,
} from "@/components/form-steps";
import type { CardOption } from "@/components/form-steps";
import useLpAuditForm from "./useLpAuditForm";
import type { BusinessType, ConversionModel } from "./useLpAuditForm";

// ---------------------------------------------------------------------------
// Card options (hardcoded EN — LP is not i18n-ized)
// ---------------------------------------------------------------------------
const BUSINESS_TYPE_OPTIONS: CardOption<BusinessType>[] = [
	{ value: "ecommerce", label: "Ecommerce", description: "Direct online sales" },
	{ value: "lead_gen", label: "Lead Gen", description: "Lead capture and nurture" },
	{ value: "saas", label: "SaaS", description: "Subscription software" },
	{ value: "hybrid", label: "Hybrid", description: "Mixed business model" },
];

const CONVERSION_OPTIONS: CardOption<ConversionModel>[] = [
	{ value: "checkout", label: "Checkout", description: "On-site purchase flow" },
	{ value: "whatsapp", label: "WhatsApp / Chat", description: "Messaging-based sales" },
	{ value: "form", label: "Form", description: "Lead capture forms" },
	{ value: "external", label: "External", description: "Redirect to external payment" },
];

export default function LpAuditPage() {
	const f = useLpAuditForm();

	return (
		<>
			{/* Additional field */}
			<div
				aria-hidden="true"
				style={{
					position: "absolute",
					left: "-9999px",
					top: "-9999px",
					width: 1,
					height: 1,
					overflow: "hidden",
				}}
			>
				<label htmlFor="website">Website</label>
				<input
					id="website"
					type="text"
					name="website"
					tabIndex={-1}
					autoComplete="off"
					value={f.honeypot}
					onChange={(e) => f.setHoneypot(e.target.value)}
				/>
			</div>

			<StepShell
				stepIndex={f.stepIndex}
				totalSteps={f.totalSteps}
				onBack={f.prev}
			>
				{/* ── Domain ── */}
				{f.currentScreen === "domain" && (
					<TextInputStep
						title="What domain should we diagnose?"
						subtitle="We'll only crawl the public landing page."
						inputType="url"
						value={f.form.domain}
						onChange={(v) => {
							f.update("domain", v);
							f.setDomainWarning(null);
						}}
						placeholder="https://example.com"
						error={f.fieldError?.field === "domain" ? f.fieldError.message : null}
						warning={
							f.domainWarning ? (
								<>
									{f.domainWarning}{" "}
									<span className="font-medium">You can still proceed.</span>
								</>
							) : undefined
						}
						buttonLabel="Continue"
						onSubmit={f.next}
						disabled={
							f.form.domain.length === 0 ||
							!f.form.ownershipConfirmed ||
							f.domainChecking
						}
						loading={f.domainChecking || f.submitting}
					>
						<label className="flex cursor-pointer items-start gap-3">
							<input
								type="checkbox"
								checked={f.form.ownershipConfirmed}
								onChange={(e) => f.update("ownershipConfirmed", e.target.checked)}
								className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
							/>
							<div>
								<span className="text-sm font-medium text-zinc-700">
									I own this domain or have authorization
								</span>
								<p className="mt-0.5 text-xs text-zinc-400">
									Vestigio will only crawl public pages.
								</p>
							</div>
						</label>
					</TextInputStep>
				)}

				{/* ── Business Type (cards) ── */}
				{f.currentScreen === "business_type" && (
					<CardSelectionStep
						title="What kind of business?"
						subtitle="So we can tailor the audit to your model."
						options={BUSINESS_TYPE_OPTIONS}
						onSelect={(v) => {
							f.update("businessModel", v);
							f.next();
						}}
					/>
				)}

				{/* ── Conversion Model (cards) ── */}
				{f.currentScreen === "conversion_model" && (
					<CardSelectionStep
						title="How do customers convert?"
						subtitle="This determines which paths we analyze."
						options={CONVERSION_OPTIONS}
						onSelect={(v) => {
							f.update("conversionModel", v);
							f.next();
						}}
					/>
				)}

				{/* ── Revenue ── */}
				{f.currentScreen === "revenue" && (
					<TextInputStep
						title="What's your approximate monthly revenue?"
						subtitle="We use this to size the financial impact in your audit."
						value={f.form.monthlyRevenue}
						onChange={(v) => f.update("monthlyRevenue", v)}
						placeholder="e.g. $50k"
						hint="You can type $50k, 1.5m, or just a number."
						error={f.fieldError?.field === "monthlyRevenue" ? f.fieldError.message : null}
						buttonLabel="Continue"
						onSubmit={f.next}
						loading={f.submitting}
					/>
				)}

				{/* ── Email ── */}
				{f.currentScreen === "email" && (
					<TextInputStep
						title="Where should we send your results?"
						subtitle="Drop your email so we can show your audit."
						inputType="email"
						value={f.form.email}
						onChange={(v) => f.update("email", v)}
						placeholder="you@yourcompany.com"
						error={f.fieldError?.field === "email" ? f.fieldError.message : null}
						buttonLabel="See my results"
						onSubmit={f.next}
						loading={f.submitting}
					/>
				)}

				{/* Global error */}
				{f.globalError && (
					<div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
						{f.globalError}
					</div>
				)}
			</StepShell>
		</>
	);
}
