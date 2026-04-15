"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ──────────────────────────────────────────────
// ActivateForm — client-side branch of /activate/:token
//
// Three choices, rendered as equal-weight options:
//   1. Google OAuth  (POST /api/activate/oauth-prepare → redirect)
//   2. GitHub OAuth  (same)
//   3. Password form (POST /api/activate/password → /auth/signin)
//
// Magic link is intentionally NOT offered: the activation token IS
// the one-shot credential; we want the user to leave this page with
// a persistent auth method, not a second one-shot.
//
// `providers` is driven by server env vars — a deploy without
// GITHUB_CLIENT_ID hides that button entirely rather than dead-ending
// the user with a working button that 500s later.
// ──────────────────────────────────────────────

interface Props {
	token: string;
	providers: { google: boolean; github: boolean };
	displayEmail: string;
}

export function ActivateForm({ token, providers, displayEmail }: Props) {
	const router = useRouter();
	const [mode, setMode] = useState<"pick" | "password">("pick");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [oauthLoading, setOauthLoading] = useState<null | "google" | "github">(null);
	const [error, setError] = useState<string | null>(null);

	async function handleOAuth(provider: "google" | "github") {
		setOauthLoading(provider);
		setError(null);
		try {
			const res = await fetch("/api/activate/oauth-prepare", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token, provider }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError(data.message || "Couldn't prepare OAuth. Please try again.");
				setOauthLoading(null);
				return;
			}
			const data = await res.json();
			if (data.redirect) {
				// Full-page nav so the httpOnly cookie the server just set
				// is definitely sent on the next request.
				window.location.href = data.redirect;
				return;
			}
			setError("OAuth handoff failed — please try again.");
			setOauthLoading(null);
		} catch {
			setError("Network error. Please try again.");
			setOauthLoading(null);
		}
	}

	async function handlePasswordSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		if (password.length < 8) {
			setError("A senha precisa ter pelo menos 8 caracteres.");
			return;
		}
		if (password !== confirm) {
			setError("As senhas não coincidem.");
			return;
		}
		setSubmitting(true);
		try {
			const res = await fetch("/api/activate/password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token, password }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError(data.message || "Couldn't activate. Please try again.");
				setSubmitting(false);
				return;
			}
			const data = await res.json();
			// Redirect to signin with the email pre-filled so the user
			// just types (or pastes) the password they set and is in.
			const params = new URLSearchParams({
				email: data.email || displayEmail,
				activated: "1",
			});
			router.push(`/auth/signin?${params.toString()}`);
		} catch {
			setError("Network error. Please try again.");
			setSubmitting(false);
		}
	}

	if (mode === "password") {
		return (
			<div className="w-full rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6">
				<button
					type="button"
					onClick={() => {
						setMode("pick");
						setError(null);
					}}
					className="mb-4 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
				>
					<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
						<path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
					</svg>
					Voltar
				</button>
				<h2 className="text-lg font-semibold text-zinc-100">Criar senha</h2>
				<p className="mt-1 text-sm text-zinc-500">
					Mínimo 8 caracteres. Dá pra trocar depois na sua conta.
				</p>
				<form onSubmit={handlePasswordSubmit} className="mt-5 space-y-3">
					<input
						type="password"
						autoComplete="new-password"
						placeholder="Nova senha"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						minLength={8}
						required
						className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none"
					/>
					<input
						type="password"
						autoComplete="new-password"
						placeholder="Confirme a senha"
						value={confirm}
						onChange={(e) => setConfirm(e.target.value)}
						minLength={8}
						required
						className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none"
					/>
					{error && (
						<p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
							{error}
						</p>
					)}
					<button
						type="submit"
						disabled={submitting}
						className="w-full rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-400 disabled:opacity-60"
					>
						{submitting ? "Ativando…" : "Criar senha e ativar conta"}
					</button>
				</form>
			</div>
		);
	}

	// Mode: pick
	return (
		<div className="w-full space-y-3">
			{providers.google && (
				<button
					type="button"
					onClick={() => handleOAuth("google")}
					disabled={oauthLoading !== null}
					className="flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/80 px-5 py-3 text-sm font-medium text-zinc-100 transition-colors hover:border-zinc-700 hover:bg-zinc-900 disabled:opacity-60"
				>
					<svg className="h-4 w-4" viewBox="0 0 24 24">
						<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
						<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.997 10.997 0 0012 23z" />
						<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.997 10.997 0 001 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z" />
						<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
					</svg>
					{oauthLoading === "google" ? "Abrindo Google…" : "Continuar com Google"}
				</button>
			)}

			{providers.github && (
				<button
					type="button"
					onClick={() => handleOAuth("github")}
					disabled={oauthLoading !== null}
					className="flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/80 px-5 py-3 text-sm font-medium text-zinc-100 transition-colors hover:border-zinc-700 hover:bg-zinc-900 disabled:opacity-60"
				>
					<svg className="h-4 w-4 fill-zinc-100" viewBox="0 0 24 24">
						<path d="M12 .3a12 12 0 00-3.79 23.39c.6.11.82-.26.82-.58v-2.04c-3.34.72-4.04-1.42-4.04-1.42-.55-1.4-1.34-1.77-1.34-1.77-1.09-.74.08-.73.08-.73 1.21.08 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.17 0 0 1-.32 3.3 1.23a11.5 11.5 0 016 0C17.3 4.9 18.3 5.22 18.3 5.22c.66 1.65.24 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.82.58A12 12 0 0012 .3" />
					</svg>
					{oauthLoading === "github" ? "Abrindo GitHub…" : "Continuar com GitHub"}
				</button>
			)}

			{(providers.google || providers.github) && (
				<div className="flex items-center gap-3 py-2">
					<span className="h-px flex-1 bg-zinc-800" />
					<span className="text-[10px] uppercase tracking-wider text-zinc-600">ou</span>
					<span className="h-px flex-1 bg-zinc-800" />
				</div>
			)}

			<button
				type="button"
				onClick={() => setMode("password")}
				disabled={oauthLoading !== null}
				className="flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/80 px-5 py-3 text-sm font-medium text-zinc-100 transition-colors hover:border-zinc-700 hover:bg-zinc-900 disabled:opacity-60"
			>
				<svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
				</svg>
				Criar uma senha
			</button>

			{error && (
				<p className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
					{error}
				</p>
			)}
		</div>
	);
}
