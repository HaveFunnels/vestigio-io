"use client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import GithubSigninButton from "../GithubSigninButton";
import GoogleSigninButton from "../GoogleSigninButton";
import SigninWithMagicLink from "../SigninWithMagicLink";
import SignupWithPassword from "../SignupWithPassword";

export default function Signup() {
	const [signinOption, setSigninOption] = useState("magic-link");
	const t = useTranslations("signUpPage");

	return (
		<div className='flex min-h-screen items-center justify-center bg-[#090911] px-4 py-16'>
			<div className='absolute left-1/2 top-1/3 h-[400px] w-[500px] -translate-x-1/2 rounded-full bg-emerald-900/10 blur-[150px]' />

			<div className='relative w-full max-w-[420px]'>
				{/* Logo */}
				<div className='mb-8 text-center'>
					<Link href='/' className='inline-block text-lg font-bold tracking-wider text-white'>
						VESTIGIO
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

				<p className='mt-6 text-center text-sm text-gray-500'>
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
