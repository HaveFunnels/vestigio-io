"use client";

import Link from "next/link";

// ──────────────────────────────────────────────
// SuspendedShell — full-screen block shown when org.status='suspended'.
//
// Rendered by /app/app/layout.tsx in place of the normal sidebar shell
// when the user's org has crossed the D+14 grace threshold (or
// suffered a chargeback). The /app/billing route is whitelisted via
// a client-side guard so the user can complete payment to reactivate.
// Everything else under /app/* is gated until org.status flips back
// to 'active'.
//
// Copy emphasizes "dados preservados" — without that, users panic
// when they hit this screen and assume the account is gone. We
// preserve data for 60 days post-suspend; the copy in the email and
// here both say so explicitly.
// ──────────────────────────────────────────────

interface Props {
	orgName: string;
}

export function SuspendedShell({ orgName }: Props) {
	return (
		<div className='flex min-h-screen items-center justify-center bg-surface p-6'>
			<div className='w-full max-w-md rounded-lg border border-red-500/40 bg-red-500/5 p-8 text-center'>
				<div className='mb-4 text-5xl text-red-400'>⏸</div>
				<h1 className='mb-2 text-xl font-semibold text-content'>
					Conta suspensa
				</h1>
				<p className='mb-1 text-sm text-content-muted'>{orgName}</p>
				<p className='mt-4 text-sm text-content-secondary'>
					Sua assinatura venceu há mais de 14 dias sem confirmação de
					pagamento. Para reativar a conta, basta pagar a renovação.
				</p>
				<p className='mt-3 text-xs text-content-muted'>
					Seus dados ficam preservados por 60 dias após a suspensão.
				</p>

				<div className='mt-6 flex flex-col gap-2'>
					<Link
						href='/app/billing'
						className='rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500'
					>
						Pagar e reativar
					</Link>
					<Link
						href='/api/auth/signout?callbackUrl=/'
						className='rounded-md border border-edge px-4 py-2.5 text-sm text-content-secondary transition-colors hover:bg-surface-card-hover'
					>
						Sair
					</Link>
				</div>

				<p className='mt-6 text-xs text-content-faint'>
					Problemas com pagamento? Responda esse email ou escreva para
					help@vestigio.io.
				</p>
			</div>
		</div>
	);
}
