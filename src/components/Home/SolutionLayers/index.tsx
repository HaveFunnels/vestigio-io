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

// ── Agentic Chat Flow ──
interface ChatI18n {
	label: string;
	heading: string;
	user_query_label: string;
	user_query: string;
	response_label: string;
	response_body: string;
	chip_findings: string;
	chip_actions: string;
	chip_verification: string;
	satellites: [string, string, string];
}

function AgenticChatFlow({ chat }: { chat: ChatI18n }) {
	return (
		<div className="relative z-20 pt-8 pb-4 layer-fade-in">
			<div className="rounded-2xl border border-white/[0.06] bg-[#0c0c14] p-5 sm:p-10 lg:p-12">
					<div className="mb-8 text-center sm:mb-10">
						<span className="mb-2 inline-block text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">{chat.label}</span>
						<h3 className="text-lg font-bold text-white sm:text-2xl">{chat.heading}</h3>
					</div>

					{/* Desktop: horizontal flow. Mobile: vertical. */}
					<div className="flex flex-col items-center gap-5 lg:flex-row lg:items-center lg:justify-between">

						{/* 1. User Query */}
						<div className="w-full max-w-[260px] shrink-0 rounded-xl border border-white/10 bg-white/[0.04] p-4 sm:max-w-[240px] sm:p-5">
							<div className="mb-3 flex items-center gap-2">
								<div className="grid h-7 w-7 place-items-center rounded-lg bg-white/10">
									<svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" /></svg>
								</div>
								<span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{chat.user_query_label}</span>
							</div>
							<p className="text-xs leading-relaxed text-zinc-300">&ldquo;{chat.user_query}&rdquo;</p>
							<div className="mt-3 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
						</div>

						{/* → line */}
						<div className="hidden h-px flex-1 bg-gradient-to-r from-white/10 to-violet-500/20 lg:block" />
						<MobileArrow />

						{/* 2. Agentic Chat hub with orbiting tools */}
						<div className="orbit-hub relative mx-auto flex h-44 w-44 shrink-0 items-center justify-center sm:h-52 sm:w-52">
							<style>{`
								@keyframes orbitCW{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
								@keyframes orbitCCW{from{transform:rotate(0deg)}to{transform:rotate(-360deg)}}
								.orbit-hub{--orbit-radius:72px;}
								@media(min-width:640px){.orbit-hub{--orbit-radius:88px;}}
							`}</style>
							{/* Orbit ring */}
							<div className="absolute inset-0 m-auto h-36 w-36 rounded-full border border-dashed border-white/[0.06] sm:h-44 sm:w-44" />
							{/* Glow */}
							<div className="absolute inset-0 m-auto -z-10 h-28 w-28 rounded-full bg-violet-500/10 blur-2xl sm:h-32 sm:w-32" />

							{/* Center icon */}
							<div className="relative z-10 grid h-14 w-14 place-items-center rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/15 to-emerald-500/15 shadow-[0_0_50px_-10px_rgba(139,92,246,0.3)] sm:h-16 sm:w-16">
								<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
									<path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z" />
									<path d="M19 15L19.75 17.25L22 18L19.75 18.75L19 21L18.25 18.75L16 18L18.25 17.25L19 15Z" />
								</svg>
							</div>
							{/* Label below center */}
							<div className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold uppercase tracking-widest text-violet-400 sm:bottom-3">{chat.label}</div>

							{/* Orbiting satellites */}
							{[
								{ key: "findings", color: "bg-emerald-400", glow: "shadow-[0_0_14px_4px_rgba(52,211,153,0.55)]" },
								{ key: "actions",  color: "bg-violet-400",  glow: "shadow-[0_0_14px_4px_rgba(167,139,250,0.55)]" },
								{ key: "verify",   color: "bg-amber-400",   glow: "shadow-[0_0_14px_4px_rgba(251,191,36,0.55)]" },
							].map((sat, i) => (
								<div
									key={sat.key}
									className="absolute left-1/2 top-1/2 h-0 w-0"
									style={{ animation: 'orbitCW 40s linear infinite', animationDelay: `${-i * 40 / 3}s` }}
								>
									<div style={{ transform: 'translateY(calc(-1 * var(--orbit-radius)))' }}>
										<div className={`-translate-x-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full ${sat.color} ${sat.glow}`} />
									</div>
								</div>
							))}
						</div>

						{/* → line */}
						<div className="hidden h-px flex-1 bg-gradient-to-r from-violet-500/20 to-emerald-500/15 lg:block" />
						<MobileArrow />

						{/* 3. Structured Response */}
						<div className="w-full max-w-[280px] shrink-0 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.02] p-4 sm:max-w-[260px] sm:p-5">
							<div className="mb-3 flex items-center gap-2">
								<div className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/10">
									<div className="h-2 w-2 rounded-full bg-emerald-400" />
								</div>
								<span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">{chat.response_label}</span>
							</div>
							<p className="mb-4 text-xs leading-relaxed text-zinc-300">&ldquo;{chat.response_body}&rdquo;</p>
							<div className="flex flex-wrap gap-1.5">
								<span className="inline-block w-fit rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">{chat.chip_findings}</span>
								<span className="inline-block w-fit rounded-md bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-400">{chat.chip_actions}</span>
								<span className="inline-block w-fit rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">{chat.chip_verification}</span>
							</div>
							<div className="mt-3 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
						</div>
				</div>
			</div>
		</div>
	);
}

function MobileArrow() {
	return (
		<svg className="block h-5 w-5 text-white/15 lg:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75" />
		</svg>
	);
}

// ── Main ──
export default function SolutionLayers() {
	const t = useTranslations("homepage.solution_layers");
	const layers = t.raw("layers") as { eyebrow: string; title: string; body: string; support: string }[];
	const tools = t.raw("tools") as string[][];
	const chat = t.raw("chat") as ChatI18n;

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
				<p className="text-sm leading-relaxed text-zinc-400 sm:text-base lg:text-lg">{t("subtitle")}</p>
			</div>

			<div className="mx-auto w-full max-w-[1100px] px-4 sm:px-8 xl:px-0">
				{layers.map((layer, i) => (
					<LayerCard key={i} layer={layer} index={i} tools={tools[i]} accent={accents[i]} />
				))}
				<AgenticChatFlow chat={chat} />
			</div>
		</section>
	);
}
