"use client";

import { useTranslations } from "next-intl";

const accents = ["emerald", "violet", "amber"] as const;
const colors = {
	emerald: { border: "border-emerald-500/20", text: "text-emerald-400", bg: "bg-emerald-500/10", glow: "shadow-[0_4px_30px_-10px_rgba(16,185,129,0.15)]", pill: "bg-emerald-500/10 text-emerald-400" },
	violet:  { border: "border-violet-500/20",  text: "text-violet-400",  bg: "bg-violet-500/10",  glow: "shadow-[0_4px_30px_-10px_rgba(139,92,246,0.15)]", pill: "bg-violet-500/10 text-violet-400" },
	amber:   { border: "border-amber-500/20",   text: "text-amber-400",   bg: "bg-amber-500/10",   glow: "shadow-[0_4px_30px_-10px_rgba(245,158,11,0.15)]", pill: "bg-amber-500/10 text-amber-400" },
};

// ── Layer Card ──
function LayerCard({ layer, index, tools, accent }: {
	layer: { eyebrow: string; title: string; body: string; support: string };
	index: number; tools: string[]; accent: typeof accents[number];
}) {
	const c = colors[accent];

	return (
		<div
			className="sticky z-10 pb-6 layer-fade-in will-change-[transform,opacity]"
			style={{
				top: `calc(var(--layer-sticky-top, 80px) + ${index * 20}px)`,
				animationDelay: `${index * 120}ms`,
			}}
		>
			<div className={`rounded-2xl border ${c.border} ${c.glow} bg-[#0c0c14]`}>
				<div className="flex flex-col gap-5 p-5 sm:gap-6 sm:p-10 md:flex-row md:items-start lg:p-12">
					<div className="min-w-0 flex-1">
						<span className={`mb-4 inline-block rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] ${c.pill} sm:mb-5`}>{layer.eyebrow}</span>
						<h3 className="mb-3 text-lg font-bold tracking-tight text-white sm:text-2xl lg:text-3xl">{layer.title}</h3>
						<p className="mb-3 text-sm leading-relaxed text-zinc-300 sm:text-base">{layer.body}</p>
						<p className="text-xs leading-relaxed text-zinc-500 sm:text-sm">{layer.support}</p>
					</div>
					<div className="flex shrink-0 flex-wrap gap-2 md:flex-col md:items-end md:pt-8">
						{tools.map((t) => <span key={t} className={`rounded-lg border ${c.border} px-3 py-1.5 text-xs font-medium ${c.text}`}>{t}</span>)}
					</div>
				</div>
			</div>
		</div>
	);
}

// ── Main ──
export default function SolutionLayers() {
	const t = useTranslations("homepage.solution_layers");
	const layers = t.raw("layers") as { eyebrow: string; title: string; body: string; support: string }[];
	const tools = t.raw("tools") as string[][];

	return (
		<section className="relative bg-[#090911] py-12 sm:py-16 lg:py-20">
			{/* One-shot entrance animation */}
			<style>{`
				@keyframes layerFadeIn {
					from { opacity: 0; transform: translateY(12px) scale(0.98); }
					to   { opacity: 1; transform: translateY(0)    scale(1); }
				}
				.layer-fade-in {
					animation: layerFadeIn 600ms cubic-bezier(0.22, 1, 0.36, 1) both;
				}
				@media (prefers-reduced-motion: reduce) {
					.layer-fade-in { animation: none; }
				}
			`}</style>
			<div className="pointer-events-none absolute inset-0 -z-10">
				<div className="absolute left-1/2 top-[30%] h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-violet-900/8 blur-[80px] sm:h-[500px] sm:w-[600px] sm:blur-[100px]" />
			</div>

			<div className="mx-auto mb-12 max-w-[700px] px-4 text-center sm:mb-16 sm:px-8 lg:mb-20">
				<div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
						<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
						<span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/90">{t("section_label")}</span>
					</div>
				<h2 className="mb-4 text-[1.75rem] font-bold leading-[1.15] tracking-tight text-white sm:mb-5 sm:text-4xl lg:text-5xl">{t("title")}</h2>
			</div>

			<div className="mx-auto w-full max-w-[1100px] px-4 sm:px-8 xl:px-0">
				{layers.map((layer, i) => (
					<LayerCard key={i} layer={layer} index={i} tools={tools[i]} accent={accents[i]} />
				))}

				{/* Closing line — ties the tension to action */}
				<div className="relative z-20 pt-8 pb-4 text-center layer-fade-in" style={{ animationDelay: "360ms" }}>
					<p className="text-base font-medium leading-relaxed text-zinc-300 sm:text-lg">
						{t("closing")}
					</p>
				</div>
			</div>
		</section>
	);
}
