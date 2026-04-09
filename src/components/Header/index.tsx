"use client";
import logoStatic from "@/../public/images/logo/logo-light.png";
import { useBranding } from "@/components/BrandingProvider";
import { onScroll } from "@/libs/scrollActive";
import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Account from "./Account";
import { menuData } from "./menuData";

/**
 * Header — site marketing header with three visual states:
 *
 *   1. DEFAULT (scrollY < 8): sits below the announcement banner at
 *      `top-10`, transparent bg, full-width, shows menu + CTAs. The
 *      banner is still visible above it.
 *
 *   2. SETTLING (8 <= scrollY < 320): banner has slid out. Header is
 *      at `top-0`, still full-width, now with a darker solid bg and
 *      shadow so the page content doesn't bleed through.
 *
 *   3. COMPACT (scrollY >= 320): the big reveal. Header transforms
 *      into a liquid-glass floating pill:
 *        - `max-w-[620px]` centered
 *        - `top-3` detached from the edge
 *        - `backdrop-blur-xl` + gradient bg + subtle border
 *        - `rounded-full`
 *        - Menu items collapse to 0 width (desktop only — on mobile
 *          the menu is already hidden behind the hamburger, so the
 *          pill just shrinks a little and re-aligns)
 *        - Only logo + login + get-started remain visible
 *
 * The 320px threshold is tuned so the transition happens after the
 * user has read past the headline and the pills, but before the
 * product tour kicks in. Feels natural, not jarring.
 */

// Scroll threshold for the liquid-glass pill compaction. Exported as
// a const so it can be referenced elsewhere (e.g. a scroll-spy fix).
const COMPACT_THRESHOLD_PX = 320;

const Header = () => {
	const [bannerHidden, setBannerHidden] = useState(false);
	const [compact, setCompact] = useState(false);
	const { data: session } = useSession();
	const branding = useBranding();
	const logoSrc = branding.logo_light?.dataUrl || logoStatic;

	const pathUrl = usePathname();

	// Navbar toggle (mobile hamburger)
	const [navbarOpen, setNavbarOpen] = useState(false);
	const navbarToggleHandler = () => {
		setNavbarOpen(!navbarOpen);
	};

	// Single scroll listener that drives both states. Using one listener
	// (instead of two as before) avoids duplicate rAF callbacks and the
	// double-run useEffect that wasn't cleaning up properly.
	useEffect(() => {
		const handleScroll = () => {
			const y = window.scrollY;
			setBannerHidden(y >= 8);
			setCompact(y >= COMPACT_THRESHOLD_PX);
		};
		handleScroll(); // Sync on mount in case user reloaded mid-scroll
		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	// The /-only scroll-active listener from the boilerplate. Separate
	// from our own listener so we don't step on its toes.
	useEffect(() => {
		if (window.location.pathname === "/") {
			window.addEventListener("scroll", onScroll);
		}
		return () => {
			window.removeEventListener("scroll", onScroll);
		};
	}, []);

	const navLabels: Record<string, string> = {
		product: "Product",
		solutions: "Solutions",
		pricing: "Pricing",
		resources: "Resources",
	};

	// Header container positioning — follows the three-state model
	// described in the file header comment.
	const headerTop = bannerHidden ? "top-0" : "top-10";
	const compactTop = compact ? "sm:top-3" : "";

	return (
		<header
			className={`fixed left-0 right-0 z-999 transition-all duration-500 ease-out ${headerTop} ${compactTop}`}
		>
			<div
				className={`relative mx-auto transition-all duration-500 ease-out ${
					compact
						? // Compact pill — liquid glass, floating
							"max-w-[620px] rounded-full border border-white/[0.12] bg-gradient-to-b from-white/[0.08] to-white/[0.03] px-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.55),0_8px_24px_-12px_rgba(16,185,129,0.18)] backdrop-blur-xl sm:px-5"
						: // Expanded — full width
							bannerHidden
							? "max-w-[1170px] border-b border-white/[0.04] bg-[#090911]/85 px-4 py-3 shadow-lg backdrop-blur-md sm:px-8 xl:py-0"
							: "max-w-[1170px] px-4 py-4 sm:px-8 xl:py-0"
				} items-center justify-between xl:flex`}
			>
				<div className='flex shrink-0 items-center justify-between'>
					<Link href='/' className='shrink-0'>
						{typeof logoSrc === "string" ? (
							<img
								src={logoSrc}
								alt='Vestigio'
								className={`w-auto transition-all duration-500 ${
									compact ? "h-6" : "h-8"
								}`}
							/>
						) : (
							<Image
								src={logoSrc}
								alt='Vestigio'
								className={`w-auto transition-all duration-500 ${
									compact ? "h-6" : "h-8"
								}`}
							/>
						)}
					</Link>

					{/* Hamburger Toggle — mobile only */}
					<button
						onClick={navbarToggleHandler}
						aria-label='Toggle menu'
						className='block xl:hidden'
					>
						<span className='relative block h-5.5 w-5.5 cursor-pointer'>
							<span className='du-block absolute right-0 h-full w-full'>
								<span
									className={`relative left-0 top-0 my-1 block h-0.5 w-0 rounded-sm bg-white delay-[0] duration-200 ease-in-out ${
										!navbarOpen && "!w-full delay-300"
									}`}
								></span>
								<span
									className={`relative left-0 top-0 my-1 block h-0.5 w-0 rounded-sm bg-white delay-150 duration-200 ease-in-out ${
										!navbarOpen && "delay-400 !w-full"
									}`}
								></span>
								<span
									className={`relative left-0 top-0 my-1 block h-0.5 w-0 rounded-sm bg-white delay-200 duration-200 ease-in-out ${
										!navbarOpen && "!w-full delay-500"
									}`}
								></span>
							</span>
							<span className='du-block absolute right-0 h-full w-full rotate-45'>
								<span
									className={`absolute left-2.5 top-0 block h-full w-0.5 rounded-sm bg-white delay-300 duration-200 ease-in-out ${
										!navbarOpen && "!h-0 delay-[0]"
									}`}
								></span>
								<span
									className={`delay-400 absolute left-0 top-2.5 block h-0.5 w-full rounded-sm bg-white duration-200 ease-in-out ${
										!navbarOpen && "dealy-200 !h-0"
									}`}
								></span>
							</span>
						</span>
					</button>
				</div>

				<div
					className={`invisible h-0 w-full items-center justify-between xl:visible xl:flex xl:h-auto ${
						navbarOpen &&
						"!visible relative mt-4 !h-auto max-h-[70vh] overflow-y-auto rounded-[1rem] bg-[#181822] p-5 shadow-lg sm:max-h-[60vh] sm:p-6"
					}`}
				>
					{/* Nav — hidden in compact mode on desktop. The `max-w`
					    trick collapses the nav to 0 smoothly while keeping it
					    in the DOM, so the transition stays continuous. */}
					<nav
						className={`overflow-hidden transition-all duration-500 ease-out lg:mx-auto ${
							compact
								? "xl:max-w-0 xl:opacity-0"
								: "xl:max-w-[800px] xl:opacity-100"
						}`}
					>
						<ul className='flex flex-col gap-5 xl:flex-row xl:items-center xl:gap-1'>
							{menuData?.map((item, key) => (
								<li
									key={key}
									className={`nav__menu ${compact ? "xl:py-2" : "xl:py-6"}`}
								>
									<Link
										onClick={() => setNavbarOpen(false)}
										href={
											item?.path
												? item?.path.includes("#") && !item?.newTab
													? `/${item?.path}`
													: item?.path
												: ""
										}
										target={item?.newTab ? "_blank" : ""}
										rel={item?.newTab ? "noopener noreferrer" : ""}
										className={`flex truncate whitespace-nowrap rounded-[0.5rem] px-3 py-2.5 text-sm font-medium xl:px-4 xl:py-1.5 ${
											pathUrl === item?.path
												? "bg-white/10 text-white"
												: "text-gray-400 hover:bg-white/5 hover:text-white"
										} ${item?.path?.startsWith("#") ? "menu-scroll" : ""}`}
									>
										{navLabels[item?.titleKey] || item?.titleKey}
									</Link>
								</li>
							))}
						</ul>
					</nav>

					<div
						className={`flex flex-col items-stretch gap-3 max-xl:mt-6 max-xl:border-t max-xl:border-white/5 max-xl:pt-5 sm:gap-3 xl:flex-row xl:items-center xl:border-0 xl:pt-0 ${
							compact ? "xl:py-2" : "xl:mt-0"
						}`}
					>
						{session?.user ? (
							<Account navbarOpen={navbarOpen} />
						) : (
							<>
								<Link
									href='/auth/signin'
									className={`rounded-[0.5rem] text-center text-sm font-medium text-gray-300 transition-all duration-300 hover:text-white ${
										compact ? "px-3 py-1.5 xl:py-1" : "px-4 py-2.5 xl:px-4 xl:py-2"
									}`}
								>
									Login
								</Link>

								<Link
									href='/auth/signup'
									className={`rounded-full border border-white/20 bg-white text-center text-sm font-medium text-black transition-all duration-300 hover:bg-gray-100 ${
										compact
											? "px-4 py-1.5 xl:py-1.5"
											: "px-5 py-2.5 xl:py-2"
									}`}
								>
									Get started
								</Link>
							</>
						)}
					</div>
				</div>
			</div>
		</header>
	);
};

export default Header;
