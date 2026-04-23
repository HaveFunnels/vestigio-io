"use client";

// ──────────────────────────────────────────────
// FindingDetailPanel — Unified finding detail component (3.20)
//
// Extracted from 3 duplicated inline implementations:
//   - analysis/page.tsx FindingDrawerContent (full, ~350 lines)
//   - workspaces/[id]/page.tsx FindingDrawerContent (compact, ~135 lines)
//   - workspaces/perspective/[slug]/page.tsx (minimal, ~83 lines)
//
// Used by all pages via <SideDrawer><FindingDetailPanel ... /></SideDrawer>
// and by the canonical /app/findings/[id] page in standalone mode.
//
// CTAs are STATE-DRIVEN, not page-driven:
//   - "Ask Vestigio" → always available
//   - "Create Action" → if finding.action_refs.length === 0
//   - "See Action" → if finding.action_refs.length > 0
//   - "Verify" → if verification_strategy exists
// ──────────────────────────────────────────────

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { FindingProjection } from "@/../../packages/projections/types";
import { useCopilot } from "@/components/app/CopilotProvider";
import { ShinyButton } from "@/components/ui/shiny-button";
import {
	DrawerSection,
	DrawerStatBox,
	DrawerStatRow,
} from "@/components/console/DrawerSection";
import SeverityBadge from "@/components/console/SeverityBadge";
import VerificationBadge from "@/components/console/VerificationBadge";
import ChangeBadge from "@/components/console/ChangeBadge";
import ImpactBadge from "@/components/console/ImpactBadge";
import VerificationPanel from "@/components/console/VerificationPanel";
import VerificationSufficiencyWarning from "@/components/console/VerificationSufficiencyWarning";

export interface FindingDetailPanelProps {
	finding: FindingProjection;
	/** 'full' = all sections (Analysis behavior). 'compact' = hides remediation, KB link (Workspace/Perspective). */
	variant?: "full" | "compact";
	/** Hide the "Open full page" button (e.g., when already on the canonical page). */
}

// ── Pack badge styles ──
const packBadgeStyles: Record<string, string> = {
	scale_readiness:
		"bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
	revenue_integrity:
		"bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
	chargeback_resilience:
		"bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
	saas_growth_readiness:
		"bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
};

export default function FindingDetailPanel({
	finding,
	variant = "full",
}: FindingDetailPanelProps) {
	const td = useTranslations("console.finding_drawer");
	const tc = useTranslations("console.common");
	const router = useRouter();
	const copilot = useCopilot();
	const isFull = variant === "full";

	// KB article lookup (full variant only)
	const [kbLink, setKbLink] = useState<{
		slug: string;
		title: string;
		excerpt?: string;
	} | null>(null);

	useEffect(() => {
		if (!isFull || !finding.inference_key) return;
		fetch(
			`/api/knowledge-base/by-finding-key?key=${encodeURIComponent(finding.inference_key)}`,
		)
			.then((r) => r.json())
			.then((data) => {
				if (data.article) setKbLink(data.article);
			})
			.catch(() => {});
	}, [finding.inference_key, isFull]);

	const packLabels: Record<string, string> = {
		scale_readiness: tc("pack_labels.scale_readiness"),
		revenue_integrity: tc("pack_labels.revenue_integrity"),
		chargeback_resilience: tc("pack_labels.chargeback_resilience"),
		saas_growth_readiness: tc("pack_labels.saas_growth_readiness"),
	};

	const impactTypeLabels: Record<string, string> = {
		revenue_loss: tc("impact_types.revenue_loss"),
		conversion_loss: tc("impact_types.conversion_loss"),
		chargeback_risk: tc("impact_types.chargeback_risk"),
		traffic_waste: tc("impact_types.traffic_waste"),
		lifetime_value_loss: tc("impact_types.lifetime_value_loss"),
		none: tc("impact_types.none"),
	};

	const severityAccent: "danger" | "warning" | "default" =
		finding.polarity === "positive"
			? "default"
			: finding.severity === "critical" || finding.severity === "high"
				? "danger"
				: finding.severity === "medium"
					? "warning"
					: "default";

	return (
		<div className="space-y-5">
			{/* Summary + badges */}
			<DrawerSection title={td("summary")} accent={severityAccent}>
				<p className="text-sm text-content-secondary">{finding.cause}</p>
				<div className="mt-2 flex flex-wrap items-center gap-2">
					{finding.polarity === "positive" ? (
						<span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
							{tc("healthy")}
						</span>
					) : (
						<SeverityBadge value={finding.severity} />
					)}
					<VerificationBadge value={finding.verification_maturity} />
					{finding.change_class && (
						<ChangeBadge value={finding.change_class} />
					)}
					<span
						className={`rounded border px-2 py-0.5 text-xs ${packBadgeStyles[finding.pack] || "border-edge text-content-muted"}`}
					>
						{packLabels[finding.pack] || finding.pack}
					</span>
					{finding.surface && (
						<code className="rounded border border-edge px-2 py-0.5 text-xs text-content-muted">
							{finding.surface}
						</code>
					)}
				</div>
			</DrawerSection>

			{/* Cross-references (3.20 Unified Entity Architecture) */}
			{(finding.workspace_refs.length > 0 ||
				finding.action_refs.length > 0 ||
				finding.opportunity_ref) && (
				<DrawerSection title={td("context") || "Context"}>
					<div className="space-y-1.5">
						{finding.workspace_refs.map((ws) => (
							<Link
								key={ws.id}
								href={`/app/workspaces/${ws.id}`}
								className="flex items-center gap-2 rounded-md border border-edge px-3 py-1.5 text-xs text-content-secondary transition-colors hover:border-accent/40 hover:bg-surface-card-hover"
							>
								<span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
								{ws.name}
							</Link>
						))}
						{finding.action_refs.map((action) => (
							<Link
								key={action.id}
								href={`/app/actions?selected=${encodeURIComponent(action.id)}`}
								className="flex items-center gap-2 rounded-md border border-edge px-3 py-1.5 text-xs text-content-secondary transition-colors hover:border-accent/40 hover:bg-surface-card-hover"
							>
								<span
									className={`h-1.5 w-1.5 rounded-full ${action.category === "incident" ? "bg-red-500" : "bg-emerald-500"}`}
								/>
								{action.title}
								{action.status && (
									<span className="ml-auto text-[10px] text-content-faint">
										{action.status}
									</span>
								)}
							</Link>
						))}
						{finding.opportunity_ref && (
							<div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-400">
								{finding.opportunity_ref.hypothesis}
								{finding.opportunity_ref.value_range && (
									<span className="ml-1 font-mono text-[10px]">
										${finding.opportunity_ref.value_range.min.toLocaleString()}-$
										{finding.opportunity_ref.value_range.max.toLocaleString()}/mo
									</span>
								)}
							</div>
						)}
					</div>
				</DrawerSection>
			)}

			{/* Suppression Callout */}
			{finding.suppression_context?.is_suppressed && (
				<DrawerStatBox accent="warning">
					<div className="px-4 py-3">
						<div className="mb-1 flex items-center gap-2">
							<span className="text-xs font-semibold text-amber-600 dark:text-amber-500">
								{td("suppressed")}
							</span>
							<span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
								{finding.suppression_context.visibility}
							</span>
						</div>
						<p className="text-xs text-amber-600/80 dark:text-amber-300/80">
							{finding.suppression_context.explanation}
						</p>
					</div>
				</DrawerStatBox>
			)}

			{/* Effect */}
			{finding.effect && (
				<DrawerSection title={td("effect")}>
					<p className="text-sm text-content-muted">{finding.effect}</p>
				</DrawerSection>
			)}

			{/* Root Cause */}
			{finding.root_cause && (
				<DrawerSection title={td("root_cause")}>
					<DrawerStatBox>
						<div className="px-4 py-3">
							<span className="text-sm font-medium text-content-secondary">
								{finding.root_cause}
							</span>
						</div>
					</DrawerStatBox>
				</DrawerSection>
			)}

			{/* Remediation Steps (full variant only) */}
			{isFull && finding.polarity !== "positive" && (
				<DrawerSection title={td("remediation")} accent={severityAccent}>
					<DrawerStatBox accent={severityAccent}>
						{finding.remediation_steps &&
						finding.remediation_steps.length > 0 ? (
							<ol className="list-none space-y-2 px-4 py-3">
								{finding.remediation_steps.map((step, i) => (
									<li
										key={i}
										className="flex items-start gap-3 text-sm leading-relaxed text-content-secondary"
									>
										<span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-edge bg-surface-inset text-[10px] font-semibold text-content-muted">
											{i + 1}
										</span>
										<span>{step}</span>
									</li>
								))}
							</ol>
						) : (
							<div className="px-4 py-3 text-sm text-content-faint italic">
								{td("remediation_empty")}
							</div>
						)}
						{finding.estimated_effort_hours != null && (
							<div className="border-t border-edge/50 px-4 py-2.5">
								<div className="flex items-center justify-between text-xs">
									<span className="uppercase tracking-wider text-content-faint">
										{td("estimated_effort")}
									</span>
									<span className="font-mono font-medium text-content-secondary">
										{td("estimated_effort_hours", {
											hours: finding.estimated_effort_hours,
										})}
									</span>
								</div>
							</div>
						)}
					</DrawerStatBox>
				</DrawerSection>
			)}

			{/* Impact Breakdown */}
			{finding.polarity !== "positive" && (
				<DrawerSection
					title={td("impact_breakdown")}
					accent={severityAccent}
				>
					<DrawerStatBox accent={severityAccent}>
						<DrawerStatRow
							label={td("monthly_range")}
							value={
								<ImpactBadge
									min={finding.impact.monthly_range.min}
									max={finding.impact.monthly_range.max}
								/>
							}
						/>
						{isFull && (
							<>
								<DrawerStatRow
									label={td("midpoint")}
									value={
										<ImpactBadge
											min={finding.impact.midpoint}
											max={finding.impact.midpoint}
											compact
										/>
									}
								/>
								<DrawerStatRow
									label={td("impact_type")}
									value={
										impactTypeLabels[
											finding.impact.impact_type
										] || finding.impact.impact_type
									}
								/>
							</>
						)}
					</DrawerStatBox>
				</DrawerSection>
			)}

			{/* Evidence Quality */}
			{finding.evidence_quality && (
				<DrawerSection title={td("evidence_quality")} accent="info">
					<DrawerStatBox accent="info">
						<div className="space-y-2 px-4 py-3">
							<EvidenceQualityBar
								label={td("source_reliability")}
								value={
									finding.evidence_quality.source_reliability
								}
							/>
							<EvidenceQualityBar
								label={td("completeness")}
								value={finding.evidence_quality.completeness}
							/>
							<EvidenceQualityBar
								label={td("recency")}
								value={finding.evidence_quality.recency}
							/>
							<EvidenceQualityBar
								label={td("corroboration")}
								value={finding.evidence_quality.corroboration}
							/>
						</div>
					</DrawerStatBox>
				</DrawerSection>
			)}

			{/* Verification Lifecycle Panel */}
			<DrawerSection title={td("verification")} accent="info">
				<VerificationPanel
					maturity={finding.verification_maturity}
					method={finding.verification_method}
					verifiedAt={null}
					expiresAt={null}
					reTriggerReason={null}
					decisionStatus={null}
					onRequestVerification={() =>
						router.push(
							`/app/chat?intent=verify&finding=${encodeURIComponent(finding.id)}`,
						)
					}
				/>
			</DrawerSection>

			{/* Verification Sufficiency Warning */}
			<VerificationSufficiencyWarning
				severity={finding.severity}
				maturity={finding.verification_maturity}
			/>

			{/* Reasoning */}
			<DrawerSection
				title={
					finding.polarity === "positive"
						? td("why_good")
						: td("reasoning")
				}
			>
				<DrawerStatBox>
					<div className="px-4 py-3">
						<p className="text-sm leading-relaxed text-content-secondary">
							{finding.reasoning}
						</p>
					</div>
				</DrawerStatBox>
			</DrawerSection>

			{/* Truth Context */}
			{finding.truth_context?.has_contradictions && (
				<DrawerSection
					title={td("evidence_contradictions")}
					accent="warning"
				>
					<DrawerStatBox accent="warning">
						<div className="px-4 py-3">
							<p className="text-xs text-amber-600 dark:text-amber-300">
								{td("contradictions_detected", {
									count: finding.truth_context
										.contradiction_count,
								})}
							</p>
						</div>
					</DrawerStatBox>
				</DrawerSection>
			)}

			{/* Knowledge Base Link (full variant only) */}
			{isFull && (
				<section>
					<a
						href={
							kbLink
								? `/app/knowledge-base/${kbLink.slug}`
								: `/app/knowledge-base?finding=${encodeURIComponent(finding.inference_key)}`
						}
						className="group flex items-start gap-3 rounded-md border border-edge bg-surface-card px-4 py-3 text-sm text-content-secondary transition-colors hover:border-accent/40 hover:bg-surface-card-hover"
					>
						<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-edge bg-surface-inset text-content-faint group-hover:text-accent">
							<svg
								className="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								strokeWidth={1.5}
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
								/>
							</svg>
						</div>
						<div className="min-w-0 flex-1">
							<div className="text-[10px] font-semibold uppercase tracking-wider text-content-faint">
								{td("learn_more")}
							</div>
							<div className="mt-0.5 truncate text-sm font-medium text-content">
								{kbLink ? kbLink.title : td("browse_related_docs")}
							</div>
							<div className="mt-0.5 line-clamp-2 text-xs text-content-muted">
								{kbLink?.excerpt || td("docs_coming_soon")}
							</div>
						</div>
						<svg
							className="mt-1 h-3.5 w-3.5 shrink-0 text-content-faint group-hover:text-accent"
							fill="none"
							viewBox="0 0 24 24"
							strokeWidth={2}
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M8.25 4.5l7.5 7.5-7.5 7.5"
							/>
						</svg>
					</a>
				</section>
			)}

			{/* CTAs — state-driven */}
			<section className="space-y-2 pt-2">
				{/* See Action / Create Action */}
				{finding.polarity !== "positive" && (
					<>
						{finding.action_refs.length > 0 ? (
							<button
								onClick={() =>
									router.push(
										`/app/actions?selected=${encodeURIComponent(finding.action_refs[0].id)}`,
									)
								}
								className="w-full rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-600 transition-colors hover:border-sky-500 hover:bg-sky-500/15 dark:text-sky-400"
							>
								{td("see_action") || "See Action"} — {finding.action_refs[0].title}
							</button>
						) : (
							<ShinyButton
								variant="console"
								onClick={() =>
									copilot.open({
										finding,
										prompt: `Discuss this finding: "${finding.title}". What's the impact and what should I do about it?`,
									})
								}
								className="w-full"
							>
								{td("discuss_finding")}
							</ShinyButton>
						)}
					</>
				)}
			</section>
		</div>
	);
}

// ── Evidence Quality Bar (co-located, used only here) ──

function EvidenceQualityBar({
	label,
	value,
}: {
	label: string;
	value: number;
}) {
	const pct = Math.max(0, Math.min(100, value));
	const color =
		pct >= 70
			? "bg-emerald-500"
			: pct >= 40
				? "bg-amber-500"
				: "bg-red-500";
	return (
		<div className="flex items-center gap-3">
			<span className="w-28 shrink-0 text-xs text-content-muted">
				{label}
			</span>
			<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
				<div
					className={`h-1.5 rounded-full transition-all ${color}`}
					style={{ width: `${pct}%` }}
				/>
			</div>
			<span className="w-8 shrink-0 text-right font-mono text-xs text-content-muted">
				{pct}
			</span>
		</div>
	);
}
