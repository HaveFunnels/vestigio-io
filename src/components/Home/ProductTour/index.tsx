"use client";

/**
 * ProductTour — 3-step guided experience
 *
 * Step 1: Action Queue — hero stat + 5 prioritized actions, P1 pulses
 * Step 2: Investigation — typewriter AI response (MCP power demo)
 * Step 3: Journey Map — highlighted leak node + CTA
 *
 * Auto-advances with per-step timing. User click pauses auto-advance.
 * Reuses browser shell, sidebar, severity tokens, and map infrastructure
 * from the previous 6-tab version.
 */

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { ShinyButton } from "@/components/ui/shiny-button";

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

type Step = 0 | 1 | 2;
type Severity = "critical" | "high" | "medium" | "low";

interface ActionRow {
	priority: string;
	title: string;
	desc: string;
	impact: string;
	severity: Severity;
}

interface MapNode {
	label: string;
	path: string;
	pct: number;
	main?: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Severity tokens
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

// ─────────────────────────────────────────────────────────────────────
// Rich text helper (renders **bold** markers from translation strings)
// ─────────────────────────────────────────────────────────────────────

function renderRichText(input: string): ReactNode[] {
	const parts = input.split(/(\*\*[^*]+\*\*)/g);
	return parts.map((part, i) => {
		if (part.startsWith("**") && part.endsWith("**")) {
			return <strong key={i} className="text-white">{part.slice(2, -2)}</strong>;
		}
		return <span key={i}>{part}</span>;
	});
}

// ─────────────────────────────────────────────────────────────────────
// Step 1: Action Queue
// ─────────────────────────────────────────────────────────────────────

function StepActionsQueue({ onClickP1 }: { onClickP1: () => void }) {
	const t = useTranslations("homepage.product_tour");
	const tg = useTranslations("homepage.product_tour.guided");
	const rows = (t.raw("actions_panel.rows") as ActionRow[]).slice(0, 5);
	const recoveryValue = t("overlay_recovery.value");
	const recoveryUnit = t("overlay_recovery.unit");

	return (
		<div className="flex h-full flex-col">
			{/* Hero stat */}
			<div className="mb-5 text-center sm:mb-6">
				<p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400/80">
					{tg("hero_label")}
				</p>
				<div className="mt-1 font-mono text-2xl font-bold tabular-nums leading-none text-emerald-300 sm:text-3xl">
					{recoveryValue}
					<span className="ml-1 text-sm font-normal text-emerald-400/60">{recoveryUnit}</span>
				</div>
				<p className="mt-1 text-[10px] text-zinc-600">{tg("hero_sub")}</p>
			</div>

			{/* Action rows */}
			<div className="space-y-1.5">
				{rows.map((a, i) => {
					const isP1 = i === 0;
					return (
						<div
							key={a.priority}
							onClick={isP1 ? onClickP1 : undefined}
							className={`group relative flex items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-all sm:gap-3 sm:px-4 sm:py-3 ${
								isP1
									? "cursor-pointer border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.06]"
									: "border-white/[0.06] bg-white/[0.02]"
							}`}
							style={isP1 ? { animation: "vptour-click-pulse 2.5s ease-in-out infinite" } : undefined}
						>
							{/* Priority badge */}
							<span className="mt-0.5 shrink-0 font-mono text-[10px] font-bold tabular-nums text-zinc-500">
								{a.priority}
							</span>
							{/* Severity dot */}
							<span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[a.severity]}`} />
							{/* Content */}
							<div className="min-w-0 flex-1">
								<p className="text-[12px] font-medium leading-snug text-zinc-200 sm:text-[13px]">
									{a.title}
								</p>
								<p className="mt-0.5 hidden text-[11px] text-zinc-500 sm:block">{a.desc}</p>
							</div>
							{/* Impact */}
							<span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-red-400 sm:block">
								{a.impact}
							</span>
							{/* Severity badge (desktop) */}
							<span className={`hidden shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase md:inline-block ${SEVERITY_BADGE[a.severity]}`}>
								{a.severity}
							</span>
							{/* P1 click hint */}
							{isP1 && (
								<span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-zinc-500 opacity-0 transition-opacity group-hover:opacity-100 sm:opacity-60">
									{tg("step1_hint")}
								</span>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────
// Step 2: Investigation (typewriter AI response)
// ─────────────────────────────────────────────────────────────────────

function StepInvestigation({ onViewMap }: { onViewMap: () => void }) {
	const tg = useTranslations("homepage.product_tour.guided");
	const fullText = tg("step2_ai");
	const [charIdx, setCharIdx] = useState(0);
	const [showChip, setShowChip] = useState(false);
	const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

	// Typewriter effect
	useEffect(() => {
		setCharIdx(0);
		setShowChip(false);
		intervalRef.current = setInterval(() => {
			setCharIdx((prev) => {
				if (prev >= fullText.length) {
					clearInterval(intervalRef.current);
					return prev;
				}
				return prev + 1;
			});
		}, 25);
		return () => clearInterval(intervalRef.current);
	}, [fullText]);

	// Show chip after typewriter completes
	useEffect(() => {
		if (charIdx >= fullText.length) {
			const timer = setTimeout(() => setShowChip(true), 400);
			return () => clearTimeout(timer);
		}
	}, [charIdx, fullText.length]);

	const visibleText = fullText.slice(0, charIdx);
	const chips = tg.raw("step2_chips") as string[];

	return (
		<div className="flex h-full flex-col">
			{/* Context breadcrumb */}
			<div className="mb-4 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
				<span className="h-1.5 w-1.5 rounded-full bg-red-400" />
				<span className="text-[11px] font-medium text-zinc-400">
					{tg("step2_context")}
				</span>
			</div>

			{/* AI response bubble */}
			<div className="flex-1">
				<div className="flex items-start gap-3">
					{/* AI avatar */}
					<div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-500/15">
						<div className="h-2 w-2 rounded-sm bg-violet-400" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="mb-1 flex items-center gap-2">
							<span className="text-[10px] font-semibold text-violet-300">Vestigio AI</span>
							<span className="h-1 w-1 rounded-full bg-violet-400 animate-pulse" />
						</div>
						<div className="rounded-xl rounded-tl-sm border border-violet-500/10 bg-violet-500/[0.04] px-4 py-3">
							<p className="whitespace-pre-line text-[12px] leading-relaxed text-zinc-300 sm:text-[13px]">
								{renderRichText(visibleText)}
								{charIdx < fullText.length && (
									<span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-violet-400" />
								)}
							</p>
						</div>

						{/* Chips */}
						{showChip && (
							<div className="mt-3 flex flex-wrap gap-2" style={{ animation: "vptour-fade-in 0.3s ease-out both" }}>
								{chips.map((chip) => (
									<button
										key={chip}
										onClick={onViewMap}
										className="flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-emerald-300 transition-all hover:bg-white/[0.08]"
										style={{ animation: "vptour-glow 2.5s ease-in-out infinite" }}
									>
										<svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
											<circle cx="5" cy="5" r="2" />
											<circle cx="15" cy="5" r="2" />
											<circle cx="10" cy="15" r="2" />
											<path d="M7 5H13" />
											<path d="M6.5 6.5L8.5 13.5" />
											<path d="M13.5 6.5L11.5 13.5" />
										</svg>
										{chip}
									</button>
								))}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────
// Step 3: Journey Map with highlighted leak node
// ─────────────────────────────────────────────────────────────────────

function FlowNode({ node, size = "sm", highlighted }: { node: MapNode; size?: "sm" | "lg"; highlighted?: boolean }) {
	const isMain = !!node.main;
	return (
		<div className="flex flex-col items-center gap-0.5">
			<div
				className={`grid place-items-center rounded-full font-mono font-bold tabular-nums ${
					size === "lg"
						? "h-11 w-11 text-[11px] md:h-12 md:w-12 md:text-xs"
						: "h-8 w-8 text-[9px] md:h-9 md:w-9 md:text-[10px]"
				} ${
					highlighted
						? "border-2 border-red-400/60 bg-red-950/40 text-red-300"
						: isMain
							? "border-2 border-emerald-400/50 bg-[#0c1a14] text-emerald-300"
							: "border border-white/[0.08] bg-[#0d0d17] text-zinc-500"
				}`}
				style={highlighted ? { animation: "vptour-leak-glow 2s ease-in-out infinite" } : undefined}
			>
				{node.pct}%
			</div>
			<span className={`max-w-[60px] truncate text-center leading-tight md:max-w-[80px] ${
				size === "lg"
					? "text-[9px] font-semibold text-zinc-200 md:text-[11px]"
					: highlighted
						? "text-[8px] font-semibold text-red-300 md:text-[9px]"
						: "text-[8px] text-zinc-400 md:text-[9px]"
			}`}>
				{node.label}
			</span>
			{highlighted && (
				<span className="mt-0.5 rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[8px] font-semibold text-red-300">
					{/* Leak label injected via parent */}
				</span>
			)}
		</div>
	);
}

// Map path builders
const COL_X = [16.7, 50, 83.3];
const ROW_Y = [6, 27, 50, 73, 94];
const MAIN_COL = [1, 0, 1, 2, 1];

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

const DESK_COL_X = [6, 27, 50, 73, 94];
const DESK_ROW_Y = [16.7, 50, 83.3];
const DESK_MAIN_ROW = [1, 0, 1, 2, 1];

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

const HIGHLIGHT_PATH = "/checkout";

function StepJourneyMap({ primaryCtaHref }: { primaryCtaHref: string }) {
	const t = useTranslations("homepage.product_tour.maps_panel");
	const tg = useTranslations("homepage.product_tour.guided");
	const start = t.raw("start") as MapNode;
	const finish = t.raw("finish") as MapNode;
	const stages = t.raw("stages") as MapNode[][];

	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="mb-3 flex items-center justify-between">
				<div>
					<h4 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
						{t("header")}
					</h4>
					<p className="mt-0.5 text-[10px] text-zinc-600">{t("subtext")}</p>
				</div>
				<span className="rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[9px] font-semibold text-red-300">
					{tg("step3_leak")}
				</span>
			</div>

			{/* Mobile: vertical flowchart */}
			<div className="relative flex-1 md:hidden">
				<svg className="absolute inset-0 -z-10 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none">
					<path d={buildMobilePath()} stroke="rgba(16,185,129,0.35)" strokeWidth="0.8" fill="none" vectorEffect="non-scaling-stroke" />
				</svg>
				<div className="relative grid h-full grid-cols-3 grid-rows-5 gap-y-2">
					<div className="col-start-2 row-start-1 flex items-center justify-center">
						<FlowNode node={start} size="lg" />
					</div>
					{stages.map((stage, si) =>
						stage.map((node, ni) => (
							<div key={`${si}-${ni}`} className="flex items-center justify-center" style={{ gridRow: si + 2, gridColumn: ni + 1 }}>
								<FlowNode node={node} highlighted={node.path === HIGHLIGHT_PATH} />
							</div>
						))
					)}
					<div className="col-start-2 row-start-5 flex items-center justify-center">
						<FlowNode node={finish} size="lg" />
					</div>
				</div>
			</div>

			{/* Desktop: horizontal flowchart */}
			<div className="relative hidden flex-1 md:block">
				<svg className="absolute inset-0 -z-10 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none">
					<path d={buildDesktopPath()} stroke="rgba(16,185,129,0.35)" strokeWidth="0.8" fill="none" vectorEffect="non-scaling-stroke" />
				</svg>
				<div className="relative grid h-full grid-cols-5 grid-rows-3 gap-x-1">
					<div className="col-start-1 row-start-2 flex items-center justify-center">
						<FlowNode node={start} size="lg" />
					</div>
					{stages.map((stage, si) =>
						stage.map((node, ni) => (
							<div key={`${si}-${ni}`} className="flex items-center justify-center" style={{ gridColumn: si + 2, gridRow: ni + 1 }}>
								<FlowNode node={node} highlighted={node.path === HIGHLIGHT_PATH} />
							</div>
						))
					)}
					<div className="col-start-5 row-start-2 flex items-center justify-center">
						<FlowNode node={finish} size="lg" />
					</div>
				</div>
			</div>

			{/* CTA */}
			<div className="mt-4 flex flex-col items-center gap-3 border-t border-white/[0.06] pt-4" style={{ animation: "vptour-fade-in 0.5s ease-out 0.5s both" }}>
				<Link href={primaryCtaHref} className="inline-block" style={{ animation: "vptour-glow 2.5s ease-in-out infinite" }}>
					<ShinyButton className="w-full sm:w-auto">
						{tg("step3_cta")}
					</ShinyButton>
				</Link>
				{/* Data sources */}
				<div className="flex items-center gap-3">
					<span className="text-[9px] text-zinc-600">{tg("step3_trust")}</span>
					<div className="flex gap-1">
						{DATA_SOURCES.map((ds) => (
							<div key={ds.alt} className="h-4 w-4 overflow-hidden rounded-full border border-white/[0.08]">
								<img src={ds.src} alt={ds.alt} className="h-full w-full object-cover" loading="lazy" />
							</div>
						))}
					</div>
				</div>
				<p className="text-[10px] text-zinc-600">{tg("step3_micro")}</p>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────
// Step indicator (3 dots)
// ─────────────────────────────────────────────────────────────────────

function StepIndicator({ current, labels, onSelect }: { current: Step; labels: string[]; onSelect: (s: Step) => void }) {
	return (
		<div className="flex items-center justify-center gap-4 py-3">
			{labels.map((label, i) => {
				const isActive = current === i;
				return (
					<button
						key={i}
						onClick={() => onSelect(i as Step)}
						className="flex items-center gap-1.5 transition-all"
					>
						<span className={`rounded-full transition-all duration-300 ${
							isActive
								? "h-2 w-6 bg-violet-400"
								: "h-2 w-2 bg-zinc-700 hover:bg-zinc-600"
						}`} />
						<span className={`text-[10px] transition-colors ${
							isActive ? "text-zinc-300" : "text-zinc-600"
						}`}>
							{label}
						</span>
					</button>
				);
			})}
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────
// Sidebar cards (reused from previous version)
// ─────────────────────────────────────────────────────────────────────

function SidebarRecoveryCard() {
	const t = useTranslations("homepage.product_tour.overlay_recovery");
	return (
		<div className="mt-8 overflow-hidden rounded-lg border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.12] to-emerald-500/[0.02] p-3">
			<div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-white/[0.04]" aria-hidden />
			<div className="relative">
				<div className="mb-1 flex items-center gap-1.5">
					<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3 w-3 text-emerald-300">
						<path d="M3 12l3-5 3 3 4-7" strokeLinecap="round" strokeLinejoin="round" />
						<path d="M9 3h4v4" strokeLinecap="round" strokeLinejoin="round" />
					</svg>
					<span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-300">{t("eyebrow")}</span>
				</div>
				<div className="font-mono text-lg font-semibold tabular-nums leading-none text-emerald-200">
					{t("value")}
					<span className="ml-1 text-[10px] font-normal text-emerald-400/70">{t("unit")}</span>
				</div>
				<div className="mt-1 text-[9px] leading-tight text-emerald-400/70">{t("sub")}</div>
			</div>
		</div>
	);
}

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
			<div className="mb-2.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{t("data_sources_label")}</div>
			<div className="flex items-center gap-1.5">
				{DATA_SOURCES.map((ds) => (
					<div key={ds.alt} className="relative">
						<div className="h-5 w-5 overflow-hidden rounded-full border border-white/[0.08]">
							<img src={ds.src} alt={ds.alt} className="h-full w-full object-cover" loading="lazy" />
						</div>
						<div className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full border-[1.5px] border-[#0a0a12] bg-emerald-400">
							<svg viewBox="0 0 8 8" fill="none" className="h-1 w-1 text-[#0a0a12]">
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

const STEP_DURATIONS: Record<Step, number> = { 0: 6000, 1: 0, 2: 7000 }; // Step 1 starts after typewriter

interface ProductTourProps {
	primaryCtaHref?: string;
}

export default function ProductTour({ primaryCtaHref = "/lp/audit" }: ProductTourProps) {
	const t = useTranslations("homepage.product_tour");
	const tg = useTranslations("homepage.product_tour.guided");
	const [currentStep, setCurrentStep] = useState<Step>(0);
	const [interactionMode, setInteractionMode] = useState<"auto" | "user">("auto");
	const [typewriterDone, setTypewriterDone] = useState(false);
	const panelRef = useRef<HTMLDivElement>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

	const stepLabels = tg.raw("step_labels") as string[];

	// Auto-advance
	useEffect(() => {
		if (interactionMode !== "auto") return;

		// Step 1 (actions): wait 6s then advance
		if (currentStep === 0) {
			timerRef.current = setTimeout(() => setCurrentStep(1), STEP_DURATIONS[0]);
			return () => clearTimeout(timerRef.current);
		}

		// Step 1 (investigation): wait for typewriter to finish + 4s
		if (currentStep === 1) {
			if (!typewriterDone) return; // wait
			timerRef.current = setTimeout(() => setCurrentStep(2), 4000);
			return () => clearTimeout(timerRef.current);
		}

		// Step 2 (map): wait 7s then loop
		if (currentStep === 2) {
			timerRef.current = setTimeout(() => {
				setCurrentStep(0);
				setTypewriterDone(false);
			}, STEP_DURATIONS[2]);
			return () => clearTimeout(timerRef.current);
		}
	}, [currentStep, interactionMode, typewriterDone]);

	// Track typewriter completion from StepInvestigation
	useEffect(() => {
		if (currentStep !== 1) return;
		setTypewriterDone(false);
	}, [currentStep]);

	const pauseAndAdvance = useCallback((step: Step) => {
		setInteractionMode("user");
		clearTimeout(timerRef.current);
		if (step === 1) setTypewriterDone(false);
		setCurrentStep(step);
	}, []);

	const handleStepSelect = useCallback((step: Step) => {
		pauseAndAdvance(step);
	}, [pauseAndAdvance]);

	return (
		<section id="product-tour" className="relative scroll-mt-24 pt-2 pb-4 sm:pt-3 sm:pb-6 lg:pt-4 lg:pb-8">
			<style>{`
				@keyframes vptour-fade-in {
					from { opacity: 0; transform: translateY(4px); }
					to   { opacity: 1; transform: translateY(0); }
				}
				@keyframes vptour-click-pulse {
					0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.3); }
					50% { box-shadow: 0 0 0 6px rgba(255,255,255,0.0); }
				}
				@keyframes vptour-glow {
					0%, 100% { box-shadow: 0 0 8px 2px rgba(255,255,255,0.06); }
					50% { box-shadow: 0 0 16px 4px rgba(255,255,255,0.12); }
				}
				@keyframes vptour-leak-glow {
					0%, 100% { box-shadow: 0 0 8px 2px rgba(239,68,68,0.3); }
					50% { box-shadow: 0 0 20px 6px rgba(239,68,68,0.5); }
				}
			`}</style>

			{/* Background glow */}
			<div className="pointer-events-none absolute inset-0 -z-10">
				<div className="absolute left-1/2 top-[40%] h-[350px] w-[450px] -translate-x-1/2 rounded-full bg-violet-900/[0.07] blur-[80px] sm:h-[400px] sm:w-[500px] sm:blur-[100px]" />
			</div>

			<div className="relative mx-auto w-full max-w-[1240px] px-4 sm:px-8 xl:px-0">
				{/* Notch */}
				<div className="flex justify-center">
					<div className="relative z-10 inline-flex items-center gap-2 rounded-t-lg border border-b-0 border-white/[0.08] bg-[#0a0a14] px-5 py-2 sm:px-6 sm:py-2.5">
						<span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
						<span className="text-[11px] font-semibold tracking-wide text-zinc-200 sm:text-xs">
							{t("section_headline")}
						</span>
					</div>
				</div>

				{/* Browser shell */}
				<div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0a14] shadow-[0_30px_80px_-30px_rgba(139,92,246,0.22),0_0_0_1px_rgba(255,255,255,0.04)] sm:rounded-2xl">
					{/* Title bar */}
					<div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#08080f] px-3 py-2.5 sm:px-4 sm:py-3">
						<div className="flex w-[52px] shrink-0 gap-1.5">
							<div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
							<div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
							<div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
						</div>
						<div className="flex min-w-0 flex-1">
							<div className="mx-auto inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-white/[0.04] bg-white/[0.02] px-3 py-1 font-mono text-[10px] text-zinc-500 sm:text-[11px]">
								<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3 w-3 shrink-0 text-emerald-400/80">
									<path d="M4 6l1.5 1.5L8 4.5" strokeLinecap="round" strokeLinejoin="round" />
									<circle cx="6" cy="6" r="4.5" />
								</svg>
								<span className="truncate">{t("url")}</span>
							</div>
						</div>
						<div className="w-[52px] shrink-0" />
					</div>

					{/* App body */}
					<div className="flex flex-col md:flex-row">
						{/* Desktop sidebar */}
						<div className="hidden w-[200px] shrink-0 border-r border-white/[0.06] bg-[#0a0a12]/60 md:block lg:w-[220px]">
							<div className="flex h-full flex-col p-4 lg:p-5">
								<div>
									<div className="mb-5 flex items-center gap-2 px-2 py-2">
										<div className="grid h-7 w-7 place-items-center rounded-md bg-violet-500/15">
											<div className="h-2.5 w-2.5 rounded-sm bg-violet-400" />
										</div>
										<span className="text-sm font-semibold text-zinc-300">Vestigio</span>
									</div>
								</div>
								<div className="mt-auto">
									<SidebarRecoveryCard />
									<SidebarDataSourcesCard />
								</div>
							</div>
						</div>

						{/* Panel */}
						<div
							ref={panelRef}
							className="h-[420px] shrink-0 overflow-y-auto p-4 sm:p-6 md:h-[640px] md:flex-1 md:shrink md:p-7 lg:h-[680px] lg:p-8"
						>
							<div key={currentStep} className="h-full animate-[vptour-fade-in_0.25s_ease-out]" style={{ animationFillMode: "both" }}>
								{currentStep === 0 && (
									<StepActionsQueue onClickP1={() => pauseAndAdvance(1)} />
								)}
								{currentStep === 1 && (
									<StepInvestigation onViewMap={() => pauseAndAdvance(2)} />
								)}
								{currentStep === 2 && (
									<StepJourneyMap primaryCtaHref={primaryCtaHref} />
								)}
							</div>
						</div>
					</div>

					{/* Step indicator */}
					<div className="border-t border-white/[0.06]">
						<StepIndicator current={currentStep} labels={stepLabels} onSelect={handleStepSelect} />
					</div>
				</div>
			</div>
		</section>
	);
}
