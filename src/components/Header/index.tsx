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

const Header = () => {
	const [stickyMenu, setStickyMenu] = useState(false);
	const { data: session } = useSession();
	const branding = useBranding();
	const logoSrc = branding.logo_light?.dataUrl || logoStatic;

	const pathUrl = usePathname();

	const handleStickyMenu = () => {
		if (window.scrollY > 0) {
			setStickyMenu(true);
		} else {
			setStickyMenu(false);
		}
	};

	// Navbar toggle
	const [navbarOpen, setNavbarOpen] = useState(false);
	const navbarToggleHandler = () => {
		setNavbarOpen(!navbarOpen);
	};

	useEffect(() => {
		if (window.location.pathname === "/") {
			window.addEventListener("scroll", onScroll);
		}

		return () => {
			window.removeEventListener("scroll", onScroll);
		};
	}, []);

	useEffect(() => {
		window.addEventListener("scroll", handleStickyMenu);
	});

	const navLabels: Record<string, string> = {
		product: "Product",
		solutions: "Solutions",
		pricing: "Pricing",
		resources: "Resources",
	};

	return (
		<header
			className={`fixed left-0 z-999 w-full transition-all duration-300 ease-in-out ${
				stickyMenu
					? "top-0 bg-[#090911]/90 py-4 shadow-lg backdrop-blur-md xl:py-0"
					: "top-10 bg-transparent py-5 xl:py-0"
			}`}
		>
			<div className='relative mx-auto max-w-[1170px] items-center justify-between px-4 sm:px-8 xl:flex xl:px-0'>
				<div className='flex shrink-0 items-center justify-between'>
					<Link href='/' className='shrink-0'>
						{typeof logoSrc === "string" ? (
							<img src={logoSrc} alt="Vestigio" className="h-8 w-auto" />
						) : (
							<Image src={logoSrc} alt="Vestigio" className="h-8 w-auto" />
						)}
					</Link>

					{/* Hamburger Toggle */}
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
					<nav className='lg:mx-auto'>
						<ul className='flex flex-col gap-5 xl:flex-row xl:items-center xl:gap-1'>
							{menuData?.map((item, key) => (
								<li
									key={key}
									className={`nav__menu ${stickyMenu ? "xl:py-4" : "xl:py-6"}`}
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
										className={`flex truncate rounded-[0.5rem] px-3 py-2.5 text-sm font-medium xl:px-4 xl:py-1.5 ${
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

					<div className='mt-6 flex flex-col items-stretch gap-3 max-xl:border-t max-xl:border-white/5 max-xl:pt-5 sm:mt-7 xl:mt-0 xl:flex-row xl:items-center xl:border-0 xl:pt-0'>
						{session?.user ? (
							<Account navbarOpen={navbarOpen} />
						) : (
							<>
								<Link
									href='/auth/signin'
									className='rounded-[0.5rem] px-4 py-2.5 text-center text-sm font-medium text-gray-300 transition-colors hover:text-white xl:px-4 xl:py-2'
								>
									Login
								</Link>

								<Link
									href='/auth/signup'
									className='rounded-[1rem] border border-white/20 bg-white px-5 py-2.5 text-center text-sm font-medium text-black transition-colors hover:bg-gray-100 xl:py-2'
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
