"use client";

import { useEffect, useRef, useState } from "react";

// ──────────────────────────────────────────────
// Solution Layers — sticky scroll-driven cards
// Cards start stacked, unstack as you scroll,
// then restack at the end. Full width.
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
	emerald: { border: "border-emerald-500/20", text: "text-emerald-400", bg: "bg-emerald-500/10", glow: "rgba(16,185,129,0.15)", pill: "bg-emerald-500/10 text-emerald-400" },
	violet:  { border: "border-violet-500/20",  text: "text-violet-400",  bg: "bg-violet-500/10",  glow: "rgba(139,92,246,0.15)", pill: "bg-violet-500/10 text-violet-400" },
	amber:   { border: "border-amber-500/20",   text: "text-amber-400",   bg: "bg-amber-500/10",   glow: "rgba(245,158,11,0.15)", pill: "bg-amber-500/10 text-amber-400" },
};

export default function SolutionLayers() {
	const sectionRef = useRef<HTMLDivElement>(null);
	const [scrollProgress, setScrollProgress] = useState(0);

	useEffect(() => {
		const onScroll = () => {
			if (!sectionRef.current) return;
			const rect = sectionRef.current.getBoundingClientRect();
			const sectionH = sectionRef.current.offsetHeight;
			const viewH = window.innerHeight;

			// 0 = section top hits viewport bottom, 1 = section bottom hits viewport top
			const raw = (viewH - rect.top) / (sectionH + viewH);
			setScrollProgress(Math.max(0, Math.min(1, raw)));
		};

		window.addEventListener("scroll", onScroll, { passive: true });
		onScroll();
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	// Phase mapping: header (0-0.15), cards (0.15-0.7), chat (0.7-0.9), end (0.9-1)
	const headerOpacity = Math.min(1, scrollProgress / 0.15);

	return (
		<section
			ref={sectionRef}
			className="relative bg-[#090911]"
			style={{ minHeight: "250vh" }}
		>
			{/* Background */}
			<div className="pointer-events-none absolute inset-0 -z-10">
				<div className="absolute left-1/2 top-[40%] h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-900/8 blur-[200px]" />
			</div>

			{/* Sticky container */}
			<div className="sticky top-0 flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-16 sm:px-8">
				{/* Header */}
				<div
					className="mb-12 max-w-[700px] text-center lg:mb-16"
					style={{ opacity: headerOpacity, transform: `translateY(${(1 - headerOpacity) * 20}px)` }}
				>
					<span className="mb-3 inline-block text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
						Solution
					</span>
					<h2 className="mb-4 text-3xl font-bold leading-[1.12] tracking-tight text-white sm:text-4xl lg:text-5xl">
						Recuse escalar seu negócio no escuro.
					</h2>
					<p className="text-base leading-relaxed text-gray-400 sm:text-lg">
						Enxergue cedo, priorize com clareza e valide seu negócio digital de maneira contínua.
					</p>
				</div>

				{/* Cards area */}
				<div className="relative w-full max-w-[1100px]">
					{/* Stacking cards */}
					<div className="relative" style={{ height: 320 }}>
						{layers.map((layer, i) => {
							const c = colors[layer.accent];
							// Each card occupies a scroll band
							const bandSize = 0.55 / 3; // cards phase = 0.15 to 0.7
							const cardStart = 0.15 + i * bandSize;
							const cardPeak = cardStart + bandSize * 0.5;
							const cardEnd = cardStart + bandSize;

							// Card unfold: 0 = stacked, 1 = fully visible
							let unfold = 0;
							if (scrollProgress < cardStart) unfold = 0;
							else if (scrollProgress < cardPeak) unfold = (scrollProgress - cardStart) / (cardPeak - cardStart);
							else if (scrollProgress < cardEnd) unfold = 1;
							else if (scrollProgress < 0.9) unfold = 1;
							else unfold = 1 - ((scrollProgress - 0.9) / 0.1); // restack at end

							unfold = Math.max(0, Math.min(1, unfold));

							// Stack offset when collapsed
							const stackOffset = i * 12;
							const stackScale = 1 - i * 0.03;

							// Interpolated transforms
							const y = (1 - unfold) * stackOffset;
							const scale = stackScale + unfold * (1 - stackScale);
							const opacity = 0.3 + unfold * 0.7;
							const zIndex = unfold > 0.5 ? 10 + i : 3 - i;

							return (
								<div
									key={layer.eyebrow}
									className={`absolute inset-x-0 top-0 rounded-2xl border ${c.border} bg-[#0d0d14]/90 backdrop-blur-md`}
									style={{
										transform: `translateY(${y}px) scale(${scale})`,
										opacity,
										zIndex,
										boxShadow: unfold > 0.5 ? `0 0 80px -20px ${c.glow}` : "none",
										transition: "box-shadow 0.3s ease",
									}}
								>
									<div className="flex flex-col gap-6 p-8 sm:flex-row sm:items-start sm:p-10 lg:p-12">
										{/* Left: content */}
										<div className="flex-1">
											<div className="mb-4 flex items-center gap-3">
												<span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${c.pill}`}>
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
										<div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end sm:pt-10">
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
							);
						})}
					</div>

					{/* MCP Chat — appears after cards */}
					<AgenticChatFlow progress={scrollProgress} />
				</div>
			</div>
		</section>
	);
}

// ──────────────────────────────────────────────
// Agentic Chat Flow — shows how the 3 layers
// feed into the chat with a proper flowchart
// ──────────────────────────────────────────────

function AgenticChatFlow({ progress }: { progress: number }) {
	const reveal = Math.max(0, Math.min(1, (progress - 0.65) / 0.15));

	return (
		<div
			className="mt-16"
			style={{
				opacity: reveal,
				transform: `translateY(${(1 - reveal) * 30}px)`,
				transition: "opacity 0.15s ease-out",
			}}
		>
			{/* Flow diagram */}
			<div className="rounded-2xl border border-white/[0.06] bg-[#0d0d14]/80 p-8 backdrop-blur-md sm:p-10 lg:p-12">
				<div className="mb-8 text-center">
					<span className="mb-2 inline-block text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
						Agentic Chat
					</span>
					<h3 className="text-xl font-bold text-white sm:text-2xl">
						Explique, investigue e valide com o Agentic Chat
					</h3>
				</div>

				{/* Flowchart: 3 layers → MCP → response */}
				<div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:gap-0">
					{/* Source layers */}
					<div className="flex shrink-0 flex-row gap-3 lg:flex-col lg:gap-4">
						{(["emerald", "violet", "amber"] as const).map((accent, i) => {
							const c = colors[accent];
							const labels = ["Findings", "Actions", "Verification"];
							return (
								<div
									key={accent}
									className={`flex items-center gap-2.5 rounded-xl border ${c.border} ${c.bg} px-4 py-2.5`}
								>
									<div className={`h-2 w-2 rounded-full ${accent === "emerald" ? "bg-emerald-400" : accent === "violet" ? "bg-violet-400" : "bg-amber-400"}`} />
									<span className={`text-xs font-semibold ${c.text}`}>{labels[i]}</span>
								</div>
							);
						})}
					</div>

					{/* Connector arrows */}
					<div className="flex items-center justify-center lg:flex-1 lg:px-4">
						<svg className="hidden h-20 w-full lg:block" viewBox="0 0 200 80" fill="none" preserveAspectRatio="none">
							<path d="M0 10 C60 10, 140 40, 200 40" stroke="rgb(52 211 153)" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />
							<path d="M0 40 C60 40, 140 40, 200 40" stroke="rgb(167 139 250)" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />
							<path d="M0 70 C60 70, 140 40, 200 40" stroke="rgb(251 191 36)" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />
							<circle cx="200" cy="40" r="4" fill="white" opacity="0.6" />
						</svg>
						{/* Mobile: vertical arrow */}
						<svg className="block h-8 w-8 text-white/20 lg:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
							<path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75" />
						</svg>
					</div>

					{/* MCP Engine node */}
					<div className="relative shrink-0">
						<div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-emerald-500/10 shadow-[0_0_60px_-15px_rgba(139,92,246,0.3)]">
							<svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
							</svg>
						</div>
						<span className="mt-2 block text-center text-[10px] font-semibold uppercase tracking-widest text-gray-500">MCP Engine</span>
					</div>

					{/* Connector arrow to response */}
					<div className="flex items-center justify-center lg:flex-1 lg:px-4">
						<svg className="hidden h-20 w-full lg:block" viewBox="0 0 200 80" fill="none" preserveAspectRatio="none">
							<path d="M0 40 L200 40" stroke="white" strokeWidth="1" strokeDasharray="4 3" opacity="0.2" />
							<polygon points="195,35 200,40 195,45" fill="white" opacity="0.3" />
						</svg>
						<svg className="block h-8 w-8 text-white/20 lg:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
							<path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75" />
						</svg>
					</div>

					{/* Response card */}
					<div className="w-full max-w-xs shrink-0 rounded-xl border border-white/10 bg-white/[0.04] p-5">
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
