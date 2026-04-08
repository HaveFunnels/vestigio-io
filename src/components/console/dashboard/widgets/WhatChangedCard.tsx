"use client";

// ──────────────────────────────────────────────
// WhatChangedCard — narrative summary of the last cycle
//
// The detail layer below the at-a-glance hero stats. Shows the
// FOUR things that happened in the most recent audit cycle vs the
// previous one: new findings, regressions, resolutions, and
// auto-verifications. Each section has its own visual lane (color,
// icon) so the eye can scan to the section that matters most.
//
// **Why it matters (the viciante mechanic):** this is where the
// "what's changed since last visit" reveal lives in detailed form.
// The dopamine driver is variability — every cycle has different
// stuff happening, so opening this card always rewards curiosity
// with new content.
// ──────────────────────────────────────────────

import { ArrowsClockwise, CheckCircle, Plus, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { registerWidget, type WidgetProps } from "@/lib/dashboard/widget-registry";
import type { ChangeReportEntry } from "@/lib/dashboard/types";

function formatCurrency(cents?: number): string {
	if (!cents) return "";
	const dollars = cents / 100;
	if (dollars >= 1_000) {
		return `$${(dollars / 1_000).toFixed(1)}k`;
	}
	return `$${dollars.toFixed(0)}`;
}

function severityClass(severity?: ChangeReportEntry["severity"]): string {
	switch (severity) {
		case "critical":
			return "bg-red-500";
		case "high":
			return "bg-orange-500";
		case "medium":
			return "bg-amber-500";
		case "low":
			return "bg-blue-500";
		default:
			return "bg-content-faint";
	}
}

function EntryRow({ entry }: { entry: ChangeReportEntry }) {
	return (
		<li className="group flex items-center gap-3 py-1.5">
			<div className={`h-1 w-1 shrink-0 rounded-full ${severityClass(entry.severity)}`} />
			<span className="flex-1 truncate text-xs text-content-secondary group-hover:text-content">
				{entry.title}
			</span>
			{entry.impactCents != null && (
				<span className="font-mono text-[11px] tabular-nums text-content-faint">
					{formatCurrency(entry.impactCents)}
				</span>
			)}
		</li>
	);
}

interface SectionProps {
	icon: React.ReactNode;
	label: string;
	count: number;
	tone: "added" | "regressed" | "resolved" | "verified";
	entries?: ChangeReportEntry[];
}

const TONE_CLASSES: Record<SectionProps["tone"], string> = {
	added: "text-emerald-400",
	regressed: "text-red-400",
	resolved: "text-emerald-400",
	verified: "text-blue-400",
};

function Section({ icon, label, count, tone, entries }: SectionProps) {
	return (
		<div className="flex flex-col gap-1">
			<div className={`flex items-baseline gap-2 ${TONE_CLASSES[tone]}`}>
				<span className="flex h-4 w-4 items-center justify-center">{icon}</span>
				<span className="font-mono text-base font-medium tabular-nums">{count}</span>
				<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
					{label}
				</span>
			</div>
			{entries && entries.length > 0 && (
				<ul className="ml-6 divide-y divide-edge/30">
					{entries.slice(0, 3).map((e) => (
						<EntryRow key={e.id} entry={e} />
					))}
				</ul>
			)}
		</div>
	);
}

function WhatChangedCardComponent({ data }: WidgetProps) {
	const { newFindings, regressions, resolved, verificationsConfirmed } = data.changeReport;

	return (
		<div className="flex h-full flex-col p-6">
			{/* Eyebrow */}
			<div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
				<span>What changed since last cycle</span>
				<span className="text-content-faint">last 24h</span>
			</div>

			{/* Four sections in a grid — each section has its own lane.
			    Sections with entries show the top 3 items as a small
			    bullet list directly below the count. */}
			<div className="mt-4 grid flex-1 grid-cols-1 gap-5 md:grid-cols-2">
				<Section
					icon={<Plus size={14} weight="bold" />}
					label="new findings"
					count={newFindings.length}
					tone="added"
					entries={newFindings}
				/>
				<Section
					icon={<ArrowsClockwise size={14} weight="bold" />}
					label="regressions"
					count={regressions.length}
					tone="regressed"
					entries={regressions}
				/>
				<Section
					icon={<CheckCircle size={14} weight="bold" />}
					label="resolved"
					count={resolved.length}
					tone="resolved"
					entries={resolved}
				/>
				<Section
					icon={<ShieldCheck size={14} weight="bold" />}
					label="verifications confirmed"
					count={verificationsConfirmed}
					tone="verified"
				/>
			</div>
		</div>
	);
}

registerWidget({
	id: "what_changed",
	version: 1,
	nameKey: "console.dashboard.widgets.what_changed.name",
	descriptionKey: "console.dashboard.widgets.what_changed.description",
	category: "activity",
	icon: "list-checks",
	defaultSize: { w: 12, h: 3 },
	minSize: { w: 6, h: 3 },
	maxSize: { w: 12, h: 4 },
	resizable: true,
	removable: true,
	inCatalog: true,
	dataKeys: ["changeReport"],
	Component: WhatChangedCardComponent,
});
