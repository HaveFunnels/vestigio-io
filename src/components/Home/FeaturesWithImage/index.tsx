/**
 * Home > FeaturesWithImage — "Built for" persona cards.
 *
 * Three cards, each showing a buyer persona's question and how
 * Vestigio answers it. Each persona has a colored icon, bold
 * question, thin divider, and answer with highlighted keywords.
 *
 * Title uses **markers** for the highlighted word with an SVG
 * under-stroke. Answers use **markers** for keyword emphasis.
 *
 * Server component, i18n via `getTranslations`.
 */

import { getTranslations } from "next-intl/server";

interface PersonaCard {
	persona: string;
	question: string;
	answer: string;
}

/* ── Highlight parsers ─────────────────────────── */

function parseTitleHighlight(text: string): React.ReactNode {
	const parts = text.split(/\*\*(.*?)\*\*/g);
	if (parts.length === 1) return text;
	return parts.map((part, i) =>
		i % 2 === 1 ? (
			<span key={i} className="relative inline-block text-emerald-400">
				{part}
				<svg
					className="absolute -bottom-1 left-0 h-[6px] w-full"
					viewBox="0 0 200 8"
					preserveAspectRatio="none"
					aria-hidden
				>
					<path
						d="M2 6 Q40 1, 80 5 T160 4 T198 5"
						stroke="currentColor"
						strokeWidth="2.5"
						fill="none"
						strokeLinecap="round"
						opacity="0.55"
					/>
				</svg>
			</span>
		) : (
			<span key={i}>{part}</span>
		),
	);
}

function parseKeywords(text: string): React.ReactNode {
	const parts = text.split(/\*\*(.*?)\*\*/g);
	if (parts.length === 1) return text;
	return parts.map((part, i) =>
		i % 2 === 1 ? (
			<span key={i} className="font-semibold text-zinc-200">
				{part}
			</span>
		) : (
			<span key={i}>{part}</span>
		),
	);
}

/* ── Persona icons (inline SVG) ────────────────── */

const PERSONA_ICONS = [
	// Fundador — dollar sign
	<svg
		key="0"
		className="h-4 w-4"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<line x1="12" y1="1" x2="12" y2="23" />
		<path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
	</svg>,

	// Head of Growth — trending up
	<svg
		key="1"
		className="h-4 w-4"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
		<polyline points="17 6 23 6 23 12" />
	</svg>,

	// CTO — shield
	<svg
		key="2"
		className="h-4 w-4"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
	</svg>,
];

/* ── Per-persona accent colors ─────────────────── */

const ACCENTS = [
	{
		border: "border-zinc-700/70",
		label: "text-amber-300/90",
		icon: "text-amber-400",
		glow: "hover:shadow-[0_18px_50px_-18px_rgba(245,158,11,0.25)]",
	},
	{
		border: "border-zinc-700/70",
		label: "text-emerald-300/90",
		icon: "text-emerald-400",
		glow: "hover:shadow-[0_18px_50px_-18px_rgba(16,185,129,0.25)]",
	},
	{
		border: "border-zinc-700/70",
		label: "text-sky-300/90",
		icon: "text-sky-400",
		glow: "hover:shadow-[0_18px_50px_-18px_rgba(56,189,248,0.25)]",
	},
];

/* ── Component ─────────────────────────────────── */

const FeaturesWithImage = async () => {
	const t = await getTranslations("homepage.use_cases");
	const title = t("title") as string;
	const cards = t.raw("personas") as PersonaCard[];

	return (
		<section
			id="solutions"
			className="relative z-1 overflow-hidden border-t border-white/5 bg-[#080812] py-10 sm:py-14 lg:py-16"
		>
			{/* Soft ambient halo */}
			<div
				className="pointer-events-none absolute left-1/2 top-0 h-[400px] w-[900px] -translate-x-1/2 rounded-full bg-emerald-500/[0.05] blur-[140px]"
				aria-hidden
			/>

			<div className="relative mx-auto w-full max-w-[1200px] px-4 sm:px-8 xl:px-0">
				{/* Header */}
				<div className="mx-auto mb-8 max-w-[680px] text-center sm:mb-12">
					<div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
						<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
						<span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/90">
							{t("eyebrow")}
						</span>
					</div>
					<h2 className="text-[1.75rem] font-bold leading-[1.1] tracking-tight text-white sm:text-3xl lg:text-[2.25rem]">
						{parseTitleHighlight(title)}
					</h2>
				</div>

				{/* 3 persona cards */}
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
					{cards.map((card, i) => {
						const accent = ACCENTS[i % ACCENTS.length];
						return (
							<div
								key={i}
								className={`group relative flex flex-col rounded-2xl border ${accent.border} bg-white/[0.02] p-6 transition-all duration-500 ease-out hover:-translate-y-1 sm:p-7 ${accent.glow}`}
							>
								<div className="relative flex h-full flex-col">
									{/* Persona label + icon */}
									<div className="mb-4 flex items-center gap-2">
										<span className={accent.icon}>
											{PERSONA_ICONS[i]}
										</span>
										<span
											className={`text-[11px] font-bold uppercase tracking-[0.16em] ${accent.label}`}
										>
											{card.persona}
										</span>
									</div>

									{/* Question — the persona's voice */}
									<p className="mb-4 flex-1 text-lg font-bold leading-snug text-white sm:text-xl">
										&ldquo;{card.question}&rdquo;
									</p>

									{/* Divider */}
									<div className="mb-4 h-px bg-white/[0.08]" />

									{/* Answer — how Vestigio responds */}
									<p className="text-[13px] leading-relaxed text-zinc-400 sm:text-sm">
										{parseKeywords(card.answer)}
									</p>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</section>
	);
};

export default FeaturesWithImage;
