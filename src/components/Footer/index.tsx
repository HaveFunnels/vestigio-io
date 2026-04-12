"use client";
import { useBranding, useFeatureFlags } from "@/components/BrandingProvider";
import Image from "next/image";
import Link from "next/link";

const Footer = () => {
	const branding = useBranding();
	const flags = useFeatureFlags();
	const logoSrc = branding.logo_light?.dataUrl || "/images/logo/logo-light.png";

	return (
		<footer className='relative z-1 mt-auto overflow-hidden border-t border-white/5 bg-[#090911] py-12 sm:py-16 lg:py-20'>
			<div className='mx-auto max-w-[1170px] px-4 sm:px-8 xl:px-0'>
				<div className='flex flex-wrap gap-8 sm:gap-10 lg:justify-between xl:flex-nowrap xl:gap-20'>
					{/* Logo & description */}
					<div className='w-full sm:max-w-[300px]'>
						<Link href='/'>
							{branding.logo_light?.dataUrl ? (
								<img src={logoSrc} alt="Vestigio" className="h-5 w-auto sm:h-7" />
							) : (
								<Image src="/images/logo/logo-light.png" alt="Vestigio" width={214} height={40} className="h-5 w-auto sm:h-7" />
							)}
						</Link>
						<p className='mt-5 text-sm text-gray-500'>
							The intelligence layer that audits, monitors, and optimizes your SaaS platform.
						</p>

						<ul className='mt-8 flex items-center gap-3'>
							<li>
								<a
									href='https://x.com/vestigio_io'
									target='_blank'
									rel='noopener noreferrer'
									aria-label='Twitter'
									className='flex h-8 w-8 items-center justify-center rounded-[0.5rem] border border-white/10 text-gray-500 transition-colors hover:border-white/20 hover:text-white'
								>
									<svg className='h-4 w-4 fill-current' viewBox='0 0 24 24'>
										<path d='M13.063 9L16.558 13.475L20.601 9H23.055L17.696 14.931L24 23H19.062L15.196 18.107L10.771 23H8.316L14.051 16.658L8 9H13.063ZM12.323 10.347H10.866L19.741 21.579H21.101L12.323 10.347Z' />
									</svg>
								</a>
							</li>
							<li>
								<a
									href='https://github.com/vestigio-io'
									target='_blank'
									rel='noopener noreferrer'
									aria-label='GitHub'
									className='flex h-8 w-8 items-center justify-center rounded-[0.5rem] border border-white/10 text-gray-500 transition-colors hover:border-white/20 hover:text-white'
								>
									<svg className='h-4 w-4 fill-current' viewBox='0 0 24 24'>
										<path d='M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.341-3.369-1.341-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.607.069-.607 1.003.07 1.531 1.031 1.531 1.031.892 1.529 2.341 1.088 2.91.831.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.111-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z' />
									</svg>
								</a>
							</li>
						</ul>
					</div>

					<div className='grid w-full grid-cols-2 gap-8 sm:w-auto sm:flex sm:flex-row sm:gap-10 xl:gap-20'>
						{/* Product */}
						<div className='w-full sm:w-auto'>
							<h2 className='mb-5 text-sm font-semibold uppercase tracking-wider text-white'>
								Product
							</h2>
							<ul className='flex flex-col gap-3'>
								<li>
									<Link className='text-sm text-gray-500 transition-colors hover:text-white' href='/#features'>
										Features
									</Link>
								</li>
								<li>
									<Link className='text-sm text-gray-500 transition-colors hover:text-white' href='/#solutions'>
										Solutions
									</Link>
								</li>
								<li>
									<Link className='text-sm text-gray-500 transition-colors hover:text-white' href='/#pricing'>
										Pricing
									</Link>
								</li>
								<li>
									<Link className='text-sm text-gray-500 transition-colors hover:text-white' href='/auth/signin'>
										Demo
									</Link>
								</li>
							</ul>
						</div>

						{/* Resources */}
						<div className='w-full sm:w-auto'>
							<h2 className='mb-5 text-sm font-semibold uppercase tracking-wider text-white'>
								Resources
							</h2>
							<ul className='flex flex-col gap-3'>
								{flags.blog_enabled && (
									<li>
										<Link className='text-sm text-gray-500 transition-colors hover:text-white' href='/blog'>
											Blog
										</Link>
									</li>
								)}
								<li>
									<Link className='text-sm text-gray-500 transition-colors hover:text-white' href='/support'>
										Support
									</Link>
								</li>
								{flags.blog_enabled && (
									<li>
										<Link className='text-sm text-gray-500 transition-colors hover:text-white' href='/blog'>
											Changelog
										</Link>
									</li>
								)}
							</ul>
						</div>

						{/* Company */}
						<div className='w-full sm:w-auto'>
							<h2 className='mb-5 text-sm font-semibold uppercase tracking-wider text-white'>
								Company
							</h2>
							<ul className='flex flex-col gap-3'>
								<li>
									<Link className='text-sm text-gray-500 transition-colors hover:text-white' href='/support'>
										About
									</Link>
								</li>
								<li>
									<Link className='text-sm text-gray-500 transition-colors hover:text-white' href='/support'>
										Contact
									</Link>
								</li>
							</ul>
						</div>

						{/* Legal */}
						<div className='w-full sm:w-auto'>
							<h2 className='mb-5 text-sm font-semibold uppercase tracking-wider text-white'>
								Legal
							</h2>
							<ul className='flex flex-col gap-3'>
								<li>
									<Link className='text-sm text-gray-500 transition-colors hover:text-white' href='/terms'>
										Terms of Use
									</Link>
								</li>
								<li>
									<Link className='text-sm text-gray-500 transition-colors hover:text-white' href='/privacy'>
										Privacy Policy
									</Link>
								</li>
								<li>
									<Link className='text-sm text-gray-500 transition-colors hover:text-white' href='/refund-policy'>
										Refund Policy
									</Link>
								</li>
							</ul>
						</div>
					</div>
				</div>

				{/* Bottom bar */}
				<div className='mt-10 border-t border-white/5 pt-6 sm:mt-12 sm:pt-8'>
					<p className='text-center text-xs text-gray-600'>
						&copy; {new Date().getFullYear()} Vestigio. All rights reserved.
					</p>
				</div>
			</div>
		</footer>
	);
};

export default Footer;
