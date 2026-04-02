"use client";
import { useTranslations } from "next-intl";
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

	return (
		<>
			<div className='mx-auto w-full max-w-[400px] px-4 py-10'>
				<div className='space-y-3 pb-7.5'>
					<GoogleSigninButton text={t("socialSignIn")} />

					<GithubSigninButton text={t("socialSignIn")} />
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
						{t("password")}
					</button>
				</div>

				<div>
					{signinOption === "magic-link" ? (
						<SigninWithMagicLink />
					) : (
						<SigninWithPassword />
					)}
				</div>

				<p className='text-center font-satoshi text-base font-medium text-dark dark:text-white'>
					{t.rich("noAccount", {
						link: (chunks) => (
							<Link href='/auth/signup' className='text-primary' key='link'>
								{chunks} →
							</Link>
						),
					})}
				</p>

				<span className='my-10 block h-px w-full bg-stroke dark:bg-stroke-dark '></span>

				<DemoSignin />
			</div>
		</>
	);
}
