"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, KeyRound, Activity, CreditCard, ShoppingBag, Store, Megaphone, Search } from "lucide-react";

/*
 * Áreas monitoradas — Fontes de dados.
 *
 * Cada card é uma integração que /app/settings/data-sources gerencia
 * em detalhes. O propósito desta seção é o sumário com STATUS REAL:
 * quem está conectado, quem ainda precisa de config, e o que cada
 * conexão desbloqueia. Sem placeholders e sem listar coisas que não
 * existem ainda — espelha exatamente a lista canônica.
 */

interface Props {
	envId: string;
}

type Status = "verified" | "configured" | "not_configured" | "coming_soon" | "always_on" | "failed";

interface SourceCard {
	id: string;
	label: string;
	purpose: string;
	icon: React.ComponentType<{ className?: string }>;
	defaultStatus: Status;
}

// Mirror of /app/settings/data-sources canonical list (Wave 22.8).
const SOURCES: SourceCard[] = [
	{
		id: "surface_audit",
		label: "Surface Audit",
		purpose: "Crawler base que descobre, classifica e mede suas páginas comerciais.",
		icon: Search,
		defaultStatus: "always_on",
	},
	{
		id: "saas_access",
		label: "Acesso autenticado ao seu produto",
		purpose: "Login no produto para Vestigio analisar páginas atrás de auth (SaaS).",
		icon: KeyRound,
		defaultStatus: "not_configured",
	},
	{
		id: "pixel",
		label: "Vestigio Pixel",
		purpose: "Sinais de sessão em tempo real para a camada behavioral.",
		icon: Activity,
		defaultStatus: "not_configured",
	},
	{
		id: "stripe",
		label: "Stripe",
		purpose: "Atribuição de receita real para findings e ações resolvidas.",
		icon: CreditCard,
		defaultStatus: "not_configured",
	},
	{
		id: "shopify",
		label: "Shopify",
		purpose: "Catálogo, pedidos e checkout para findings de e-commerce.",
		icon: ShoppingBag,
		defaultStatus: "not_configured",
	},
	{
		id: "nuvemshop",
		label: "Nuvemshop",
		purpose: "Catálogo, pedidos e checkout para lojas Nuvemshop (BR/LATAM).",
		icon: Store,
		defaultStatus: "not_configured",
	},
	{
		id: "meta_ads",
		label: "Meta Ads",
		purpose: "Dados de campanhas Meta para enriquecer impacto de findings.",
		icon: Megaphone,
		defaultStatus: "coming_soon",
	},
	{
		id: "google_ads",
		label: "Google Ads",
		purpose: "Dados de campanhas Google Ads para enriquecer impacto.",
		icon: Megaphone,
		defaultStatus: "coming_soon",
	},
];

const STATUS_META: Record<
	Status,
	{ label: string; className: string; configurable: boolean }
> = {
	verified: {
		label: "Conectado",
		className:
			"border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
		configurable: true,
	},
	configured: {
		label: "Configurado",
		className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
		configurable: true,
	},
	not_configured: {
		label: "A configurar",
		className: "border-edge bg-surface-inset/40 text-content-muted",
		configurable: true,
	},
	failed: {
		label: "Falha",
		className: "border-rose-500/30 bg-rose-500/10 text-rose-300",
		configurable: true,
	},
	always_on: {
		label: "Sempre ativo",
		className:
			"border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
		configurable: false,
	},
	coming_soon: {
		label: "Em breve",
		className: "border-edge bg-surface-inset/40 text-content-faint",
		configurable: false,
	},
};

function mapApiStatus(raw: string | null | undefined): Status {
	switch (raw) {
		case "verified":
			return "verified";
		case "configured":
			return "configured";
		case "failed":
		case "disconnected":
			return "failed";
		case "coming_soon":
			return "coming_soon";
		case "not_configured":
		case "unconfigured":
		case null:
		case undefined:
		default:
			return "not_configured";
	}
}

export default function DataSourcesSection({ envId }: Props) {
	const [statuses, setStatuses] = useState<Record<string, Status>>({});

	useEffect(() => {
		// Best-effort: fetch the canonical statuses from the same endpoints
		// /app/settings/data-sources reads. Each integration has its own
		// status route; we only call the ones that matter for the summary
		// to keep the page responsive. Failures are silent — the default
		// "A configurar" label still reads as honest.
		let cancelled = false;

		const updates: Record<string, Status> = {};
		function commit() {
			if (!cancelled) setStatuses((prev) => ({ ...prev, ...updates }));
		}

		Promise.allSettled([
			fetch(`/api/data-sources/saas?environment_id=${encodeURIComponent(envId)}`)
				.then((r) => (r.ok ? r.json() : null))
				.then((d) => {
					if (d?.status) updates.saas_access = mapApiStatus(d.status);
				}),
			fetch(`/api/integrations?environment_id=${encodeURIComponent(envId)}`)
				.then((r) => (r.ok ? r.json() : null))
				.then((d) => {
					if (!d?.integrations) return;
					const list = d.integrations as Array<{ provider: string; status: string }>;
					const shopify = list.find((i) => i.provider === "shopify");
					const nuvem = list.find((i) => i.provider === "nuvemshop");
					const stripe = list.find((i) => i.provider === "stripe");
					const pixel = list.find((i) => i.provider === "pixel");
					if (shopify) updates.shopify = mapApiStatus(shopify.status);
					if (nuvem) updates.nuvemshop = mapApiStatus(nuvem.status);
					if (stripe) updates.stripe = mapApiStatus(stripe.status);
					if (pixel) updates.pixel = mapApiStatus(pixel.status);
				}),
		]).then(() => commit());

		return () => {
			cancelled = true;
		};
	}, [envId]);

	const connectedCount = Object.values(statuses).filter(
		(s) => s === "verified" || s === "configured",
	).length + 1; // +1 = surface_audit always_on

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
			className="mb-12"
		>
			<div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					Fontes de dados
				</h2>
				<div className="text-[11px] text-content-faint">
					{connectedCount} ativa{connectedCount === 1 ? "" : "s"} · {SOURCES.length - connectedCount} a configurar
				</div>
			</div>

			<div data-vsgp-card className="rounded-2xl border border-edge bg-surface-card p-5 sm:p-6">
				<p className="mb-5 border-b border-edge/40 pb-5 text-[13px] leading-snug text-content-secondary">
					Integrações que alimentam ou enriquecem as análises do mês. Mais fontes conectadas levam o engine de estimativa para atribuição medida.
				</p>

				<ul className="space-y-2">
					{SOURCES.map((s) => {
						const Icon = s.icon;
						const status = statuses[s.id] ?? s.defaultStatus;
						const meta = STATUS_META[status];
						return (
							<li
								key={s.id}
								className="flex flex-col gap-2 rounded-xl border border-edge/40 bg-surface-inset/20 p-3 sm:flex-row sm:items-center sm:gap-4"
							>
								<div className="flex flex-1 items-start gap-3">
									<Icon
										className="mt-0.5 h-4 w-4 shrink-0 text-content-faint"
										aria-hidden
									/>
									<div className="min-w-0">
										<div className="text-[13px] font-semibold text-content">
											{s.label}
										</div>
										<div className="mt-0.5 text-[11.5px] leading-snug text-content-muted">
											{s.purpose}
										</div>
									</div>
								</div>
								<div className="flex items-center gap-2 sm:justify-end">
									<span
										className={`rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${meta.className}`}
									>
										{meta.label}
									</span>
									{meta.configurable && (
										<Link
											href={`/app/settings/data-sources?expand=${encodeURIComponent(s.id)}`}
											className="inline-flex items-center gap-1 rounded-md border border-edge bg-surface-inset/60 px-2.5 py-1 text-[11px] font-medium text-content-secondary transition-colors hover:border-edge-focus hover:text-content"
										>
											{status === "verified" || status === "configured" ? "Gerir" : "Conectar"}
											<ArrowRight className="h-3 w-3" />
										</Link>
									)}
								</div>
							</li>
						);
					})}
				</ul>

				{/* "Ver todas" — tester feedback: clicar num card específico
				    e cair na pág geral (sem destaque pro card escolhido) era
				    confuso. Agora cada card deep-linka direto pro próprio
				    card expandido, e este botão é o caminho genérico para
				    quem só quer abrir a tela inteira de fontes. */}
				<div className="mt-4 border-t border-edge/40 pt-4 text-center">
					<Link
						href="/app/settings/data-sources"
						className="inline-flex items-center gap-1.5 text-[12px] font-medium text-content-secondary transition-colors hover:text-content"
					>
						Ver todas as fontes de dados
						<ArrowRight className="h-3 w-3" />
					</Link>
				</div>
			</div>
		</motion.section>
	);
}
