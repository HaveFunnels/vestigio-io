"use client";

import { useEffect, useRef, useState } from "react";

// ── i18n ──

const i18n: Record<string, {
	sectionLabel: string; title: string; subtitle: string;
	layers: { eyebrow: string; title: string; body: string; support: string }[];
	chat: { label: string; heading: string; userQuery: string; responseLabel: string; responseBody: string; chipFindings: string; chipActions: string; chipVerification: string };
	tools: string[][];
}> = {
	en: {
		sectionLabel: "Solution", title: "Refuse to scale your business in the dark.", subtitle: "See early, prioritize with clarity, and validate your digital business continuously.",
		layers: [
			{ eyebrow: "Layer 1", title: "Discover before others", body: "See where the risks, leaks, and opportunities are before they become costs.", support: "Findings, analysis, and initial context to understand what's breaking, what's going unnoticed, and what could compromise scale." },
			{ eyebrow: "Layer 2", title: "Prioritize and act with precision", body: "Turn signals into a continuous queue of action, with context and priority.", support: "Actions and workspaces help organize what to fix, track, and explore by route, journey, campaign, or environment." },
			{ eyebrow: "Layer 3", title: "Validate with confidence", body: "Confirm if it's ready, if it got worse, or if the fix actually closed.", support: "Preflight, regressions, and verification help decide before scaling and track changes over time." },
		],
		chat: { label: "Agentic Chat", heading: "Explain, investigate, and validate with Agentic Chat", userQuery: "What risks are getting worse since the last analysis?", responseLabel: "Structured Response", responseBody: '"3 regressions found: checkout abandonment +12%, payment validation failed on 2 routes, SSL expires in 5 days."', chipFindings: "Used 3 Findings", chipActions: "Created a new Action", chipVerification: "Ran Verification as a user" },
		tools: [["Findings", "Analysis", "Evidence"], ["Actions", "Workspaces", "Priorities"], ["Preflight", "Regressions", "Verification"]],
	},
	"pt-BR": {
		sectionLabel: "Solution", title: "Recuse escalar seu negócio no escuro.", subtitle: "Enxergue cedo, priorize com clareza e valide seu negócio digital de maneira contínua.",
		layers: [
			{ eyebrow: "Layer 1", title: "Descubra antes dos outros", body: "Veja onde estão os riscos, vazamentos e oportunidades antes que virem custo.", support: "Findings, analysis e contexto inicial para entender o que está quebrando, o que está passando despercebido e o que pode comprometer escala." },
			{ eyebrow: "Layer 2", title: "Priorize e aja com precisão", body: "Transforme sinais em uma fila contínua de ação, com contexto e prioridade.", support: "Actions e workspaces ajudam a organizar o que corrigir, acompanhar e explorar por rota, jornada, campanha ou ambiente." },
			{ eyebrow: "Layer 3", title: "Valide com confiança", body: "Confirme se está pronto, se piorou ou se a correção realmente fechou.", support: "Preflight, regressions e verification ajudam a decidir antes de escalar e a acompanhar mudanças ao longo do tempo." },
		],
		chat: { label: "Agentic Chat", heading: "Explique, investigue e valide com o Agentic Chat", userQuery: "Quais riscos estão piorando desde a última análise?", responseLabel: "Structured Response", responseBody: '"3 regressões encontradas: checkout abandonment +12%, payment validation falhou em 2 rotas, SSL expira em 5 dias."', chipFindings: "Usou 3 Findings", chipActions: "Criou uma nova Action", chipVerification: "Rodou Verification como usuário" },
		tools: [["Findings", "Analysis", "Evidence"], ["Actions", "Workspaces", "Priorities"], ["Preflight", "Regressions", "Verification"]],
	},
	es: {
		sectionLabel: "Solución", title: "Niégate a escalar tu negocio a ciegas.", subtitle: "Detecta temprano, prioriza con claridad y valida tu negocio digital de forma continua.",
		layers: [
			{ eyebrow: "Capa 1", title: "Descubre antes que otros", body: "Detecta riesgos, fugas y oportunidades antes de que se conviertan en costos.", support: "Findings, análisis y contexto inicial para entender qué se está rompiendo, qué pasa desapercibido y qué puede comprometer la escala." },
			{ eyebrow: "Capa 2", title: "Prioriza y actúa con precisión", body: "Convierte señales en una cola continua de acción, con contexto y prioridad.", support: "Actions y workspaces ayudan a organizar qué corregir, rastrear y explorar por ruta, jornada, campaña o entorno." },
			{ eyebrow: "Capa 3", title: "Valida con confianza", body: "Confirma si está listo, si empeoró o si la corrección realmente cerró.", support: "Preflight, regresiones y verificación ayudan a decidir antes de escalar y seguir cambios a lo largo del tiempo." },
		],
		chat: { label: "Agentic Chat", heading: "Explica, investiga y valida con Agentic Chat", userQuery: "¿Qué riesgos están empeorando desde el último análisis?", responseLabel: "Respuesta Estructurada", responseBody: '"3 regresiones encontradas: abandono de checkout +12%, validación de pago falló en 2 rutas, SSL expira en 5 días."', chipFindings: "Usó 3 Findings", chipActions: "Creó una nueva Action", chipVerification: "Ejecutó Verification como usuario" },
		tools: [["Findings", "Analysis", "Evidence"], ["Actions", "Workspaces", "Priorities"], ["Preflight", "Regressions", "Verification"]],
	},
	de: {
		sectionLabel: "Lösung", title: "Weigere dich, dein Geschäft im Dunkeln zu skalieren.", subtitle: "Erkenne früh, priorisiere klar und validiere dein digitales Geschäft kontinuierlich.",
		layers: [
			{ eyebrow: "Schicht 1", title: "Entdecke vor anderen", body: "Erkenne Risiken, Lecks und Chancen, bevor sie zu Kosten werden.", support: "Findings, Analyse und initialer Kontext, um zu verstehen, was bricht, was übersehen wird und was die Skalierung gefährden könnte." },
			{ eyebrow: "Schicht 2", title: "Priorisiere und handle präzise", body: "Verwandle Signale in eine kontinuierliche Aktionswarteschlange mit Kontext und Priorität.", support: "Actions und Workspaces helfen zu organisieren, was korrigiert, verfolgt und erkundet werden soll." },
			{ eyebrow: "Schicht 3", title: "Validiere mit Vertrauen", body: "Bestätige, ob es bereit ist, ob es schlimmer wurde oder ob die Korrektur abgeschlossen wurde.", support: "Preflight, Regressionen und Verifizierung helfen bei Entscheidungen vor der Skalierung." },
		],
		chat: { label: "Agentic Chat", heading: "Erkläre, untersuche und validiere mit Agentic Chat", userQuery: "Welche Risiken verschlechtern sich seit der letzten Analyse?", responseLabel: "Strukturierte Antwort", responseBody: '"3 Regressionen gefunden: Checkout-Abbruch +12%, Zahlungsvalidierung in 2 Routen fehlgeschlagen, SSL läuft in 5 Tagen ab."', chipFindings: "Nutzte 3 Findings", chipActions: "Erstellte eine neue Action", chipVerification: "Führte Verification als Benutzer aus" },
		tools: [["Findings", "Analysis", "Evidence"], ["Actions", "Workspaces", "Priorities"], ["Preflight", "Regressions", "Verification"]],
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

// ── Fade hook: observe a sentinel div BEFORE the sticky card ──
function useFadeOnScroll() {
	const sentinelRef = useRef<HTMLDivElement>(null);
	const [visible, setVisible] = useState(false);
	useEffect(() => {
		const el = sentinelRef.current;
		if (!el) return;
		const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.1, rootMargin: "-60px 0px -10% 0px" });
		obs.observe(el);
		return () => obs.disconnect();
	}, []);
	return { sentinelRef, visible };
}

// ── Layer Card ──
function LayerCard({ layer, index, tools, accent }: {
	layer: { eyebrow: string; title: string; body: string; support: string };
	index: number; tools: string[]; accent: typeof accents[number];
}) {
	const c = colors[accent];
	const { sentinelRef, visible } = useFadeOnScroll();

	return (
		<>
			{/* Sentinel: a small invisible div that scrolls normally (not sticky) */}
			<div ref={sentinelRef} className="h-1" />
			<div className="sticky z-10 pb-6" style={{ top: 80 + index * 20 }}>
				<div className={`rounded-2xl border ${c.border} ${c.glow} bg-[#0c0c14] backdrop-blur-md transition-all duration-500 ease-out ${visible ? "opacity-100 scale-100" : "opacity-0 scale-[0.97] translate-y-3"}`}>
					<div className="flex flex-col gap-6 p-7 sm:flex-row sm:items-start sm:p-10 lg:p-12">
						<div className="min-w-0 flex-1">
							<span className={`mb-5 inline-block rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] ${c.pill}`}>{layer.eyebrow}</span>
							<h3 className="mb-3 text-xl font-bold tracking-tight text-white sm:text-2xl lg:text-3xl">{layer.title}</h3>
							<p className="mb-3 text-sm leading-relaxed text-gray-300 sm:text-base">{layer.body}</p>
							<p className="text-xs leading-relaxed text-gray-500 sm:text-sm">{layer.support}</p>
						</div>
						<div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end sm:pt-8">
							{tools.map((t) => <span key={t} className={`rounded-lg border ${c.border} px-3 py-1.5 text-xs font-medium ${c.text}`}>{t}</span>)}
						</div>
					</div>
				</div>
			</div>
		</>
	);
}

// ── Agentic Chat Flow ──
function AgenticChatFlow({ t }: { t: typeof i18n["en"]["chat"] }) {
	const { sentinelRef, visible } = useFadeOnScroll();

	return (
		<>
			<div ref={sentinelRef} className="h-1" />
			<div className={`relative z-20 pt-8 pb-4 transition-all duration-700 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
				<div className="rounded-2xl border border-white/[0.06] bg-[#0c0c14] p-7 backdrop-blur-md sm:p-10 lg:p-12">
					<div className="mb-10 text-center">
						<span className="mb-2 inline-block text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">{t.label}</span>
						<h3 className="text-xl font-bold text-white sm:text-2xl">{t.heading}</h3>
					</div>

					{/* Desktop: horizontal flow. Mobile: vertical. */}
					<div className="flex flex-col items-center gap-5 lg:flex-row lg:items-center lg:justify-between">

						{/* 1. User Query */}
						<div className="w-full max-w-[240px] shrink-0 rounded-xl border border-white/10 bg-white/[0.04] p-5">
							<div className="mb-3 flex items-center gap-2">
								<div className="grid h-7 w-7 place-items-center rounded-lg bg-white/10">
									<svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" /></svg>
								</div>
								<span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">User Query</span>
							</div>
							<p className="text-xs leading-relaxed text-gray-300">&ldquo;{t.userQuery}&rdquo;</p>
							<div className="mt-3 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
						</div>

						{/* → line */}
						<div className="hidden h-px flex-1 bg-gradient-to-r from-white/10 to-violet-500/20 lg:block" />
						<MobileArrow />

						{/* 2. Agentic Chat hub with orbiting tools */}
						<div className="relative shrink-0 py-8 lg:py-0">
							{/* Orbit ring (decorative) */}
							<div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
								<div className="h-44 w-44 rounded-full border border-dashed border-white/[0.06]" />
							</div>
							{/* Glow */}
							<div className="absolute left-1/2 top-1/2 -z-10 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/10 blur-2xl" />

							{/* Center icon — grid place-items-center guarantees centering */}
							<div className="relative mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/15 to-emerald-500/15 shadow-[0_0_50px_-10px_rgba(139,92,246,0.3)]">
								<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
									<path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z" />
									<path d="M19 15L19.75 17.25L22 18L19.75 18.75L19 21L18.25 18.75L16 18L18.25 17.25L19 15Z" />
								</svg>
							</div>
							<div className="mt-2 text-center text-[9px] font-bold uppercase tracking-widest text-violet-400">{t.label}</div>

							{/* Satellite nodes positioned around the orbit */}
							{/* Top: Findings */}
							<div className="absolute left-1/2 -translate-x-1/2" style={{ top: -8 }}>
								<div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-[#0c0c14] px-3 py-1">
									<div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
									<span className="text-[10px] font-semibold text-emerald-400">Findings</span>
								</div>
							</div>
							{/* Bottom-left: Actions */}
							<div className="absolute" style={{ bottom: -8, left: -24 }}>
								<div className="flex items-center gap-1.5 rounded-full border border-violet-500/20 bg-[#0c0c14] px-3 py-1">
									<div className="h-1.5 w-1.5 rounded-full bg-violet-400" />
									<span className="text-[10px] font-semibold text-violet-400">Actions</span>
								</div>
							</div>
							{/* Bottom-right: Verification */}
							<div className="absolute" style={{ bottom: -8, right: -36 }}>
								<div className="flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-[#0c0c14] px-3 py-1">
									<div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
									<span className="text-[10px] font-semibold text-amber-400">Verification</span>
								</div>
							</div>
						</div>

						{/* → line */}
						<div className="hidden h-px flex-1 bg-gradient-to-r from-violet-500/20 to-emerald-500/15 lg:block" />
						<MobileArrow />

						{/* 3. Structured Response */}
						<div className="w-full max-w-[260px] shrink-0 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.02] p-5">
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
		</>
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
		<section className="relative bg-[#090911] py-20 lg:py-28">
			<div className="pointer-events-none absolute inset-0 -z-10">
				<div className="absolute left-1/2 top-[30%] h-[600px] w-[700px] -translate-x-1/2 rounded-full bg-violet-900/8 blur-[180px]" />
			</div>

			<div className="mx-auto mb-16 max-w-[700px] px-4 text-center sm:px-8 lg:mb-20">
				<span className="mb-3 inline-block text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">{t.sectionLabel}</span>
				<h2 className="mb-5 text-3xl font-bold leading-[1.12] tracking-tight text-white sm:text-4xl lg:text-5xl">{t.title}</h2>
				<p className="text-base leading-relaxed text-gray-400 sm:text-lg">{t.subtitle}</p>
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
