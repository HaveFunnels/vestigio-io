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

			<div className='relative mx-auto w-full max-w-[1200px] px-4 sm:px-8 xl:px-0'>
				<p className='mb-4 text-center text-[11px] text-zinc-500 sm:mb-5 sm:text-xs'>
					{t("headline")}
				</p>

				<div className='relative w-full [mask-image:linear-gradient(to_right,transparent_0,black_8%,black_92%,transparent_100%)]'>
					<div className='vclient-track flex w-max items-center gap-x-12 sm:gap-x-16'>
						{loopLogos.map((logo, i) => (
							<img
								key={`${logo.name}-${i}`}
								src={logo.src}
								alt={logo.name}
								title={logo.name}
								loading="lazy"
								className="h-5 w-auto max-w-[90px] shrink-0 object-contain grayscale opacity-20 transition-opacity duration-300 hover:opacity-50 hover:grayscale-0 sm:h-6 sm:max-w-[110px]"
							/>
						))}
					</div>
				</div>

				<div className="mt-7 sm:mt-8">
					<AwardsStrip />
				</div>
			</div>
		</section>
	);
};

export default ClientGallery;
