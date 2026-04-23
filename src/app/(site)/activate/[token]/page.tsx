import { redirect } from "next/navigation";
import { prisma } from "@/libs/prismaDb";
import { ActivateForm } from "./ActivateForm";

// ──────────────────────────────────────────────
// /activate/[token]
//
// Post-purchase activation page for /lp buyers. Users arrive from
// the activation email we sent in promote-lead.ts. They pick one of:
//   1. Google OAuth
//   2. GitHub OAuth
//   3. Create a password
//
// No magic link option here — the spec is deliberate: the activation
// token IS the authority, and we want the user to leave this page
// with a persistent auth method, not a one-shot autologin.
//
// Server component: validates the token before rendering anything.
//   - Missing/expired/consumed: render the "invalid" branch (no
//     form, just a message + redirect CTA)
//   - Already activated: redirect to /auth/signin
//   - Valid pending user: render ActivateForm (client component)
//     with billingEmail + provider availability info
//
// Server side is also where we decide which OAuth providers to show
// — they're enabled per-deploy via GOOGLE_CLIENT_ID / GITHUB_CLIENT_ID.
// ──────────────────────────────────────────────

interface PageProps {
	params: Promise<{ token: string }>;
}

export default async function ActivatePage({ params }: PageProps) {
	const { token } = await params;

	// Trust-but-verify: the URL is the password equivalent, so do a
	// tight lookup that covers all three invalid cases in one query.
	const user = await prisma.user.findFirst({
		where: { activationToken: token },
		select: {
			id: true,
			email: true,
			billingEmail: true,
			activationTokenExpiresAt: true,
			activatedAt: true,
		},
	});

	if (!user) {
		return <InvalidState variant="not_found" />;
	}
	if (user.activatedAt) {
		// Already activated — redirect straight to signin. The user
		// knows their method; no reason to linger.
		redirect("/auth/signin?activated=1");
	}
	const expired =
		!user.activationTokenExpiresAt ||
		user.activationTokenExpiresAt < new Date();
	if (expired) {
		return <InvalidState variant="expired" />;
	}

	const providers = {
		google: !!(
			process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
		),
		github: !!(
			process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
		),
	};

	const displayEmail = user.billingEmail || user.email || "";

	return (
		<main className="relative min-h-screen overflow-hidden bg-[#070710]">
			<div className="pointer-events-none absolute inset-x-0 top-0 -z-1 h-[600px] bg-gradient-to-b from-emerald-900/15 via-emerald-900/5 to-transparent" />
			<div className="pointer-events-none absolute left-1/2 top-0 -z-1 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-emerald-700/10 blur-[120px]" />

			<div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-12">
				<div className="mb-6 text-center">
					<div className="text-sm font-bold uppercase tracking-[0.3em] text-emerald-400">
						VESTIGIO
					</div>
					<h1 className="mt-6 text-2xl font-semibold text-zinc-100 sm:text-3xl">
						Bem-vindo à Vestigio
					</h1>
					<p className="mt-3 text-sm text-zinc-400">
						Sua conta está pronta. Escolha como você prefere acessar:
					</p>
					<p className="mt-4 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/80 px-3 py-1 text-xs text-zinc-400">
						<svg className="h-3.5 w-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
						</svg>
						<span className="font-mono">{displayEmail}</span>
					</p>
				</div>

				<ActivateForm
					token={token}
					providers={providers}
					displayEmail={displayEmail}
				/>

				<p className="mt-8 max-w-sm text-center text-xs text-zinc-600">
					Este link expira 24 horas após a compra e só pode ser usado uma vez.
					Seu email de cobrança é <span className="font-mono text-zinc-500">{displayEmail}</span> e
					continuará nele mesmo se você escolher outro email pra login.
				</p>
			</div>
		</main>
	);
}

function InvalidState({
	variant,
}: {
	variant: "not_found" | "expired";
}) {
	const copy =
		variant === "expired"
			? {
					headline: "Este link de ativação expirou",
					body: "O link é válido por 24 horas após a compra. Se você ainda não ativou sua conta, fale com o suporte para receber um novo.",
				}
			: {
					headline: "Link de ativação inválido",
					body: "Não encontramos uma conta pendente para esse link. Ele pode já ter sido usado, ou o endereço pode ter sido digitado errado. Se você acabou de comprar e chegou aqui direto do email, fale com o suporte.",
				};

	return (
		<main className="relative min-h-screen bg-[#070710]">
			<div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-12 text-center">
				<div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10">
					<svg
						className="h-6 w-6 text-amber-400"
						fill="none"
						viewBox="0 0 24 24"
						strokeWidth={2}
						stroke="currentColor"
					>
						<path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
					</svg>
				</div>
				<h1 className="text-2xl font-semibold text-zinc-100">
					{copy.headline}
				</h1>
				<p className="mt-3 text-sm text-zinc-400">{copy.body}</p>
				<div className="mt-8 flex flex-col gap-2">
					<a
						href="/auth/signin"
						className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-400"
					>
						Ir para login
					</a>
					<a
						href="mailto:suporte@vestigio.io"
						className="text-xs text-zinc-500 hover:text-zinc-300"
					>
						suporte@vestigio.io
					</a>
				</div>
			</div>
		</main>
	);
}
