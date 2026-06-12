"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

// ──────────────────────────────────────────────
// Bundle B — Ecosystem awareness
//
// Render duplo:
//   1. Banner de alerta (vermelho, no topo do plano) quando superfícies
//      críticas (checkout/cart/login/primary tier) estão retornando
//      4xx/5xx ou ficaram expired. Customer reaction esperada: "🚨 minha
//      checkout caiu, preciso ver agora".
//   2. Card "Saúde do ecossistema" (em flow normal) listando:
//      - Stack detectado pela Vestigio (Stripe, Klaviyo, Cloudflare, etc.)
//      - Link direto pra status page de cada vendor com status pública
//      - Advisories curados (CVEs públicos) quando aplicáveis
//
// Self-hide quando não há dado em nenhuma das 3 fontes. Renderiza um
// status loading discreto enquanto fetcha.
// ──────────────────────────────────────────────

interface CriticalSurface {
	id: string;
	url: string;
	path: string;
	page_type: string;
	tier: string;
	status_code: number | null;
	freshness_state: string;
	freshness_age_seconds: number | null;
	title: string | null;
}

interface DetectedTech {
	technology_key: string;
	display_name: string;
	category: string;
}

interface VendorStatusLink {
	technology_key: string;
	display_name: string;
	category: string;
	status_page_url: string;
	status_page_label: string;
}

interface NotableAdvisory {
	id: string;
	publishedAt: string;
	severity: "critical" | "high" | "medium";
	summary: string;
	mitigation: string;
}

interface VendorAdvisory {
	technology_key: string;
	display_name: string;
	category: string;
	advisory_url: string;
	notable: NotableAdvisory[];
}

interface EcosystemData {
	critical_surfaces_down: CriticalSurface[];
	detected_stack: DetectedTech[];
	vendor_status_links: VendorStatusLink[];
	vendor_advisories: VendorAdvisory[];
}

interface Props {
	envId: string;
	month: string;
	/** When "banner-only" render só o alert top-of-plan (sem stack/advisories). */
	mode?: "full" | "banner-only" | "section-only";
}

const CATEGORY_LABEL_PT: Record<string, string> = {
	platform: "Plataforma",
	payment_provider: "Pagamento",
	analytics: "Analytics",
	tag_manager: "Tag manager",
	support_widget: "Suporte / Chat",
	consent_manager: "Cookie consent",
	error_tracking: "Error tracking",
	ab_testing: "A/B testing",
	cdn: "CDN",
	email_marketing: "Email marketing",
	other: "Outros",
};

const PAGE_TYPE_LABEL_PT: Record<string, string> = {
	checkout: "checkout",
	cart: "carrinho",
	login: "login",
	account: "conta",
	product: "produto",
	category: "categoria",
	landing: "landing",
	policy: "política",
	support: "suporte",
	blog: "blog",
	app: "app",
	other: "página",
};

export default function EcosystemSection({ envId, month, mode = "full" }: Props) {
	const [data, setData] = useState<EcosystemData | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		setLoading(true);
		fetch(
			`/api/library/strategy/${encodeURIComponent(month)}/ecosystem?envId=${encodeURIComponent(envId)}`,
			{ cache: "no-store" },
		)
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => setData(d))
			.catch(() => setData(null))
			.finally(() => setLoading(false));
	}, [envId, month]);

	if (loading || !data) return null;

	const showBanner = mode !== "section-only" && data.critical_surfaces_down.length > 0;
	const showSection =
		mode !== "banner-only" &&
		(data.detected_stack.length > 0 || data.vendor_advisories.length > 0);

	if (!showBanner && !showSection) return null;

	return (
		<>
			{showBanner && (
				<CriticalSurfacesBanner surfaces={data.critical_surfaces_down} />
			)}
			{showSection && (
				<EcosystemHealthCard
					stack={data.detected_stack}
					links={data.vendor_status_links}
					advisories={data.vendor_advisories}
				/>
			)}
		</>
	);
}

// ──────────────────────────────────────────────
// Banner — alert vermelho no topo do plano
// ──────────────────────────────────────────────

function CriticalSurfacesBanner({ surfaces }: { surfaces: CriticalSurface[] }) {
	const [expanded, setExpanded] = useState(false);
	const visible = expanded ? surfaces : surfaces.slice(0, 3);
	return (
		<motion.div
			initial={{ opacity: 0, y: -8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4 }}
			className="mb-6 overflow-hidden rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 sm:p-6"
		>
			<div className="mb-3 flex items-start gap-3">
				<svg className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" viewBox="0 0 20 20" fill="currentColor">
					<path
						fillRule="evenodd"
						d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
						clipRule="evenodd"
					/>
				</svg>
				<div className="flex-1">
					<div className="text-[14px] font-semibold text-rose-200">
						{surfaces.length === 1
							? "1 superfície crítica com problema"
							: `${surfaces.length} superfícies críticas com problema`}
					</div>
					<p className="mt-0.5 text-[12px] leading-relaxed text-rose-300/90">
						Detectado no último ciclo de auditoria. Vale revisar agora antes de qualquer outra ação do plano.
					</p>
				</div>
			</div>
			<div className="space-y-2">
				{visible.map((s) => (
					<div
						key={s.id}
						className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2"
					>
						<div className="flex items-center justify-between gap-3">
							<div className="min-w-0 flex-1">
								<div className="truncate font-mono text-[12px] text-rose-100">
									{s.path}
								</div>
								<div className="mt-0.5 text-[11px] text-rose-300/80">
									{PAGE_TYPE_LABEL_PT[s.page_type] ?? s.page_type}
									{s.tier === "primary" && " · superfície primária"}
								</div>
							</div>
							<div className="shrink-0 text-right">
								{s.status_code !== null && s.status_code >= 400 && (
									<span className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-rose-200">
										HTTP {s.status_code}
									</span>
								)}
								{s.freshness_state === "expired" && s.status_code === null && (
									<span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
										sem resposta
									</span>
								)}
							</div>
						</div>
					</div>
				))}
				{surfaces.length > 3 && !expanded && (
					<button
						type="button"
						onClick={() => setExpanded(true)}
						className="w-full rounded-md border border-rose-500/30 bg-transparent px-3 py-1.5 text-[11.5px] font-medium text-rose-300 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
					>
						Ver mais {surfaces.length - 3} ↓
					</button>
				)}
			</div>
		</motion.div>
	);
}

// ──────────────────────────────────────────────
// Health card — stack detectado + status pages + advisories
// ──────────────────────────────────────────────

function EcosystemHealthCard({
	stack,
	links,
	advisories,
}: {
	stack: DetectedTech[];
	links: VendorStatusLink[];
	advisories: VendorAdvisory[];
}) {
	const stackByCategory = groupByCategory(stack);
	const notableAdvisories = advisories.flatMap((a) =>
		a.notable.map((n) => ({ ...n, vendor: a.display_name, vendor_key: a.technology_key })),
	);
	const linksByKey = new Map(links.map((l) => [l.technology_key, l]));

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.18 }}
			className="mb-12"
		>
			<div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					Saúde do ecossistema
				</h2>
				<div className="text-[11px] text-content-faint">
					{stack.length} {stack.length === 1 ? "vendor detectado" : "vendors detectados"}
					{links.length > 0 && ` · ${links.length} com status page`}
				</div>
			</div>

			<div data-vsgp-card className="rounded-2xl border border-edge bg-surface-card p-5 sm:p-6">
				{/* Notable advisories — quando há CVE crítico em vendor detectado.
				    Renderiza primeiro porque é o mais urgente. */}
				{notableAdvisories.length > 0 && (
					<div className="mb-5 border-b border-edge/60 pb-5">
						<div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
							Vulnerabilidades a verificar
						</div>
						<div className="space-y-2">
							{notableAdvisories.slice(0, 4).map((n, idx) => (
								<div
									key={`${n.vendor_key}-${n.id}-${idx}`}
									className="rounded-xl border border-edge/40 bg-surface-inset/30 p-3"
								>
									<div className="mb-1 flex items-baseline justify-between gap-3">
										<div className="text-[12.5px] font-medium text-content">
											{n.vendor}
										</div>
										<span
											className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
												n.severity === "critical"
													? "bg-rose-500/20 text-rose-300"
													: n.severity === "high"
														? "bg-orange-500/20 text-orange-300"
														: "bg-amber-500/20 text-amber-300"
											}`}
										>
											{n.severity}
										</span>
									</div>
									<div className="text-[11.5px] leading-snug text-content-secondary">
										{n.summary}
									</div>
									<div className="mt-1.5 text-[11px] leading-snug text-content-muted">
										<span className="font-medium text-content-secondary">Mitigação:</span>{" "}
										{n.mitigation}
									</div>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Stack por categoria */}
				<div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
					Stack detectado
				</div>
				<div className="space-y-4">
					{Array.from(stackByCategory.entries()).map(([cat, items]) => (
						<div key={cat}>
							<div className="mb-1.5 text-[11px] font-semibold text-content-secondary">
								{CATEGORY_LABEL_PT[cat] ?? cat}
							</div>
							<div className="flex flex-wrap gap-1.5">
								{items.map((t) => {
									const link = linksByKey.get(t.technology_key);
									return link ? (
										<a
											key={t.technology_key}
											href={link.status_page_url}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-surface-inset px-3 py-1 text-[11.5px] text-content-secondary transition-colors hover:border-edge-focus hover:bg-surface-card-hover hover:text-content"
											title={link.status_page_label}
										>
											<span>{t.display_name}</span>
											<svg
												className="h-2.5 w-2.5 opacity-60"
												viewBox="0 0 10 10"
												fill="none"
												stroke="currentColor"
												strokeWidth="1.5"
											>
												<path strokeLinecap="round" d="M3 1.5h5.5V7M8.5 1.5L2.5 7.5" />
											</svg>
										</a>
									) : (
										<span
											key={t.technology_key}
											className="inline-flex items-center rounded-full border border-edge bg-surface-inset px-3 py-1 text-[11.5px] text-content-muted"
										>
											{t.display_name}
										</span>
									);
								})}
							</div>
						</div>
					))}
				</div>

				{/* Caveat de produto */}
				<div className="mt-5 border-t border-edge/40 pt-3 text-[11px] leading-relaxed text-content-muted">
					Vendors detectados pelo crawl da Vestigio no último ciclo. Status pages externas são links pra checagem manual — Vestigio não polla automaticamente (ainda).
				</div>
			</div>
		</motion.section>
	);
}

function groupByCategory(stack: DetectedTech[]): Map<string, DetectedTech[]> {
	const out = new Map<string, DetectedTech[]>();
	const order = ["payment_provider", "platform", "analytics", "tag_manager", "email_marketing", "support_widget", "cdn", "error_tracking", "ab_testing", "consent_manager", "other"];
	for (const t of stack) {
		const arr = out.get(t.category) ?? [];
		arr.push(t);
		out.set(t.category, arr);
	}
	// Stable order
	const sorted = new Map<string, DetectedTech[]>();
	for (const cat of order) {
		if (out.has(cat)) sorted.set(cat, out.get(cat)!);
	}
	// Plus any unexpected categories
	for (const [cat, arr] of out.entries()) {
		if (!sorted.has(cat)) sorted.set(cat, arr);
	}
	return sorted;
}
