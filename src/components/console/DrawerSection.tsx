"use client";

// ──────────────────────────────────────────────
// DrawerSection + DrawerStatBox — shared primitives for SideDrawer content
//
// Phase 5 polish: extracted because both Actions and Analysis drawers
// were repeating the same `<section><h3 class="..."></h3>...` boilerplate
// for every block, which made it tempting to leave the styling
// uninspired. Centralizing the section frame here lets us:
//
//   1. Apply the dashboard's hero+caption + accent gradient + colored
//      shadow language consistently across every drawer block
//   2. Theme-aware out of the box (uses the same `text-{tone}-600
//      dark:text-{tone}-400` pattern as the rewritten SummaryCards)
//   3. JetBrains Mono on numeric values via `font-mono tabular-nums`
//   4. Single place to update if the section style needs another pass
//
// **DrawerSection** wraps a titled block. Optional `accent` adds a
// subtle colored gradient highlight in the top-left and a matching
// dot to the eyebrow — same vocabulary as SummaryCards variants.
//
// **DrawerStatBox** is a card-shaped container (border + bg + corner
// gradient) that holds rows of `DrawerStatRow`. Use it for "Impact
// Breakdown", "Evidence Quality", "Description + Root Cause" — any
// place that was previously a flat `border border-edge bg-surface-card`.
//
// **DrawerStatRow** is one label/value pair inside a DrawerStatBox.
// The `mono` flag turns on JetBrains Mono + tabular-nums (use for
// money, scores, percentages). The `tone` controls the value color
// (default uses content-secondary; danger/warning/success/info map
// to the same scale as elsewhere).
//
// **DrawerHeroValue** is the big mono number used as the focal
// point of a section (e.g. the "monthly midpoint" surfaced in the
// Action drawer). Mirrors the dashboard hero numbers — left-aligned,
// JetBrains Mono, tabular-nums, large.
// ──────────────────────────────────────────────

import type { ReactNode } from "react";

export type DrawerAccent =
	| "default"
	| "success"
	| "warning"
	| "danger"
	| "info";

const accentDot: Record<DrawerAccent, string> = {
	default: "bg-content-faint",
	success: "bg-emerald-500",
	warning: "bg-amber-500",
	danger: "bg-red-500",
	info: "bg-blue-500",
};

const accentGradient: Record<DrawerAccent, string> = {
	default: "from-transparent",
	success: "from-emerald-500/[0.05]",
	warning: "from-amber-500/[0.05]",
	danger: "from-red-500/[0.05]",
	info: "from-blue-500/[0.05]",
};

const accentShadow: Record<DrawerAccent, string> = {
	default: "",
	success: "shadow-[0_8px_24px_-14px_rgba(16,185,129,0.22)]",
	warning: "shadow-[0_8px_24px_-14px_rgba(245,158,11,0.22)]",
	danger: "shadow-[0_8px_24px_-14px_rgba(239,68,68,0.22)]",
	info: "shadow-[0_8px_24px_-14px_rgba(59,130,246,0.22)]",
};

const valueTone: Record<DrawerAccent, string> = {
	default: "text-content",
	success: "text-emerald-600 dark:text-emerald-400",
	warning: "text-amber-600 dark:text-amber-400",
	danger: "text-red-600 dark:text-red-400",
	info: "text-blue-600 dark:text-blue-400",
};

// ──────────────────────────────────────────────
// DrawerSection — titled block with optional accent dot
// ──────────────────────────────────────────────
export function DrawerSection({
	title,
	accent = "default",
	titleSlot,
	children,
}: {
	title: string;
	accent?: DrawerAccent;
	/** Optional content rendered inline next to the title (e.g. tooltip) */
	titleSlot?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section>
			<div className='mb-2 flex items-center gap-1.5'>
				<span
					className={`h-1.5 w-1.5 shrink-0 rounded-full ${accentDot[accent]}`}
					aria-hidden
				/>
				<h3 className='text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint'>
					{title}
				</h3>
				{titleSlot}
			</div>
			{children}
		</section>
	);
}

// ──────────────────────────────────────────────
// DrawerStatBox — card frame with optional accent gradient + shadow
// ──────────────────────────────────────────────
export function DrawerStatBox({
	accent = "default",
	className = "",
	children,
}: {
	accent?: DrawerAccent;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={`relative overflow-hidden rounded-xl border border-edge bg-surface-card ${accentShadow[accent]} ${className}`}
		>
			<div
				className={`pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br ${accentGradient[accent]} via-transparent to-transparent`}
				aria-hidden
			/>
			<div className='relative'>{children}</div>
		</div>
	);
}

// ──────────────────────────────────────────────
// DrawerStatRow — one label/value row inside a stat box
// ──────────────────────────────────────────────
export function DrawerStatRow({
	label,
	value,
	mono = false,
	tone = "default",
	negative = false,
}: {
	label: string;
	value: ReactNode;
	mono?: boolean;
	tone?: DrawerAccent;
	negative?: boolean;
}) {
	const valueClasses = `${
		mono ? "font-mono text-xs tabular-nums" : "text-xs"
	} ${negative ? "text-red-600 dark:text-red-400" : valueTone[tone]}`;
	return (
		<div className='flex items-center justify-between gap-3 border-b border-edge/40 px-4 py-2.5 last:border-b-0'>
			<span className='text-xs text-content-muted'>{label}</span>
			{typeof value === "string" || typeof value === "number" ? (
				<span className={valueClasses}>
					{negative && typeof value !== "undefined" ? `−${value}` : value}
				</span>
			) : (
				value
			)}
		</div>
	);
}

// ──────────────────────────────────────────────
// DrawerHeroValue — big mono number for focal stats
// ──────────────────────────────────────────────
export function DrawerHeroValue({
	value,
	suffix,
	tone = "default",
	negative = false,
}: {
	value: string | number;
	/** Smaller faint suffix appended after the value (e.g. "/mo") */
	suffix?: string;
	tone?: DrawerAccent;
	negative?: boolean;
}) {
	const display = negative ? `−${value}` : value;
	const colorClass = negative
		? "text-red-600 dark:text-red-400"
		: valueTone[tone];
	return (
		<div className='flex items-baseline gap-1'>
			<span
				className={`font-mono text-3xl font-medium tabular-nums leading-none ${colorClass}`}
			>
				{display}
			</span>
			{suffix && (
				<span className='font-mono text-xs text-content-faint'>{suffix}</span>
			)}
		</div>
	);
}
