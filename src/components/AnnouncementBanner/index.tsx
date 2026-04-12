"use client";

/**
 * AnnouncementBanner — thin promo bar above the site header.
 *
 * Behavior:
 *   - Fixed at the very top of the viewport (z-[1001])
 *   - Visible only at scrollY ~0; slides up when user scrolls
 *   - Clicking the CTA dismisses permanently (sessionStorage)
 *   - Dispatches a custom event so the Header can sync instantly
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export const BANNER_HEIGHT_PX = 40;
export const BANNER_DISMISSED_EVENT = "vestigio:banner-dismissed";

interface AnnouncementBannerProps {
	href?: string;
}

export default function AnnouncementBanner({
	href = "#product-tour",
}: AnnouncementBannerProps) {
	const t = useTranslations("homepage.hero_v2.banner");
	const [dismissed, setDismissed] = useState(false);
	const [visible, setVisible] = useState(true);

	// Check sessionStorage on mount (so refresh within session keeps it hidden)
	useEffect(() => {
		if (sessionStorage.getItem("banner_dismissed") === "1") {
			setDismissed(true);
			return;
		}
		const onScroll = () => setVisible(window.scrollY < 8);
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	const handleDismiss = (e: React.MouseEvent) => {
		e.preventDefault();
		setDismissed(true);
		sessionStorage.setItem("banner_dismissed", "1");
		window.dispatchEvent(new CustomEvent(BANNER_DISMISSED_EVENT));
		// Smooth scroll to target after dismissing
		const target = document.querySelector(href);
		if (target) {
			setTimeout(() => target.scrollIntoView({ behavior: "smooth" }), 50);
		}
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
			<div className='relative flex h-full w-full items-center justify-center border-b border-white/[0.06] bg-gradient-to-r from-[#0a1a14] via-[#0b0e1c] to-[#0a0a14] px-3 sm:px-6'>
				<a
					href={href}
					onClick={handleDismiss}
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
				</a>
			</div>

			<style>{`
				@keyframes vbanner-pulse {
					0%, 100% { transform: scale(1); opacity: 0.9; }
					50%      { transform: scale(1.2); opacity: 0.55; }
				}
			`}</style>
		</div>
	);
}
