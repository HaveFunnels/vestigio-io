"use client";

/**
 * ResilienceChecklist — Reusable grouped checklist for workspace enrichment.
 *
 * Groups findings by "pillar" (domain-specific categories) and renders
 * each as a pass/fail/warning checklist item derived from the finding's
 * polarity. Collapsible pillar groups.
 *
 * Used by: ChargebackResilience (3.11B Fase 1), SecurityPosture (Fase 3).
 */

import { useState } from "react";
import type { FindingProjection } from "../../../../packages/projections/types";

export interface ChecklistPillar {
	id: string;
	label: string;
	/** Inference keys that belong to this pillar */
	inferenceKeys: string[];
	/** Only show this pillar if at least one of these findings exists */
	requiresData?: boolean;
}

interface Props {
	findings: FindingProjection[];
	pillars: ChecklistPillar[];
}

type ItemStatus = "pass" | "fail" | "warn" | "missing";

function statusFromFinding(f: FindingProjection | undefined): ItemStatus {
	if (!f) return "missing";
	if (f.polarity === "positive") return "pass";
	if (f.severity === "critical" || f.severity === "high") return "fail";
	return "warn";
}

const STATUS_STYLES: Record<ItemStatus, { icon: string; bg: string; text: string; border: string }> = {
	pass: {
		icon: "M13.25 4.75L6 12 2.75 8.75",
		bg: "bg-emerald-500/10",
		text: "text-emerald-400",
		border: "border-emerald-500/20",
	},
	fail: {
		icon: "M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5",
		bg: "bg-red-500/10",
		text: "text-red-400",
		border: "border-red-500/20",
	},
	warn: {
		icon: "M8 4v5M8 11h.01",
		bg: "bg-amber-500/10",
		text: "text-amber-400",
		border: "border-amber-500/20",
	},
	missing: {
		icon: "M4 8h8",
		bg: "bg-surface-inset",
		text: "text-content-faint",
		border: "border-edge/30",
	},
};

function ChecklistItem({ finding, status }: { finding?: FindingProjection; status: ItemStatus }) {
	const s = STATUS_STYLES[status];
	return (
		<div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${s.border} ${s.bg}`}>
			<svg className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${s.text}`} viewBox="0 0 16 16" fill="none">
				<path d={s.icon} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
			</svg>
			<div className="min-w-0 flex-1">
				<p className="text-xs font-medium text-content-secondary">
					{finding?.title || "Not detected"}
				</p>
				{finding && status !== "pass" && finding.root_cause && (
					<p className="mt-0.5 text-[11px] text-content-muted line-clamp-2">
						{finding.root_cause}
					</p>
				)}
			</div>
			{finding?.impact && finding.impact.midpoint > 0 && status !== "pass" && (
				<span className="shrink-0 text-[10px] font-mono text-content-faint">
					${finding.impact.midpoint.toLocaleString()}/mo
				</span>
			)}
		</div>
	);
}

export default function ResilienceChecklist({ findings, pillars }: Props) {
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

	// Build a map of inference_key → finding for fast lookup
	const byKey = new Map<string, FindingProjection>();
	for (const f of findings) {
		if (f.inference_key) byKey.set(f.inference_key, f);
	}

	// Filter pillars that have data (if requiresData is set)
	const visiblePillars = pillars.filter((p) => {
		if (!p.requiresData) return true;
		return p.inferenceKeys.some((k) => byKey.has(k));
	});

	return (
		<div className="space-y-3">
			{visiblePillars.map((pillar) => {
				const isCollapsed = collapsed[pillar.id] ?? false;
				const items = pillar.inferenceKeys
					.map((key) => ({ key, finding: byKey.get(key) }))
					.filter((item) => item.finding); // Only show items with data

				if (items.length === 0) return null;

				const passCount = items.filter((i) => statusFromFinding(i.finding) === "pass").length;
				const total = items.length;

				return (
					<div key={pillar.id}>
						<button
							onClick={() => setCollapsed((prev) => ({ ...prev, [pillar.id]: !isCollapsed }))}
							className="flex w-full items-center gap-2 py-1.5 text-left"
						>
							<svg
								className={`h-3 w-3 text-content-faint transition-transform ${isCollapsed ? "" : "rotate-90"}`}
								viewBox="0 0 16 16"
								fill="none"
							>
								<path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
							</svg>
							<span className="flex-1 text-xs font-semibold text-content-muted">
								{pillar.label}
							</span>
							<span className={`text-[10px] font-mono ${passCount === total ? "text-emerald-400" : "text-content-faint"}`}>
								{passCount}/{total}
							</span>
						</button>
						{!isCollapsed && (
							<div className="mt-1 space-y-1.5 pl-5">
								{items.map(({ key, finding }) => (
									<ChecklistItem
										key={key}
										finding={finding}
										status={statusFromFinding(finding)}
									/>
								))}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
