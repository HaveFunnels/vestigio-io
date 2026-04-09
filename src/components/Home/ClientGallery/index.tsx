/**
 * Home > ClientGallery — quiet social-proof strip beneath the product
 * tour. Renders the brand SVGs from `Hero/brandData.tsx` as a single
 * row with a soft mask gradient on the edges, framed by a small
 * eyebrow / title / subtitle block.
 *
 * Honest social proof contract: the framing copy in
 * `homepage.client_gallery.*` is intentionally generic ("digital
 * operators that refuse to scale in the dark") so we don't claim any
 * specific Fortune 500 customer. The brand SVGs themselves are the
 * boilerplate vendor marks already shipping in the codebase. When
 * real client logos arrive, swap `brandData` for a curated
 * `clientLogos` data file — no callsite changes needed.
 *
 * Server component, i18n via `getTranslations`. The marquee is
 * CSS-only (`@keyframes vclient-marquee`) so we stay out of the
 * client bundle.
 */

import { getTranslations } from "next-intl/server";
import brandData from "../Hero/brandData";

const ClientGallery = async () => {
	const t = await getTranslations("homepage.client_gallery");

	// Duplicate the brand list so the marquee can loop seamlessly.
	const loopBrands = [...brandData, ...brandData];

	return (
		<section
			id='client-gallery'
			className='relative z-1 overflow-hidden border-t border-white/[0.04] bg-[#080812] py-14 sm:py-16 lg:py-20'
		>
			<style>{`
				@keyframes vclient-marquee {
					from { transform: translateX(0); }
					to   { transform: translateX(-50%); }
				}
				.vclient-track {
					animation: vclient-marquee 38s linear infinite;
				}
				.vclient-track:hover { animation-play-state: paused; }
				@media (prefers-reduced-motion: reduce) {
					.vclient-track { animation: none !important; }
				}
			`}</style>

			{/* Soft ambient halo */}
			<div
				className='pointer-events-none absolute left-1/2 top-1/2 h-[200px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/[0.05] blur-[120px]'
				aria-hidden
			/>

			<div className='relative mx-auto w-full max-w-[1200px] px-4 sm:px-8 xl:px-0'>
				{/* Header */}
				<div className='mx-auto mb-10 max-w-[640px] text-center sm:mb-12'>
					<div className='mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1'>
						<span className='h-1.5 w-1.5 rounded-full bg-emerald-400' />
						<span className='text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/90'>
							{t("eyebrow")}
						</span>
					</div>
					<h2 className='mb-3 text-[1.5rem] font-bold leading-[1.15] tracking-tight text-white sm:text-[1.875rem] lg:text-[2.25rem]'>
						{t("title")}
					</h2>
					<p className='mx-auto max-w-[560px] text-sm leading-relaxed text-zinc-500 sm:text-[15px]'>
						{t("subtitle")}
					</p>
				</div>

				{/* Marquee row — soft edge mask, paused on hover */}
				<div className='relative w-full [mask-image:linear-gradient(to_right,transparent_0,black_8%,black_92%,transparent_100%)]'>
					<div className='vclient-track flex w-max items-center gap-x-14 sm:gap-x-20'>
						{loopBrands.map((brand, i) => (
							<div
								key={`${brand.id}-${i}`}
								className='flex h-10 shrink-0 items-center justify-center text-zinc-500 opacity-60 transition-opacity hover:opacity-90 sm:h-12'
								title={brand.name}
								aria-label={brand.name}
							>
								{brand.image}
							</div>
						))}
					</div>
				</div>
			</div>
		</section>
	);
};

export default ClientGallery;
