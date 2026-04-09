/**
 * Home > FeaturesWithImage — five product use cases in a tight grid.
 *
 * Replaces the old 2-block "Build, launch, scale with confidence"
 * layout with a 5-card grid sized after the desired marketing
 * reference (Mixpanel-style 3-col use case row at the bottom of the
 * page).
 *
 * Each card maps 1:1 to a Vestigio product surface so the copy is
 * decision-first instead of feature-first:
 *
 *   1. Action Queue          → "Prioritize fixes that move revenue"
 *   2. Revenue Audit         → "Find every leak across the funnel"
 *   3. Evidence Trail        → "Multi-source proof for every finding"
 *   4. Continuous Watch      → "Catch regressions before customers do"
 *   5. AI Decision Engine    → "Ask in plain language, decide w/ context"
 *
 * Layout: 1 col on mobile, 2 cols on sm/md, 3 cols on lg+. Card 5
 * spans the last row and centers itself when it would otherwise be
 * orphaned in a 3-col grid (so 5 cards never look "broken").
 *
 * Server component, i18n via `getTranslations`. The grid CTA uses the
 * `ShinyButton` component (a client component, but rendering it from
 * a server tree is fine — Next bundles only the button itself).
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ShinyButton } from "@/components/ui/shiny-button";

interface UseCaseItem {
	tag: string;
	title: string;
	description: string;
	cta: string;
}

const ACCENTS = [
	{
		dot: "bg-amber-400",
		eyebrow: "text-amber-300/90",
		gradient: "from-amber-500/[0.08]",
		hoverBorder: "group-hover:border-amber-500/40",
		shadow: "group-hover:shadow-[0_18px_50px_-18px_rgba(245,158,11,0.45)]",
		icon: (
			<svg
				viewBox='0 0 20 20'
				fill='none'
				stroke='currentColor'
				strokeWidth='1.4'
				strokeLinecap='round'
				strokeLinejoin='round'
			>
				<path d='M11 2.5L4.5 11.5H10L9 17.5L15.5 8.5H10L11 2.5z' />
			</svg>
		),
	},
	{
		dot: "bg-red-400",
		eyebrow: "text-red-300/90",
		gradient: "from-red-500/[0.08]",
		hoverBorder: "group-hover:border-red-500/40",
		shadow: "group-hover:shadow-[0_18px_50px_-18px_rgba(239,68,68,0.45)]",
		icon: (
			<svg
				viewBox='0 0 20 20'
				fill='none'
				stroke='currentColor'
				strokeWidth='1.4'
				strokeLinecap='round'
				strokeLinejoin='round'
			>
				<path d='M10 2.5c-2.5 3-5 5.8-5 9a5 5 0 0010 0c0-3.2-2.5-6-5-9z' />
				<path d='M8 12.5c0 1 .8 1.8 1.8 1.8' opacity='0.6' />
			</svg>
		),
	},
	{
		dot: "bg-sky-400",
		eyebrow: "text-sky-300/90",
		gradient: "from-sky-500/[0.08]",
		hoverBorder: "group-hover:border-sky-500/40",
		shadow: "group-hover:shadow-[0_18px_50px_-18px_rgba(56,189,248,0.45)]",
		icon: (
			<svg
				viewBox='0 0 20 20'
				fill='none'
				stroke='currentColor'
				strokeWidth='1.4'
				strokeLinecap='round'
				strokeLinejoin='round'
			>
				<path d='M10 2.5l6 2v5c0 4-3 7-6 8-3-1-6-4-6-8v-5l6-2z' />
				<path d='M7.5 10l2 2 3.5-4' />
			</svg>
		),
	},
	{
		dot: "bg-emerald-400",
		eyebrow: "text-emerald-300/90",
		gradient: "from-emerald-500/[0.08]",
		hoverBorder: "group-hover:border-emerald-500/40",
		shadow: "group-hover:shadow-[0_18px_50px_-18px_rgba(16,185,129,0.45)]",
		icon: (
			<svg
				viewBox='0 0 20 20'
				fill='none'
				stroke='currentColor'
				strokeWidth='1.4'
				strokeLinecap='round'
				strokeLinejoin='round'
			>
				<circle cx='10' cy='10' r='6.5' />
				<path d='M10 6.5V10l2.2 2' />
			</svg>
		),
	},
	{
		dot: "bg-violet-400",
		eyebrow: "text-violet-300/90",
		gradient: "from-violet-500/[0.08]",
		hoverBorder: "group-hover:border-violet-500/40",
		shadow: "group-hover:shadow-[0_18px_50px_-18px_rgba(139,92,246,0.45)]",
		icon: (
			<svg
				viewBox='0 0 20 20'
				fill='none'
				stroke='currentColor'
				strokeWidth='1.4'
				strokeLinecap='round'
				strokeLinejoin='round'
			>
				<path d='M10 1.5l2.6 5.4 5.9.5-4.5 3.9 1.4 5.7L10 14l-5.4 3 1.4-5.7L1.5 7.4l5.9-.5L10 1.5z' />
			</svg>
		),
	},
] as const;

const FeaturesWithImage = async () => {
	const t = await getTranslations("homepage.use_cases");
	const items = t.raw("items") as UseCaseItem[];

	return (
		<section
			id='solutions'
			className='relative z-1 overflow-hidden border-t border-white/[0.04] bg-[#080812] py-16 sm:py-20 lg:py-24 xl:py-28'
		>
			{/* Soft ambient halo */}
			<div
				className='pointer-events-none absolute left-1/2 top-0 h-[400px] w-[900px] -translate-x-1/2 rounded-full bg-emerald-500/[0.05] blur-[140px]'
				aria-hidden
			/>

			<div className='relative mx-auto w-full max-w-[1200px] px-4 sm:px-8 xl:px-0'>
				{/* Header */}
				<div className='mx-auto mb-10 max-w-[680px] text-center sm:mb-14'>
					<div className='mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1'>
						<span className='h-1.5 w-1.5 rounded-full bg-emerald-400' />
						<span className='text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/90'>
							{t("eyebrow")}
						</span>
					</div>
					<h2 className='mb-4 text-[1.75rem] font-bold leading-[1.1] tracking-tight text-white sm:text-3xl lg:text-[2.25rem]'>
						{t("title")}
					</h2>
					<p className='mx-auto max-w-[600px] text-sm leading-relaxed text-zinc-400 sm:text-[15px]'>
						{t("subtitle")}
					</p>
				</div>

				{/* 5 use case cards — 1/2/3 col responsive grid. The 5th
				    card spans cols 1+2 on lg so it never orphans alone in
				    its row. */}
				<div className='grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3'>
					{items.map((item, i) => {
						const accent = ACCENTS[i % ACCENTS.length];
						const isLast = i === items.length - 1;
						return (
							<div
								key={i}
								className={`group relative flex h-full flex-col overflow-hidden rounded-[1.25rem] border border-white/[0.07] bg-white/[0.015] p-6 transition-all duration-500 ease-out hover:-translate-y-1 hover:border-white/[0.18] sm:p-7 ${accent.hoverBorder} ${accent.shadow} ${
									isLast ? "lg:col-span-2 lg:col-start-2" : ""
								}`}
							>
								{/* Idle gradient → brightens on hover */}
								<div
									className={`pointer-events-none absolute inset-0 rounded-[1.25rem] bg-gradient-to-br ${accent.gradient} via-transparent to-transparent opacity-70 transition-opacity duration-500 group-hover:opacity-100`}
									aria-hidden
								/>
								{/* Inner ring */}
								<div
									className='pointer-events-none absolute inset-0 rounded-[1.25rem] ring-1 ring-inset ring-white/[0.04] transition-all duration-500 group-hover:ring-white/[0.08]'
									aria-hidden
								/>

								<div className='relative flex h-full flex-col'>
									{/* Top: tag + icon */}
									<div className='mb-5 flex items-start justify-between gap-3'>
										<div className='inline-flex items-center gap-2'>
											<span
												className={`h-1.5 w-1.5 rounded-full ${accent.dot}`}
											/>
											<span
												className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${accent.eyebrow}`}
											>
												{item.tag}
											</span>
										</div>
										<div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.625rem] border border-white/10 bg-white/[0.04] text-zinc-300 transition-colors group-hover:text-white'>
											<div className='h-4 w-4'>{accent.icon}</div>
										</div>
									</div>

									{/* Title */}
									<h3 className='mb-3 text-lg font-semibold leading-snug tracking-tight text-white sm:text-xl'>
										{item.title}
									</h3>

									{/* Description */}
									<p className='mb-6 flex-1 text-[13px] leading-relaxed text-zinc-400 sm:text-sm'>
										{item.description}
									</p>

									{/* CTA link */}
									<Link
										href='/auth/signup'
										className='inline-flex items-center gap-1.5 text-sm font-medium text-white/80 transition-colors hover:text-white'
									>
										{item.cta}
										<svg
											viewBox='0 0 12 12'
											fill='none'
											stroke='currentColor'
											strokeWidth='1.6'
											className='h-3 w-3 transition-transform group-hover:translate-x-0.5'
										>
											<path
												d='M3 6h6M6.5 3.5L9 6 6.5 8.5'
												strokeLinecap='round'
												strokeLinejoin='round'
											/>
										</svg>
									</Link>
								</div>
							</div>
						);
					})}
				</div>

				{/* Section CTA — ShinyButton for emphasis */}
				<div className='mt-12 text-center sm:mt-14'>
					<Link href='/auth/signup' className='inline-block'>
						<ShinyButton>{t("cta_primary")}</ShinyButton>
					</Link>
				</div>
			</div>
		</section>
	);
};

export default FeaturesWithImage;
