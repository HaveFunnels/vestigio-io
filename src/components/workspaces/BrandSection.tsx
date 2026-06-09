"use client";

import { motion } from "framer-motion";
import { Shield, AlertTriangle } from "lucide-react";

/*
 * Workspaces hub — Marca section.
 *
 * Brand tokens for impersonator scanning are derived in runtime from
 * the env domain (packages/brand-adapter/domain-generator.ts). There
 * is no CRUD surface yet. This section documents what the scan does
 * and surfaces "is it on?" status so the customer knows monitoring
 * exists even without a configure-button to press.
 */

interface Props {
	envDomain: string | null;
}

export default function BrandSection({ envDomain }: Props) {
	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.06 }}
			className="mb-12"
		>
			<div className="mb-4 flex items-baseline justify-between">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					Proteção de marca
				</h2>
				<div className="text-[11px] text-content-faint">
					detecção automática
				</div>
			</div>

			<div data-vsgp-card className="rounded-2xl border border-edge bg-surface-card p-6">
				<p className="mb-5 border-b border-edge/40 pb-5 text-[13px] leading-snug text-content-secondary">
					Vestigio escaneia domínios similares ao seu (typosquats, variações de
					TLD, padrões de phishing) e classifica cada um por nível de ameaça,
					captura de comércio, e indicadores de captura de credenciais ou
					pagamento. Os achados aparecem na seção "Sinais da carteira" do
					plano mensal.
				</p>

				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<div className="rounded-xl border border-edge/40 bg-surface-inset/30 p-3">
						<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
							Domínio raiz monitorado
						</div>
						<div className="mt-1 font-mono text-[14px] text-content">
							{envDomain ?? "—"}
						</div>
						<div className="mt-0.5 text-[10.5px] text-content-muted">
							Brand tokens derivados automaticamente
						</div>
					</div>
					<div className="rounded-xl border border-edge/40 bg-surface-inset/30 p-3">
						<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
							Tipos de ameaça monitorados
						</div>
						<div className="mt-2 flex flex-wrap gap-1.5">
							{[
								{ icon: AlertTriangle, label: "Typosquat" },
								{ icon: AlertTriangle, label: "Phishing pattern" },
								{ icon: Shield, label: "Variação de TLD" },
								{ icon: Shield, label: "Palavra-chave comercial" },
								{ icon: Shield, label: "Interceptação de marca" },
							].map((t) => (
								<span
									key={t.label}
									className="inline-flex items-center gap-1 rounded-md bg-surface-inset/60 px-1.5 py-0.5 text-[10.5px] text-content-secondary ring-1 ring-inset ring-edge"
								>
									<t.icon className="h-3 w-3 text-content-faint" />
									{t.label}
								</span>
							))}
						</div>
					</div>
				</div>

				<div className="mt-5 rounded-xl border border-dashed border-edge bg-surface-inset/20 p-3 text-[12px] text-content-muted">
					Configuração manual de brand tokens chega numa próxima versão. Por
					enquanto, o scan usa heurísticas automáticas com base no domínio
					raiz acima.
				</div>
			</div>
		</motion.section>
	);
}
