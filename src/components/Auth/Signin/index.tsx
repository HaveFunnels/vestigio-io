"use client";

/**
 * Signin — two-column premium login page.
 *
 * Left:  form (Google → GitHub → magic link / password toggle)
 * Right: product screenshot + client testimonials (desktop only)
 *
 * Magic link is the default tab (password shown by default only if
 * arriving from activation flow with ?activated=1).
 */

import { useTranslations } from "next-intl";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { signIn } from "next-auth/react";
import toast from "react-hot-toast";
import { rateLimitByIp } from "@/libs/limiter";
import { integrations, messages } from "../../../../integrations.config";
import logoDark from "@/../public/images/logo/logo.png";
import DemoSignin from "./DemoSignin";

export default function Signin() {
	const searchParams = useSearchParams();
	const justActivated = searchParams?.get("activated") === "1";
	const [tab, setTab] = useState<"magic-link" | "password">(
		justActivated ? "password" : "magic-link",
	);
	const t = useTranslations("signInPage");
	const [showPassword, setShowPassword] = useState(false);

	// Magic link state
	const [magicEmail, setMagicEmail] = useState("");
	const [magicSent, setMagicSent] = useState(false);
	const [magicLoading, setMagicLoading] = useState(false);

	// Password state
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [remember, setRemember] = useState(false);
	const [passLoading, setPassLoading] = useState(false);

	const handleGoogle = () => {
		if (!integrations.isAuthEnabled) return toast.error(messages.auth);
		signIn("google", { callbackUrl: "/app" });
	};

	const handleGithub = () => {
		if (!integrations.isAuthEnabled) return toast.error(messages.auth);
		signIn("github", { callbackUrl: "/app" });
	};

	const handleMagicLink = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!integrations.isAuthEnabled) return toast.error(messages.auth);
		setMagicLoading(true);
		try {
			await rateLimitByIp(2, 20000);
		} catch {
			setMagicLoading(false);
			return toast.error("Too many attempts. Please try again later.");
		}
		try {
			const res = await signIn("email", { redirect: false, email: magicEmail, callbackUrl: "/app" });
			if (res?.error) {
				toast.error(res.error);
			} else {
				setMagicSent(true);
			}
		} catch {
			toast.error("Something went wrong. Please try again.");
		}
		setMagicLoading(false);
	};

	const handlePassword = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!integrations.isAuthEnabled) return toast.error(messages.auth);
		setPassLoading(true);
		try {
			await rateLimitByIp(2, 20000);
		} catch {
			setPassLoading(false);
			return toast.error("Too many attempts. Please try again later.");
		}
		try {
			const res = await signIn("credentials", { email, password, remember: String(remember), redirect: false });
			if (res?.error) {
				toast.error(t("form.invalidCredentials"));
			} else if (res?.ok) {
				window.location.href = "/app";
			}
		} catch {
			toast.error("Something went wrong.");
		}
		setPassLoading(false);
	};

	return (
		<div className="relative flex h-[100dvh] w-full bg-[#090911]">
			{/* Canvas dot-grid background */}
			<div
				className="pointer-events-none absolute inset-0 -z-1"
				aria-hidden
				style={{
					backgroundImage: "radial-gradient(circle, rgba(39,39,42,0.5) 1px, transparent 1px)",
					backgroundSize: "20px 20px",
				}}
			/>
			{/* Left column: form */}
			<section className="flex flex-1 items-center justify-center px-6 py-8 sm:p-8">
				<div className="w-full max-w-[420px]">
					{/* Logo */}
					<div className="auth-fade-in auth-delay-100 mb-8">
						<Link href="/">
							<Image src={logoDark} alt="Vestigio" className="h-7 w-auto" />
						</Link>
					</div>

					{/* Headline */}
					<h1 className="auth-fade-in auth-delay-200 mb-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
						{t("title")}
					</h1>
					<p className="auth-fade-in auth-delay-200 mb-8 text-sm text-zinc-500">
						{t("subtitle")}
					</p>

					{/* Google */}
					<button
						onClick={handleGoogle}
						className="auth-fade-in auth-delay-300 mb-3 flex w-full items-center justify-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] py-3.5 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
					>
						<GoogleIcon />
						{t("socialSignIn")} Google
					</button>

					{/* GitHub */}
					<button
						onClick={handleGithub}
						className="auth-fade-in auth-delay-300 mb-6 flex w-full items-center justify-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] py-3.5 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
					>
						<GithubIcon />
						{t("socialSignIn")} GitHub
					</button>

					{/* Divider */}
					<div className="auth-fade-in auth-delay-400 mb-6 flex items-center gap-3">
						<span className="block h-px flex-1 bg-white/[0.06]" />
						<span className="text-xs text-zinc-600">{t("or")}</span>
						<span className="block h-px flex-1 bg-white/[0.06]" />
					</div>

					{/* Tab toggle: magic link / password */}
					<div className="auth-fade-in auth-delay-400 mb-5 flex w-full items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
						<button
							onClick={() => setTab("magic-link")}
							className={`h-9 w-full rounded-lg text-sm font-medium transition-all ${
								tab === "magic-link"
									? "bg-white/10 text-white"
									: "text-zinc-500 hover:text-zinc-300"
							}`}
						>
							{t("magicLink")}
						</button>
						<button
							onClick={() => setTab("password")}
							className={`h-9 w-full rounded-lg text-sm font-medium transition-all ${
								tab === "password"
									? "bg-white/10 text-white"
									: "text-zinc-500 hover:text-zinc-300"
							}`}
						>
							{t("password")}
						</button>
					</div>

					{/* Magic Link form */}
					{tab === "magic-link" && (
						<div className="auth-fade-in">
							{magicSent ? (
								<div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-5 text-center">
									<p className="mb-1 text-sm font-medium text-emerald-400">{t("form.magicLinkSent")}</p>
									<p className="text-xs text-zinc-500">{t("form.checkInbox")}</p>
								</div>
							) : (
								<form onSubmit={handleMagicLink} className="space-y-4">
									<div>
										<label className="mb-1.5 block text-xs font-medium text-zinc-500">{t("form.email")}</label>
										<input
											type="email"
											required
											placeholder={t("form.emailPlaceholder")}
											value={magicEmail}
											onChange={(e) => setMagicEmail(e.target.value)}
											className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-emerald-500/50 focus:bg-white/[0.05]"
										/>
									</div>
									<button
										type="submit"
										disabled={magicLoading}
										className="w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(16,185,129,0.5)] transition-colors hover:bg-emerald-500 disabled:opacity-50"
									>
										{magicLoading ? t("form.sending") : t("form.magicLinkSubmit")}
									</button>
								</form>
							)}
						</div>
					)}

					{/* Password form */}
					{tab === "password" && (
						<form onSubmit={handlePassword} className="auth-fade-in space-y-4">
							<div>
								<label className="mb-1.5 block text-xs font-medium text-zinc-500">{t("form.email")}</label>
								<input
									type="email"
									required
									placeholder={t("form.emailPlaceholder")}
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-emerald-500/50 focus:bg-white/[0.05]"
								/>
							</div>
							<div>
								<label className="mb-1.5 block text-xs font-medium text-zinc-500">{t("form.password")}</label>
								<div className="relative">
									<input
										type={showPassword ? "text" : "password"}
										required
										placeholder={t("form.passwordPlaceholder")}
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 pr-11 text-sm text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-emerald-500/50 focus:bg-white/[0.05]"
									/>
									<button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-3 flex items-center">
										{showPassword ? <EyeOff className="h-4 w-4 text-zinc-600 hover:text-zinc-400 transition-colors" /> : <Eye className="h-4 w-4 text-zinc-600 hover:text-zinc-400 transition-colors" />}
									</button>
								</div>
							</div>
							<div className="flex items-center justify-between text-sm">
								<label className="flex cursor-pointer items-center gap-2">
									<input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-3.5 w-3.5 rounded border-zinc-600 bg-transparent text-emerald-500 focus:ring-emerald-500" />
									<span className="text-xs text-zinc-500">{t("form.rememberMe")}</span>
								</label>
								<Link href="/auth/forgot-password" className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
									{t("form.forgotPassword")}
								</Link>
							</div>
							<button
								type="submit"
								disabled={passLoading}
								className="w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(16,185,129,0.5)] transition-colors hover:bg-emerald-500 disabled:opacity-50"
							>
								{passLoading ? t("form.loading") : t("form.passwordSubmit")}
							</button>
						</form>
					)}

					{/* Footer link */}
					<p className="auth-fade-in auth-delay-600 mt-6 text-center text-sm text-zinc-600">
						{t.rich("noAccount", {
							link: (chunks) => (
								<Link href="/auth/signup" className="text-emerald-400 hover:text-emerald-300 transition-colors">
									{chunks}
								</Link>
							),
						})}
					</p>

					{/* Demo section */}
					<div className="mt-6 border-t border-white/[0.06] pt-5">
						<DemoSignin />
					</div>
				</div>
			</section>

			{/* Right column (desktop only) — same as signup */}
			<section className="hidden flex-1 p-4 md:block">
				<div className="auth-slide-right auth-delay-300 relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950/40 via-[#0c1015] to-[#090911] border border-white/[0.04]">
					<div className="pointer-events-none absolute inset-0">
						<div className="absolute -right-20 -top-20 h-[300px] w-[300px] rounded-full bg-emerald-500/[0.08] blur-[100px]" />
						<div className="absolute -bottom-20 -left-20 h-[250px] w-[250px] rounded-full bg-emerald-500/[0.05] blur-[80px]" />
					</div>

					<div className="relative flex h-full flex-col items-center justify-center px-8">
						<div className="mb-6 text-center">
							<div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400/70">
								{t("hero.eyebrow")}
							</div>
							<div className="font-mono text-4xl font-bold tabular-nums text-white sm:text-5xl">
								−R$81k<span className="text-lg text-zinc-500">/mês</span>
							</div>
							<p className="mt-2 max-w-[280px] text-sm text-zinc-500">
								{t("hero.stat_description")}
							</p>
						</div>
					</div>
				</div>
			</section>
		</div>
	);
}

function GoogleIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 21 20" fill="none">
			<path d="M19.25 10.19c0-.72-.06-1.24-.19-1.79H10.68v3.25h4.92c-.1.81-.63 2.02-1.83 2.84l6.19 2.12c1.69-1.53 2.66-3.77 2.66-6.42z" fill="#4285F4" />
			<path d="M10.68 18.75c2.41 0 4.43-.78 5.91-2.12l-2.82-2.19c-.75.52-1.77.87-3.1.87-2.36 0-4.36-1.53-5.08-3.64l-6.1 4.7C6.17 19.56 8.19 18.75 10.68 18.75z" fill="#34A853" />
			<path d="M5.6 11.73c-.19-.54-.3-1.13-.3-1.73s.11-1.19.3-1.73L2.7 6.07A9.97 9.97 0 001.75 10c0 1.41.35 2.74.95 3.93l2.9-2.2z" fill="#FBBC05" />
			<path d="M10.68 4.63c1.68 0 2.81.71 3.45 1.3l2.52-2.41C15.1 2.05 13.09 1.25 10.68 1.25 7.19 1.25 4.17 3.21 2.7 6.07l2.9 2.2c.71-2.11 2.72-3.64 5.08-3.64z" fill="#EB4335" />
		</svg>
	);
}

function GithubIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 20 20" fill="none">
			<path
				d="M10 .56C4.69.56.31 4.88.31 10.25c0 4.25 2.78 7.88 6.66 9.19.5.09.66-.22.66-.44v-1.69c-2.69.63-3.25-1.94-3.25-1.94-.44-1.09-1.09-1.41-1.09-1.41-.88-.63.06-.63.06-.63.97.03 1.5.97 1.5.97.84 1.5 2.28 1.06 2.81.78.09-.6.33-1.03.6-1.28-2.12-.22-4.41-1.06-4.41-4.75 0-1.06.37-1.91.97-2.56-.1-.25-.44-1.25.09-2.56 0 0 .84-.25 2.69.97a9.2 9.2 0 015.06 0c1.88-1.22 2.69-.97 2.69-.97.53 1.31.19 2.31.09 2.56.63.66.97 1.53.97 2.56 0 3.69-2.28 4.5-4.41 4.72.34.31.66 1 .66 2.13v3.28c0 .25.16.53.69.44 3.84-1.28 6.66-4.88 6.66-9.13-.03-5.31-4.38-9.69-9.69-9.69z"
				fill="currentColor"
			/>
		</svg>
	);
}
