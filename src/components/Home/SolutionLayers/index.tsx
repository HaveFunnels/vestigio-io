/**
 * Home > SolutionLayers — "O problema" (editorial essay v2, 2026-06-20).
 *
 * 3 frames of the same observation, each with its OWN visual moment so
 * the reader scans instead of skipping. Previous v1 was 3 same-shape
 * Fraunces paragraphs in a row — wall of text, no visual rhythm,
 * user feedback "cansativo de ler, mesma fonte em tudo, leitor pula".
 *
 *   Frame 1 — O buraco     : massive italic stat (67%) pulled to display
 *   Frame 2 — O ciclo      : hanging-indent cascade of the problem moving
 *                            down the funnel — typography IS the diagram
 *   Frame 3 — O silêncio   : 0 / 0 / 0 / 1 typographic tally — three
 *                            zeros (no signal) ending in the one thing
 *                            growing (the buraco)
 *
 * Constraints: no terminal aesthetic, no SVG illustrations, restricted
 * palette, Fraunces only where it's editorial display.
 *
 * Server component (`async` + `getTranslations`) so it stays out of
 * the client bundle.
 */

import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

// **bold** marker → <strong>text-zinc-100</strong>
function renderBold(text: string): ReactNode[] {
	const parts = text.split(/(\*\*[^*]+\*\*)/g);
	return parts.map((part, i) => {
		if (part.startsWith("**") && part.endsWith("**")) {
			return <strong key={i} className="font-semibold text-zinc-100">{part.slice(2, -2)}</strong>;
		}
		return <span key={i}>{part}</span>;
	});
}

// Chapter rule — small uppercase italic-serif label flanked by hairlines.
// Section's signature, distinct from Features (vertical hairlines between
// columns) and Counter Tese (decorative `"` glyph).
function ChapterRule({ label }: { label: string }) {
	return (
		<div className="my-12 flex items-center gap-4 text-content-faint sm:my-16">
			<div className="h-px flex-1 bg-content-faint/25" />
			<span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-secondary sm:text-[12px]">
				{label}
			</span>
			<div className="h-px flex-1 bg-content-faint/25" />
		</div>
	);
}

const SolutionLayers = async () => {
	const t = await getTranslations("homepage.solution_layers");

	return (
		<section className="relative bg-[#090911] py-16 sm:py-20 lg:py-28">
			{/* Restrained rose ambient — problem cue, not loud */}
			<div
				className="pointer-events-none absolute left-1/2 top-[30%] -z-10 h-[400px] w-[500px] -translate-x-1/2 rounded-full bg-rose-900/[0.05] blur-[100px]"
				aria-hidden
			/>

			{/* Narrow reading column — opposite of Features's 1100px spread. */}
			<div className="relative mx-auto w-full max-w-[680px] px-4 sm:px-8 xl:px-0">
				<header className="mb-8 text-center sm:mb-12">
					<div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-content-faint">
						{t("eyebrow")}
					</div>
					<h2 className="text-[1.75rem] font-semibold leading-[1.1] tracking-tight text-zinc-100 sm:text-[2.25rem] lg:text-[2.75rem]">
						{t("title_line1")}
						<br />
						<span className="text-content-secondary">{t("title_line2")}</span>
					</h2>
				</header>

				{/* ═══════════════ FRAME 1 — O BURACO ═══════════════ */}
				{/* Display moment: the killer stat. Massive Fraunces italic
				    digit + small caption below. Body underneath, short.   */}
				<ChapterRule label={t("buraco.label")} />
				<div className="text-center">
					<div className="text-[5.5rem] font-bold leading-none tracking-tighter text-rose-300/90 tabular-nums sm:text-[7rem] lg:text-[8.5rem]">
						{t("buraco.stat")}
					</div>
					<div className="mx-auto mt-4 h-px w-12 bg-content-faint/40" />
					<p className="mx-auto mt-4 max-w-[420px] text-[14px] leading-relaxed text-content-secondary sm:text-[15px]">
						{renderBold(t("buraco.caption"))}
					</p>
				</div>
				<p className="mx-auto mt-6 max-w-[480px] text-center text-[13px] leading-relaxed text-content-muted sm:text-[14px]">
					{renderBold(t("buraco.aside"))}
				</p>

				{/* ═══════════════ FRAME 2 — O CICLO ═══════════════ */}
				{/* Display moment: a hanging-indent cascade. Each line steps
				    further right to show the problem MOVING down the funnel.
				    Typography is the diagram — no SVG. */}
				<ChapterRule label={t("ciclo.label")} />
				<div className="text-[15px] leading-[1.6] text-zinc-300 sm:text-[17px]">
					<div className="pl-0">{renderBold(t("ciclo.step1"))}</div>
					<div className="pl-6 sm:pl-10">{renderBold(t("ciclo.step2"))}</div>
					<div className="pl-12 sm:pl-20">{renderBold(t("ciclo.step3"))}</div>
					<div className="pl-[4.5rem] sm:pl-[7.5rem]">{renderBold(t("ciclo.step4"))}</div>
				</div>
				<p className="mt-6 text-[13px] leading-relaxed text-content-muted sm:text-[14px]">
					{renderBold(t("ciclo.aside"))}
				</p>

				{/* ═══════════════ FRAME 3 — O SILÊNCIO ═══════════════ */}
				{/* Display moment: 0 / 0 / 0 typographic tally — three
				    zeros (silence) with the one thing growing at the
				    bottom (the actual buraco). Numerals in Fraunces,
				    labels in small sans, hairline divides the contrast. */}
				<ChapterRule label={t("silencio.label")} />
				<div className="mx-auto max-w-[360px]">
					<dl className="space-y-3">
						{(t.raw("silencio.zeros") as string[]).map((label, i) => (
							<div key={i} className="flex items-center gap-5">
								<dt className="text-[36px] font-bold leading-none tabular-nums tracking-tighter text-content-faint sm:text-[44px]">
									0
								</dt>
								<dd className="text-[14px] tracking-wide text-content-secondary sm:text-[15px]">
									{label}
								</dd>
							</div>
						))}
						<div className="!mt-5 h-px w-full bg-content-faint/25" />
						<div className="!mt-5 flex items-center gap-5">
							<dt className="text-[36px] font-bold leading-none tabular-nums tracking-tighter text-rose-300/90 sm:text-[44px]">
								1
							</dt>
							<dd className="text-[14px] tracking-wide text-zinc-200 sm:text-[15px]">
								{t("silencio.one")}
							</dd>
						</div>
					</dl>
				</div>
				<p className="mx-auto mt-6 max-w-[480px] text-[13px] leading-relaxed text-content-muted sm:text-[14px]">
					{renderBold(t("silencio.aside"))}
				</p>

				{/* Closing pivot — italic, set apart by short hairline. */}
				<div className="mt-16 flex flex-col items-center gap-5 text-center sm:mt-20">
					<div className="h-px w-12 bg-content-faint/40" />
					<p className="max-w-[440px] text-[15px] font-medium leading-[1.55] text-content-secondary sm:text-[17px]">
						{t("closing")}
					</p>
				</div>
			</div>
		</section>
	);
};

export default SolutionLayers;
