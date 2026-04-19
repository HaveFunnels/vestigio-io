"use client";
import { useBranding } from "@/components/BrandingProvider";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import GithubSigninButton from "../GithubSigninButton";
import GoogleSigninButton from "../GoogleSigninButton";
import SigninWithMagicLink from "../SigninWithMagicLink";
import SignupWithPassword from "../SignupWithPassword";

export default function Signup() {
	const [signinOption, setSigninOption] = useState("magic-link");
	const t = useTranslations("signUpPage");
	const branding = useBranding();
	const logoSrc = branding.logo_dark?.dataUrl;
	const searchParams = useSearchParams();

	// Persist domain from MiniCalc so onboarding can pre-fill it
	// (OAuth redirects lose query params, so we use localStorage)
	useEffect(() => {
		const domain = searchParams.get("domain");
		if (domain) {
			try { localStorage.setItem("vestigio_onboard_domain", domain); } catch {}
		}
	}, [searchParams]);

	return (
		<div className='flex min-h-screen items-center justify-center bg-[#090911] px-4 py-16'>
			<div className='absolute left-1/2 top-1/3 h-[400px] w-[500px] -translate-x-1/2 rounded-full bg-emerald-900/10 blur-[150px]' />

			<div className='relative w-full max-w-[420px]'>
				{/* Logo */}
				<div className='mb-8 text-center'>
					<Link href='/' className='inline-block'>
						{logoSrc ? (
							<img src={logoSrc} alt="Vestigio" className="mx-auto h-8 w-auto" />
						) : (
							<span className='text-lg font-bold tracking-wider text-white'>VESTIGIO</span>
						)}
					</Link>
					<p className='mt-2 text-sm text-gray-500'>Create your account</p>
				</div>

				{/* Card */}
				<div className='rounded-[1rem] border border-white/[0.06] bg-white/[0.03] p-8 backdrop-blur-sm'>
					<div className='space-y-3 pb-6'>
						<GoogleSigninButton text={t("socialSignUp")} />
						<GithubSigninButton text={t("socialSignUp")} />
					</div>

					<div className='mb-6 flex items-center gap-3'>
						<span className='block h-px flex-1 bg-white/[0.06]' />
						<span className='text-xs text-gray-500'>{t("or")}</span>
						<span className='block h-px flex-1 bg-white/[0.06]' />
					</div>

					<div className='mb-5 flex w-full items-center gap-1 rounded-[0.75rem] border border-white/[0.06] bg-white/[0.02] p-1'>
						<button
							onClick={() => setSigninOption("magic-link")}
							className={`h-9 w-full rounded-[0.5rem] text-sm font-medium transition-all ${
								signinOption === "magic-link"
									? "bg-white/10 text-white"
									: "text-gray-500 hover:text-gray-300"
							}`}
						>
							{t("magicLink")}
						</button>
						<button
							onClick={() => setSigninOption("password")}
							className={`h-9 w-full rounded-[0.5rem] text-sm font-medium transition-all ${
								signinOption === "password"
									? "bg-white/10 text-white"
									: "text-gray-500 hover:text-gray-300"
							}`}
						>
							{t("email")}
						</button>
					</div>

					<div>
						{signinOption === "magic-link" ? (
							<SigninWithMagicLink />
						) : (
							<SignupWithPassword />
						)}
					</div>
				</div>

				{/* Trust signals */}
				<div className='mt-6 flex flex-col items-center gap-2'>
					<div className='flex items-center gap-4 text-[11px] text-gray-600'>
						<span className='flex items-center gap-1'>
							<svg className='h-3 w-3 text-emerald-500' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' d='M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z' /></svg>
							No credit card required
						</span>
						<span className='flex items-center gap-1'>
							<svg className='h-3 w-3 text-emerald-500' fill='none' viewBox='0 0 24 24' strokeWidth={2} stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' d='M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z' /></svg>
							First diagnostic in 24h
						</span>
					</div>
				</div>

				<p className='mt-4 text-center text-sm text-gray-500'>
					{t.rich("alreadyHaveAccount", {
						link: (chunk) => (
							<Link href='/auth/signin' className='text-emerald-400 hover:text-emerald-300'>
								{chunk} →
							</Link>
						),
					})}
				</p>
			</div>
		</div>
	);
}
