"use client";

import { useEffect, useRef, useState } from "react";

// ──────────────────────────────────────────────
// Solution Layers — scroll-driven stacking cards
// Paddle/Salt-inspired premium section
// ──────────────────────────────────────────────

const layers = [
	{
		eyebrow: "Layer 1",
		title: "Descubra antes dos outros",
		body: "Veja onde estão os riscos, vazamentos e oportunidades antes que virem custo.",
		support:
			"Findings, analysis e contexto inicial para entender o que está quebrando, o que está passando despercebido e o que pode comprometer escala.",
		icon: (
			<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
				<path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
				<path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
			</svg>
		),
		accent: "emerald",
	},
	{
		eyebrow: "Layer 2",
		title: "Priorize e aja com precisão",
		body: "Transforme sinais em uma fila contínua de ação, com contexto e prioridade.",
		support:
			"Actions e workspaces ajudam a organizar o que corrigir, acompanhar e explorar por rota, jornada, campanha ou ambiente.",
		icon: (
			<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
				<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
			</svg>
		),
		accent: "violet",
	},
	{
		eyebrow: "Layer 3",
		title: "Valide com confiança",
		body: "Confirme se está pronto, se piorou ou se a correção realmente fechou.",
		support:
			"Preflight, regressions e verification ajudam a decidir antes de escalar e a acompanhar mudanças ao longo do tempo.",
		icon: (
			<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
				<path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
			</svg>
		),
		accent: "amber",
	},
];

const accentStyles: Record<string, { bg: string; text: string; border: string; glow: string }> = {
	emerald: {
		bg: "bg-emerald-500/10",
		text: "text-emerald-400",
		border: "border-emerald-500/20",
		glow: "shadow-[0_0_60px_-15px_rgba(16,185,129,0.3)]",
	},
	violet: {
		bg: "bg-violet-500/10",
		text: "text-violet-400",
		border: "border-violet-500/20",
		glow: "shadow-[0_0_60px_-15px_rgba(139,92,246,0.3)]",
	},
	amber: {
		bg: "bg-amber-500/10",
		text: "text-amber-400",
		border: "border-amber-500/20",
		glow: "shadow-[0_0_60px_-15px_rgba(245,158,11,0.3)]",
	},
};

function LayerCard({
	layer,
	index,
	progress,
}: {
	layer: (typeof layers)[0];
	index: number;
	progress: number;
}) {
	const style = accentStyles[layer.accent];

	// Each card starts revealing at different scroll thresholds
	const cardStart = index * 0.25;
	const cardEnd = cardStart + 0.3;
	const cardProgress = Math.max(0, Math.min(1, (progress - cardStart) / (cardEnd - cardStart)));

	// Transform: cards stack from below, each slightly offset
	const translateY = (1 - cardProgress) * 80;
	const opacity = cardProgress;
	const scale = 0.95 + cardProgress * 0.05;

	return (
		<div
			className={`relative overflow-hidden rounded-2xl border ${style.border} bg-white/[0.03] backdrop-blur-sm transition-shadow duration-500 ${
				cardProgress > 0.5 ? style.glow : ""
			}`}
			style={{
				transform: `translateY(${translateY}px) scale(${scale})`,
				opacity,
				transition: "transform 0.1s ease-out, opacity 0.1s ease-out",
			}}
		>
			<div className="p-8 sm:p-10">
				{/* Eyebrow */}
				<div className="mb-6 flex items-center gap-3">
					<div className={`flex h-10 w-10 items-center justify-center rounded-xl ${style.bg} ${style.text}`}>
						{layer.icon}
					</div>
					<span className={`text-xs font-semibold uppercase tracking-widest ${style.text}`}>
						{layer.eyebrow}
					</span>
				</div>

				{/* Content */}
				<h3 className="mb-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
					{layer.title}
				</h3>
				<p className="mb-4 text-base leading-relaxed text-gray-300">
					{layer.body}
				</p>
				<p className="text-sm leading-relaxed text-gray-500">
					{layer.support}
				</p>

				{/* Decorative line */}
				<div className="mt-8 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
			</div>
		</div>
	);
}

function MCPChatConnector({ progress }: { progress: number }) {
	const reveal = Math.max(0, Math.min(1, (progress - 0.75) / 0.25));

	return (
		<div
			className="relative mt-12"
			style={{
				opacity: reveal,
				transform: `translateY(${(1 - reveal) * 40}px)`,
				transition: "transform 0.1s ease-out, opacity 0.1s ease-out",
			}}
		>
			{/* Connector lines from layers to chat */}
			<div className="mx-auto mb-8 flex justify-center">
				<svg className="h-16 w-64 text-white/10" viewBox="0 0 256 64" fill="none">
					<path d="M32 0 L32 24 L128 48" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
					<path d="M128 0 L128 48" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
					<path d="M224 0 L224 24 L128 48" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
					{/* Dots at connection points */}
					<circle cx="32" cy="0" r="3" fill="rgb(52 211 153)" opacity="0.6" />
					<circle cx="128" cy="0" r="3" fill="rgb(167 139 250)" opacity="0.6" />
					<circle cx="224" cy="0" r="3" fill="rgb(251 191 36)" opacity="0.6" />
					<circle cx="128" cy="48" r="5" fill="white" opacity="0.8" />
				</svg>
			</div>

			{/* MCP Chat card */}
			<div className="mx-auto max-w-lg">
				<div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm shadow-[0_0_80px_-20px_rgba(139,92,246,0.2)]">
					<div className="p-8 text-center">
						{/* Chat icon */}
						<div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-emerald-500/20">
							<svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
							</svg>
						</div>

						<p className="text-lg font-semibold text-white">
							Explique, investigue e valide com o Agentic Chat
						</p>
						<p className="mt-2 text-sm text-gray-500">
							Uma interface conectada às 3 camadas — pergunte em linguagem natural, receba respostas com evidências.
						</p>

						{/* Mini chat mockup */}
						<div className="mx-auto mt-6 max-w-sm space-y-3">
							<div className="flex justify-end">
								<div className="rounded-2xl rounded-br-md bg-violet-500/20 px-4 py-2 text-left text-xs text-violet-200">
									Quais riscos estão piorando desde a última análise?
								</div>
							</div>
							<div className="flex justify-start">
								<div className="rounded-2xl rounded-bl-md bg-white/[0.06] px-4 py-2 text-left text-xs text-gray-300">
									<span className="mb-1 block text-[10px] font-medium text-emerald-400">3 regressões encontradas</span>
									Checkout abandonment subiu 12%, payment validation falhou em 2 rotas, e SSL certificate expira em 5 dias...
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function SolutionLayers() {
	const sectionRef = useRef<HTMLDivElement>(null);
	const [progress, setProgress] = useState(0);

	useEffect(() => {
		const handleScroll = () => {
			if (!sectionRef.current) return;

			const rect = sectionRef.current.getBoundingClientRect();
			const windowHeight = window.innerHeight;
			const sectionHeight = sectionRef.current.offsetHeight;

			// Progress: 0 when section enters viewport, 1 when it's about to leave
			const scrolled = windowHeight - rect.top;
			const total = windowHeight + sectionHeight;
			const p = Math.max(0, Math.min(1, scrolled / total));

			setProgress(p);
		};

		window.addEventListener("scroll", handleScroll, { passive: true });
		handleScroll(); // Initial check
		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	return (
		<section
			ref={sectionRef}
			className="relative overflow-hidden bg-[#090911] py-24 lg:py-32"
		>
			{/* Background gradient */}
			<div className="absolute inset-0 -z-10">
				<div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-900/10 blur-[150px]" />
			</div>

			<div className="mx-auto w-full max-w-[1170px] px-4 sm:px-8 xl:px-0">
				{/* Section header */}
				<div className="mx-auto mb-4 max-w-[600px] text-center">
					<span className="mb-4 inline-block text-xs font-semibold uppercase tracking-widest text-violet-400">
						Solution
					</span>
				</div>
				<div className="mx-auto mb-20 max-w-[700px] text-center">
					<h2 className="mb-5 text-3xl font-bold leading-[1.15] tracking-tight text-white sm:text-4xl lg:text-[44px]">
						Recuse escalar seu negócio no escuro.
					</h2>
					<p className="text-base leading-relaxed text-gray-400 sm:text-lg">
						Enxergue cedo, priorize com clareza e valide seu negócio digital de maneira contínua.
					</p>
				</div>

				{/* Stacking cards */}
				<div className="mx-auto max-w-[800px] space-y-6">
					{layers.map((layer, i) => (
						<LayerCard
							key={layer.eyebrow}
							layer={layer}
							index={i}
							progress={progress}
						/>
					))}
				</div>

				{/* MCP Chat connector */}
				<MCPChatConnector progress={progress} />
			</div>
		</section>
	);
}
