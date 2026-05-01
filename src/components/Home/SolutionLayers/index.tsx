import { getTranslations } from "next-intl/server";

const accents = ["emerald", "violet", "amber"] as const;
const colors = {
	emerald: { border: "border-emerald-500/50", text: "text-emerald-400", bg: "bg-emerald-500/10", glow: "shadow-[0_4px_40px_-8px_rgba(16,185,129,0.25)]", pill: "bg-emerald-500/10 text-emerald-400" },
	violet:  { border: "border-violet-500/50",  text: "text-violet-400",  bg: "bg-violet-500/10",  glow: "shadow-[0_4px_40px_-8px_rgba(139,92,246,0.25)]", pill: "bg-violet-500/10 text-violet-400" },
	amber:   { border: "border-amber-500/50",   text: "text-amber-400",   bg: "bg-amber-500/10",   glow: "shadow-[0_4px_40px_-8px_rgba(245,158,11,0.25)]", pill: "bg-amber-500/10 text-amber-400" },
};

/* ── Icons per layer ── */

const LAYER_ICONS = [
	// The Gap — bar chart with missing middle bar
	<svg
		key="0"
		className="h-3.5 w-3.5"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<rect x="4" y="14" width="4" height="6" rx="1" />
		<rect x="10" y="6" width="4" height="14" rx="1" opacity="0.35" strokeDasharray="2 2" />
		<rect x="16" y="10" width="4" height="10" rx="1" />
	</svg>,

	// The Cycle — refresh arrows
	<svg
		key="1"
		className="h-3.5 w-3.5"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<polyline points="23 4 23 10 17 10" />
		<polyline points="1 20 1 14 7 14" />
		<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
	</svg>,

	// The Silence — eye off
	<svg
		key="2"
		className="h-3.5 w-3.5"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
		<line x1="1" y1="1" x2="23" y2="23" />
	</svg>,
];

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
						<span className={`mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] ${c.pill} sm:mb-5`}>
							{LAYER_ICONS[index]}
							{layer.eyebrow}
						</span>
						<h3 className="mb-3 text-xl font-bold tracking-tight text-white sm:text-2xl lg:text-3xl">{layer.title}</h3>
						<p className="mb-3 text-sm leading-relaxed text-zinc-300 sm:text-base">{layer.body}</p>
						{layer.support && (
							<p className="text-xs leading-relaxed text-zinc-500 sm:text-sm">{layer.support}</p>
						)}
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
export default async function SolutionLayers() {
	const t = await getTranslations("homepage.solution_layers");
	const layers = t.raw("layers") as { eyebrow: string; title: string; body: string; support: string }[];
	const tools = t.raw("tools") as string[][];

	return (
		<section className="relative bg-[#090911] py-8 sm:py-10 lg:py-14">
			<div className="pointer-events-none absolute inset-0 -z-10">
				<div className="absolute left-1/2 top-[30%] h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-violet-900/8 blur-[80px] sm:h-[500px] sm:w-[600px] sm:blur-[100px]" />
			</div>

			<div className="mx-auto mb-12 max-w-[700px] px-4 text-center sm:mb-16 sm:px-8 lg:mb-20">
				<div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
						<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
						<span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/90">{t("section_label")}</span>
					</div>
				<h2 className="mb-4 text-[1.75rem] font-bold leading-[1.1] tracking-tight text-white sm:mb-5 sm:text-3xl lg:text-[2.25rem]">{t("title")}</h2>
			</div>

			<div className="mx-auto w-full max-w-[1100px] px-4 sm:px-8 xl:px-0">
				{layers.map((layer, i) => (
					<LayerCard key={i} layer={layer} index={i} tools={tools[i]} accent={accents[i]} />
				))}

				{/* Closing line — ties the tension to action */}
				<div className="relative z-20 pt-14 pb-4 text-center layer-fade-in sm:pt-10" style={{ animationDelay: "360ms" }}>
					<p className="text-base font-medium leading-relaxed text-zinc-300 sm:text-lg">
						{t("closing")}
					</p>
				</div>
			</div>
		</section>
	);
}
