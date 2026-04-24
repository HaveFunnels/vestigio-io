"use client";

/**
 * PlanSelectionStep — plan picker with explicit CTA.
 *
 * Tap a plan card to SELECT it (no auto-advance).
 * The "Activate" button triggers checkout.
 * Adapted from the existing onboarding plan UI for the light-card theme.
 */

export interface Plan {
	key: string;
	name: string;
	price: string;
	paddlePriceId: string;
	features: string[];
	recommended?: boolean;
}

interface PlanSelectionStepProps {
	title: string;
	subtitle?: string;
	plans: Plan[];
	selectedPlan: Plan;
	onPlanSelect: (plan: Plan) => void;
	onActivate: () => void;
	loading?: boolean;
	error?: string | null;
	activateLabel: string;
	recommendedLabel?: string;
	securePaymentLabel?: string;
	perMonthLabel?: string;
}

export default function PlanSelectionStep({
	title,
	subtitle,
	plans,
	selectedPlan,
	onPlanSelect,
	onActivate,
	loading = false,
	error,
	activateLabel,
	recommendedLabel = "Recommended",
	securePaymentLabel,
	perMonthLabel = "/mo",
}: PlanSelectionStepProps) {
	return (
		<div className="flex flex-col">
			{/* Title */}
			<h2 className="mb-1.5 text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
				{title}
			</h2>

			{/* Subtitle */}
			{subtitle && (
				<p className="mb-6 text-sm leading-relaxed text-zinc-500">
					{subtitle}
				</p>
			)}

			{/* Plan cards */}
			<div className="space-y-3">
				{plans.map((plan) => {
					const isSelected = selectedPlan.key === plan.key;
					return (
						<button
							key={plan.key}
							type="button"
							onClick={() => onPlanSelect(plan)}
							className={`relative w-full overflow-hidden rounded-xl border text-left transition-all duration-200 ${
								isSelected
									? "border-emerald-500 bg-emerald-50 shadow-[0_8px_24px_-12px_rgba(16,185,129,0.25)]"
									: "border-zinc-200 bg-zinc-100 hover:border-zinc-300 hover:bg-zinc-50"
							}`}
						>
							<div className="relative px-4 py-4">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<span
											className={`text-sm font-semibold ${
												isSelected ? "text-emerald-900" : "text-zinc-900"
											}`}
										>
											{plan.name}
										</span>
										{plan.recommended && (
											<span className="rounded-full border border-emerald-500/30 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
												{recommendedLabel}
											</span>
										)}
									</div>
									<span
										className={`font-mono text-sm font-bold tabular-nums ${
											isSelected ? "text-emerald-900" : "text-zinc-900"
										}`}
									>
										{plan.price}
										<span className="text-xs font-normal text-zinc-500">
											{perMonthLabel}
										</span>
									</span>
								</div>
								<ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
									{plan.features.map((f) => (
										<li
											key={f}
											className="flex items-center gap-1 text-xs text-zinc-500"
										>
											<span className="text-emerald-500">+</span> {f}
										</li>
									))}
								</ul>
							</div>
						</button>
					);
				})}
			</div>

			{/* Error */}
			{error && (
				<div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
					{error}
				</div>
			)}

			{/* Activate CTA */}
			<button
				type="button"
				onClick={onActivate}
				disabled={loading}
				className={`mt-6 w-full rounded-xl px-6 py-3.5 text-sm font-semibold transition-all ${
					loading
						? "cursor-not-allowed bg-zinc-200 text-zinc-400"
						: "bg-emerald-600 text-white shadow-[0_8px_24px_-12px_rgba(16,185,129,0.5)] hover:bg-emerald-500 active:scale-[0.98]"
				}`}
			>
				{loading ? (
					<span className="flex items-center justify-center gap-2">
						<svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
							<circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round" />
						</svg>
						{activateLabel}
					</span>
				) : (
					activateLabel
				)}
			</button>

			{/* Secure payment note */}
			{securePaymentLabel && (
				<p className="mt-3 text-center text-xs text-zinc-400">
					{securePaymentLabel}
				</p>
			)}
		</div>
	);
}
