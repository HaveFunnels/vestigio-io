"use client";

// ──────────────────────────────────────────────
// Solution Layers — sticky stacking cards
//
// Each card scrolls up and sticks at the top of the
// viewport. The next card scrolls over the previous,
// creating a natural stacking effect. Pure CSS sticky.
// ──────────────────────────────────────────────

const layers = [
	{
		eyebrow: "Layer 1",
		title: "Descubra antes dos outros",
		body: "Veja onde estão os riscos, vazamentos e oportunidades antes que virem custo.",
		support:
			"Findings, analysis e contexto inicial para entender o que está quebrando, o que está passando despercebido e o que pode comprometer escala.",
		accent: "emerald" as const,
		tools: ["Findings", "Analysis", "Evidence"],
	},
	{
		eyebrow: "Layer 2",
		title: "Priorize e aja com precisão",
		body: "Transforme sinais em uma fila contínua de ação, com contexto e prioridade.",
		support:
			"Actions e workspaces ajudam a organizar o que corrigir, acompanhar e explorar por rota, jornada, campanha ou ambiente.",
		accent: "violet" as const,
		tools: ["Actions", "Workspaces", "Priorities"],
	},
	{
		eyebrow: "Layer 3",
		title: "Valide com confiança",
		body: "Confirme se está pronto, se piorou ou se a correção realmente fechou.",
		support:
			"Preflight, regressions e verification ajudam a decidir antes de escalar e a acompanhar mudanças ao longo do tempo.",
		accent: "amber" as const,
		tools: ["Preflight", "Regressions", "Verification"],
	},
];

const colors = {
	emerald: { border: "border-emerald-500/20", text: "text-emerald-400", bg: "bg-emerald-500/10", glow: "shadow-[0_8px_60px_-15px_rgba(16,185,129,0.2)]", pill: "bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-400" },
	violet:  { border: "border-violet-500/20",  text: "text-violet-400",  bg: "bg-violet-500/10",  glow: "shadow-[0_8px_60px_-15px_rgba(139,92,246,0.2)]", pill: "bg-violet-500/10 text-violet-400",  dot: "bg-violet-400" },
	amber:   { border: "border-amber-500/20",   text: "text-amber-400",   bg: "bg-amber-500/10",   glow: "shadow-[0_8px_60px_-15px_rgba(245,158,11,0.2)]", pill: "bg-amber-500/10 text-amber-400",   dot: "bg-amber-400" },
};

function LayerCard({ layer, index }: { layer: (typeof layers)[0]; index: number }) {
	const c = colors[layer.accent];
	// Each card sticks a bit lower so they peek behind each other
	const stickyTop = 80 + index * 16;

	return (
		<div
			className="sticky z-10 pb-6"
			style={{ top: stickyTop }}
		>
			<div className={`rounded-2xl border ${c.border} ${c.glow} bg-[#0c0c14] backdrop-blur-md`}>
				<div className="flex flex-col gap-6 p-7 sm:flex-row sm:items-start sm:p-10 lg:p-12">
					{/* Left: content */}
					<div className="flex-1 min-w-0">
						<div className="mb-5 flex items-center gap-3">
							<span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] ${c.pill}`}>
								{layer.eyebrow}
							</span>
						</div>
						<h3 className="mb-3 text-xl font-bold tracking-tight text-white sm:text-2xl lg:text-3xl">
							{layer.title}
						</h3>
						<p className="mb-3 text-sm leading-relaxed text-gray-300 sm:text-base">
							{layer.body}
						</p>
						<p className="text-xs leading-relaxed text-gray-500 sm:text-sm">
							{layer.support}
						</p>
					</div>

					{/* Right: tool pills */}
					<div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end sm:pt-8">
						{layer.tools.map((tool) => (
							<span
								key={tool}
								className={`rounded-lg border ${c.border} px-3 py-1.5 text-xs font-medium ${c.text}`}
							>
								{tool}
							</span>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function AgenticChatFlow() {
	return (
		<div className="relative z-20 pt-8 pb-4">
			<div className="rounded-2xl border border-white/[0.06] bg-[#0c0c14] p-7 backdrop-blur-md sm:p-10 lg:p-12">
				{/* Header */}
				<div className="mb-10 text-center">
					<span className="mb-2 inline-block text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
						Agentic Chat
					</span>
					<h3 className="text-xl font-bold text-white sm:text-2xl">
						Explique, investigue e valide com o Agentic Chat
					</h3>
				</div>

				{/* Flowchart */}
				<div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center lg:gap-0">
					{/* Source layers */}
					<div className="flex shrink-0 flex-row gap-3 lg:flex-col lg:gap-3">
						{(["emerald", "violet", "amber"] as const).map((accent, i) => {
							const c = colors[accent];
							const labels = ["Findings", "Actions", "Verification"];
							return (
								<div
									key={accent}
									className={`flex items-center gap-2 rounded-xl border ${c.border} ${c.bg} px-4 py-2.5`}
								>
									<div className={`h-2 w-2 rounded-full ${c.dot}`} />
									<span className={`text-xs font-semibold ${c.text}`}>{labels[i]}</span>
								</div>
							);
						})}
					</div>

					{/* Connector → MCP */}
					<div className="flex items-center lg:flex-1 lg:px-3">
						<div className="hidden h-px flex-1 bg-gradient-to-r from-emerald-500/20 via-violet-500/20 to-violet-500/30 lg:block" />
						<svg className="block h-6 w-6 text-white/20 lg:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
							<path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75" />
						</svg>
					</div>

					{/* MCP Engine */}
					<div className="shrink-0 text-center">
						<div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-emerald-500/10 shadow-[0_0_50px_-12px_rgba(139,92,246,0.25)]">
							<svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
							</svg>
						</div>
						<span className="mt-2 block text-[10px] font-semibold uppercase tracking-widest text-gray-500">MCP Engine</span>
					</div>

					{/* Connector → Response */}
					<div className="flex items-center lg:flex-1 lg:px-3">
						<div className="hidden h-px flex-1 bg-gradient-to-r from-violet-500/30 to-white/10 lg:block" />
						<svg className="block h-6 w-6 text-white/20 lg:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
							<path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75" />
						</svg>
					</div>

					{/* Response */}
					<div className="w-full max-w-xs shrink-0 rounded-xl border border-white/10 bg-white/[0.03] p-5">
						<div className="mb-3 flex items-center gap-2">
							<div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
							<span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">Structured Response</span>
						</div>
						<p className="mb-3 text-xs leading-relaxed text-gray-300">
							&ldquo;3 regressões encontradas: checkout abandonment +12%, payment validation falhou em 2 rotas, SSL expira em 5 dias.&rdquo;
						</p>
						<div className="flex flex-wrap gap-1.5">
							<span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[9px] font-medium text-emerald-400">cited: findings</span>
							<span className="rounded bg-violet-500/10 px-2 py-0.5 text-[9px] font-medium text-violet-400">cited: actions</span>
							<span className="rounded bg-amber-500/10 px-2 py-0.5 text-[9px] font-medium text-amber-400">cited: verification</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function SolutionLayers() {
	return (
		<section className="relative bg-[#090911] py-20 lg:py-28">
			{/* Background */}
			<div className="pointer-events-none absolute inset-0 -z-10">
				<div className="absolute left-1/2 top-[30%] h-[600px] w-[700px] -translate-x-1/2 rounded-full bg-violet-900/8 blur-[180px]" />
			</div>

			{/* Section header (not sticky) */}
			<div className="mx-auto mb-16 max-w-[700px] px-4 text-center sm:px-8 lg:mb-20">
				<span className="mb-3 inline-block text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
					Solution
				</span>
				<h2 className="mb-5 text-3xl font-bold leading-[1.12] tracking-tight text-white sm:text-4xl lg:text-5xl">
					Recuse escalar seu negócio no escuro.
				</h2>
				<p className="text-base leading-relaxed text-gray-400 sm:text-lg">
					Enxergue cedo, priorize com clareza e valide seu negócio digital de maneira contínua.
				</p>
			</div>

			{/* Stacking cards container */}
			<div className="mx-auto w-full max-w-[1100px] px-4 sm:px-8 xl:px-0">
				{layers.map((layer, i) => (
					<LayerCard key={layer.eyebrow} layer={layer} index={i} />
				))}

				{/* MCP Chat flow — scrolls in after all cards are stacked */}
				<AgenticChatFlow />
			</div>
		</section>
	);
}
