"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/console/PageHeader";
import { useActiveEnvId } from "@/components/app/McpDataProvider";

// ──────────────────────────────────────────────
// Extrato de tráfego pago. The first v2 surface.
//
// Reads /api/traffic-statement, which groups months of already
// collected session data by campaign for the first time.
//
// Rendered as a statement, not a dashboard: one page, ordered by how
// many paid arrivals each campaign wasted, with the account's own
// median as the comparison. Twenty reviewers of the previous product
// scored its clarity at 4.8 and one of them, the least technical, gave
// it a 2 and said it made her feel stupid. So: no JSON, no charts, no
// estimates. Counts and one verdict per line.
// ──────────────────────────────────────────────

interface CampaignRow {
	name: string;
	platformId: string | null;
	source: string;
	sessions: number;
	arrivedBlind: number;
	arrivedBlindPct: number;
	medianDurationS: number;
	reachedAction: number;
	reachedActionPct: number;
	completed: number;
	topLandingPath: string | null;
	verdict: "desperdicio" | "observar" | "entregando";
	pointsAboveAccount: number;
	excessBlind: number;
	pauseCostActions: number;
	pauseCostPurchases: number;
	previousBlindPct: number | null;
	deltaPoints: number | null;
	byDevice: {
		mobile: { sessions: number; blind: number; blindPct: number } | null;
		desktop: { sessions: number; blind: number; blindPct: number } | null;
	};
	spendBrl: number | null;
	spendWastedBrl: number | null;
}

interface Statement {
	windowStart: string;
	windowEnd: string;
	attributedSessions: number;
	measuredSessions: number;
	attributionCoveragePct: number;
	accountMedianBlindPct: number;
	campaigns: CampaignRow[];
	totals: {
		campaignsAboveFloor: number;
		arrivedBlind: number;
		sessions: number;
		spendBrl: number | null;
		spendWastedBrl: number | null;
	};
	belowFloor: { campaigns: number; sessions: number };
	control: { sessions: number; blind: number; blindPct: number } | null;
}

const VERDICT: Record<CampaignRow["verdict"], { label: string; cls: string }> = {
	desperdicio: {
		label: "desperdício",
		cls: "bg-red-500/[0.08] text-red-700 dark:text-red-400 border-red-500/20",
	},
	observar: {
		label: "observar",
		cls: "bg-amber-500/[0.08] text-amber-700 dark:text-amber-400 border-amber-500/20",
	},
	entregando: {
		label: "entregando",
		cls: "bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
	},
};

function n(v: number): string {
	return v.toLocaleString("pt-BR");
}

function brl(v: number): string {
	return v.toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
		maximumFractionDigits: 0,
	});
}

export default function TrafficStatementPage() {
	const [data, setData] = useState<Statement | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Keyed on the active environment, not on []. Switching environments
	// sets a cookie and calls router.refresh(), which re-renders the
	// server layout and delivers a new envId here; an effect with an
	// empty dependency list would keep showing the previous store's
	// statement until a manual reload.
	const envId = useActiveEnvId();

	useEffect(() => {
		let alive = true;
		setLoading(true);
		setError(null);
		fetch("/api/traffic-statement")
			.then((r) => r.json())
			.then((body) => {
				if (!alive) return;
				if (body.statement) setData(body.statement);
				else setError(body.reason ?? "sem dados");
			})
			.catch(() => alive && setError("falha ao carregar"))
			.finally(() => alive && setLoading(false));
		return () => {
			alive = false;
		};
	}, [envId]);

	if (loading) {
		// Shimmer, never a spinner. House rule.
		return (
			<div className="p-6">
				<PageHeader title="Extrato de tráfego pago" />
				<div className="space-y-2">
					{Array.from({ length: 6 }).map((_, i) => (
						<div key={i} className="h-14 animate-pulse rounded-xl bg-surface-inset" />
					))}
				</div>
			</div>
		);
	}

	if (error || !data) {
		return (
			<div className="p-6">
				<PageHeader title="Extrato de tráfego pago" />
				<div className="rounded-2xl border border-edge bg-surface-card p-6 text-[13.5px] text-content-secondary">
					Ainda não há sessões medidas com campanha identificada nesta janela. O extrato
					aparece quando o pixel registra tráfego vindo de anúncio.
				</div>
			</div>
		);
	}

	const wasted = data.totals.arrivedBlind;
	// 31 of 47 campaigns came back "entregando" on the real account.
	// Listing them is noise on a page that has to read in 30 seconds, so
	// they collapse into one line and the table carries only what needs
	// a decision.
	const needsDecision = data.campaigns.filter((c) => c.verdict !== "entregando");
	const wasteRows = data.campaigns.filter((c) => c.verdict === "desperdicio");
	const wasteSessions = wasteRows.reduce((n, c) => n + c.sessions, 0);
	const pausePurchases = wasteRows.reduce((n, c) => n + c.pauseCostPurchases, 0);
	const totalPurchases = data.campaigns.reduce((n, c) => n + c.pauseCostPurchases, 0);
	const fine = data.campaigns.length - needsDecision.length;
	const hasSpend = data.totals.spendBrl !== null;

	// The ad-or-page question, answered by the data rather than by a
	// separate feature: when several wasteful campaigns land on the SAME
	// page, the page is implicated. When one wastes alone at 5 seconds,
	// the ad is. On the live account three of the six worst campaigns
	// land on the same product page.
	const byLanding = new Map<string, CampaignRow[]>();
	for (const c of needsDecision) {
		if (!c.topLandingPath) continue;
		const list = byLanding.get(c.topLandingPath) ?? [];
		list.push(c);
		byLanding.set(c.topLandingPath, list);
	}
	const sharedPages = [...byLanding.entries()]
		.filter(([, list]) => list.length >= 2)
		.sort((a, b) => b[1].length - a[1].length);

	return (
		<div className="p-6">
			<PageHeader
				title="Extrato de tráfego pago"
				subtitle={`${data.windowStart} a ${data.windowEnd}`}
				tooltip={
					"Uma sessão conta como 'chegou e não viu nada' quando o marco de 25% de " +
					"scroll nunca disparou. Sessões com menos de 3 eventos são descartadas. " +
					"Tudo nesta página é contagem direta, não estimativa."
				}
			/>

			{/* Leads with what is actionable, not with the dramatic total.
			    The previous version opened with "21.389 chegaram e foram
			    embora sem ver nada", which is true and implies a problem
			    this page cannot yet establish: without a market
			    comparison, a high no-scroll rate on cold paid traffic may
			    be ordinary advertising physics. Stating the outliers
			    first says only what the data supports. */}
			<div className="mb-6 rounded-2xl border border-edge bg-surface-card px-5 py-4">
				<p className="text-[15px] leading-relaxed text-content">
					{needsDecision.length > 0 ? (
						<>
							<strong>{wasteRows.length}</strong> das{" "}
							<strong>{data.totals.campaignsAboveFloor}</strong> campanhas desperdiçam acima
							do normal desta conta, e somam{" "}
							<strong>{n(wasteSessions)}</strong> acessos comprados.
						</>
					) : (
						<>
							Nenhuma das {data.totals.campaignsAboveFloor} campanhas está fora do padrão
							desta conta nesta janela.
						</>
					)}
				</p>
				<p className="mt-2 text-[12.5px] text-content-muted">
					Nesta conta, {data.accountMedianBlindPct}% dos acessos pagos não passam da primeira
					tela. Esse número descreve o seu padrão, não um problema: ainda não há comparação
					de mercado. A comparação que existe está abaixo.
				</p>
			</div>

			{data.control && (
				<div className="mb-6 rounded-2xl border border-edge bg-surface-inset/40 px-5 py-4">
					<div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-content-muted">
						A sua própria base de comparação
					</div>
					<p className="text-[14px] leading-relaxed text-content">
						Quem chega ao site <strong>sem anúncio</strong> não passa da primeira tela em{" "}
						<strong>{data.control.blindPct}%</strong> das {n(data.control.sessions)} visitas.
						Quem você <strong>pagou</strong>, em{" "}
						<strong>{data.accountMedianBlindPct}%</strong>.
					</p>
					<p className="mt-2 text-[12.5px] text-content-muted">
						Mesmo site, mesmas páginas, mesmo período. Parte da diferença é esperada, porque
						quem chega direto costuma já conhecer a marca. O que isso estabelece é que as
						suas páginas conseguem segurar atenção, e é por isso que dá para separar
						problema de anúncio de problema de página.
					</p>
				</div>
			)}

			<div className="overflow-x-auto rounded-2xl border border-edge">
				<table className="w-full min-w-[760px] border-collapse text-[13px]">
					<thead>
						<tr className="bg-surface-inset text-left text-[11px] uppercase tracking-[0.08em] text-content-muted">
							<th className="px-4 py-3 font-semibold">campanha</th>
							<th className="px-3 py-3 text-right font-semibold">comprou</th>
							<th className="px-3 py-3 text-right font-semibold">não viu nada</th>
							<th className="px-3 py-3 text-right font-semibold">acima do normal</th>
							<th className="px-3 py-3 text-right font-semibold">vs janela anterior</th>
							<th className="px-3 py-3 text-right font-semibold">tempo</th>
							<th className="px-3 py-3 text-right font-semibold">chegou à ação</th>
							<th className="px-3 py-3 text-right font-semibold">pausar custa</th>
							{hasSpend && (
								<th className="px-3 py-3 text-right font-semibold">gasto perdido</th>
							)}
							<th className="px-3 py-3 font-semibold">veredito</th>
						</tr>
					</thead>
					<tbody>
						{needsDecision.map((c) => (
							<tr
								key={c.platformId ?? c.name}
								className="border-t border-edge align-top hover:bg-surface-card-hover"
							>
								<td className="px-4 py-3">
									<div className="max-w-[360px] text-content">{c.name}</div>
									<div className="mt-0.5 font-mono text-[11px] text-content-faint">
										{c.source}
										{c.topLandingPath ? ` cai em ${c.topLandingPath}` : ""}
									</div>
									{c.byDevice.mobile && c.byDevice.desktop && (
										<div className="mt-1 text-[11px] text-content-muted">
											celular {c.byDevice.mobile.blindPct}%, computador{" "}
											{c.byDevice.desktop.blindPct}%
										</div>
									)}
								</td>
								<td className="px-3 py-3 text-right tabular-nums text-content-secondary">
									{n(c.sessions)}
								</td>
								<td className="px-3 py-3 text-right tabular-nums">
									<div className="text-content">{n(c.arrivedBlind)}</div>
									<div className="text-[11px] text-content-muted">{c.arrivedBlindPct}%</div>
								</td>
								<td className="px-3 py-3 text-right tabular-nums">
									<div className="text-content">{n(c.excessBlind)}</div>
									<div className="text-[11px] text-content-muted">
										{c.pointsAboveAccount > 0 ? "+" : ""}
										{c.pointsAboveAccount}pt
									</div>
								</td>
								<td className="px-3 py-3 text-right tabular-nums">
									{c.deltaPoints === null ? (
										<span className="text-[11px] text-content-faint">nova</span>
									) : (
										<>
											<div
												className={
													c.deltaPoints > 2
														? "text-red-700 dark:text-red-400"
														: c.deltaPoints < -2
															? "text-emerald-700 dark:text-emerald-400"
															: "text-content-secondary"
												}
											>
												{c.deltaPoints > 0 ? "+" : ""}
												{c.deltaPoints}pt
											</div>
											<div className="text-[11px] text-content-muted">
												era {c.previousBlindPct}%
											</div>
										</>
									)}
								</td>
								<td className="px-3 py-3 text-right tabular-nums text-content-secondary">
									{c.medianDurationS}s
								</td>
								<td className="px-3 py-3 text-right tabular-nums">
									<div className="text-content">{n(c.reachedAction)}</div>
									<div className="text-[11px] text-content-muted">{c.reachedActionPct}%</div>
								</td>
								<td className="px-3 py-3 text-right tabular-nums">
									<div className="text-content">{n(c.pauseCostPurchases)}</div>
									<div className="text-[11px] text-content-muted">
										{c.pauseCostPurchases === 1 ? "compra" : "compras"}
									</div>
								</td>
								{hasSpend && (
									<td className="px-3 py-3 text-right tabular-nums">
										<div className="text-content">
											{c.spendWastedBrl === null ? "sem dado" : brl(c.spendWastedBrl)}
										</div>
										<div className="text-[11px] text-content-muted">
											{c.spendBrl === null ? "campanha nova" : `de ${brl(c.spendBrl)}`}
										</div>
									</td>
								)}
								<td className="px-3 py-3">
									<span
										className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${VERDICT[c.verdict].cls}`}
									>
										{VERDICT[c.verdict].label}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{wasteRows.length > 0 && (
				<div className="mt-6 rounded-2xl border border-edge bg-surface-card px-5 py-4">
					<div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-content-muted">
						A troca, se você pausar as {wasteRows.length}
					</div>
					<p className="text-[14px] leading-relaxed text-content">
						Você deixa de comprar <strong>{n(wasteSessions)}</strong> acessos, dos quais{" "}
						<strong>{n(wasteRows.reduce((x, c) => x + c.arrivedBlind, 0))}</strong> não veem
						nada hoje. E perde <strong>{n(pausePurchases)}</strong>{" "}
						{pausePurchases === 1 ? "compra" : "compras"}
						{totalPurchases > 0 && (
							<> de {n(totalPurchases)}, ou {((100 * pausePurchases) / totalPurchases).toFixed(1)}% do total</>
						)}
						.
					</p>
					{hasSpend && data.totals.spendWastedBrl !== null && (
						<p className="mt-2 text-[14px] leading-relaxed text-content">
							No período, <strong>{brl(data.totals.spendWastedBrl)}</strong> do que você
							pagou comprou acesso que não viu nada.
						</p>
					)}
					<p className="mt-2 text-[12.5px] text-content-muted">
						A recomendação desta página é pausar, então o custo de pausar fica junto dela.
						Se a troca não te parecer boa, não pause: o número está aí para você decidir,
						não para te convencer.
					</p>
				</div>
			)}

			{sharedPages.length > 0 && (
				<div className="mt-6 rounded-2xl border border-edge bg-surface-card px-5 py-4">
					<div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-content-muted">
						Anúncio ou página
					</div>
					{/* One sentence for the rule, then the list. Printing the
					    explanation once per path repeated the same sentence
					    verbatim three times, which three reviewers read as
					    template rather than analysis. */}
					<p className="mb-2 text-[13.5px] leading-relaxed text-content">
						Quando campanhas diferentes morrem no mesmo lugar, o problema tende a ser a
						página, não os anúncios. Acontece{" "}
						{sharedPages.length === 1 ? "em uma página" : `em ${sharedPages.length} páginas`}:
					</p>
					<ul className="mb-2 space-y-1">
						{sharedPages.map(([path, list]) => (
							<li key={path} className="text-[13px] text-content-secondary">
								<span className="font-mono text-[12px]">{path}</span>, com{" "}
								<strong>{list.length} campanhas</strong> acima do normal
							</li>
						))}
					</ul>
					{needsDecision
						.filter(
							(c) =>
								c.medianDurationS <= 8 &&
								c.arrivedBlindPct >= 90 &&
								(!c.topLandingPath || (byLanding.get(c.topLandingPath)?.length ?? 0) < 2),
						)
						.map((c) => (
							<p key={c.name} className="mb-2 text-[13.5px] leading-relaxed text-content">
								<span className="font-mono text-[12px]">{c.name.slice(0, 48)}</span> perde{" "}
								{c.arrivedBlindPct}% em {c.medianDurationS} segundos e é a única nessa
								página. Aqui o problema tende a ser o anúncio.
							</p>
						))}
				</div>
			)}

			{fine > 0 && (
				<p className="mt-4 text-[12.5px] text-content-secondary">
					Outras {fine} campanhas estão dentro do normal desta conta e não aparecem acima.
				</p>
			)}

			<p className="mt-4 text-[12px] text-content-muted">
				{data.attributionCoveragePct}% das {n(data.measuredSessions)} sessões medidas trazem
				campanha identificada.
				{data.belowFloor.campaigns > 0 && (
					<>
						{" "}
						{data.belowFloor.campaigns} campanhas com menos de 300 sessões ficaram fora do
						extrato, porque abaixo disso a taxa é ruído. Elas somam{" "}
						{n(data.belowFloor.sessions)} acessos, ou{" "}
						{Math.round((data.belowFloor.sessions / data.attributedSessions) * 100)}% do
						tráfego com campanha identificada.
					</>
				)}
			</p>
		</div>
	);
}
