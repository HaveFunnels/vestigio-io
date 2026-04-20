"use client";

/**
 * ProductTour — the single source of truth for the "this is what
 * Vestigio looks like" surface on the homepage.
 *
 * Replaces the legacy 6-tab static mockup AND the duplicate
 * `BrowserShell` block that used to live inside the Hero. Everything
 * the old Hero shell did (priority queue, AI assistant overlay,
 * recovery callout) now lives here, anchored to the corners of the
 * actual product mockup as floating overlay cards.
 *
 * Layout:
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ Section header (eyebrow / title / subtitle)  │
 *   ├──────────────────────────────────────────────┤
 *   │ ╔════════════ Browser shell ═══════════════╗ │
 *   │ ║ chrome bar (traffic lights + URL)         ║ │
 *   │ ║ ┌──────┬───────────────────────────────┐  ║ │
 *   │ ║ │ side │  active panel content         │  ║ │
 *   │ ║ │ nav  │  (Actions / Analysis / …)     │  ║ │
 *   │ ║ │      │                               │  ║ │
 *   │ ║ └──────┴───────────────────────────────┘  ║ │
 *   │ ║   ⤴ AI assistant float (top-left)        ║ │
 *   │ ║   ⤵ Recovered callout (bottom-right)     ║ │
 *   │ ╚═══════════════════════════════════════════╝ │
 *   └──────────────────────────────────────────────┘
 *
 * Design vocabulary inherited from the dashboard:
 *   - JetBrains Mono + tabular-nums on every number
 *   - Negative loss values prefixed with typographic minus + red
 *   - Severity dots scaled by tone (red → orange → amber → sky)
 *   - Eyebrow strips with colored dot + uppercase tracking
 *   - Liquid-glass overlay cards (gradient backdrop + thin highlight
 *     ring) — same pattern as the dashboard SummaryCards
 *
 * All copy is i18n-driven via `homepage.product_tour.*`. The mock
 * data is intentionally larger than the previous version (9 actions,
 * 10 findings, 12 inventory rows, 5 workspaces, 4 chat exchanges,
 * 8 map nodes) so the panels never look empty regardless of which
 * tab the user lands on.
 */

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ShinyButton } from "@/components/ui/shiny-button";

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

type Severity = "critical" | "high" | "medium" | "low";
type Tone = "red" | "orange" | "amber" | "sky" | "emerald";

interface ActionRow {
	priority: string;
	title: string;
	desc: string;
	impact: string;
	severity: Severity;
}

interface FindingRow {
	title: string;
	severity: Severity;
	impact: string;
}

interface SummaryCard {
	label: string;
	value: string;
	sub: string;
}

interface InventoryRow {
	path: string;
	label: string;
	status: "live" | "down" | "warn";
	code: number;
	findings: number;
}

interface WorkspaceRow {
	name: string;
	urgency: string;
	tone: Tone;
	desc: string;
}

interface ChatMessage {
	from: "user" | "ai";
	text: string;
	chips?: string[];
}

interface MapNode {
	label: string;
	path: string;
	pct: number;
	main?: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Tone tokens (centralized so every panel uses the same vocabulary)
// ─────────────────────────────────────────────────────────────────────

const SEVERITY_DOT: Record<Severity, string> = {
	critical: "bg-red-400",
	high: "bg-orange-400",
	medium: "bg-amber-400",
	low: "bg-sky-400",
};

const SEVERITY_BADGE: Record<Severity, string> = {
	critical: "border-red-500/30 bg-red-500/10 text-red-300",
	high: "border-orange-500/30 bg-orange-500/10 text-orange-300",
	medium: "border-amber-500/30 bg-amber-500/10 text-amber-300",
	low: "border-sky-500/30 bg-sky-500/10 text-sky-300",
};

const TONE_BADGE: Record<Tone, string> = {
	red: "border-red-500/30 bg-red-500/10 text-red-300",
	orange: "border-orange-500/30 bg-orange-500/10 text-orange-300",
	amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
	sky: "border-sky-500/30 bg-sky-500/10 text-sky-300",
	emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};

const TONE_RING: Record<Tone, string> = {
	red: "border-red-500/30 bg-red-500/10",
	orange: "border-orange-500/30 bg-orange-500/10",
	amber: "border-amber-500/30 bg-amber-500/10",
	sky: "border-sky-500/30 bg-sky-500/10",
	emerald: "border-emerald-500/30 bg-emerald-500/10",
};

const TONE_TEXT: Record<Tone, string> = {
	red: "text-red-300",
	orange: "text-orange-300",
	amber: "text-amber-300",
	sky: "text-sky-300",
	emerald: "text-emerald-300",
};

// Render a translation string that contains `**bold**` markers as
// React nodes with `<strong>` elements. Trusted-input only — the
// translation strings are static literals from the dictionary, no
// user input is interpolated. We use this instead of
// `dangerouslySetInnerHTML` to keep the surface free of XSS vectors.
function renderRichText(input: string): ReactNode[] {
	const parts = input.split(/(\*\*[^*]+\*\*)/g);
	return parts.map((part, i) => {
		if (part.startsWith("**") && part.endsWith("**")) {
			return <strong key={i}>{part.slice(2, -2)}</strong>;
		}
		return <span key={i}>{part}</span>;
	});
}

// ─────────────────────────────────────────────────────────────────────
// Tab definitions — icons only; labels come from translations
// ─────────────────────────────────────────────────────────────────────

const TABS = ["actions", "analysis", "inventory", "workspaces", "chat", "maps"] as const;
type TabId = typeof TABS[number];

const TAB_ICONS: Record<TabId, JSX.Element> = {
	actions: (
		<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
			<path d="M11 2L4.5 11.5H10L9 18L15.5 8.5H10L11 2Z" />
		</svg>
	),
	analysis: (
		<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
			<path d="M3 16V10" />
			<path d="M7 16V6" />
			<path d="M11 16V8" />
			<path d="M15 16V3" />
		</svg>
	),
	inventory: (
		<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
			<rect x="3" y="3" width="14" height="14" rx="2" />
			<path d="M3 8H17" />
			<path d="M8 8V17" />
		</svg>
	),
	workspaces: (
		<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
			<rect x="2" y="2" width="7" height="7" rx="1.5" />
			<rect x="11" y="2" width="7" height="7" rx="1.5" />
			<rect x="2" y="11" width="7" height="7" rx="1.5" />
			<rect x="11" y="11" width="7" height="7" rx="1.5" />
		</svg>
	),
	chat: (
		<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
			<path d="M4 4H16C16.5523 4 17 4.44772 17 5V13C17 13.5523 16.5523 14 16 14H7L3 17V5C3 4.44772 3.44772 4 4 4Z" />
		</svg>
	),
	maps: (
		<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
			<circle cx="5" cy="5" r="2" />
			<circle cx="15" cy="5" r="2" />
			<circle cx="10" cy="15" r="2" />
			<path d="M7 5H13" />
			<path d="M6.5 6.5L8.5 13.5" />
			<path d="M13.5 6.5L11.5 13.5" />
		</svg>
	),
};

// ─────────────────────────────────────────────────────────────────────
// Action queue panel
// ─────────────────────────────────────────────────────────────────────

function ActionsPanel() {
	const t = useTranslations("homepage.product_tour.actions_panel");
	const rows = t.raw("rows") as ActionRow[];

	return (
		<div className="space-y-2">
			<div className="mb-3 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
						<span className="h-1 w-1 rounded-full bg-emerald-400" />
						{t("eyebrow")}
					</span>
				</div>
				<span className="font-mono text-[10px] tabular-nums text-zinc-500">
					{t("count")}
				</span>
			</div>
			<div className="space-y-1.5">
				{rows.map((a) => (
					<div
						key={a.priority}
						className="group flex items-center gap-3 rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5 transition-colors hover:border-white/[0.08] hover:bg-white/[0.03]"
					>
						<span className="inline-flex h-6 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.05] font-mono text-[10px] font-bold tabular-nums text-zinc-400">
							{a.priority}
						</span>
						<span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[a.severity]}`} />
						<div className="min-w-0 flex-1">
							<div className="truncate text-[11px] font-medium text-zinc-100 sm:text-xs">
								{a.title}
							</div>
							<div className="mt-0.5 hidden truncate text-[10px] text-zinc-500 sm:block">
								{a.desc}
							</div>
						</div>
						<span className="hidden shrink-0 font-mono text-[10px] tabular-nums text-red-400 sm:inline sm:text-[11px]">
							{a.impact}
						</span>
						<span
							className={`hidden shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] md:inline-block ${SEVERITY_BADGE[a.severity]}`}
						>
							{a.severity}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────
// Analysis panel — summary cards + findings list
// ─────────────────────────────────────────────────────────────────────

function AnalysisPanel() {
	const t = useTranslations("homepage.product_tour.analysis_panel");
	const summary = t.raw("summary_cards") as SummaryCard[];
	const rows = t.raw("rows") as FindingRow[];

	return (
		<div>
			<h4 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
				{t("summary_header")}
			</h4>
			<div className="mb-5 grid grid-cols-2 gap-2 sm:gap-2.5 md:grid-cols-3 lg:grid-cols-6">
				{summary.map((c) => (
					<div
						key={c.label}
						className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 lg:p-3"
					>
						<div className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">
							{c.label}
						</div>
						<div
							className={`mt-1 font-mono text-base font-semibold tabular-nums lg:text-lg ${
								c.value.startsWith("−") ? "text-red-400" : "text-white"
							}`}
						>
							{c.value}
						</div>
						<div className="mt-0.5 text-[9px] text-zinc-500">{c.sub}</div>
					</div>
				))}
			</div>
			<h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
				{t("findings_header")}
			</h4>
			<div className="space-y-1.5">
				{rows.map((f, i) => (
					<div
						key={i}
						className="rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2"
					>
						<div className="flex items-center gap-3">
							<span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[f.severity]}`} />
							<span className="min-w-0 flex-1 truncate text-[11px] text-zinc-200 sm:text-xs">
								{f.title}
							</span>
							<span
								className={`hidden shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] md:inline-block ${SEVERITY_BADGE[f.severity]}`}
							>
								{f.severity}
							</span>
						</div>
						<div className="mt-1 pl-[18px] font-mono text-[10px] tabular-nums text-red-400 sm:text-[11px]">
							{f.impact}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────
// Inventory panel — table on desktop, stacked cards on mobile
// ─────────────────────────────────────────────────────────────────────

function InventoryPanel() {
	const t = useTranslations("homepage.product_tour.inventory_panel");
	const rows = t.raw("rows") as InventoryRow[];

	const statusLabel = (s: InventoryRow["status"]) =>
		s === "live" ? t("status_live") : s === "down" ? t("status_down") : t("status_warn");

	const statusColor = (s: InventoryRow["status"]) =>
		s === "live"
			? { text: "text-emerald-400", dot: "bg-emerald-400" }
			: s === "down"
				? { text: "text-red-400", dot: "bg-red-400" }
				: { text: "text-amber-400", dot: "bg-amber-400" };

	const liveCount = rows.filter(r => r.status === "live").length;
	const downCount = rows.filter(r => r.status !== "live").length;

	return (
		<div>
			<h4 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
				{t("header")}
			</h4>

			{/* Live / Down summary strip */}
			<div className="mb-3 flex gap-2">
				<div className="flex flex-1 items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2">
					<span className="h-2 w-2 rounded-full bg-emerald-400" />
					<span className="font-mono text-sm font-semibold tabular-nums text-emerald-300">{liveCount}</span>
					<span className="text-[10px] text-emerald-400/70">{t("status_live")}</span>
				</div>
				<div className="flex flex-1 items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2">
					<span className="h-2 w-2 rounded-full bg-red-400" />
					<span className="font-mono text-sm font-semibold tabular-nums text-red-300">{downCount}</span>
					<span className="text-[10px] text-red-400/70">{t("status_down")}</span>
				</div>
			</div>

			{/* Mobile: stacked cards */}
			<div className="space-y-1.5 sm:hidden">
				{rows.map((s) => {
					const sc = statusColor(s.status);
					return (
						<div
							key={s.path}
							className="rounded-lg border border-white/[0.05] bg-white/[0.015] p-2.5"
						>
							<div className="flex items-center justify-between gap-2">
								<span className="truncate text-[11px] font-medium text-zinc-100">
									{s.label}
								</span>
								<span className={`inline-flex shrink-0 items-center gap-1.5 text-[9px] font-semibold ${sc.text}`}>
									<span className={`inline-block h-1.5 w-1.5 rounded-full ${sc.dot}`} />
									{statusLabel(s.status)}
								</span>
							</div>
							<div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
								<span className="truncate font-mono text-zinc-500">{s.path}</span>
								<div className="flex shrink-0 items-center gap-2 font-mono tabular-nums">
									<span className={s.code >= 500 ? "text-red-400" : "text-zinc-600"}>
										{s.code}
									</span>
									<span className="text-zinc-400">
										{s.findings} {s.findings === 1 ? t("findings_label_one") : t("findings_label")}
									</span>
								</div>
							</div>
						</div>
					);
				})}
			</div>

			{/* Desktop: table */}
			<div className="hidden overflow-x-auto sm:block">
				<table className="w-full text-left text-xs">
					<thead>
						<tr className="border-b border-white/[0.06] text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
							<th className="pb-2 pr-4">{t("headers.surface")}</th>
							<th className="pb-2 pr-4">{t("headers.path")}</th>
							<th className="pb-2 pr-4">{t("headers.status")}</th>
							<th className="pb-2 pr-4">{t("headers.http")}</th>
							<th className="pb-2 text-right">{t("headers.findings")}</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((s) => {
							const sc = statusColor(s.status);
							return (
								<tr key={s.path} className="border-b border-white/[0.04]">
									<td className="py-2 pr-4 text-[11px] text-zinc-200">{s.label}</td>
									<td className="py-2 pr-4 font-mono text-[10px] text-zinc-500">{s.path}</td>
									<td className="py-2 pr-4">
										<span className={`inline-flex items-center gap-1.5 text-[9px] font-semibold ${sc.text}`}>
											<span className={`inline-block h-1.5 w-1.5 rounded-full ${sc.dot}`} />
											{statusLabel(s.status)}
										</span>
									</td>
									<td className={`py-2 pr-4 font-mono text-[10px] tabular-nums ${s.code >= 500 ? "text-red-400" : "text-zinc-500"}`}>
										{s.code}
									</td>
									<td className="py-2 text-right font-mono text-[10px] tabular-nums text-zinc-300">
										{s.findings}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────
// Workspaces panel — colored tone cards
// ─────────────────────────────────────────────────────────────────────

function WorkspacesPanel() {
	const t = useTranslations("homepage.product_tour.workspaces_panel");
	const rows = t.raw("rows") as WorkspaceRow[];

	return (
		<div>
			<h4 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
				{t("header")}
			</h4>
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{rows.map((w) => (
					<div
						key={w.name}
						className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 transition-colors hover:bg-white/[0.04]"
					>
						<div className="mb-2 flex items-center justify-between gap-2">
							<span className="truncate text-[12px] font-semibold text-white">{w.name}</span>
							<span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] ${TONE_BADGE[w.tone]}`}>
								{w.urgency}
							</span>
						</div>
						<p className="text-[10px] leading-relaxed text-zinc-500">{w.desc}</p>
					</div>
				))}
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────
// Chat panel — multi-turn conversation
// ─────────────────────────────────────────────────────────────────────

function ChatPanel() {
	const t = useTranslations("homepage.product_tour.chat_panel");
	const thread = t.raw("thread") as ChatMessage[];

	return (
		<div className="flex h-full flex-col">
			<h4 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
				{t("header")}
			</h4>
			<div className="flex-1 space-y-3">
				{thread.map((msg, i) =>
					msg.from === "user" ? (
						<div key={i} className="flex justify-end">
							<div className="max-w-[88%] rounded-xl rounded-br-sm border border-white/[0.08] bg-white/[0.05] px-3 py-2 sm:max-w-[70%]">
								<p className="text-[11px] text-zinc-200 sm:text-xs">{msg.text}</p>
							</div>
						</div>
					) : (
						<div key={i} className="flex justify-start">
							<div className="max-w-[92%] rounded-xl rounded-bl-sm border border-violet-500/20 bg-violet-500/[0.05] px-3 py-2.5 sm:max-w-[80%]">
								<div className="mb-1.5 flex items-center gap-1.5">
									<div className="h-1.5 w-1.5 rounded-full bg-violet-400" />
									<span className="text-[9px] font-semibold uppercase tracking-wider text-violet-300">
										Vestigio AI
									</span>
								</div>
								<p className="text-[11px] leading-relaxed text-zinc-200 sm:text-xs">
									{renderRichText(msg.text)}
								</p>
								{msg.chips && (
									<div className="mt-2 flex flex-wrap gap-1">
										{msg.chips.map((chip, ci) => (
											<span
												key={ci}
												className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-emerald-300"
											>
												{chip}
											</span>
										))}
									</div>
								)}
							</div>
						</div>
					)
				)}
			</div>
			<div className="mt-3 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
				<span className="flex-1 text-[11px] text-zinc-600">{t("input_placeholder")}</span>
				<div className="grid h-5 w-5 place-items-center rounded bg-white/[0.06]">
					<svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
						<path d="M5 10H15" />
						<path d="M10 5L15 10L10 15" />
					</svg>
				</div>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────
// Maps panel — graph of journey nodes
// ─────────────────────────────────────────────────────────────────────

/** Single flowchart node */
function FlowNode({ node, size = "sm" }: { node: MapNode; size?: "sm" | "lg" }) {
	const isMain = !!node.main;
	return (
		<div className="flex flex-col items-center gap-0.5">
			<div className={`grid place-items-center rounded-full font-mono font-bold tabular-nums ${
				size === "lg"
					? "h-11 w-11 text-[11px] md:h-12 md:w-12 md:text-xs"
					: "h-8 w-8 text-[9px] md:h-9 md:w-9 md:text-[10px]"
			} ${
				isMain
					? "border-2 border-emerald-400/50 bg-[#0c1a14] text-emerald-300"
					: "border border-white/[0.08] bg-[#0d0d17] text-zinc-500"
			}`}>
				{node.pct}%
			</div>
			<span className={`max-w-[60px] truncate text-center leading-tight md:max-w-[80px] ${
				size === "lg"
					? "text-[9px] font-semibold text-zinc-200 md:text-[11px]"
					: "text-[8px] text-zinc-400 md:text-[9px]"
			}`}>
				{node.label}
			</span>
		</div>
	);
}

/*
 * Mobile vertical flowchart with curved SVG connectors.
 *
 * Grid: 3 columns. 5 rows: start, stage1, stage2, stage3, finish.
 * Main nodes zigzag: col0 → col1 → col2 so the path isn't a straight
 * line. An SVG sits behind the grid drawing quadratic bezier curves
 * from one main node center to the next.
 *
 * Main node column indices: start=1, stage0=0, stage1=1, stage2=2, finish=1
 * X centers (% of width):  col0≈16.7%, col1=50%, col2≈83.3%
 *
 * Row Y centers are evenly spaced across 5 rows.
 */

// Column X positions as % of the SVG viewBox width (0–100)
const COL_X = [16.7, 50, 83.3];
// Row Y positions (5 rows, evenly spaced with padding)
const ROW_Y = [6, 27, 50, 73, 94];
// Which column holds the main node per row
const MAIN_COL = [1, 0, 1, 2, 1]; // start, s1, s2, s3, finish

/** Build the SVG path that curves through the main nodes (mobile) */
function buildMobilePath(): string {
	const pts = MAIN_COL.map((col, row) => ({ x: COL_X[col], y: ROW_Y[row] }));
	let d = `M${pts[0].x} ${pts[0].y}`;
	for (let i = 1; i < pts.length; i++) {
		const prev = pts[i - 1];
		const curr = pts[i];
		const midY = (prev.y + curr.y) / 2;
		d += ` C${prev.x} ${midY}, ${curr.x} ${midY}, ${curr.x} ${curr.y}`;
	}
	return d;
}

/** Build the SVG path for desktop (horizontal flow) */
// Desktop: 5 columns, 3 rows. Main nodes zigzag vertically: row1→row0→row1→row2→row1
const DESK_COL_X = [6, 27, 50, 73, 94];
const DESK_ROW_Y = [16.7, 50, 83.3];
const DESK_MAIN_ROW = [1, 0, 1, 2, 1]; // start, s1, s2, s3, finish

function buildDesktopPath(): string {
	const pts = DESK_MAIN_ROW.map((row, col) => ({ x: DESK_COL_X[col], y: DESK_ROW_Y[row] }));
	let d = `M${pts[0].x} ${pts[0].y}`;
	for (let i = 1; i < pts.length; i++) {
		const prev = pts[i - 1];
		const curr = pts[i];
		const midX = (prev.x + curr.x) / 2;
		d += ` C${midX} ${prev.y}, ${midX} ${curr.y}, ${curr.x} ${curr.y}`;
	}
	return d;
}

function MapsPanel() {
	const t = useTranslations("homepage.product_tour.maps_panel");
	const start = t.raw("start") as MapNode;
	const finish = t.raw("finish") as MapNode;
	const stages = t.raw("stages") as MapNode[][];

	return (
		<div className="flex h-full flex-col">
			<div className="mb-4">
				<h4 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
					{t("header")}
				</h4>
				<p className="mt-1 text-[10px] text-zinc-600">{t("subtext")}</p>
			</div>

			{/* ── Mobile: vertical flowchart ── */}
			<div className="relative flex-1 md:hidden">
				{/* Curved connector SVG behind everything */}
				<svg className="absolute inset-0 -z-10 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none">
					<path d={buildMobilePath()} stroke="rgba(16,185,129,0.35)" strokeWidth="0.8" fill="none" vectorEffect="non-scaling-stroke" />
				</svg>

				{/* 5-row, 3-col grid — nodes placed at their positions */}
				<div className="relative grid h-full grid-cols-3 grid-rows-5 gap-y-2">
					{/* Row 0: Start — centered (col 1) */}
					<div className="col-start-2 row-start-1 flex items-center justify-center">
						<FlowNode node={start} size="lg" />
					</div>

					{/* Row 1–3: Stages */}
					{stages.map((stage, si) => (
						stage.map((node, ni) => (
							<div
								key={`${si}-${ni}`}
								className="flex items-center justify-center"
								style={{ gridRow: si + 2, gridColumn: ni + 1 }}
							>
								<FlowNode node={node} />
							</div>
						))
					))}

					{/* Row 4: Finish — centered (col 1) */}
					<div className="col-start-2 row-start-5 flex items-center justify-center">
						<FlowNode node={finish} size="lg" />
					</div>
				</div>
			</div>

			{/* ── Desktop: horizontal flowchart ── */}
			<div className="relative hidden flex-1 md:block">
				{/* Curved connector SVG */}
				<svg className="absolute inset-0 -z-10 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none">
					<path d={buildDesktopPath()} stroke="rgba(16,185,129,0.35)" strokeWidth="0.8" fill="none" vectorEffect="non-scaling-stroke" />
				</svg>

				{/* 3-row, 5-col grid */}
				<div className="relative grid h-full grid-cols-5 grid-rows-3 gap-x-1">
					{/* Col 0: Start — centered (row 1) */}
					<div className="col-start-1 row-start-2 flex items-center justify-center">
						<FlowNode node={start} size="lg" />
					</div>

					{/* Col 1–3: Stages — main zigzags row0→row1→row2 */}
					{stages.map((stage, si) => (
						stage.map((node, ni) => (
							<div
								key={`${si}-${ni}`}
								className="flex items-center justify-center"
								style={{ gridColumn: si + 2, gridRow: ni + 1 }}
							>
								<FlowNode node={node} />
							</div>
						))
					))}

					{/* Col 4: Finish — centered (row 1) */}
					<div className="col-start-5 row-start-2 flex items-center justify-center">
						<FlowNode node={finish} size="lg" />
					</div>
				</div>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────
// Sidebar Recovery Card — replaces the legacy user card at the bottom
// of the sidebar. Uses the same copy tree (`overlay_recovery`) that
// used to power the floating overlay — the overlay was removed in
// Phase 7 because it was visually noisy and covered the product
// shell's corners. This card sits inside the sidebar instead so the
// "+$67k/mo recoverable" stat is still visible without fighting the
// product mockup for attention.
// ─────────────────────────────────────────────────────────────────────

function SidebarRecoveryCard() {
	const t = useTranslations("homepage.product_tour.overlay_recovery");
	return (
		<div className="mt-8 overflow-hidden rounded-lg border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.12] to-emerald-500/[0.02] p-3">
			{/* Thin highlight ring for the liquid-glass feel */}
			<div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-white/[0.04]" aria-hidden />
			<div className="relative">
				<div className="mb-1 flex items-center gap-1.5">
					<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3 w-3 text-emerald-300">
						<path d="M3 12l3-5 3 3 4-7" strokeLinecap="round" strokeLinejoin="round" />
						<path d="M9 3h4v4" strokeLinecap="round" strokeLinejoin="round" />
					</svg>
					<span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
						{t("eyebrow")}
					</span>
				</div>
				<div className="font-mono text-lg font-semibold tabular-nums leading-none text-emerald-200">
					{t("value")}
					<span className="ml-1 text-[10px] font-normal text-emerald-400/70">
						{t("unit")}
					</span>
				</div>
				<div className="mt-1 text-[9px] leading-tight text-emerald-400/70">{t("sub")}</div>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────
// Sidebar Data Sources Card — shows connected integration logos with
// a green active indicator dot overlapping the top-right corner of
// each circular icon.
// ─────────────────────────────────────────────────────────────────────

const DATA_SOURCES = [
	{ src: "/logos/shopify.svg", alt: "Shopify" },
	{ src: "/logos/stripe.svg", alt: "Stripe" },
	{ src: "/logos/meta.svg", alt: "Meta Ads" },
	{ src: "/logos/google-ads.svg", alt: "Google Ads" },
	{ src: "/logos/nuvemshop.svg", alt: "Nuvemshop" },
];

function SidebarDataSourcesCard() {
	const t = useTranslations("homepage.product_tour");
	return (
		<div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
			<div className="mb-2.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
				{t("data_sources_label")}
			</div>
			<div className="flex items-center gap-2">
				{DATA_SOURCES.map((ds) => (
					<div key={ds.alt} className="relative">
						<div className="h-7 w-7 overflow-hidden rounded-full border border-white/[0.08]">
							<img
								src={ds.src}
								alt={ds.alt}
								className="h-full w-full object-cover"
								loading="lazy"
							/>
						</div>
						{/* Active indicator */}
						<div className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-[#0a0a12] bg-emerald-400">
							<svg viewBox="0 0 8 8" fill="none" className="h-1.5 w-1.5 text-[#0a0a12]">
								<path d="M1.5 4L3.5 6L6.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
							</svg>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────

const PANELS: Record<TabId, () => JSX.Element> = {
	actions: ActionsPanel,
	analysis: AnalysisPanel,
	inventory: InventoryPanel,
	workspaces: WorkspacesPanel,
	chat: ChatPanel,
	maps: MapsPanel,
};

interface ProductTourProps {
	primaryCtaHref?: string;
}

export default function ProductTour({ primaryCtaHref = "/auth/signup" }: ProductTourProps) {
	const t = useTranslations("homepage.product_tour");
	const [activeTab, setActiveTab] = useState<TabId>("actions");
	const ActivePanel = PANELS[activeTab];

	return (
		<section
			id="product-tour"
			className="relative scroll-mt-24 pt-2 pb-4 sm:pt-3 sm:pb-6 lg:pt-4 lg:pb-8"
		>
			{/* Component-scoped keyframes — `vptour-` prefix to avoid
			    collisions with vhero / vbento. */}
			<style>{`
				@keyframes vptour-fade-in {
					from { opacity: 0; transform: translateY(4px); }
					to   { opacity: 1; transform: translateY(0); }
				}
			`}</style>

			{/* Background glow */}
			<div className="pointer-events-none absolute inset-0 -z-10">
				<div className="absolute left-1/2 top-[40%] h-[350px] w-[450px] -translate-x-1/2 rounded-full bg-violet-900/[0.07] blur-[80px] sm:h-[400px] sm:w-[500px] sm:blur-[100px]" />
			</div>


			{/* Browser shell wrapper */}
			<div className="relative mx-auto w-full max-w-[1240px] px-4 sm:px-8 xl:px-0">
				{/* Notch — glued to the top of the browser shell */}
				<div className="flex justify-center">
					<div className="relative z-10 inline-flex items-center gap-2 rounded-t-lg border border-b-0 border-white/[0.08] bg-[#0a0a14] px-5 py-2 sm:px-6 sm:py-2.5">
						<span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
						<span className="text-[11px] font-semibold tracking-wide text-zinc-200 sm:text-xs">
							{t("section_headline")}
						</span>
					</div>
				</div>
				<div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0a14] shadow-[0_30px_80px_-30px_rgba(139,92,246,0.22),0_0_0_1px_rgba(255,255,255,0.04)] sm:rounded-2xl">
					{/* Browser title bar */}
					<div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#08080f] px-3 py-2.5 sm:px-4 sm:py-3">
						<div className="flex w-[52px] shrink-0 gap-1.5">
							<div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
							<div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
							<div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
						</div>
						<div className="flex min-w-0 flex-1">
							<div className="mx-auto inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-white/[0.04] bg-white/[0.02] px-3 py-1 font-mono text-[10px] text-zinc-500 sm:text-[11px]">
								<svg
									viewBox="0 0 12 12"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.4"
									className="h-3 w-3 shrink-0 text-emerald-400/80"
								>
									<path d="M4 6l1.5 1.5L8 4.5" strokeLinecap="round" strokeLinejoin="round" />
									<circle cx="6" cy="6" r="4.5" />
								</svg>
								<span className="truncate">{t("url")}</span>
							</div>
						</div>
						<div className="w-[52px] shrink-0" />
					</div>

					{/* App body: sidebar + content */}
					<div className="flex flex-col md:flex-row">
						{/* Mobile horizontal tabs — all icons visible, only active shows label */}
						<div className="relative md:hidden">
							<div className="flex items-center justify-center gap-0.5 border-b border-white/[0.06] bg-[#0a0a12]/60 px-2 py-1.5">
								{TABS.map((tabId) => {
									const isActive = activeTab === tabId;
									return (
										<button
											key={tabId}
											onClick={() => setActiveTab(tabId)}
											className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-medium transition-all ${
												isActive
													? "bg-white/[0.08] text-white"
													: "text-zinc-500 hover:text-zinc-300"
											}`}
										>
											<span className={isActive ? "text-violet-400" : "text-zinc-600"}>
												{TAB_ICONS[tabId]}
											</span>
											{isActive && (
												<span className="animate-[vptour-fade-in_0.2s_ease-out]">
													{t(`tabs.${tabId}`)}
												</span>
											)}
										</button>
									);
								})}
							</div>
						</div>

						{/* Desktop sidebar */}
						<div className="hidden w-[200px] shrink-0 border-r border-white/[0.06] bg-[#0a0a12]/60 md:block lg:w-[220px]">
							<div className="p-4 lg:p-5">
								{/* App logo */}
								<div className="mb-5 flex items-center gap-2 px-2 py-2">
									<div className="grid h-7 w-7 place-items-center rounded-md bg-violet-500/15">
										<div className="h-2.5 w-2.5 rounded-sm bg-violet-400" />
									</div>
									<span className="text-sm font-semibold text-zinc-300">Vestigio</span>
								</div>

								{/* Nav items */}
								<nav className="space-y-1">
									{TABS.map((tabId) => (
										<button
											key={tabId}
											onClick={() => setActiveTab(tabId)}
											className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-all ${
												activeTab === tabId
													? "bg-white/[0.06] text-white"
													: "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
											}`}
										>
											<span className={activeTab === tabId ? "text-violet-400" : "text-zinc-600"}>
												{TAB_ICONS[tabId]}
											</span>
											{t(`tabs.${tabId}`)}
										</button>
									))}
								</nav>

								{/* Recovery card pinned at bottom of sidebar — was the
								    floating overlay in the previous iteration. Removed
								    PII (no real user names on a public marketing page).
								    See SidebarRecoveryCard component above. */}
								<SidebarRecoveryCard />
								<SidebarDataSourcesCard />
							</div>
						</div>

						{/* Active panel — fixed height, scrollable content */}
						<div className="thin-scrollbar h-[420px] shrink-0 overflow-y-auto p-4 sm:p-6 md:h-[640px] md:flex-1 md:shrink md:p-7 lg:h-[680px] lg:p-8">
							<div
								key={activeTab}
								className="animate-[vptour-fade-in_0.25s_ease-out]"
								style={{ animationFillMode: "both" }}
							>
								<ActivePanel />
							</div>
						</div>
					</div>
				</div>
			</div>

				{/* CTA below the product tour */}
				<div className="mx-auto mt-10 flex max-w-[700px] flex-col items-center gap-3 px-4 sm:mt-14 sm:px-8">
					<Link href={primaryCtaHref} className="inline-block">
						<ShinyButton>
							{t("cta_primary")}
						</ShinyButton>
					</Link>
				</div>
		</section>
	);
}
