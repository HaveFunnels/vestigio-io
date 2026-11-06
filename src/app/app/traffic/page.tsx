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
	displayName: string;
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
	verdict: "cortar" | "corrigir" | "observar" | "entregando" | "medicao_suspeita";
	pointsAboveAccount: number;
	excessBlind: number;
	pauseCostActions: number;
	pauseCostPurchases: number;
	previousBlindPct: number | null;
	deltaPoints: number | null;
	mobileSharePct: number;
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
		purchases: number;
		spendBrl: number | null;
		spendWastedBrl: number | null;
	};
	belowFloor: { campaigns: number; sessions: number };
	landingPages: {
		path: string;
		sessions: number;
		arrivedBlind: number;
		arrivedBlindPct: number;
		campaigns: number;
		purchases: number;
	}[];
	control: {
		sessions: number;
		blind: number;
		blindPct: number;
		excludedPaidMarker: number;
	} | null;
}

const VERDICT: Record<CampaignRow["verdict"], { label: string; cls: string }> = {
	// Labels say what to do. "desperdício" was a money word on a page
	// that cannot price anything yet, and it contradicted the purchases
	// column on its own rows.
	cortar: {
		label: "cortar",
		cls: "bg-red-500/[0.08] text-red-700 dark:text-red-400 border-red-500/20",
	},
	corrigir: {
		label: "corrigir, não cortar",
		cls: "bg-amber-500/[0.10] text-amber-700 dark:text-amber-400 border-amber-500/25",
	},
	medicao_suspeita: {
		label: "medição suspeita",
		cls: "bg-violet-500/[0.08] text-violet-700 dark:text-violet-300 border-violet-500/20",
	},
	observar: {
		label: "observar",
		cls: "bg-surface-inset text-content-secondary border-edge",
	},
	entregando: {
		label: "entregando",
		cls: "bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
	},
};


function n(v: number): string {
	return v.toLocaleString("pt-BR");
}

/** A percentage in pt-BR, which uses a comma. Every rate on this page
 *  was printing "36.1%", and the reviewer most qualified to judge
 *  presentation said she audits a digital product the way she audits a
 *  drawing, by the consistency of its details. A decimal point in a
 *  Brazilian document is one of those details. */
function pct(v: number): string {
	return v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
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

	// 27 of 46 campaigns came back "entregando" on the real account and
	// another 14 "observar". Nine reviewers said the same thing about
	// those: "observar não é instrução", and one who reads bank
	// statements for a living put it best, that he tolerates density
	// because every line of a statement is an entry, and observar is
	// not an entry. So the table carries only what asks for a decision.
	const needsDecision = data.campaigns.filter(
		(c) => c.verdict === "cortar" || c.verdict === "corrigir" || c.verdict === "medicao_suspeita",
	);
	const cutRows = data.campaigns.filter((c) => c.verdict === "cortar");
	const fixRows = data.campaigns.filter((c) => c.verdict === "corrigir");
	const cutSessions = cutRows.reduce((n, c) => n + c.sessions, 0);
	const cutPurchases = cutRows.reduce((n, c) => n + c.pauseCostPurchases, 0);
	const watching = data.campaigns.filter((c) => c.verdict === "observar").length;
	const fine = data.campaigns.filter((c) => c.verdict === "entregando").length;
	const hasSpend = data.totals.spendBrl !== null;
	const [showMethod, setShowMethod] = useState(false);

	// The page view, promoted from a footnote to the lead. It is the
	// only view that works for an account whose campaigns are each too
	// small to judge, and on the live account it says something the
	// campaign table cannot: one product page runs 36% across 155
	// campaigns while another runs 9%.
	const pages = data.landingPages;
	const worstPage = pages[0] ?? null;

	return (
		<div className="p-6">
			<PageHeader
				title="Extrato de tráfego pago"
				subtitle={`${data.windowStart} a ${data.windowEnd}`}
			/>

			{/* Spend is the single most requested thing in the review, 19
			    of 20, and its absence used to be a parenthesis in the
			    last line. Three reviewers independently said the same
			    thing: buried there, it does not weaken the verdict, it
			    dismantles it. So it leads, and it asks. */}
			{!hasSpend && (
				<div className="mb-5 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-5 py-4">
					<p className="text-[13.5px] leading-relaxed text-content">
						<strong>Este extrato conta acessos, não reais.</strong> Conecte a conta de
						anúncio e cada linha passa a mostrar quanto custou e quanto do custo comprou
						acesso que não fez nada.
					</p>
					<a
						href="/app/integrations"
						className="mt-2 inline-flex rounded-lg border border-edge bg-surface-card px-3 py-1.5 text-[12.5px] font-medium text-content hover:bg-surface-card-hover"
					>
						Conectar conta de anúncio
					</a>
				</div>
			)}

			<div className="mb-6 rounded-2xl border border-edge bg-surface-card px-5 py-4">
				<p className="text-[15px] leading-relaxed text-content">
					{worstPage ? (
						<>
							<strong>{pct(worstPage.arrivedBlindPct)}%</strong> de quem você levou para{" "}
							<span className="font-mono text-[13px]">{worstPage.path}</span> não fez
							absolutamente nada: nem rolou, nem clicou, nem viu um botão. São{" "}
							<strong>{n(worstPage.arrivedBlind)}</strong> acessos comprados, vindos de{" "}
							{worstPage.campaigns} campanhas diferentes.
						</>
					) : (
						<>
							Nenhuma página de destino tem volume suficiente nesta janela para medir com
							confiança.
						</>
					)}
				</p>
				<p className="mt-2 text-[12.5px] text-content-muted">
					Na conta inteira, {pct(data.accountMedianBlindPct)}% dos acessos pagos não fazem nada.
					Quem chega sem anúncio:{" "}
					{data.control ? `${pct(data.control.blindPct)}%` : "sem base para comparar"}.
					<button
						type="button"
						onClick={() => setShowMethod((v) => !v)}
						className="ml-1 underline decoration-dotted underline-offset-2 hover:text-content"
					>
						{showMethod ? "esconder como isso é contado" : "como isso é contado"}
					</button>
				</p>
				{showMethod && (
					// Four definitions were load-bearing and undeclared, and
					// the reviewer who audits statements for a living
					// returned the document over exactly that: "demonstrativo
					// que não declara o critério de cálculo da própria coluna
					// é demonstrativo que eu devolvo".
					<div className="mt-3 space-y-1.5 border-t border-edge pt-3 text-[12px] leading-relaxed text-content-muted">
						<p>
							<strong className="text-content-secondary">não fez nada:</strong> não passou
							de 25% da página, não teve nenhum botão entrando na tela, não começou
							formulário, não abriu suporte nem WhatsApp, não clicou, não voltou e não
							abriu uma segunda página. Qualquer um desses sinais tira a sessão da conta.
						</p>
						<p>
							<strong className="text-content-secondary">acima do padrão:</strong> a taxa
							da campanha menos a mediana da conta ({pct(data.accountMedianBlindPct)}%),
							aplicada sobre os acessos dela. Em acessos, não em pontos.
						</p>
						<p>
							<strong className="text-content-secondary">chegou à ação:</strong> a sessão
							alcançou o que conta como conversão neste negócio, que é diferente de ter
							comprado. A coluna de compras é a venda concluída.
						</p>
						<p>
							<strong className="text-content-secondary">cortar ou corrigir:</strong> uma
							campanha precisa estar acima de 45% em termos absolutos E 10 pontos acima da
							mediana da conta. Se ainda produz compra, o veredito é corrigir, nunca
							cortar. Conta saudável sai daqui sem nenhuma linha, e isso é o
							comportamento correto.
						</p>
						<p>
							<strong className="text-content-secondary">o que não é medido:</strong>{" "}
							ligação telefônica, venda por DM e conversa que começa fora do site. Se o
							seu negócio fecha por telefone, este extrato mede a parte menor dele.
						</p>
						<p>
							Sessões com menos de 3 eventos são descartadas. Campanha com menos de 300
							acessos não entra, porque abaixo disso a taxa é ruído. Tudo aqui é contagem
							direta, não estimativa.
						</p>
					</div>
				)}
			</div>

			{/* The page view. Promoted because the campaign floor excludes
			    the small advertiser and the fast tester alike, and both
			    ends of the review proposed this same way out. */}
			{pages.length > 0 && (
				<div className="mb-6 overflow-hidden rounded-2xl border border-edge">
					<div className="border-b border-edge bg-surface-inset px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-content-muted">
						Por página de destino
					</div>
					<table className="w-full border-collapse text-[13px]">
						<tbody>
							{pages.map((pg) => (
								<tr key={pg.path} className="border-t border-edge first:border-t-0">
									<td className="px-4 py-2.5">
										<div className="font-mono text-[12px] text-content">{pg.path}</div>
										<div className="text-[11px] text-content-muted">
											{pg.campaigns} campanhas, {n(pg.purchases)}{" "}
											{pg.purchases === 1 ? "compra" : "compras"}
										</div>
									</td>
									<td className="w-[38%] px-4 py-2.5">
										<div className="flex items-center gap-2">
											<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-inset">
												<div
													className={`h-full rounded-full ${
														pg.arrivedBlindPct >= 30 ? "bg-red-500/60" : "bg-emerald-500/50"
													}`}
													style={{ width: `${Math.min(100, pg.arrivedBlindPct)}%` }}
												/>
											</div>
											<div className="w-[108px] text-right tabular-nums text-[12.5px] text-content">
												<strong>{pct(pg.arrivedBlindPct)}%</strong>{" "}
												<span className="text-content-muted">
													de {n(pg.sessions)}
												</span>
											</div>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{data.control && (
				<div className="mb-6 rounded-2xl border border-edge bg-surface-inset/40 px-5 py-4">
					<div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-content-muted">
						A sua própria base de comparação
					</div>
					<p className="text-[14px] leading-relaxed text-content">
						Quem chega ao site <strong>sem anúncio</strong> não faz nada em{" "}
						<strong>{pct(data.control.blindPct)}%</strong> das {n(data.control.sessions)} visitas.
						Quem você <strong>pagou</strong>, em{" "}
						<strong>{pct(data.accountMedianBlindPct)}%</strong>.
					</p>
					<p className="mt-2 text-[12.5px] text-content-muted">
						Mesmo site, mesmas páginas, mesmo período. Parte da diferença é esperada, porque
						quem chega direto costuma já conhecer a marca. O que isso estabelece é que as
						suas páginas conseguem segurar atenção, e é por isso que dá para separar
						problema de anúncio de problema de página.
						{data.control.excludedPaidMarker > 0 && (
							<>
								{" "}
								Outras {n(data.control.excludedPaidMarker)} visitas chegaram sem nome de
								campanha mas com marca de clique pago, e ficaram fora desta comparação para
								não contaminá-la.
							</>
						)}
					</p>
				</div>
			)}

			{needsDecision.length > 0 ? (
				<div className="overflow-x-auto rounded-2xl border border-edge">
					{/* Was nine columns, which ten reviewers said is
					    unusable on the phone they all read this on. The
					    secondary numbers moved into the campaign cell. */}
					<table className="w-full min-w-[620px] border-collapse text-[13px]">
						<thead>
							<tr className="bg-surface-inset text-left text-[11px] uppercase tracking-[0.08em] text-content-muted">
								<th className="px-4 py-3 font-semibold">campanha</th>
								<th className="px-3 py-3 text-right font-semibold">não fez nada</th>
								<th className="px-3 py-3 text-right font-semibold">acima do padrão</th>
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
										<div className="max-w-[300px] text-content" title={c.name}>
											{c.displayName}
										</div>
										<div className="mt-0.5 font-mono text-[11px] text-content-faint">
											{c.source}
											{c.topLandingPath ? ` cai em ${c.topLandingPath}` : ""}
										</div>
										{/* The month-over-month move, back in the row after
										    the column was cut for width. The replicability
										    auditor called this the one thing nobody
										    reproduces in a weekend with GA4, because it
										    needs 30 days of the event already existing, so
										    it is the last thing that should disappear. It
										    reads "sem base anterior" rather than "nova":
										    three of these campaigns are dated 29/08 and
										    calling an August campaign new was simply the
										    wrong word. */}
										{c.deltaPoints !== null ? (
											<div
												className={`mt-1 text-[11px] ${
													c.deltaPoints > 2
														? "text-red-700 dark:text-red-400"
														: c.deltaPoints < -2
															? "text-emerald-700 dark:text-emerald-400"
															: "text-content-muted"
												}`}
											>
												era {pct(c.previousBlindPct ?? 0)}% na janela anterior, agora{" "}
												{pct(c.arrivedBlindPct)}%
												{c.deltaPoints > 2 && ", piorou"}
												{c.deltaPoints < -2 && ", melhorou"}
											</div>
										) : (
											<div className="mt-1 text-[11px] text-content-faint">
												sem base anterior para comparar
											</div>
										)}
										<div className="mt-1 text-[11px] text-content-muted">
											{n(c.sessions)} acessos, {c.medianDurationS}s de mediana,{" "}
											{/* Device on every row, not one of fifteen. When one
											    side is too thin to state a rate, the traffic mix
											    still says something true. */}
											{c.byDevice.mobile && c.byDevice.desktop ? (
												<>
													celular {pct(c.byDevice.mobile.blindPct)}%, computador{" "}
													{pct(c.byDevice.desktop.blindPct)}%
												</>
											) : (
												<>{pct(c.mobileSharePct)}% celular</>
											)}
										</div>
									</td>
									<td className="px-3 py-3 text-right tabular-nums">
										<div className="text-content">{n(c.arrivedBlind)}</div>
										<div className="text-[11px] text-content-muted">
											{pct(c.arrivedBlindPct)}%
										</div>
									</td>
									<td className="px-3 py-3 text-right tabular-nums">
										<div className="text-content">{n(c.excessBlind)}</div>
										<div className="text-[11px] text-content-muted">acessos</div>
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
			) : (
				<div className="rounded-2xl border border-edge bg-surface-card px-5 py-4 text-[13.5px] leading-relaxed text-content">
					Nenhuma campanha desta janela está ao mesmo tempo acima de 45% de acessos que não
					fazem nada e 10 pontos acima da sua mediana. Nada a cortar nem a corrigir no nível
					da campanha.
				</div>
			)}

			{fixRows.length > 0 && (
				<div className="mt-6 rounded-2xl border border-edge bg-surface-card px-5 py-4">
					<div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-content-muted">
						Por que corrigir e não cortar
					</div>
					<p className="text-[14px] leading-relaxed text-content">
						{fixRows.length === 1 ? "Essa campanha" : `Essas ${fixRows.length} campanhas`}{" "}
						perde muita gente na entrada, mas ainda{" "}
						{fixRows.length === 1 ? "produz" : "produzem"}{" "}
						<strong>
							{n(fixRows.reduce((x, c) => x + c.pauseCostPurchases, 0))} compras
						</strong>{" "}
						de {n(data.totals.purchases)} do total das {data.totals.campaignsAboveFloor}{" "}
						campanhas medidas. Pausar resolve o desperdício e joga a venda fora junto. O
						alvo é a página onde elas caem.
					</p>
				</div>
			)}

			{cutRows.length > 0 && (
				<div className="mt-6 rounded-2xl border border-edge bg-surface-card px-5 py-4">
					<div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-content-muted">
						A troca, se você cortar {cutRows.length === 1 ? "essa" : `essas ${cutRows.length}`}
					</div>
					<p className="text-[14px] leading-relaxed text-content">
						Você deixa de comprar <strong>{n(cutSessions)}</strong> acessos, dos quais{" "}
						<strong>{n(cutRows.reduce((x, c) => x + c.arrivedBlind, 0))}</strong> não fazem
						nada hoje. E perde <strong>{n(cutPurchases)}</strong>{" "}
						{cutPurchases === 1 ? "compra" : "compras"} de {n(data.totals.purchases)}
						{data.totals.purchases > 0 && (
							<> , ou {pct(Math.round((1000 * cutPurchases) / data.totals.purchases) / 10)}% do total</>
						)}
						.
					</p>
					{hasSpend && data.totals.spendWastedBrl !== null && (
						<p className="mt-2 text-[14px] leading-relaxed text-content">
							No período, <strong>{brl(data.totals.spendWastedBrl)}</strong> do que você
							pagou comprou acesso que não fez nada.
						</p>
					)}
					<p className="mt-2 text-[12.5px] text-content-muted">
						A recomendação desta página é cortar, então o custo de cortar fica junto dela.
						Se a troca não te parecer boa, não corte: o número está aí para você decidir,
						não para te convencer.
					</p>
				</div>
			)}

			<p className="mt-5 text-[12.5px] leading-relaxed text-content-secondary">
				{watching > 0 && (
					<>
						Outras {watching} campanhas estão acima do seu padrão mas abaixo de 45%, então
						não pedem decisão agora.{" "}
					</>
				)}
				{fine > 0 && <>{fine} estão dentro do padrão da conta. </>}
			</p>

			<p className="mt-2 text-[12px] leading-relaxed text-content-muted">
				{pct(data.attributionCoveragePct)}% das {n(data.measuredSessions)} sessões medidas trazem
				campanha identificada.
				{data.belowFloor.campaigns > 0 && (
					<>
						{" "}
						{data.belowFloor.campaigns} campanhas com menos de 300 acessos ficaram fora da
						tabela de campanha, porque abaixo disso a taxa é ruído. Elas somam{" "}
						{n(data.belowFloor.sessions)} acessos, ou{" "}
						{pct(Math.round((data.belowFloor.sessions / data.attributedSessions) * 100))}% do
						tráfego com campanha identificada, e aparecem somadas na visão por página de
						destino acima, que é onde conta pequena consegue ser medida.
					</>
				)}
			</p>
		</div>
	);
}
