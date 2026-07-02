/**
 * Home > Features — "Quatro movimentos por ciclo" (editorial spread).
 *
 * 4 movements of the monthly Plano: Tese · Onde você está · Próximos
 * passos · Continuidade. Layout is intentionally NOT a 4-card bento
 * (4 cards = 4 categories, generic SaaS); it's an editorial spread:
 *
 *   ┌────────────────────────────────────────────────────────┐
 *   │  TESE — full-width 2-column masthead (FT/Lex style)    │
 *   │  meta column on left, pull-quote on right, hairline    │
 *   │  divider between them                                  │
 *   ├────────────────────────────────────────────────────────┤
 *   │ Onde você está │ Próximos passos │ Continuidade        │
 *   │  (typography)  │  (typography)   │  (typography)       │
 *   │  no card wrapper, hairline vertical rules divide them  │
 *   └────────────────────────────────────────────────────────┘
 *
 * Frontend-design audit corrections applied:
 * - Fraunces serif used ONLY on Tese (where copy is editorial).
 *   Other titles in sans (Satoshi) — H3s on supporting moves are
 *   functional B2B-marketing register, not editorial voice.
 * - Drop per-card accent colors (the 4 movements are one piece, not
 *   4 categories — let typography + spacing carry hierarchy).
 * - Drop hover lift + slide-in top accent bar (generic SaaS moves).
 * - Use product design tokens (border-edge / bg-surface-card) instead
 *   of bespoke white/[0.06] borders so marketing visually matches the
 *   authenticated Plano.
 * - Distinct Tese signature (2-column meta+quote layout) — the
 *   decorative serif `"` glyph + dashed rings is already spent on
 *   the Counter Tese card + ProductTour Step 1; not a third time.
 * - Continuidade rendered as prose, not strike-through pills (which
 *   read as spreadsheet conditional-format, not editorial).
 *
 * Server component (async + getTranslations) so it stays out of the
 * client bundle.
 */

import { getTranslations } from "next-intl/server";

interface MiniMetric { label: string; value: string; tone?: "win" | "loss" | "neutral" }
interface NextStepItem { n: string; title: string; impact: string; buyer: string }
interface DeltaPair { label: string; before: string; after: string; delta: string; deltaTone: "win" | "loss" | "neutral" }

const Features = async () => {
	const t = await getTranslations("homepage.features_bento");

	const tiles = t.raw("onde_voce_esta.tiles") as MiniMetric[];
	const nextSteps = t.raw("proximos_passos.items") as NextStepItem[];
	const pairs = t.raw("continuidade.pairs") as DeltaPair[];

	return (
		<section className="relative overflow-hidden bg-[#090911] py-16 sm:py-20 lg:py-24">
			{/* Soft ambient glow — restrained emerald, single source */}
			<div
				className="pointer-events-none absolute left-1/2 top-0 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-emerald-900/[0.05] blur-[120px]"
				aria-hidden
			/>

			<div className="relative mx-auto w-full max-w-[1100px] px-4 sm:px-8 xl:px-0">
				{/* Section eyebrow + title — quiet header, lets the Tese
				    masthead below carry the dominant visual weight. */}
				<div className="mx-auto mb-10 max-w-[680px] text-center sm:mb-14">
					<div className="mb-3 inline-flex items-center gap-2 rounded-full border border-edge bg-surface-card px-3 py-1">
						<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
						<span className="text-[10px] font-medium uppercase tracking-[0.18em] text-content-secondary">
							{t("eyebrow")}
						</span>
					</div>
					<h2 className="mb-3 text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-zinc-100 sm:text-[2rem] lg:text-[2.5rem]">
						{t("title")}
					</h2>
					<p className="mx-auto max-w-[560px] text-[14px] leading-relaxed text-zinc-400 sm:text-[15px]">
						{t("subtitle")}
					</p>
				</div>

				{/* ═════════════════════ TESE MASTHEAD ═════════════════════ */}
				{/* Full-width 2-column editorial layout. Left column =
				    meta (eyebrow, dateline, attribution). Right column =
				    the tese itself in Fraunces. Hairline vertical rule
				    divides them — newspaper feature signature. */}
				<article className="mb-12 grid grid-cols-1 gap-6 border-y border-edge py-10 sm:mb-16 sm:py-12 md:grid-cols-12 md:gap-0 md:py-14 lg:py-16">
					<aside className="md:col-span-3 md:pr-6">
						{/* Buyer-speak section heading — was tiny-uppercase
						    label "TESE DO MÊS"; replaced with Fraunces serif
						    sentence "Qual é o problema deste mês" matching
						    the supporting columns' heading style. */}
						<div className="text-[16px] font-semibold leading-snug tracking-tight text-zinc-100 sm:text-[18px]">
							{t("tese.eyebrow")}
						</div>
						<div className="mt-2 font-mono text-[11px] text-content-muted">
							{t("tese.dateline")}
						</div>
						<div className="mt-6 hidden h-px w-8 bg-content-faint/40 md:block" />
						<div className="mt-3 hidden text-[10px] font-medium uppercase tracking-[0.18em] text-content-faint md:block">
							{t("tese.attribution")}
						</div>
					</aside>

					<div className="md:col-span-9 md:border-l md:border-edge md:pl-8 lg:pl-12">
						<p className="text-[22px] font-semibold leading-[1.3] tracking-tight text-zinc-100 sm:text-[28px] lg:text-[32px]">
							{t("tese.sample")}
						</p>
						{/* Mobile-only attribution (when stacked, the desktop
						    meta column sits above the quote — no need to
						    repeat — so this only shows when md:hidden). */}
						<div className="mt-6 flex items-center gap-2 text-[10px] text-content-faint md:hidden">
							<span className="h-px w-6 bg-content-faint/40" />
							<span className="font-medium uppercase tracking-[0.14em]">{t("tese.attribution")}</span>
						</div>
					</div>
				</article>

				{/* ═══════════════ 3 SUPPORTING MOVES ═══════════════ */}
				{/* Horizontal strip with hairline-divided columns. NO card
				    wrappers, NO Fraunces on titles, NO per-column accents
				    — typography + spacing carry the hierarchy. */}
				<div className="grid grid-cols-1 gap-y-10 md:grid-cols-3 md:gap-y-0">
					{/* Onde você está — 2 hero metrics at editorial scale */}
					<section className="md:px-6 md:py-2 lg:px-8">
						{/* Buyer-speak section heading — was tiny-uppercase
						    label; replaced with Fraunces serif sentence so
						    the buyer-question reads as a section heading
						    (e.g. "Onde você tá perdendo") not a label.
						    Description dropped — heading is the message. */}
						<h3 className="mb-6 text-[18px] font-semibold leading-snug tracking-tight text-zinc-100 sm:text-[20px]">
							{t("onde_voce_esta.eyebrow")}
						</h3>
						<div className="flex flex-col gap-5">
							{tiles.slice(0, 2).map((m, i) => (
								<div key={i}>
									<div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-content-faint">
										{m.label}
									</div>
									<div className={`mt-1 font-mono text-[28px] font-semibold leading-none tabular-nums sm:text-[32px] ${
										m.tone === "loss" ? "text-rose-400"
											: m.tone === "win" ? "text-emerald-400"
											: "text-zinc-100"
									}`}>
										{m.value}
									</div>
								</div>
							))}
						</div>
					</section>

					{/* Próximos passos — numbered actions as compact prose lines */}
					<section className="md:border-l md:border-edge md:px-6 md:py-2 lg:px-8">
						<h3 className="mb-6 text-[18px] font-semibold leading-snug tracking-tight text-zinc-100 sm:text-[20px]">
							{t("proximos_passos.eyebrow")}
						</h3>
						<ol className="flex flex-col gap-5">
							{nextSteps.map((s, i) => (
								<li key={i} className="flex items-start gap-3">
									<span className="text-[24px] font-bold leading-none tabular-nums tracking-tighter text-content-secondary sm:text-[26px]">
										{s.n}
									</span>
									<div className="min-w-0 flex-1">
										<p className="text-[13px] leading-snug text-zinc-100 sm:text-[14px]">
											{s.title}
										</p>
										<p className="mt-1 text-[11px] text-content-faint">
											<span className="font-mono tabular-nums text-emerald-400">{s.impact}</span>
											<span className="mx-2 text-content-faint/40">·</span>
											<span>{s.buyer}</span>
										</p>
									</div>
								</li>
							))}
						</ol>
					</section>

					{/* Continuidade — delta pairs as prose ("X → Y, +Z") */}
					<section className="md:border-l md:border-edge md:px-6 md:py-2 lg:px-8">
						<h3 className="mb-6 text-[18px] font-semibold leading-snug tracking-tight text-zinc-100 sm:text-[20px]">
							{t("continuidade.eyebrow")}
						</h3>
						<dl className="flex flex-col gap-5">
							{pairs.map((p, i) => (
								<div key={i}>
									<dt className="text-[11px] text-content-secondary">
										{p.label}
									</dt>
									<dd className="mt-1 font-mono text-[13px] tabular-nums sm:text-[14px]">
										<span className="text-content-faint">{p.before}</span>
										<span className="mx-1.5 text-content-faint/50">→</span>
										<span className="text-zinc-100">{p.after}</span>
										<span className={`ml-2 ${
											p.deltaTone === "win" ? "text-emerald-400"
												: p.deltaTone === "loss" ? "text-rose-400"
												: "text-content-faint"
										}`}>
											({p.delta})
										</span>
									</dd>
								</div>
							))}
						</dl>
					</section>
				</div>
			</div>
		</section>
	);
};

export default Features;
