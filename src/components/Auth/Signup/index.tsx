"use client";

/**
 * Signup — two-column premium registration page.
 *
 * Left:  form (Google → GitHub → email+password)
 * Right: product screenshot + client testimonial cards (desktop only)
 *
 * No magic link on signup (magic link is signin-only).
 * Domain from MiniCalc persisted to localStorage for onboarding pre-fill.
 */

import { useTranslations } from "next-intl";
import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, Shield, Clock, Lock } from "lucide-react";
import { signIn } from "next-auth/react";
import axios, { AxiosError } from "axios";
import toast from "react-hot-toast";
import z from "zod";
import { rateLimitByIp } from "@/libs/limiter";
import { integrations, messages } from "../../../../integrations.config";
import logoDark from "@/../public/images/logo/logo.png";

const schema = z.object({
	name: z.string().min(3, { message: "Name must be at least 3 characters long" }),
	email: z.string().email(),
	password: z
		.string()
		.min(8, { message: "Password must be at least 8 characters long" })
		.refine((val) => /[A-Z]/.test(val), { message: "Must contain an uppercase letter." })
		.refine((val) => /[a-z]/.test(val), { message: "Must contain a lowercase letter." })
		.refine((val) => /\d/.test(val), { message: "Must contain a number." })
		.refine((val) => /[@$!%*?&_\-#^]/.test(val), { message: "Must contain a special character." }),
});

export default function Signup() {
	const t = useTranslations("signUpPage");
	const searchParams = useSearchParams();
	const [showPassword, setShowPassword] = useState(false);
	const [loading, setLoading] = useState(false);
	const [data, setData] = useState({ name: "", email: "", password: "" });

	// Persist domain from MiniCalc
	useEffect(() => {
		const domain = searchParams.get("domain");
		if (domain) {
			try { localStorage.setItem("vestigio_onboard_domain", domain); } catch {}
		}
	}, [searchParams]);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setData((d) => ({ ...d, [e.target.name]: e.target.value }));
	};

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!integrations.isAuthEnabled) return toast.error(messages.auth);

		const result = schema.safeParse(data);
		if (!result.success) return toast.error(result.error.issues[0].message);

		setLoading(true);
		try {
			await rateLimitByIp(2, 20000);
		} catch {
			setLoading(false);
			return toast.error("Too many attempts. Please try again later.");
		}

		try {
			await axios.post("/api/user/register", data);
			const res = await signIn("credentials", { ...data, redirect: false });
			if (res?.error) {
				toast.error(res.error);
				setLoading(false);
			} else if (res?.ok) {
				toast.success(t("form.success"));
				window.location.href = "/app";
			}
		} catch (error) {
			if (error instanceof AxiosError) toast.error(error.response?.data.message);
			setLoading(false);
		}
	};

	const handleGoogle = () => {
		if (!integrations.isAuthEnabled) return toast.error(messages.auth);
		signIn("google", { callbackUrl: "/app" });
	};

	const handleGithub = () => {
		if (!integrations.isAuthEnabled) return toast.error(messages.auth);
		signIn("github", { callbackUrl: "/app" });
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

					{/* Google (primary) */}
					<button
						onClick={handleGoogle}
						className="auth-fade-in auth-delay-300 mb-3 flex w-full items-center justify-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] py-3.5 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
					>
						<GoogleIcon />
						{t("socialSignUp")} Google
					</button>

					{/* GitHub (secondary) */}
					<button
						onClick={handleGithub}
						className="auth-fade-in auth-delay-300 mb-6 flex w-full items-center justify-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] py-3.5 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
					>
						<GithubIcon />
						{t("socialSignUp")} GitHub
					</button>

					{/* Divider */}
					<div className="auth-fade-in auth-delay-400 mb-6 flex items-center gap-3">
						<span className="block h-px flex-1 bg-white/[0.06]" />
						<span className="text-xs text-zinc-600">{t("or")}</span>
						<span className="block h-px flex-1 bg-white/[0.06]" />
					</div>

					{/* Email form */}
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="auth-fade-in auth-delay-400">
							<label className="mb-1.5 block text-xs font-medium text-zinc-500">{t("form.name.label")}</label>
							<input
								name="name"
								type="text"
								autoComplete="name"
								required
								placeholder={t("form.name.placeholder")}
								value={data.name}
								onChange={handleChange}
								className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-emerald-500/50 focus:bg-white/[0.05]"
							/>
						</div>

						<div className="auth-fade-in auth-delay-500">
							<label className="mb-1.5 block text-xs font-medium text-zinc-500">{t("form.email.label")}</label>
							<input
								name="email"
								type="email"
								autoComplete="email"
								required
								placeholder={t("form.email.placeholder")}
								value={data.email}
								onChange={handleChange}
								className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-emerald-500/50 focus:bg-white/[0.05]"
							/>
						</div>

						<div className="auth-fade-in auth-delay-500">
							<label className="mb-1.5 block text-xs font-medium text-zinc-500">{t("form.password.label")}</label>
							<div className="relative">
								<input
									name="password"
									type={showPassword ? "text" : "password"}
									autoComplete="new-password"
									required
									placeholder={t("form.password.placeholder")}
									value={data.password}
									onChange={handleChange}
									className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 pr-11 text-sm text-white placeholder:text-zinc-600 outline-none transition-colors focus:border-emerald-500/50 focus:bg-white/[0.05]"
								/>
								<button
									type="button"
									onClick={() => setShowPassword(!showPassword)}
									className="absolute inset-y-0 right-3 flex items-center"
								>
									{showPassword ? (
										<EyeOff className="h-4 w-4 text-zinc-600 hover:text-zinc-400 transition-colors" />
									) : (
										<Eye className="h-4 w-4 text-zinc-600 hover:text-zinc-400 transition-colors" />
									)}
								</button>
							</div>
						</div>

						<button
							type="submit"
							disabled={loading}
							className="auth-fade-in auth-delay-600 w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(16,185,129,0.5)] transition-colors hover:bg-emerald-500 disabled:opacity-50"
						>
							{loading ? t("form.loading") : t("form.submit")}
						</button>
					</form>

					{/* Trust signals */}
					<div className="auth-fade-in auth-delay-600 mt-6 flex flex-wrap items-center justify-center gap-4 text-[11px] text-zinc-600">
						<span className="flex items-center gap-1.5">
							<Shield className="h-3 w-3 text-emerald-500" />
							{t("trust.noCard")}
						</span>
						<span className="flex items-center gap-1.5">
							<Clock className="h-3 w-3 text-emerald-500" />
							{t("trust.firstDiagnostic")}
						</span>
						<span className="flex items-center gap-1.5">
							<Lock className="h-3 w-3 text-emerald-500" />
							{t("trust.privacy")}
						</span>
					</div>

					{/* Footer link */}
					<p className="auth-fade-in auth-delay-700 mt-6 text-center text-sm text-zinc-600">
						{t.rich("alreadyHaveAccount", {
							link: (chunk) => (
								<Link href="/auth/signin" className="text-emerald-400 hover:text-emerald-300 transition-colors">
									{chunk}
								</Link>
							),
						})}
					</p>
				</div>
			</section>

			{/* Right column: hero + testimonials (desktop only) */}
			<section className="hidden flex-1 p-4 md:block">
				<div className="auth-slide-right auth-delay-300 relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950/40 via-[#0c1015] to-[#090911] border border-white/[0.04]">
					{/* Ambient glow */}
					<div className="pointer-events-none absolute inset-0">
						<div className="absolute -right-20 -top-20 h-[300px] w-[300px] rounded-full bg-emerald-500/[0.08] blur-[100px]" />
						<div className="absolute -bottom-20 -left-20 h-[250px] w-[250px] rounded-full bg-emerald-500/[0.05] blur-[80px]" />
					</div>

					{/* Center content */}
					<div className="relative flex h-full flex-col items-center justify-center px-8">
						{/* Big stat */}
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

						{/* Testimonial cards */}
						<div className="mt-8 w-full max-w-[360px] space-y-3">
							{[
								{ name: "Dra. Renata Albuquerque", role: "Advogada e Contadora", quote: t("hero.testimonial_1") },
								{ name: "Gabriel Ferreira", role: "Lançamentos Digitais", quote: t("hero.testimonial_2") },
								{ name: "Lucas Martins", role: "E-commerce / Dropshipping", quote: t("hero.testimonial_3") },
							].map((t, i) => (
								<div
									key={i}
									className={`auth-fade-in auth-delay-${500 + i * 100} rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 backdrop-blur-sm`}
								>
									<p className="mb-2 text-xs leading-relaxed text-zinc-400">
										&ldquo;{t.quote}&rdquo;
									</p>
									<div className="flex items-center gap-2">
										<div className="h-6 w-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] font-bold text-emerald-400">
											{t.name[0]}
										</div>
										<div>
											<div className="text-[11px] font-medium text-zinc-300">{t.name}</div>
											<div className="text-[10px] text-zinc-600">{t.role}</div>
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</section>
		</div>
	);
}

// ── Inline SVG icons (avoid importing full button components) ──

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
