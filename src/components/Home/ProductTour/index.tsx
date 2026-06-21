"use client";

/**
 * ProductTour — guided sections of a real Plano (rebuild 2026-06-20).
 *
 * Three step contents, each mirroring one section of the authenticated
 * monthly Plano de Estratégia:
 *
 *   Step 0: Tese + HeroMetrics      — masthead + pull-quote + 4 tiles
 *   Step 1: Buyer Segments + Narrative — who acts + what happened
 *   Step 2: Próximos Passos         — 3 prioritized actions with R$ + CTA
 *
 * Replaces the previous 780-line "Action Queue → AI Chat → Journey Map"
 * tour (which pitched 3 surfaces the customer no longer sees). The data
 * is sourced structurally from a real Plano (anonymized, brand-only —
 * zero identifiable customer info — see project memory
 * havefunnels-redacted-plan-consent).
 *
 * Transitions are VERTICAL (new step rises from below on advance, drops
 * from above on back-nav). The old tour used horizontal slide; user
 * requested vertical motion to feel less "carousel" and more "next page
 * of a document being read".
 *
 * Auto-advances on a per-step timer once the section enters viewport.
 * Clicking a step indicator switches to manual mode (no more auto loop).
 */

import { useTranslations } from "next-intl";
import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { ShinyButton } from "@/components/ui/shiny-button";

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

type Step = 0 | 1 | 2;

interface MetricTile {
	label: string;
	value: string;
	delta: string;
	tone?: "win" | "loss" | "neutral";
	spark?: number[];
}

interface Segment {
	key: string;
	label: string;
	count: number;
	impactMid: string;
	impactRange: string;
	dot: string;
}

interface NextStepItem {
	n: string;
	title: string;
	impact: string;
	buyer: string;
	dot: string;
}

interface NarrativePill {
	label: string;
	tone: "rose" | "sky" | "amber" | "emerald";
}

const PILL_CLASSES: Record<NarrativePill["tone"], string> = {
	rose: "border-rose-400/30 bg-rose-400/10 text-rose-300",
	sky: "border-sky-400/30 bg-sky-400/10 text-sky-300",
	amber: "border-amber-400/30 bg-amber-400/10 text-amber-300",
	emerald: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
};

// Per-step auto-advance duration (ms). Step 0 + Step 1 hold longer
// because there's more text to read; Step 2 is denser visually but
// shorter to parse. Slightly longer than the old tour because the
// vertical slide-in is also slower (premium "smooth scroll" feel).
const STEP_DURATIONS = [10000, 10000, 9000];

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function renderBold(text: string): ReactNode[] {
	const parts = text.split(/(\*\*[^*]+\*\*)/g);
	return parts.map((part, i) => {
		if (part.startsWith("**") && part.endsWith("**")) {
			return <strong key={i} className="font-semibold text-zinc-100">{part.slice(2, -2)}</strong>;
		}
		return <span key={i}>{part}</span>;
	});
}

// Minimal inline sparkline matching the authenticated HeroMetrics style.
// 6 points = 6-cycle history (one per month). tone drives stroke color.
function MiniSparkline({ values, tone }: { values: number[]; tone?: "win" | "loss" | "neutral" }) {
	if (!values.length || values.length < 2) return null;
	const w = 48, h = 16;
	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min || 1;
	const points = values
		.map((v, i) => {
			const x = (i / (values.length - 1)) * w;
			const y = h - ((v - min) / range) * h;
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		})
		.join(" ");
	const stroke = tone === "win" ? "rgb(52 211 153)" : tone === "loss" ? "rgb(251 113 133)" : "rgb(161 161 170)";
	return (
		<svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} fill="none" aria-hidden>
			<polyline points={points} stroke={stroke} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

// ─────────────────────────────────────────────────────────────────────
// Step 0 — Tese + HeroMetrics
// ─────────────────────────────────────────────────────────────────────

function StepThesisAndMetrics() {
	const t = useTranslations("homepage.product_tour");
	const metrics = t.raw("step1.metrics") as MetricTile[];

	return (
		<div className="flex h-full flex-col">
			{/* Breadcrumb — quiet, monospace, matches authenticated app */}
			<div className="mb-3 flex items-center gap-1.5 font-mono text-[10px] text-zinc-500 sm:mb-4 sm:text-[11px]">
				<span>{t("step1.breadcrumb_brand")}</span>
				<span className="text-zinc-700">/</span>
				<span>{t("step1.breadcrumb_section")}</span>
				<span className="text-zinc-700">/</span>
				<span className="text-zinc-400">{t("step1.breadcrumb_month")}</span>
			</div>

			{/* Masthead — Fraunces serif, the defining "this is a Plano" moment */}
			<div className="mb-5 sm:mb-6">
				<h2 className="font-serif text-[24px] font-medium tracking-tight text-zinc-100 sm:text-[32px] lg:text-[36px]">
					{t("step1.masthead_title")}
				</h2>
				<p className="mt-1 font-serif text-[15px] italic text-zinc-400 sm:text-[18px]">
					{t("step1.masthead_subtitle")}
				</p>
			</div>

			{/* Thesis pull-quote — mirrors MonthlyThesis section */}
			<div className="relative mb-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:mb-6 sm:p-6">
				<div aria-hidden className="pointer-events-none absolute -left-1 -top-3 select-none font-serif text-[70px] leading-none text-white/15 sm:-left-2 sm:-top-4 sm:text-[90px]">“</div>
				<div className="relative">
					<div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-[10px]">
						{t("step1.tese_eyebrow")}
					</div>
					<p className="font-serif text-[14px] italic leading-[1.45] text-zinc-300 sm:text-[16px] lg:text-[18px]">
						{renderBold(t("step1.tese_body"))}
					</p>
					<div className="mt-4 flex items-center gap-2 text-[10px] text-zinc-500">
						<span className="h-px w-5 bg-zinc-500/40" />
						<span className="font-medium uppercase tracking-[0.14em]">{t("step1.tese_attribution")}</span>
					</div>
				</div>
			</div>

			{/* HeroMetrics — 4 tiles. Matches authenticated HeroMetrics shape. */}
			<div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
				{metrics.map((m, i) => (
					<div key={i} className="relative rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4">
						<div className="flex items-start justify-between gap-2">
							<div className="text-[9px] font-semibold uppercase leading-tight tracking-[0.14em] text-zinc-500 sm:text-[10px]">
								{m.label}
							</div>
							{m.spark && m.spark.length > 1 && (
								<MiniSparkline values={m.spark} tone={m.tone} />
							)}
						</div>
						<div className={`mt-2 font-mono text-[18px] font-semibold tabular-nums sm:text-[22px] ${
							m.tone === "loss" ? "text-rose-400"
								: m.tone === "win" ? "text-emerald-400"
								: "text-zinc-100"
						}`}>
							{m.value}
						</div>
						<div className="mt-1 font-mono text-[9px] tabular-nums text-zinc-500 sm:text-[10px]">
							{m.delta}
						</div>
					</div>
				))}
			</div>

			{/* Competitor radar + brand impersonators strip — pulls from
			    competitorJson + impersonatorsJson on the real Plano.
			    Brand-only safe: no domain names shown, only counts +
			    summary. Clones use rose accent to signal threat tone
			    (matches anxiety-frame guidance for pre-signup surfaces). */}
			<div className="mt-3 grid grid-cols-1 gap-2.5 sm:mt-4 sm:grid-cols-2 sm:gap-3">
				<div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-3.5">
					<div className="min-w-0 pr-2">
						<div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500 sm:text-[10px]">
							{t("step1.competitors_label")}
						</div>
						<div className="mt-1 text-[11px] leading-snug text-zinc-300 sm:text-[12px]">
							{t("step1.competitors_body")}
						</div>
					</div>
					<div className="shrink-0 font-mono text-[20px] font-semibold tabular-nums text-zinc-100 sm:text-[24px]">
						{t("step1.competitors_count")}
					</div>
				</div>
				<div className="flex items-center justify-between rounded-xl border border-rose-400/20 bg-rose-400/[0.04] p-3 sm:p-3.5">
					<div className="min-w-0 pr-2">
						<div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-rose-400/80 sm:text-[10px]">
							{t("step1.impersonators_label")}
						</div>
						<div className="mt-1 text-[11px] leading-snug text-zinc-300 sm:text-[12px]">
							{t("step1.impersonators_body")}
						</div>
					</div>
					<div className="shrink-0 font-mono text-[20px] font-semibold tabular-nums text-rose-400 sm:text-[24px]">
						{t("step1.impersonators_count")}
					</div>
				</div>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────
// Step 1 — Buyer Segments + Narrative excerpt
// ─────────────────────────────────────────────────────────────────────

function StepBuyersAndNarrative() {
	const t = useTranslations("homepage.product_tour");
	const segments = t.raw("step2.segments") as Segment[];

	return (
		<div className="flex h-full flex-col">
			{/* Section heading — serif H2 matches BuyerSegments authenticated style */}
			<div className="mb-3 flex flex-col items-start gap-1 sm:mb-4 sm:flex-row sm:items-baseline sm:justify-between">
				<h2 className="font-serif text-[18px] font-medium tracking-tight text-zinc-100 sm:text-[22px]">
					{t("step2.heading")}
				</h2>
				<div className="text-[10px] text-zinc-500 sm:text-[11px]">{t("step2.subheading")}</div>
			</div>

			{/* 3 buyer segment cards */}
			<div className="mb-5 grid grid-cols-1 gap-2.5 sm:mb-6 sm:grid-cols-3 sm:gap-3">
				{segments.map((s) => (
					<div key={s.key} className="relative flex flex-col rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
						<div className="mb-1 flex items-center gap-2">
							<span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
							<div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500 sm:text-[10px]">
								{s.label}
							</div>
						</div>
						<div className="text-[13px] font-semibold text-zinc-100 sm:text-[14px]">
							{s.count} findings
						</div>
						<div className="mt-3 font-mono text-[18px] font-semibold tabular-nums text-zinc-100 sm:text-[20px]">
							{s.impactMid}
							<span className="ml-1 text-[10px] font-normal text-zinc-500">/ mês</span>
						</div>
						<div className="mt-0.5 font-mono text-[9px] tabular-nums text-zinc-500">
							{s.impactRange}
						</div>
					</div>
				))}
			</div>

			{/* Narrative — editorial pull-quote with pills + multi-paragraph
			    body. Larger Fraunces serif so the card feels populated and
			    reads like a magazine column, not a dense block. Pills act
			    as topic tags so the eye has anchor points before the
			    paragraphs unfold. */}
			<div className="relative flex-1 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-6 lg:p-7">
				<div className="mb-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-[10px]">
					{t("step2.narrative_eyebrow")}
				</div>

				{/* Pills row — quick topic tags */}
				<div className="mb-4 flex flex-wrap gap-1.5 sm:gap-2">
					{(t.raw("step2.narrative_pills") as NarrativePill[]).map((p, i) => (
						<span key={i} className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium tracking-[0.04em] sm:text-[11px] ${PILL_CLASSES[p.tone]}`}>
							{p.label}
						</span>
					))}
				</div>

				{/* Lead paragraph — primary serif body */}
				<p className="font-serif text-[15px] leading-[1.55] text-zinc-200 sm:text-[17px] lg:text-[18px]">
					{renderBold(t("step2.narrative_lead"))}
				</p>

				{/* Detail paragraph — slightly smaller, slightly fainter */}
				<p className="mt-3 font-serif text-[14px] leading-[1.55] text-zinc-400 sm:text-[15px] lg:text-[16px]">
					{renderBold(t("step2.narrative_detail"))}
				</p>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────
// Step 2 — Próximos Passos
// ─────────────────────────────────────────────────────────────────────

function StepNextSteps({ primaryCtaHref }: { primaryCtaHref: string }) {
	const t = useTranslations("homepage.product_tour");
	const steps = t.raw("step3.steps") as NextStepItem[];

	return (
		<div className="flex h-full flex-col">
			<h2 className="mb-4 font-serif text-[18px] font-medium tracking-tight text-zinc-100 sm:text-[22px]">
				{t("step3.heading")}
			</h2>

			{/* Numbered action list — big serif numerals */}
			<div className="flex-1 space-y-2.5">
				{steps.map((s, i) => (
					<div key={i} className="relative flex items-start gap-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
						<div className="font-serif text-[32px] font-medium leading-none tabular-nums text-zinc-100 sm:text-[40px]">
							{s.n}
						</div>
						<div className="min-w-0 flex-1">
							<p className="text-[12px] font-medium leading-snug text-zinc-100 sm:text-[14px]">
								{s.title}
							</p>
							<div className="mt-2 flex items-center gap-2">
								<span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
								<span className="text-[9px] uppercase tracking-[0.14em] text-zinc-500 sm:text-[10px]">{s.buyer}</span>
							</div>
						</div>
						<div className="shrink-0 text-right">
							<div className="font-mono text-[12px] font-semibold tabular-nums text-emerald-400 sm:text-[14px]">
								{s.impact}
							</div>
							<div className="text-[9px] text-zinc-500">{t("step3.impact_label")}</div>
						</div>
					</div>
				))}
			</div>

			{/* Footer — attribution + non-functional affordances (icons only),
			    matches the real Plano footer pattern. */}
			<div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-[10px] text-zinc-500">
				<div className="flex items-center gap-2">
					<span className="h-px w-5 bg-zinc-500/40" />
					<span className="font-medium uppercase tracking-[0.14em]">{t("step3.footer_attribution")}</span>
				</div>
				<div className="flex items-center gap-3">
					<span className="inline-flex items-center gap-1">
						<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3 w-3"><path d="M4 2h6l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" strokeLinejoin="round"/><path d="M10 2v3h3M6 9h4M6 11h3" strokeLinecap="round"/></svg>
						{t("step3.export_pdf")}
					</span>
					<span className="inline-flex items-center gap-1">
						<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3 w-3"><path d="M7 9.5L6 10.5a2.5 2.5 0 0 1-3.5-3.5l2-2a2.5 2.5 0 0 1 3.5 0M9 6.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-2 2a2.5 2.5 0 0 1-3.5 0" strokeLinecap="round" strokeLinejoin="round"/></svg>
						{t("step3.share_link")}
					</span>
				</div>
			</div>

			{/* Conversion CTA — kept current copy per user preference
			    (free-action beats preview, see feedback memory). */}
			<div className="mt-4 flex justify-center">
				<ShinyButton href={primaryCtaHref} data-vtg-cta="product-tour-cta">{t("cta_primary")}</ShinyButton>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────
// Step Indicator — bottom strip
// ─────────────────────────────────────────────────────────────────────

function StepIndicator({ current, labels, onSelect }: { current: Step; labels: string[]; onSelect: (s: Step) => void }) {
	return (
		<div className="flex items-center justify-center gap-1 px-3 py-3 sm:gap-2">
			{labels.map((label, i) => (
				<button
					key={i}
					type="button"
					onClick={() => onSelect(i as Step)}
					className={`group flex items-center gap-2 rounded-full px-2.5 py-1.5 transition-colors sm:px-3 ${
						current === i ? "bg-white/[0.06] text-zinc-100" : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
					}`}
					aria-current={current === i}
				>
					<span className={`flex h-5 w-5 items-center justify-center rounded-full font-serif text-[11px] font-medium transition-colors ${
						current === i ? "bg-emerald-500/15 text-emerald-300" : "bg-white/[0.04] text-zinc-500 group-hover:text-zinc-400"
					}`}>
						{i + 1}
					</span>
					<span className="hidden text-[11px] font-medium sm:inline">{label}</span>
				</button>
			))}
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────

interface ProductTourProps {
	primaryCtaHref?: string;
}

export default function ProductTour({ primaryCtaHref = "/audit" }: ProductTourProps) {
	const t = useTranslations("homepage.product_tour");
	const [currentStep, setCurrentStep] = useState<Step>(0);
	const [slideDir, setSlideDir] = useState<"up" | "down">("up");
	const [interactionMode, setInteractionMode] = useState<"auto" | "user">("auto");
	const [inView, setInView] = useState(false);
	const sectionRef = useRef<HTMLDivElement>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const prevStepRef = useRef<Step>(0);

	const goToStep = useCallback((next: Step, forceDir?: "up" | "down") => {
		// "up" = new content rises from below (default for forward nav).
		// "down" = new content drops from above (used when going back).
		setSlideDir(forceDir ?? (next > prevStepRef.current ? "up" : "down"));
		prevStepRef.current = next;
		setCurrentStep(next);
	}, []);

	// Start auto-advance only when section enters viewport — avoids
	// burning a step transition the user never sees if they bounce.
	useEffect(() => {
		const el = sectionRef.current;
		if (!el) return;
		const obs = new IntersectionObserver(
			([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
			{ threshold: 0.3 },
		);
		obs.observe(el);
		return () => obs.disconnect();
	}, []);

	useEffect(() => {
		if (interactionMode !== "auto" || !inView) return;
		const duration = STEP_DURATIONS[currentStep];
		const next = ((currentStep + 1) % 3) as Step;
		timerRef.current = setTimeout(() => {
			// Always advance "up" in the auto loop — when looping 2→0,
			// the visual still reads as "next" rather than "back".
			goToStep(next, "up");
		}, duration);
		return () => clearTimeout(timerRef.current);
	}, [currentStep, interactionMode, inView, goToStep]);

	const handleStepSelect = useCallback((step: Step) => {
		setInteractionMode("user");
		clearTimeout(timerRef.current);
		goToStep(step);
	}, [goToStep]);

	const stepLabels = t.raw("step_indicator") as string[];

	return (
		<section ref={sectionRef} id="product-tour" className="relative z-1 scroll-mt-24 pt-2 pb-4 sm:pt-3 sm:pb-6 lg:pt-4 lg:pb-8">
			<style>{`
				/* Vertical step transitions — premium "smooth scroll" feel.
				   advance:  new content rises from below (translateY 60px → 0)
				   back-nav: new content drops from above (translateY -60px → 0)
				   Longer travel + longer duration + extra-soft ease-out
				   (cubic-bezier 0.16, 1, 0.3, 1 — Apple-style "expo out") =
				   reads as "scrolling to the next page of a document" not
				   "carousel slide". prefers-reduced-motion fast-forwards. */
				@keyframes vptour-slide-up {
					from { opacity: 0; transform: translateY(60px); }
					to   { opacity: 1; transform: translateY(0); }
				}
				@keyframes vptour-slide-down {
					from { opacity: 0; transform: translateY(-60px); }
					to   { opacity: 1; transform: translateY(0); }
				}
				@media (prefers-reduced-motion: reduce) {
					.vptour-step-anim { animation: none !important; }
				}
			`}</style>

			{/* Ambient background glow — soft emerald (was violet). Subtle. */}
			<div className="pointer-events-none absolute inset-0 -z-10">
				<div className="absolute left-1/2 top-[40%] h-[350px] w-[450px] -translate-x-1/2 rounded-full bg-emerald-500/[0.03] blur-[80px] sm:h-[400px] sm:w-[500px] sm:blur-[100px]" />
			</div>

			<div className="relative mx-auto w-full max-w-[1100px] px-4 sm:px-8 xl:px-0">
				{/* Notch — matches old ProductTour but with emerald (not violet) dot */}
				<div className="flex justify-center">
					<div className="relative z-10 inline-flex items-center gap-2 rounded-t-lg border border-b-0 border-white/[0.08] bg-[#0a0a14] px-5 py-2 sm:px-6 sm:py-2.5">
						<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
						<span className="text-[11px] font-semibold tracking-wide text-zinc-200 sm:text-xs">
							{t("section_headline")}
						</span>
					</div>
				</div>

				{/* Browser shell — chrome bar + URL + traffic-light dots */}
				<div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0a14] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04)] sm:rounded-2xl">
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

					{/* Step panel. overflow-y-auto so any tall content (especially
					    on mobile) is scrollable within the fixed container rather
					    than clipped or expanding the shell. */}
					<div className="h-[560px] shrink-0 overflow-hidden p-4 sm:h-[580px] sm:p-6 md:p-7 lg:h-[600px] lg:p-8">
						<div
							key={currentStep}
							className="vptour-step-anim h-full overflow-y-auto pr-1"
							style={{
								animation: `vptour-slide-${slideDir} 0.85s cubic-bezier(0.16, 1, 0.3, 1) both`,
							}}
						>
							{currentStep === 0 && <StepThesisAndMetrics />}
							{currentStep === 1 && <StepBuyersAndNarrative />}
							{currentStep === 2 && <StepNextSteps primaryCtaHref={primaryCtaHref} />}
						</div>
					</div>

					{/* Step indicator footer */}
					<div className="border-t border-white/[0.06]">
						<StepIndicator current={currentStep} labels={stepLabels} onSelect={handleStepSelect} />
					</div>
				</div>
			</div>
		</section>
	);
}
