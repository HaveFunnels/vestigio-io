"use client";

import {
	GlobeIcon,
	BriefcaseIcon,
	StorefrontIcon,
	TargetIcon,
	CurrencyCircleDollarIcon,
	CalculatorIcon,
	SparkleIcon,
	UsersIcon,
	BrainIcon,
	HourglassIcon,
	EnvelopeIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { ComponentType } from "react";

// ──────────────────────────────────────────────
// StepProgressChips — icon-chip progress for the onboarding shell
//
// Replaces the linear progress bar with a row of round icon chips
// connected by short dashes. Active step lights up in emerald;
// completed steps stay green-tinted; upcoming stay neutral gray.
//
// Icon per step is mapped via `StepId` keys that mirror the onboard
// form machine. Unknown ids fall back to a sparkle so the chip row
// never crashes if a new step is added before this map is updated.
// ──────────────────────────────────────────────

export type StepKind =
	| "org"
	| "domain"
	| "business_type"
	| "industry"
	| "conversion_model"
	| "revenue"
	| "ticket"
	| "plan"
	| "concern"
	| "current_method"
	| "why_now"
	| "email";

interface Props {
	steps: readonly StepKind[];
	activeIndex: number;
}

const ICON: Record<StepKind, ComponentType<{ size?: number; weight?: any }>> = {
	org: UsersIcon,
	domain: GlobeIcon,
	business_type: BriefcaseIcon,
	industry: StorefrontIcon,
	conversion_model: TargetIcon,
	revenue: CurrencyCircleDollarIcon,
	ticket: CalculatorIcon,
	plan: SparkleIcon,
	concern: TargetIcon,
	current_method: BrainIcon,
	why_now: HourglassIcon,
	email: EnvelopeIcon,
};

export default function StepProgressChips({ steps, activeIndex }: Props) {
	return (
		<div className="flex items-center justify-center gap-1.5 sm:gap-2.5">
			{steps.map((step, i) => {
				const Icon = ICON[step] ?? SparkleIcon;
				const isActive = i === activeIndex;
				const isDone = i < activeIndex;
				const state = isActive ? "active" : isDone ? "done" : "upcoming";
				return (
					<div key={`${step}-${i}`} className="flex items-center">
						<div
							className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
								state === "active"
									? "bg-emerald-100 ring-2 ring-emerald-500/50 dark:bg-emerald-500/20"
									: state === "done"
										? "bg-emerald-50 dark:bg-emerald-500/10"
										: "bg-surface-inset"
							}`}
							aria-current={isActive ? "step" : undefined}
						>
							<Icon
								size={18}
								weight={state === "upcoming" ? "regular" : "duotone"}
							/>
							<span className="sr-only">
								Step {i + 1} of {steps.length}
							</span>
						</div>
						{i < steps.length - 1 && (
							<span
								className={`mx-0.5 h-px w-3 sm:w-4 ${
									state === "done" ? "bg-emerald-300 dark:bg-emerald-500/40" : "bg-edge"
								}`}
								aria-hidden
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}
