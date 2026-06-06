"use client";

/**
 * /lp/audit/signup/[leadId] — STUB page (Mercado Pago path)
 *
 * Final destination for the LP funnel when paymentProvider =
 * "mercadopago". The real flow is mini-audit → account creation
 * → paywall (Pix + Cartão tabbed), implemented in C22.
 *
 * For now this page just acknowledges the redirect so visitors don't
 * land on a 404 while we build the real signup+paywall stack. Will
 * be replaced wholesale by the C22 implementation.
 */

import { useParams } from "next/navigation";
import Link from "next/link";

export default function SignupStub() {
	const params = useParams<{ leadId: string }>();
	const leadId = params?.leadId;

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-surface-shell px-5 py-12 text-center">
			<div className="max-w-md">
				<div className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-semibold uppercase tracking-[0.2em] text-content-muted">
					Em construção
				</div>
				<h1 className="mt-3 font-[family-name:var(--font-fraunces)] text-3xl font-medium leading-tight text-content sm:text-4xl">
					Criação de conta + paywall vem aqui.
				</h1>
				<p className="mt-4 text-[15px] leading-relaxed text-content-secondary">
					Você caiu nesta página porque o provedor de pagamento
					ativo é Mercado Pago e o fluxo de signup + paywall
					ainda está sendo finalizado. Volte em breve.
				</p>
				<div className="mt-2 font-mono text-[11px] text-content-faint">
					lead: {leadId}
				</div>
				<Link
					href="/lp"
					className="mt-8 inline-flex items-center gap-1.5 rounded-xl bg-content px-6 py-3 text-sm font-semibold text-surface-card transition-colors hover:bg-content-secondary"
				>
					Voltar pro início
				</Link>
			</div>
		</div>
	);
}
