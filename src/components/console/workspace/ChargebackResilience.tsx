"use client";

/**
 * ChargebackResilience — Domain-specific primary view for the
 * chargeback workspace. Replaces the generic findings table as
 * the main content above the drill-down table.
 *
 * Layout: 60/40 split — checklist (left) + trust score card (right).
 */

import { useTranslations } from "next-intl";
import type { FindingProjection } from "../../../../packages/projections/types";
import ResilienceChecklist, { type ChecklistPillar } from "./ResilienceChecklist";
import TrustScoreCard from "./TrustScoreCard";

const CHARGEBACK_PILLAR_DEFS = [
	{
		id: "pre_transaction",
		labelKey: "pillars.pre_transaction" as const,
		inferenceKeys: [
			"refund_policy_gap",
			"terms_conditions_missing",
			"support_unreachable",
			"product_description_misleading",
			"subscription_disclosure_missing",
			"shipping_policy_gap",
			"cancellation_docs_missing",
			"expectation_misalignment",
		],
	},
	{
		id: "transaction_security",
		labelKey: "pillars.transaction_security" as const,
		inferenceKeys: [
			"three_d_secure_detected",
			"fraud_screening_tool_detected",
			"trust_signals_payment_page",
			"dispute_risk_elevated",
		],
	},
	{
		id: "post_transaction",
		labelKey: "pillars.post_transaction" as const,
		inferenceKeys: [
			"dispute_rate_zone",
			"refund_rate_health",
			"refund_turnaround",
		],
		requiresData: true,
	},
];

interface Props {
	findings: FindingProjection[];
}

export default function ChargebackResilience({ findings }: Props) {
	const t = useTranslations("console.workspaces.detail.enrichment");

	// Render a positive empty state when no chargeback findings exist —
	// silent null left chargeback workspaces looking abandoned even when
	// the audit had simply not flagged anything in that pack yet.
	const hasChargebackData = findings.some((f) => f.pack === "chargeback_resilience" || f.pack === "chargeback");
	if (!hasChargebackData) {
		return (
			<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
				<div className="flex items-center gap-2">
					<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
					<h3 className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-semibold uppercase tracking-[0.15em] text-content-muted">
						{t("chargeback_empty_label")}
					</h3>
				</div>
				<p className="mt-2 text-[13px] font-medium text-content">
					{t("chargeback_empty_title")}
				</p>
				<p className="mt-1 text-[12px] text-content-muted">
					{t("chargeback_empty_description")}
				</p>
			</section>
		);
	}

	const pillars: ChecklistPillar[] = CHARGEBACK_PILLAR_DEFS.map((d) => ({
		id: d.id,
		label: t(d.labelKey),
		inferenceKeys: d.inferenceKeys,
		requiresData: d.requiresData,
	}));

	return (
		<div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
			{/* Left: Checklist (60%) */}
			<div className="lg:col-span-3">
				<h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-content-faint">
					{t("resilience_checklist")}
				</h3>
				<ResilienceChecklist
					findings={findings}
					pillars={pillars}
				/>
			</div>

			{/* Right: Trust Score (40%) */}
			<div className="lg:col-span-2">
				<h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-content-faint">
					{t("trust_score")}
				</h3>
				<TrustScoreCard
					findings={findings}
					filterPacks={["chargeback_resilience", "chargeback"]}
				/>
			</div>
		</div>
	);
}
