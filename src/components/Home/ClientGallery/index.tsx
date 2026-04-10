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

import brandData from "../Hero/brandData";

const ClientGallery = async () => {
	// Duplicate the brand list so the marquee can loop seamlessly.
	const loopBrands = [...brandData, ...brandData];

	return (
		<section
			id='client-gallery'
			className='relative z-1 overflow-hidden py-8 sm:py-10 lg:py-12'
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

			{/* The ambient halo from previous versions was removed —
			    it was an `emerald-500/[0.05]` blur that read fine on
			    dark but added visual mud on the white bottom of the
			    HomeBigCard gradient. */}

			<div className='relative mx-auto w-full max-w-[1200px] px-4 sm:px-8 xl:px-0'>
				{/* Header text removed — the user explicitly asked for
				    "deixe só a galeria pertinho do produto" so the strip
				    of brand logos is now anchored right under the product
				    tour with no eyebrow / title / subtitle frame.
				    The `t` translations for `eyebrow / title / subtitle`
				    are kept in the dictionary in case we want to bring the
				    framing back later, but the JSX no longer reads them. */}

				{/* Marquee row — soft edge mask, paused on hover.
				    Brand glyphs use `text-zinc-700` (dark) so they read
				    against the white bottom of the HomeBigCard gradient. */}
				<div className='relative w-full [mask-image:linear-gradient(to_right,transparent_0,black_8%,black_92%,transparent_100%)]'>
					<div className='vclient-track flex w-max items-center gap-x-14 sm:gap-x-20'>
						{loopBrands.map((brand, i) => (
							<div
								key={`${brand.id}-${i}`}
								className='flex h-10 shrink-0 items-center justify-center text-zinc-700 opacity-70 transition-opacity hover:opacity-100 sm:h-12'
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
