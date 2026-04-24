/**
 * Home > FeaturesWithImage — "Built for" persona cards.
 *
 * Three clean cards, each showing a buyer persona's question and
 * how Vestigio answers it. No icons, no illustrations — the
 * simplicity is the design. Visible on all viewports (was hidden
 * on mobile in the old 5-card version).
 *
 * Server component, i18n via `getTranslations`.
 */

import { getTranslations } from "next-intl/server";

interface PersonaCard {
	persona: string;
	question: string;
	answer: string;
}

const ACCENTS = [
	{ border: "border-amber-500/20", label: "text-amber-300/80", glow: "hover:shadow-[0_18px_50px_-18px_rgba(245,158,11,0.3)]" },
	{ border: "border-emerald-500/20", label: "text-emerald-300/80", glow: "hover:shadow-[0_18px_50px_-18px_rgba(16,185,129,0.3)]" },
	{ border: "border-sky-500/20", label: "text-sky-300/80", glow: "hover:shadow-[0_18px_50px_-18px_rgba(56,189,248,0.3)]" },
];

const FeaturesWithImage = async () => {
	const t = await getTranslations("homepage.use_cases");
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
						{t("title")}
					</h2>
				</div>

				{/* 3 persona cards */}
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
					{cards.map((card, i) => {
						const accent = ACCENTS[i % ACCENTS.length];
						return (
							<div
								key={i}
								className={`group relative flex flex-col rounded-2xl border ${accent.border} bg-white/[0.015] p-6 transition-all duration-500 ease-out hover:-translate-y-1 sm:p-7 ${accent.glow}`}
							>
								{/* Inner ring */}
								<div
									className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.04] transition-all duration-500 group-hover:ring-white/[0.08]"
									aria-hidden
								/>

								<div className="relative flex h-full flex-col">
									{/* Persona label */}
									<span className={`mb-4 text-[10px] font-semibold uppercase tracking-[0.16em] ${accent.label}`}>
										{card.persona}
									</span>

									{/* Question — the persona's voice */}
									<p className="mb-4 flex-1 text-base font-medium leading-snug text-white sm:text-lg">
										&ldquo;{card.question}&rdquo;
									</p>

									{/* Answer — how Vestigio responds */}
									<p className="text-[13px] leading-relaxed text-zinc-400 sm:text-sm">
										{card.answer}
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
