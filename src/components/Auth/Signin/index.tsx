"use client";
import { useBranding } from "@/components/BrandingProvider";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import GithubSigninButton from "../GithubSigninButton";
import GoogleSigninButton from "../GoogleSigninButton";
import SigninWithMagicLink from "../SigninWithMagicLink";
import SigninWithPassword from "../SigninWithPassword";
import DemoSignin from "./DemoSignin";

export default function Signin() {
	const [signinOption, setSigninOption] = useState("magic-link");
	const t = useTranslations("signInPage");
	const branding = useBranding();
	const logoSrc = branding.logo_dark?.dataUrl; // dark bg → dark variant

	return (
		<div className='flex min-h-screen items-center justify-center bg-[#090911] px-4 py-16'>
			{/* Subtle glow */}
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
					<p className='mt-2 text-sm text-gray-500'>Sign in to your account</p>
				</div>

				{/* Card */}
				<div className='rounded-[1rem] border border-white/[0.06] bg-white/[0.03] p-8 backdrop-blur-sm'>
					{/* Social buttons */}
					<div className='space-y-3 pb-6'>
						<GoogleSigninButton text={t("socialSignIn")} />
						<GithubSigninButton text={t("socialSignIn")} />
					</div>

					{/* Divider */}
					<div className='mb-6 flex items-center gap-3'>
						<span className='block h-px flex-1 bg-white/[0.06]' />
						<span className='text-xs text-gray-500'>{t("or")}</span>
						<span className='block h-px flex-1 bg-white/[0.06]' />
					</div>

					{/* Tab toggle */}
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
							{t("password")}
						</button>
					</div>

					{/* Form */}
					<div>
						{signinOption === "magic-link" ? (
							<SigninWithMagicLink />
						) : (
							<SigninWithPassword />
						)}
					</div>
				</div>

				{/* Footer link */}
				<p className='mt-6 text-center text-sm text-gray-500'>
					{t.rich("noAccount", {
						link: (chunks) => (
							<Link href='/auth/signup' className='text-emerald-400 hover:text-emerald-300' key='link'>
								{chunks} →
							</Link>
						),
					})}
				</p>

				{/* Demo section */}
				<div className='mt-8 border-t border-white/[0.06] pt-6'>
					<DemoSignin />
				</div>
			</div>
		</div>
	);
}
