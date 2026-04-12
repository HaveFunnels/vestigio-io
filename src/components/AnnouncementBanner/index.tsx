"use client";

/**
 * AnnouncementBanner — thin promo bar that sits above the site header.
 *
 * Behavior:
 *   - Fixed at the very top of the viewport (z-[1001], above the header
 *     which is z-999)
 *   - Visible only while the user is at scrollY ~0; slides up and out
 *     (`-translate-y-full`) the moment they scroll past the banner's
 *     own height. Once hidden, it stays hidden even if they scroll back
 *     to the top — it's a true "first-visit" hook, not a persistent bar.
 *   - Auto-hides on admin/user routes (via the `HeaderWrapper` pattern:
 *     we let the wrapper decide whether to render this at all rather
 *     than polluting the banner with route-sniffing logic)
 *
 * Copy lives under `homepage.hero_v2.banner.*` in the dictionaries so it
 * inherits the same localization path the hero is already using.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

// Banner shrinks on narrow viewports; these are the two values used
// throughout the file so the header's `top` offset stays in sync.
// Exposed as a const so other components can `import { BANNER_HEIGHT_PX }`
// if they need pixel-perfect alignment.
export const BANNER_HEIGHT_PX = 40;

interface AnnouncementBannerProps {
	/**
	 * Optional href for the CTA. Defaults to `#product-tour` (the
	 * existing product tour anchor). The banner always links somewhere
	 * — no dead pills.
	 */
	href?: string;
}

export default function AnnouncementBanner({
	href = "#product-tour",
}: AnnouncementBannerProps) {
	const t = useTranslations("homepage.hero_v2.banner");
	const [visible, setVisible] = useState(true);
	const [dismissed, setDismissed] = useState(false);

	useEffect(() => {
		if (dismissed) return;
		const onScroll = () => {
			setVisible(window.scrollY < 8);
		};
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, [dismissed]);

	const handleClick = () => {
		setDismissed(true);
		setVisible(false);
	};

	if (dismissed) return null;

	return (
		<div
			id="announcement-banner"
			className={`pointer-events-none fixed inset-x-0 top-0 z-[1001] transition-transform duration-300 ease-out ${
				visible ? "translate-y-0" : "-translate-y-full"
			}`}
			style={{ height: `${BANNER_HEIGHT_PX}px` }}
			aria-hidden={!visible}
		>
			{/* Backdrop — subtle gradient with backdrop-blur for the
			    "liquid glass" feel; NOT full black so the banner reads as
			    a promo flash rather than as part of the header. */}
			<div className='relative flex h-full w-full items-center justify-center border-b border-white/[0.06] bg-gradient-to-r from-[#0a1a14] via-[#0b0e1c] to-[#0a0a14] px-3 sm:px-6'>
				<Link
					href={href}
					onClick={handleClick}
					className='pointer-events-auto group inline-flex max-w-full items-center gap-2 text-[11px] leading-tight text-zinc-300 transition-colors hover:text-white sm:gap-3 sm:text-xs'
				>
					<span className='inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-300 sm:text-[10px]'>
						<span className='h-1 w-1 animate-[vbanner-pulse_1.6s_ease-in-out_infinite] rounded-full bg-emerald-400' />
						{t("label")}
					</span>
					<span className='hidden truncate sm:inline'>{t("message")}</span>
					<span className='inline-flex shrink-0 items-center gap-1 font-medium text-emerald-300 transition-transform group-hover:translate-x-0.5'>
						{t("cta")}
						<svg
							viewBox='0 0 12 12'
							fill='none'
							stroke='currentColor'
							strokeWidth='1.6'
							className='h-3 w-3'
						>
							<path
								d='M3 6h6M6.5 3.5L9 6 6.5 8.5'
								strokeLinecap='round'
								strokeLinejoin='round'
							/>
						</svg>
					</span>
				</Link>
			</div>

			{/* Local keyframes so we don't collide with the vhero-pulse
			    animation running inside the Hero component. */}
			<style>{`
				@keyframes vbanner-pulse {
					0%, 100% { transform: scale(1); opacity: 0.9; }
					50%      { transform: scale(1.2); opacity: 0.55; }
				}
			`}</style>
		</div>
	);
}
