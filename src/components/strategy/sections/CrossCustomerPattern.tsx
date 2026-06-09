"use client";

import { motion } from "framer-motion";
import { useMcpData } from "@/components/app/McpDataProvider";
import { fmtCurrencyUnits } from "@/lib/format-currency";
import type { CrossCustomerPattern as Pattern } from "../types";

/*
 * E4 — Peer pattern callout
 *
 * "N de M concorrentes no seu segmento têm o mesmo padrão; das que
 * resolveram, a captura média foi R$ X/mês." Renders only when the
 * sample size is statistically defensible (gating handled at the
 * generator); UI just decides how to phrase it.
 *
 * Strategic role: this is the line that Ahrefs/Semrush cannot say.
 * Vestigio has the cross-customer data; making it visible is what
 * justifies the recurring spend after the first novelty wears off.
 */

interface Props {
	pattern: Pattern | null | undefined;
}

const BUSINESS_MODEL_LABEL: Record<string, string> = {
	ecommerce: "e-commerce",
	lead_gen: "lead-gen",
	saas: "SaaS",
	services: "serviços",
	app_conversion: "app",
	enterprise: "enterprise",
	hybrid: "modelo híbrido",
};

export default function CrossCustomerPattern({ pattern }: Props) {
	const { currency } = useMcpData();
	if (!pattern) return null;

	const segmentLabel = BUSINESS_MODEL_LABEL[pattern.businessModel] ?? pattern.businessModel;
	const sharePctRaw = (pattern.peersWithPattern / pattern.peerCount) * 100;
	const sharePct = Math.round(sharePctRaw);
	const hasFixers = pattern.peersWhoFixed > 0;

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.18 }}
			className="mb-12"
		>
			<div className="mb-4 flex items-baseline justify-between">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					Padrão na carteira
				</h2>
				<div className="text-[11px] text-content-faint">
					exclusivo Vestigio · {segmentLabel}
				</div>
			</div>

			<div
				data-vsgp-card
				className="rounded-2xl border border-edge bg-gradient-to-br from-surface-card to-surface-inset/30 p-6"
			>
				<p className="font-serif text-[17px] leading-[1.6] text-content-secondary">
					Dos{" "}
					<span className="font-mono tabular-nums text-content">
						{pattern.peerCount}
					</span>{" "}
					ambientes de <strong className="font-semibold text-content">{segmentLabel}</strong> que
					Vestigio monitora,{" "}
					<span className="font-mono tabular-nums text-content">
						{pattern.peersWithPattern}
					</span>{" "}
					({sharePct}%) mostram o mesmo padrão dominante:{" "}
					<strong className="font-semibold text-content">{pattern.packLabel}</strong>.
					{hasFixers ? (
						<>
							{" "}Das que fecharam esse buraco nos últimos 90 dias (
							<span className="font-mono tabular-nums text-content">
								{pattern.peersWhoFixed}
							</span>
							{pattern.peersWhoFixed === 1 ? " ambiente" : " ambientes"}),
							a captura média foi de{" "}
							<strong className="font-semibold text-content">
								{fmtCurrencyUnits(pattern.avgCapturedImpact ?? 0, currency)}
							</strong>
							/mês.
						</>
					) : (
						<>
							{" "}Nenhuma resolveu nos últimos 90 dias — você tem janela pra ser o primeiro a fechar.
						</>
					)}
				</p>
				<div className="mt-4 text-[11px] text-content-faint">
					Padrões cruzados saem dos seus dados + da carteira anonimizada — sinal que nenhuma ferramenta SEO genérica entrega.
				</div>
			</div>
		</motion.section>
	);
}
