/**
 * Home > ClientGallery — social-proof logo strip with real client logos.
 *
 * Logos live in /public/images/clients/ as SVGs.
 * Rendered grayscale + opacity for neutral dark-theme look,
 * full color on hover. CSS-only marquee for seamless loop.
 *
 * Server component, i18n via `getTranslations`.
 */

import { getTranslations } from "next-intl/server";
import AwardsStrip from "@/components/shared/AwardsStrip";

const CLIENT_LOGOS = [
	{ name: "Hotmart", src: "/images/clients/hotmart.png" },
	{ name: "iFood", src: "/images/clients/ifood.png" },
	{ name: "VTEX", src: "/images/clients/vtex.png" },
	{ name: "Vivara", src: "/images/clients/vivara.png" },
	{ name: "Cartpanda", src: "/images/clients/cartpanda.png" },
	{ name: "Pagar.me", src: "/images/clients/pagarme.png" },
	{ name: "RD Station", src: "/images/clients/rdstation.png" },
	{ name: "Insider", src: "/images/clients/insider.png" },
	{ name: "Exame", src: "/images/clients/exame.png" },
	{ name: "Reserva", src: "/images/clients/reserva.png" },
	{ name: "ElevenLabs", src: "/images/clients/eleven-labs.png" },
	{ name: "Minimal", src: "/images/clients/minimal.png" },
];

const ClientGallery = async () => {
	const t = await getTranslations("homepage.client_gallery");
	const loopLogos = [...CLIENT_LOGOS, ...CLIENT_LOGOS];

	return (
		<section
			id='client-gallery'
			className='relative z-1 overflow-hidden py-4 sm:py-6 lg:py-8'
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

			<div className='relative mx-auto w-full max-w-[1200px]'>
				<p className='mb-4 px-4 text-center text-[11px] text-zinc-500 sm:mb-5 sm:px-8 sm:text-xs xl:px-0'>
					{t("headline")}
				</p>

				{/*
					The mask wrapper intentionally has NO horizontal
					padding so the gradient fades at the viewport edge
					on mobile. Pre-fix the wrapper sat inside px-4 with
					an 8% fade, which on a 360px viewport ate ~29px of
					the first/last visible logo and read as cropping.
					Mobile keeps a tighter 4% fade so we lose less of
					the edge logos in the carousel; desktop keeps the
					original 8%.
				*/}
				<div className='relative w-full [mask-image:linear-gradient(to_right,transparent_0,black_4%,black_96%,transparent_100%)] sm:[mask-image:linear-gradient(to_right,transparent_0,black_8%,black_92%,transparent_100%)]'>
					<div className='vclient-track flex w-max items-center gap-x-12 sm:gap-x-16'>
						{loopLogos.map((logo, i) => (
							<img
								key={`${logo.name}-${i}`}
								src={logo.src}
								alt={logo.name}
								title={logo.name}
								// width/height attrs reserve box dimensions before the
								// image bytes arrive. Without them, `w-auto` collapses
								// each logo to zero width until decode, then expands —
								// visible horizontal pop-in as the marquee scrolls items
								// in. Tailwind h-6/h-7 still wins at render; these attrs
								// only affect pre-load layout reservation. 120×28 matches
								// the desktop max-w-[120px] × h-7 typical case.
								width={120}
								height={28}
								// ClientGallery is the 4th section above the fold — well
								// below the first viewport on mobile. lazy lets the browser
								// defer the marquee logos until they enter view, saving
								// 10-20 image fetches on cold load.
								loading="lazy"
								className="h-6 w-auto max-w-[100px] shrink-0 object-contain grayscale opacity-[0.35] transition-opacity duration-300 hover:opacity-60 hover:grayscale-0 sm:h-7 sm:max-w-[120px]"
							/>
						))}
					</div>
				</div>

				<div className="mt-7 px-4 sm:mt-8 sm:px-8 xl:px-0">
					{/* darkBg=false: ClientGallery sits at the bottom of
					    HomeBigCard's dark→white gradient. The badges are
					    over the white portion, so mixBlendMode:lighten
					    would wash them out. */}
					<AwardsStrip darkBg={false} />
				</div>
			</div>
		</section>
	);
};

export default ClientGallery;
