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
		<>
			<div className='mx-auto w-full max-w-[400px] px-4 py-10'>
				<div className='space-y-3 pb-7.5'>
					<GoogleSigninButton text={t("socialSignUp")} />

					<GithubSigninButton text={t("socialSignUp")} />
				</div>

				<div className='mb-7.5 flex items-center justify-center'>
					<span className='block h-px w-full bg-stroke dark:bg-stroke-dark'></span>
					<div className='inline-block bg-white px-3 text-base text-body dark:bg-[#151F34] dark:text-gray-5'>
						{t("or")}
					</div>
					<span className='block h-px w-full bg-stroke dark:bg-stroke-dark'></span>
				</div>

				<div className='mb-4.5 flex w-full items-center justify-between gap-1.5 rounded-10 border border-stroke p-1 dark:border-stroke-dark'>
					<button
						onClick={() => setSigninOption("magic-link")}
						className={`h-[38px] w-full rounded-lg font-satoshi text-base font-medium tracking-[-.2px] ${
							signinOption === "magic-link"
								? "bg-primary/[.08] text-primary"
								: "text-dark dark:text-white"
						}`}
					>
						{t("magicLink")}
					</button>
					<button
						onClick={() => setSigninOption("password")}
						className={`h-[38px] w-full rounded-lg font-satoshi text-base font-medium tracking-[-.2px] ${
							signinOption === "password"
								? "bg-primary/[.08] text-primary"
								: "text-dark dark:text-white"
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

				<p className='text-center font-satoshi font-medium text-dark dark:text-white'>
					{t.rich("alreadyHaveAccount", {
						link: (chunk) => (
							<Link
								href='/auth/signin'
								className='ml-1 inline-block text-primary'
							>
								{chunk} →
							</Link>
						),
					})}
				</p>
			</div>
		</>
	);
}
