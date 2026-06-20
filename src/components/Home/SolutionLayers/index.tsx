/**
 * Home > SolutionLayers — "O problema" (editorial essay, rewrite 2026-06-20).
 *
 * 3 frames of the same observation: O buraco (the leak between click and
 * conversion), O ciclo (fixes move the problem instead of solving it),
 * O silêncio (no alerts, no signal, the leak is invisible).
 *
 * Layout is intentionally NOT the Features triptych masthead — the
 * homepage already uses that pattern, and repeating it here would
 * collapse the page into one rhythm. SolutionLayers takes a different
 * editorial form: a single-column long-form essay, narrow reading
 * width, with chapter-rule dividers (small label centered between
 * horizontal hairlines, like Aeon / New Yorker "Talk of the Town").
 *
 *   ┌─────────────────────────────┐
 *   │     [eyebrow]               │
 *   │                             │
 *   │  Mais tráfego não resolve.  │  ← Fraunces, big, the lede
 *   │  O dinheiro escapa entre    │
 *   │  o clique e a conversão.    │
 *   │                             │
 *   │  ─────  O BURACO  ─────     │  ← chapter rule signature
 *   │  [Fraunces body paragraph]  │  ← essay register, body serif
 *   │                             │
 *   │  ─────  O CICLO  ─────      │
 *   │  [Fraunces body paragraph]  │
 *   │                             │
 *   │  ─────  O SILÊNCIO  ─────   │
 *   │  [Fraunces body paragraph]  │
 *   │                             │
 *   │           ─                 │
 *   │  [italic closing line]      │
 *   └─────────────────────────────┘
 *
 * Old SVG visuals (rotating ring, terminal mockup, draining coins) are
 * dropped — terminal aesthetic violates the standing memory rule, and
 * the ornamental graphics fight the editorial register. The frames'
 * copy carries the message; serif body paragraphs prove Vestigio
 * actually reads + writes, not just dashboards.
 *
 * Server component (`async` + `getTranslations`) so it stays out of
 * the client bundle.
 */

import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────
// **bold** marker → <strong>text-content</strong>, otherwise plain text.
// Used to call out the numeric phrases ("até 67% dos visitantes somem")
// inside the otherwise muted serif body — earns visual emphasis on the
// claim without breaking the reading register.
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

// ─────────────────────────────────────────────────────────────────────
// Chapter rule — small uppercase label centered between hairlines.
// The section's signature: distinguishes this surface from Features
// (which uses vertical hairlines dividing columns).
// ─────────────────────────────────────────────────────────────────────

function ChapterRule({ label }: { label: string }) {
	return (
		<div className="my-10 flex items-center gap-4 text-content-faint sm:my-12">
			<div className="h-px flex-1 bg-content-faint/25" />
			<span className="font-serif text-[12px] font-medium italic tracking-[0.06em] text-content-secondary sm:text-[13px]">
				{label}
			</span>
			<div className="h-px flex-1 bg-content-faint/25" />
		</div>
	);
}

interface Frame {
	label: string;
	body: string;
}

const SolutionLayers = async () => {
	const t = await getTranslations("homepage.solution_layers");
	const frames = t.raw("frames") as Frame[];

	return (
		<section className="relative bg-[#090911] py-16 sm:py-20 lg:py-28">
			{/* Soft red glow — restrained "this is the problem" ambient
			    cue. Smaller + softer than the old version's full-width
			    halo so it stays atmospheric, not loud. */}
			<div
				className="pointer-events-none absolute left-1/2 top-[30%] -z-10 h-[400px] w-[500px] -translate-x-1/2 rounded-full bg-rose-900/[0.05] blur-[100px]"
				aria-hidden
			/>

			{/* Narrow reading column (~680px) — opposite of Features
			    (1100px wide spread). Reads like a magazine essay opened
			    inside a wider page. */}
			<div className="relative mx-auto w-full max-w-[680px] px-4 sm:px-8 xl:px-0">
				<header className="mb-10 text-center sm:mb-14">
					<div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-content-faint">
						{t("eyebrow")}
					</div>
					<h2 className="font-serif text-[1.75rem] font-medium leading-[1.2] tracking-tight text-zinc-100 sm:text-[2.25rem] lg:text-[2.75rem]">
						{t("title_line1")}
						<br />
						<span className="text-content-secondary">{t("title_line2")}</span>
					</h2>
				</header>

				{/* Three essay frames separated by chapter rules. Each frame
				    is one paragraph of Fraunces serif body, ~80–120 words,
				    paced for sustained reading. No cards, no graphics. */}
				{frames.map((frame, i) => (
					<div key={i}>
						<ChapterRule label={frame.label} />
						<p className="font-serif text-[16px] leading-[1.65] text-zinc-300 sm:text-[18px]">
							{renderBold(frame.body)}
						</p>
					</div>
				))}

				{/* Closing — italic, set apart from the body with a soft
				    rule. The single editorial line that pivots from
				    diagnosis to invitation. */}
				<div className="mt-14 flex flex-col items-center gap-6 text-center sm:mt-20">
					<div className="h-px w-12 bg-content-faint/40" />
					<p className="max-w-[440px] font-serif text-[15px] italic leading-[1.55] text-content-secondary sm:text-[17px]">
						{t("closing")}
					</p>
				</div>
			</div>
		</section>
	);
};

export default SolutionLayers;
