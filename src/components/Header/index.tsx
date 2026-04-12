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
 * Header — site marketing header with TWO visual states (was three
 * before — the intermediate "settling" state was deleted because it
 * caused a visible jank between the full-width bar and the compact
 * pill: a border-bottom would flash, then the bg would morph, then
 * the rounded corners would snap. Now the header goes directly
 * from default to compact pill in a single smooth transition.):
 *
 *   1. DEFAULT (scrollY < SCROLL_THRESHOLD)
 *      Sits at `top-10` below the announcement banner. Transparent
 *      background, full-width container, all menu items visible.
 *
 *   2. COMPACT (scrollY >= SCROLL_THRESHOLD)
 *      Liquid-glass floating pill at the top center of the viewport:
 *        * `max-w-[620px]` centered, detached from edges
 *        * `top-3`, rounded-full, h-12 fixed height
 *        * `backdrop-blur-xl` + gradient bg + thin border + shadow
 *        * Menu items collapse to opacity 0 + max-w 0
 *        * Logo shrinks h-8 → h-6
 *        * Login + Get started buttons tighten padding
 *        * Everything in the pill is forced to vertical center via
 *          `items-center` and a fixed `h-12` so the alignment problem
 *          from the previous version goes away.
 *
 * The transition is a single 500ms ease-out on every property
 * change, no intermediate state. `bg`/`border`/`max-w`/`rounded`/
 * `padding`/`top` all morph together so visually it looks like the
 * header gathers itself into a pill in one smooth motion.
 */

const SCROLL_THRESHOLD_PX = 80;

const Header = () => {
	const [compact, setCompact] = useState(false);
	const [bannerVisible, setBannerVisible] = useState(true);
	const { data: session } = useSession();
	const branding = useBranding();
	const logoSrc = branding.logo_light?.dataUrl || logoStatic;

	const pathUrl = usePathname();

	// Navbar toggle (mobile hamburger)
	const [navbarOpen, setNavbarOpen] = useState(false);
	const navbarToggleHandler = () => {
		setNavbarOpen(!navbarOpen);
	};

	// Single scroll listener — drives compact state + banner sync.
	useEffect(() => {
		const handleScroll = () => {
			setCompact(window.scrollY >= SCROLL_THRESHOLD_PX);
			// Check if banner still exists in DOM (it removes itself when dismissed)
			const bannerExists = !!document.getElementById('announcement-banner');
			setBannerVisible(window.scrollY < 8 && bannerExists);
		};
		handleScroll();
		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	// The /-only scroll-active listener from the boilerplate. Kept
	// separate from our state listener so we don't entangle the two.
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

	return (
		<header
			className={`fixed left-0 right-0 z-999 will-change-transform transition-[top] duration-500 ease-out ${
				compact ? "top-3" : bannerVisible ? "top-10" : "top-3"
			}`}
		>
			<div
				className={`relative mx-auto flex flex-col will-change-[transform,opacity] xl:flex-row xl:items-center xl:justify-between ${
					compact
						? // Compact liquid-glass pill
							navbarOpen
								? "max-w-[620px] rounded-[1.25rem] border border-white/[0.12] bg-[#0c0c14]/95 px-5 py-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.55),0_8px_24px_-12px_rgba(16,185,129,0.18)] transition-[border-radius,background,border-color,box-shadow,max-width,padding] duration-500 ease-out"
								: "h-12 max-w-[620px] rounded-full border border-white/[0.12] bg-[#0c0c14]/95 px-5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.55),0_8px_24px_-12px_rgba(16,185,129,0.18)] transition-[border-radius,background,border-color,box-shadow,max-width,padding] duration-500 ease-out"
						: // Default — full width, transparent, no border
							"max-w-[1170px] rounded-full border border-transparent bg-transparent px-4 py-4 shadow-none sm:px-8 transition-[border-radius,background,border-color,box-shadow,max-width,padding] duration-500 ease-out"
				}`}
			>
				<div className={`flex w-full shrink-0 items-center justify-between xl:w-auto ${compact && !navbarOpen ? "h-12" : ""}`}>
					<Link href='/' className='flex shrink-0 items-center'>
						{typeof logoSrc === "string" ? (
							<img
								src={logoSrc}
								alt='Vestigio'
								className={`w-auto transition-all duration-500 ${
									compact ? "h-5 sm:h-6" : "h-6 sm:h-8"
								}`}
							/>
						) : (
							<Image
								src={logoSrc}
								alt='Vestigio'
								className={`w-auto transition-all duration-500 ${
									compact ? "h-5 sm:h-6" : "h-6 sm:h-8"
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
					className={`w-full items-center justify-between ${
						navbarOpen
							? "mt-4 block max-h-[70vh] overflow-y-auto rounded-[1rem] bg-[#181822] p-5 shadow-lg sm:max-h-[60vh] sm:p-6 xl:mt-0 xl:bg-transparent xl:p-0 xl:shadow-none"
							: "hidden xl:flex"
					} xl:flex xl:h-auto`}
				>
					{/* Nav — collapses to width 0 in compact mode. Items stay
					    in the DOM, just visually gone, so the transition keeps
					    morphing instead of remounting. */}
					<nav
						className={`overflow-hidden transition-[max-width,opacity] duration-500 ease-out lg:mx-auto ${
							compact
								? "xl:max-w-0 xl:opacity-0"
								: "xl:max-w-[800px] xl:opacity-100"
						}`}
					>
						<ul className='flex flex-col gap-5 xl:flex-row xl:items-center xl:gap-1'>
							{menuData?.map((item, key) => (
								<li key={key} className='nav__menu xl:py-2'>
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

					<div className='flex items-center gap-3 max-xl:mt-6 max-xl:flex-col max-xl:items-stretch max-xl:border-t max-xl:border-white/5 max-xl:pt-5 xl:flex-row xl:border-0 xl:pt-0'>
						{session?.user ? (
							<Account navbarOpen={navbarOpen} />
						) : (
							<>
								<Link
									href='/auth/signin'
									className={`whitespace-nowrap rounded-[0.5rem] text-center text-sm font-medium text-gray-300 transition-all duration-300 hover:text-white ${
										compact ? "px-3 py-1" : "px-4 py-2"
									}`}
								>
									Login
								</Link>

								<Link
									href='/auth/signup'
									className={`whitespace-nowrap rounded-full border border-white/20 bg-white text-center text-sm font-medium text-black transition-all duration-300 hover:bg-gray-100 ${
										compact ? "px-4 py-1.5" : "px-5 py-2"
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
