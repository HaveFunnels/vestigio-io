"use client";

import { useEffect, useState } from "react";

// ── i18n ──

const i18n: Record<string, {
	sectionLabel: string; title: string; subtitle: string;
	layers: { eyebrow: string; title: string; body: string; support: string }[];
	chat: { label: string; heading: string; userQueryLabel: string; userQuery: string; responseLabel: string; responseBody: string; chipFindings: string; chipActions: string; chipVerification: string; satellites: [string, string, string] };
	tools: string[][];
}> = {
	en: {
		sectionLabel: "Solution", title: "Refuse to scale your business in the dark.", subtitle: "See early, prioritize with clarity, and validate your digital business continuously.",
		layers: [
			{ eyebrow: "Layer 1", title: "Discover before others", body: "See where the risks, leaks, and opportunities are before they become costs.", support: "Findings, analysis, and initial context to understand what's breaking, what's going unnoticed, and what could compromise scale." },
			{ eyebrow: "Layer 2", title: "Prioritize and act with precision", body: "Turn signals into a continuous queue of action, with context and priority.", support: "Actions and workspaces help organize what to fix, track, and explore by route, journey, campaign, or environment." },
			{ eyebrow: "Layer 3", title: "Validate with confidence", body: "Confirm if it's ready, if it got worse, or if the fix actually closed.", support: "Preflight, regressions, and verification help decide before scaling and track changes over time." },
		],
		chat: { label: "Vestigio Pulse", heading: "Explain, investigate, and validate with Vestigio Pulse", userQueryLabel: "You ask:", userQuery: "What risks are getting worse since the last analysis?", responseLabel: "Structured Response", responseBody: '"3 regressions found: checkout abandonment +12%, payment validation failed on 2 routes, SSL expires in 5 days."', chipFindings: "Used 3 findings", chipActions: "Created a new action", chipVerification: "Ran verification as a user", satellites: ["Findings", "Actions", "Verification"] },
		tools: [["Findings", "Analysis", "Evidence"], ["Actions", "Workspaces", "Priorities"], ["Preflight", "Regressions", "Verification"]],
	},
	"pt-BR": {
		sectionLabel: "Solução", title: "Recuse escalar seu negócio no escuro.", subtitle: "Enxergue cedo, priorize com clareza e valide seu negócio digital de maneira contínua.",
		layers: [
			{ eyebrow: "Camada 1", title: "Descubra antes dos outros", body: "Veja onde estão os riscos, vazamentos e oportunidades antes que virem custo.", support: "Descobertas, análise e contexto inicial para entender o que está quebrando, o que está passando despercebido e o que pode comprometer escala." },
			{ eyebrow: "Camada 2", title: "Priorize e aja com precisão", body: "Transforme sinais em uma fila contínua de ação, com contexto e prioridade.", support: "Ações e workspaces ajudam a organizar o que corrigir, acompanhar e explorar por rota, jornada, campanha ou ambiente." },
			{ eyebrow: "Camada 3", title: "Valide com confiança", body: "Confirme se está pronto, se piorou ou se a correção realmente fechou.", support: "Preflight, regressões e verificação ajudam a decidir antes de escalar e a acompanhar mudanças ao longo do tempo." },
		],
		chat: { label: "Vestigio Pulse", heading: "Explique, investigue e valide com o Vestigio Pulse", userQueryLabel: "Você pergunta:", userQuery: "Quais riscos estão piorando desde a última análise?", responseLabel: "Resposta Estruturada", responseBody: '"3 regressões encontradas: abandono de checkout +12%, validação de pagamento falhou em 2 rotas, SSL expira em 5 dias."', chipFindings: "Usou 3 descobertas", chipActions: "Criou uma nova ação", chipVerification: "Rodou verificação como usuário", satellites: ["Descobertas", "Ações", "Verificação"] },
		tools: [["Descobertas", "Análise", "Evidência"], ["Ações", "Workspaces", "Prioridades"], ["Preflight", "Regressões", "Verificação"]],
	},
	es: {
		sectionLabel: "Solución", title: "Niégate a escalar tu negocio a ciegas.", subtitle: "Detecta temprano, prioriza con claridad y valida tu negocio digital de forma continua.",
		layers: [
			{ eyebrow: "Capa 1", title: "Descubre antes que otros", body: "Detecta riesgos, fugas y oportunidades antes de que se conviertan en costos.", support: "Hallazgos, análisis y contexto inicial para entender qué se está rompiendo, qué pasa desapercibido y qué puede comprometer la escala." },
			{ eyebrow: "Capa 2", title: "Prioriza y actúa con precisión", body: "Convierte señales en una cola continua de acción, con contexto y prioridad.", support: "Acciones y workspaces ayudan a organizar qué corregir, rastrear y explorar por ruta, jornada, campaña o entorno." },
			{ eyebrow: "Capa 3", title: "Valida con confianza", body: "Confirma si está listo, si empeoró o si la corrección realmente cerró.", support: "Preflight, regresiones y verificación ayudan a decidir antes de escalar y seguir cambios a lo largo del tiempo." },
		],
		chat: { label: "Vestigio Pulse", heading: "Explica, investiga y valida con Vestigio Pulse", userQueryLabel: "Tú preguntas:", userQuery: "¿Qué riesgos están empeorando desde el último análisis?", responseLabel: "Respuesta Estructurada", responseBody: '"3 regresiones encontradas: abandono de checkout +12%, validación de pago falló en 2 rutas, SSL expira en 5 días."', chipFindings: "Usó 3 hallazgos", chipActions: "Creó una nueva acción", chipVerification: "Ejecutó verificación como usuario", satellites: ["Hallazgos", "Acciones", "Verificación"] },
		tools: [["Hallazgos", "Análisis", "Evidencia"], ["Acciones", "Workspaces", "Prioridades"], ["Preflight", "Regresiones", "Verificación"]],
	},
	de: {
		sectionLabel: "Lösung", title: "Weigere dich, dein Geschäft im Dunkeln zu skalieren.", subtitle: "Erkenne früh, priorisiere klar und validiere dein digitales Geschäft kontinuierlich.",
		layers: [
			{ eyebrow: "Schicht 1", title: "Entdecke vor anderen", body: "Erkenne Risiken, Lecks und Chancen, bevor sie zu Kosten werden.", support: "Befunde, Analyse und initialer Kontext, um zu verstehen, was bricht, was übersehen wird und was die Skalierung gefährden könnte." },
			{ eyebrow: "Schicht 2", title: "Priorisiere und handle präzise", body: "Verwandle Signale in eine kontinuierliche Aktionswarteschlange mit Kontext und Priorität.", support: "Aktionen und Workspaces helfen zu organisieren, was korrigiert, verfolgt und erkundet werden soll." },
			{ eyebrow: "Schicht 3", title: "Validiere mit Vertrauen", body: "Bestätige, ob es bereit ist, ob es schlimmer wurde oder ob die Korrektur abgeschlossen wurde.", support: "Preflight, Regressionen und Verifizierung helfen bei Entscheidungen vor der Skalierung." },
		],
		chat: { label: "Vestigio Pulse", heading: "Erkläre, untersuche und validiere mit Vestigio Pulse", userQueryLabel: "Du fragst:", userQuery: "Welche Risiken verschlechtern sich seit der letzten Analyse?", responseLabel: "Strukturierte Antwort", responseBody: '"3 Regressionen gefunden: Checkout-Abbruch +12%, Zahlungsvalidierung in 2 Routen fehlgeschlagen, SSL läuft in 5 Tagen ab."', chipFindings: "Nutzte 3 Befunde", chipActions: "Erstellte eine neue Aktion", chipVerification: "Führte Verifizierung als Benutzer aus", satellites: ["Befunde", "Aktionen", "Verifizierung"] },
		tools: [["Befunde", "Analyse", "Beweise"], ["Aktionen", "Workspaces", "Prioritäten"], ["Preflight", "Regressionen", "Verifizierung"]],
	},
};

function useLocale() {
	const [locale, setLocale] = useState("pt-BR");
	useEffect(() => {
		const l = navigator.language || "en";
		if (l.startsWith("pt")) setLocale("pt-BR");
		else if (l.startsWith("es")) setLocale("es");
		else if (l.startsWith("de")) setLocale("de");
		else setLocale("en");
	}, []);
	return locale;
}

const accents = ["emerald", "violet", "amber"] as const;
const colors = {
	emerald: { border: "border-emerald-500/20", text: "text-emerald-400", bg: "bg-emerald-500/10", glow: "shadow-[0_8px_60px_-15px_rgba(16,185,129,0.2)]", pill: "bg-emerald-500/10 text-emerald-400" },
	violet:  { border: "border-violet-500/20",  text: "text-violet-400",  bg: "bg-violet-500/10",  glow: "shadow-[0_8px_60px_-15px_rgba(139,92,246,0.2)]", pill: "bg-violet-500/10 text-violet-400" },
	amber:   { border: "border-amber-500/20",   text: "text-amber-400",   bg: "bg-amber-500/10",   glow: "shadow-[0_8px_60px_-15px_rgba(245,158,11,0.2)]", pill: "bg-amber-500/10 text-amber-400" },
};

// ── Entrance animation: CSS-only, one-shot on mount ──
//
// Previously used IntersectionObserver + sentinel to fade cards in on scroll,
// but on short mobile viewports it raced with the sticky layout and cards
// flickered/faded mid-scroll. Now we just play a one-shot CSS fade on mount
// (the cards are always "visible" after that, no scroll-dependent state).

// ── Layer Card ──
function LayerCard({ layer, index, tools, accent }: {
	layer: { eyebrow: string; title: string; body: string; support: string };
	index: number; tools: string[]; accent: typeof accents[number];
}) {
	const c = colors[accent];

	return (
		<div
			className="sticky z-10 pb-6 layer-fade-in"
			style={{
				// CSS variable so mobile and desktop can have independent top offsets
				top: `calc(var(--layer-sticky-top, 80px) + ${index * 20}px)`,
				animationDelay: `${index * 120}ms`,
			}}
		>
			<div className={`rounded-2xl border ${c.border} ${c.glow} bg-[#0c0c14] backdrop-blur-md`}>
				<div className="flex flex-col gap-5 p-5 sm:gap-6 sm:p-10 md:flex-row md:items-start lg:p-12">
					<div className="min-w-0 flex-1">
						<span className={`mb-4 inline-block rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] ${c.pill} sm:mb-5`}>{layer.eyebrow}</span>
						<h3 className="mb-3 text-lg font-bold tracking-tight text-white sm:text-2xl lg:text-3xl">{layer.title}</h3>
						<p className="mb-3 text-sm leading-relaxed text-gray-300 sm:text-base">{layer.body}</p>
						<p className="text-xs leading-relaxed text-gray-500 sm:text-sm">{layer.support}</p>
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
function AgenticChatFlow({ t }: { t: typeof i18n["en"]["chat"] }) {
	return (
		<div className="relative z-20 pt-8 pb-4 layer-fade-in">
			<div className="rounded-2xl border border-white/[0.06] bg-[#0c0c14] p-5 backdrop-blur-md sm:p-10 lg:p-12">
					<div className="mb-8 text-center sm:mb-10">
						<span className="mb-2 inline-block text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">{t.label}</span>
						<h3 className="text-lg font-bold text-white sm:text-2xl">{t.heading}</h3>
					</div>

					{/* Desktop: horizontal flow. Mobile: vertical. */}
					<div className="flex flex-col items-center gap-5 lg:flex-row lg:items-center lg:justify-between">

						{/* 1. User Query */}
						<div className="w-full max-w-[260px] shrink-0 rounded-xl border border-white/10 bg-white/[0.04] p-4 sm:max-w-[240px] sm:p-5">
							<div className="mb-3 flex items-center gap-2">
								<div className="grid h-7 w-7 place-items-center rounded-lg bg-white/10">
									<svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" /></svg>
								</div>
								<span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{t.userQueryLabel}</span>
							</div>
							<p className="text-xs leading-relaxed text-gray-300">&ldquo;{t.userQuery}&rdquo;</p>
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
							<div className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold uppercase tracking-widest text-violet-400 sm:bottom-3">{t.label}</div>

							{/* Orbiting satellites — simple colored dots, no labels.
							    The user explicitly asked for "só um ponto/bullet da
							    cor deles" instead of the previous pill containers
							    that had a colored bg, border, and a text label. The
							    label was redundant with the section's `tools` table
							    above and was making the orbit feel cluttered.

							    The outer rotating element is a 0×0 box anchored at
							    the exact hub center so `transform-origin: center`
							    resolves to the hub's middle and the orbit stays
							    perfectly concentric (was off-center in earlier
							    iterations because the pill's bounding box pulled
							    the transform-origin away from the hub). */}
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
								<span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">{t.responseLabel}</span>
							</div>
							<p className="mb-4 text-xs leading-relaxed text-gray-300">{t.responseBody}</p>
							<div className="flex flex-wrap gap-1.5">
								<span className="inline-block w-fit rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">{t.chipFindings}</span>
								<span className="inline-block w-fit rounded-md bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-400">{t.chipActions}</span>
								<span className="inline-block w-fit rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">{t.chipVerification}</span>
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
	const locale = useLocale();
	const t = i18n[locale] || i18n["en"];

	return (
		<section className="relative bg-[#090911] py-16 sm:py-20 lg:py-28">
			{/* One-shot entrance animation for layer cards + chat flow.
			    Runs once on mount, no scroll dependency — fixes mobile fade race. */}
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
				<div className="absolute left-1/2 top-[30%] h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-violet-900/8 blur-[120px] sm:h-[600px] sm:w-[700px] sm:blur-[180px]" />
			</div>

			<div className="mx-auto mb-12 max-w-[700px] px-4 text-center sm:mb-16 sm:px-8 lg:mb-20">
				<span className="mb-3 inline-block text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">{t.sectionLabel}</span>
				<h2 className="mb-4 text-[1.75rem] font-bold leading-[1.15] tracking-tight text-white sm:mb-5 sm:text-4xl lg:text-5xl">{t.title}</h2>
				<p className="text-sm leading-relaxed text-gray-400 sm:text-base lg:text-lg">{t.subtitle}</p>
			</div>

			<div className="mx-auto w-full max-w-[1100px] px-4 sm:px-8 xl:px-0">
				{t.layers.map((layer, i) => (
					<LayerCard key={i} layer={layer} index={i} tools={t.tools[i]} accent={accents[i]} />
				))}
				<AgenticChatFlow t={t.chat} />
			</div>
		</section>
	);
}
