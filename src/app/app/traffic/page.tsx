"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/console/PageHeader";
import CampaignPill from "@/components/app/CampaignPill";
import MetricInfo from "@/components/app/MetricInfo";
import OpenTheCount from "@/components/app/OpenTheCount";
import Scoreboard, { type ScoreboardData } from "@/components/app/Scoreboard";
import GroundTruthColumn, { type StitchData } from "@/components/app/GroundTruthColumn";
import Sparkline from "@/components/app/Sparkline";
import {
	IconBetter,
	IconChange,
	IconCheck,
	IconCompare,
	IconFix,
	IconMail,
	IconMessage,
	IconPage,
	IconPhone,
	IconSearch,
	IconVerdict,
	IconWhatsapp,
	IconWorse,
} from "@/components/app/traffic-icons";
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
	verdict: "cortar" | "corrigir" | "observar" | "entregando" | "medicao_suspeita" | "parada";
	daysSinceLastSession: number | null;
	activeDays: number;
	cutUnsafeReason: string | null;
	falseZeroRiskPct: number;
	pointsAboveAccount: number;
	marginPoints: number;
	blindPctLow: number;
	excessBlind: number;
	pauseCostActions: number;
	pauseCostPurchases: number;
	pauseCostUnit: "compras" | "contatos";
	pauseCost: number;
	contactSessions: number;
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
	accountBlindPct: number;
	notLoaded: { sessions: number; withPaidMarker: number; sharePct: number };
	conversionSuspect: {
		blocked: boolean;
		reason: string | null;
		purchases: number;
		checkoutReached: number;
	};
	accountVerdict: {
		blindPctLow: number;
		marginPoints: number;
		controlPct: number | null;
		gapPoints: number | null;
		campaignsJudged: number;
	} | null;
	thresholds: {
		absoluteBlindPct: number;
		pointsAboveMedian: number;
		implausibleBlindPct: number;
		minSessions: number;
		minEvents: number;
	};
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
	contactsByChannel: { channel: string; sessions: number }[];
	searchTerms: {
		term: string;
		sessions: number;
		arrivedBlind: number;
		arrivedBlindPct: number;
		reachedAction: number;
		purchases: number;
		campaigns: number;
	}[];
	landingPages: {
		path: string;
		sessions: number;
		arrivedBlind: number;
		arrivedBlindPct: number;
		campaigns: number;
		purchases: number;
		campaignsAboveMedian: number;
		campaignsJudged: number;
		campaignsDegrading: number;
		elsewhereMedianPct: number | null;
		medianLoadMs: number | null;
		neverLoadedPct: number;
		verdict: "corrigir" | "anuncio_errado" | "observar" | "entregando" | "medicao_suspeita";
		marginPoints: number;
		blindPctLow: number;
		wasteShare: number;
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
	// A campaign that has not run for two weeks. It stays in the
	// statement because it spent money inside the window, and it is
	// never an instruction, because there is nothing left to instruct
	// about. Two of six action verdicts on the live account were
	// telling the operator to cut campaigns already off for 18 and 20
	// days.
	parada: {
		label: "já parou",
		cls: "bg-surface-inset text-content-muted border-edge",
	},
	cortar: {
		label: "cortar",
		cls: "bg-attention-bg text-attention border-attention/25",
	},
	corrigir: {
		label: "corrigir, não cortar",
		cls: "bg-attention-bg text-attention border-attention/25",
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

interface SeriesPoint {
	week: string;
	sessions: number;
	blind: number;
	blindPct: number;
}

interface TrafficSeries {
	account: SeriesPoint[];
	byPage: Record<string, SeriesPoint[]>;
	since: string | null;
	driftPoints: number | null;
	drift: {
		totalPoints: number;
		behaviourPoints: number;
		mixPoints: number;
		campaigns: number;
		usable: boolean;
	} | null;
}

interface TrafficMove {
	kind: "campaign" | "page" | "term";
	label: string;
	nowPct: number;
	beforePct: number;
	deltaPoints: number;
	nowSessions: number;
	beforeSessions: number;
	direction: "worse" | "better";
	samePage: boolean;
	purchases: number;
	path: string | null;
}

/** Several campaigns moving the same way on one page is one fact. The
 *  same rule the statement already applies to levels, applied to
 *  changes. Mirrors sharedPageMove() in the package; kept local so the
 *  client bundle does not pull the engine. */
function sharedPath(moves: TrafficMove[]): { path: string; count: number } | null {
	const byPath = new Map<string, TrafficMove[]>();
	for (const m of moves) {
		if (m.kind !== "campaign" || !m.path) continue;
		const list = byPath.get(m.path) ?? [];
		list.push(m);
		byPath.set(m.path, list);
	}
	let best: { path: string; count: number } | null = null;
	for (const [path, list] of byPath) {
		const worse = list.filter((m) => m.direction === "worse").length;
		if (list.length < 2 || (worse !== list.length && worse !== 0)) continue;
		if (!best || list.length > best.count) best = { path, count: list.length };
	}
	return best;
}

// ──────────────────────────────────────────────
// The vocabulary, in one place so it is one edit to change.
//
// Market research finding: products name the BEHAVIOUR, not the
// measurement. Microsoft Clarity does not ship "taxa de engajamento
// inverso", it ships Dead clicks, Rage clicks, Quick backs. A short
// noun works as a column header, as a filter, inside an alert
// sentence, and in the conversation between an owner and their media
// buyer. "Acessos que não fizeram nada" is seven words and fits none
// of those.
//
// "Visita muda" was chosen over "passou direto" (a verb phrase, bad as
// a header) and over "visita morta" (collides with Clarity's dead
// click, which means something else: a click that did nothing, not a
// visit that did nothing).
// ──────────────────────────────────────────────
const MUTE = {
	one: "visita muda",
	many: "visitas mudas",
	Many: "Visitas mudas",
	/** Column header, where space is tightest. */
	col: "Mudas",
	/** The definition, shown in a tooltip on the number rather than in
	 *  a section at the end. */
	def:
		"Entrou pelo anúncio e não deixou rastro nenhum: não rolou a página, " +
		"não teve botão entrando na tela, não clicou, não abriu formulário, " +
		"WhatsApp ou telefone, e não abriu uma segunda página.",
} as const;

/** Plain names, because nobody calls it an instagram_dm. */
const CHANNEL_LABEL: Record<string, string> = {
	whatsapp: "WhatsApp",
	phone: "ligação (toque no telefone)",
	phone_copy: "telefone copiado",
	instagram_dm: "Direct do Instagram",
	messenger: "Messenger",
	telegram: "Telegram",
	sms: "SMS",
	email: "e-mail",
};

/** Each channel in its own colour, so the eye finds WhatsApp without
 *  reading. Platform colours where they exist, because recognition is
 *  the point. */
const CHANNEL_TINT: Record<string, string> = {
	whatsapp: "#25D366",
	phone: "#3F5663",
	phone_copy: "#6B7772",
	email: "#A8490D",
	instagram_dm: "#C13584",
	messenger: "#0084FF",
	telegram: "#229ED9",
	sms: "#3F5663",
};

/** The difference against the previous week, as a cell. Nothing when
 *  there is no comparable week: an empty cell is honest, an invented
 *  zero is not. */
function Delta({ move }: { move?: TrafficMove }) {
	if (!move) {
		return <span className="text-[11px] text-content-faint">sem base</span>;
	}
	const worse = move.direction === "worse";
	return (
		<span
			className={`inline-flex items-center gap-1 text-[12px] font-semibold tabular-nums ${
				worse ? "text-attention" : "text-accent-text"
			}`}
			title={`Estava em ${move.beforePct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
		>
			{worse ? <IconWorse size={12} /> : <IconBetter size={12} />}
			{move.deltaPoints > 0 ? "+" : ""}
			{move.deltaPoints.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
		</span>
	);
}

export default function TrafficStatementPage() {
	const [data, setData] = useState<Statement | null>(null);
	const [moves, setMoves] = useState<TrafficMove[]>([]);
	const [platformConversations, setPlatformConversations] = useState<number | null>(null);
	const [series, setSeries] = useState<TrafficSeries | null>(null);
	const [scoreboard, setScoreboard] = useState<ScoreboardData | null>(null);
	const [stitch, setStitch] = useState<StitchData | null>(null);
	/** Bumped when the operator saves a week or logs a change, so the
	 *  stitch they just fed comes back stitched. */
	const [nonce, setNonce] = useState(0);
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
		// The skeleton belongs to an empty screen, not to a refetch. A
		// save that blanks the panel the operator is typing into reads
		// as having lost their work.
		if (data === null) setLoading(true);
		setError(null);
		fetch("/api/traffic-statement")
			.then((r) => r.json())
			.then((body) => {
				if (!alive) return;
				if (body.statement) {
					setData(body.statement);
					setMoves(Array.isArray(body.moves) ? body.moves : []);
					setPlatformConversations(
						typeof body.platformConversations === "number"
							? body.platformConversations
							: null,
					);
					setSeries(body.series ?? null);
					setScoreboard(body.scoreboard ?? null);
					setStitch(body.stitch ?? null);
				} else setError(body.reason ?? "sem dados");
			})
			.catch(() => alive && setError("falha ao carregar"))
			.finally(() => alive && setLoading(false));
		return () => {
			alive = false;
		};
		// `data` is read above only to decide whether to show the
		// skeleton, and including it here would refetch on every
		// arrival. The nonce is the deliberate reload trigger.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [envId, nonce]);

	if (loading) {
		// Shimmer, never a spinner. House rule.
		return (
			<div className="p-6">
				<PageHeader title="Extrato de tráfego pago" />
				<div className="space-y-2">
					{Array.from({ length: 6 }).map((_, i) => (
						<div key={i} className="h-14 animate-pulse rounded-mid bg-surface-inset" />
					))}
				</div>
			</div>
		);
	}

	if (error || !data) {
		return (
			<div className="p-6">
				<PageHeader title="Extrato de tráfego pago" />
				<div className="rounded-card border border-edge bg-surface-card p-6 text-[13.5px] text-content-secondary">
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
	// Pages first, and that ordering is the whole point of this release.
	//
	// Measured on the live account before changing anything: the
	// campaign-only card pointed at 9,6% of the waste, because the eight
	// campaigns it flagged are small and the waste is concentrated in one
	// page that no verdict could reach. The same card drawing from both
	// dimensions points at 76,8%, with one line instead of eight.
	const pagesNeedingDecision = data.landingPages
		.filter((g) => g.verdict === "corrigir" || g.verdict === "anuncio_errado")
		.sort((a, b) => b.arrivedBlind - a.arrivedBlind);

	// A campaign landing on a flagged page is already inside that page's
	// number. Listing it again would double count the waste and, worse,
	// would invite two investigations of one cause, which is the defect
	// the shared-path grouping was added to prevent in the first place.
	const flaggedPaths = new Set(pagesNeedingDecision.map((g) => g.path));
	const campaignsNeedingDecision = data.campaigns.filter(
		(c) =>
			(c.verdict === "cortar" ||
				c.verdict === "corrigir" ||
				c.verdict === "medicao_suspeita") &&
			!(c.topLandingPath && flaggedPaths.has(c.topLandingPath)),
	);
	// The account itself, when it is bad everywhere and so nothing
	// individual stands out. Both other rulers are relative, which is
	// what keeps them from producing noise and also what made the
	// product go quiet exactly when the customer was worst.
	const accountVerdict = data.accountVerdict;
	const decisionCount =
		pagesNeedingDecision.length +
		campaignsNeedingDecision.length +
		(accountVerdict ? 1 : 0);

	// Kept for the sections below that are genuinely about campaigns:
	// the cut trade, the fix explanation, the campaign table.
	const needsDecision = data.campaigns.filter(
		(c) => c.verdict === "cortar" || c.verdict === "corrigir" || c.verdict === "medicao_suspeita",
	);
	const cutRows = data.campaigns.filter((c) => c.verdict === "cortar");
	const fixRows = data.campaigns.filter((c) => c.verdict === "corrigir");
	const cutSessions = cutRows.reduce((n, c) => n + c.sessions, 0);
	const cutPurchases = cutRows.reduce((n, c) => n + c.pauseCostPurchases, 0);
	const watchingRows = data.campaigns.filter((c) => c.verdict === "observar");
	const watching = watchingRows.length;
	/** What the watching bucket actually holds. Printed because calling
	 *  it calm while it carries half the waste is the defect. */
	const watchingBlind = watchingRows.reduce((n, c) => n + c.arrivedBlind, 0);

	// The cut, and how much the list depends on it. Computed from the
	// same cautious rate the verdict acts on, so these three numbers
	// cannot drift from the verdict they describe.
	const crossing = (floor: number) =>
		data.campaigns.filter((c) => c.blindPctLow >= floor).length;
	const atFloor = crossing(data.thresholds.absoluteBlindPct);
	const atLower = crossing(data.thresholds.absoluteBlindPct - 5);
	const atHigher = crossing(data.thresholds.absoluteBlindPct + 5);
	const nearFloor = data.campaigns.filter(
		(c) =>
			c.blindPctLow >= data.thresholds.absoluteBlindPct &&
			c.blindPctLow - data.thresholds.absoluteBlindPct < 2,
	).length;
	const fine = data.campaigns.filter((c) => c.verdict === "entregando").length;
	const hasSpend = data.totals.spendBrl !== null;
	// No campaign has a previous baseline, so this account has not been
	// measured for a full period yet. Used to show the connect-your-ad-
	// account ask prominently once, instead of on every single load.
	const isFirstWindow = data.campaigns.every((c) => c.deltaPoints === null);

	// The page view, promoted from a footnote to the lead. It is the
	// only view that works for an account whose campaigns are each too
	// small to judge, and on the live account it says something the
	// campaign table cannot: one product page runs 36% across 155
	// campaigns while another runs 9%.
	const pages = data.landingPages;

	// Change as a COLUMN, which is the convention every mature dashboard
	// uses and the one we were not using. Search Console puts a Compare
	// toggle on the date picker and every row gains a difference; it has
	// no "what changed" screen. We had the inverse: a chapter narrating
	// three movements above a table that did not know anything had
	// moved. That shape is what reads as a report.
	const moveOf = new Map<string, TrafficMove>();
	for (const m of moves) moveOf.set(`${m.kind}:${m.label}`, m);
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
			{/* The spend ask, which used to be a banner on every visit.
			    The content model said prominent in the first week and a
			    quiet marker after that, because a request repeated daily
			    becomes invisible and then becomes irritating. An audit
			    found it still leading every load.

			    First window is detectable without a new field: if no
			    campaign has a previous baseline, the account has not
			    been measured for a full period yet. */}
			{!hasSpend && isFirstWindow && (
				<div className="mb-5 rounded-card border border-attention/25 bg-attention-bg px-5 py-4">
					<p className="text-[13.5px] leading-relaxed text-content">
						<strong>Este extrato conta acessos, não reais.</strong> Conecte a conta de
						anúncio e cada linha passa a mostrar quanto custou e quanto do custo comprou{" "}
						{MUTE.many}.
					</p>
					<a
						href="/app/integrations"
						className="mt-2 inline-flex rounded-mid border border-edge bg-surface-card px-3 py-1.5 text-[12.5px] font-medium text-content hover:bg-surface-card-hover"
					>
						Conectar conta de anúncio
					</a>
				</div>
			)}

			{/* What moved, above the statement. Sixteen of twenty reviewers
			    scored "would you pay again in month two" lowest, for one
			    reason they all gave in the same words: month two shows
			    the same table. This is the part that is only true this
			    week. */}
			{/* The anchor. One dark card gives the panel a centre of
			    gravity, and it is in our green rather than the black the
			    reference used, so the one loud surface is still the
			    brand. It holds what changed because that is the only
			    part of this screen that is true only this week. */}
			{decisionCount > 0 && (
				<div className="mb-6 overflow-hidden rounded-card bg-gradient-to-br from-[#0A5240] to-[#073A2D] text-[#D3EDE2]">
					<div className="flex items-center gap-3 px-5 pb-1 pt-5">
						<span className="grid h-8 w-8 place-items-center rounded-mid bg-white/15 text-white">
							<IconChange />
						</span>
						<span>
							<span className="block text-[14.5px] font-semibold text-white">
								O que pede decisão
							</span>
							<span className="block text-[12.5px] text-[#9ECFBC]">
								{/* The subtitle counts what the card holds, which is
								    no longer only campaigns. Saying "8 campanhas de
								    140" while the first line is a page would be the
								    kind of small lie that makes a reader stop
								    trusting the big numbers. */}
								{decisionCount === 1 ? "1 lugar" : `${decisionCount} lugares`} onde o
								dinheiro está indo embora, e o que muda se você mexer
							</span>
						</span>
					</div>

					{/* The account, when there is no single offender to name.
					    Placed first because it reframes everything below it:
					    reading a campaign table looking for the bad one is
					    the wrong activity when they are all the bad one. */}
					{accountVerdict && (
						<div className="mx-5 mt-4 rounded-mid bg-white/10 px-4 py-3.5">
							<p className="text-[13.5px] leading-relaxed text-[#D3EDE2]">
								Não é uma campanha e não é uma página:{" "}
								<strong className="text-white">
									{pct(data.accountBlindPct)}% de todo o seu tráfego pago
								</strong>{" "}
								não faz nada, e isso vale para a conta inteira. Nenhuma das{" "}
								{accountVerdict.campaignsJudged} campanhas medidas se destaca das outras,
								porque todas estão no mesmo lugar.
							</p>
							{accountVerdict.controlPct !== null && (
								<p className="mt-2 text-[12.5px] leading-relaxed text-[#9ECFBC]">
									{/* Reframed after five of nine media-buying
									    specialists independently rejected the old
									    sentence. It read the paid-versus-organic gap as
									    evidence that the paid traffic was bad. It is
									    not: organic and direct are mostly returning
									    customers and brand searches, on a desktop
									    browser with a warm cache, while paid DR is cold
									    interruption on mobile inside an in-app webview.
									    A gap of that size is expected, and a competent
									    media buyer would have used the overclaim to
									    throw out the whole report.

									    What the control legitimately proves is narrow
									    and still worth printing: the site works. If the
									    pages were broken, traffic arriving without an ad
									    would break on them too. */}
									Quem chega ao mesmo site sem anúncio não faz nada em apenas{" "}
									<strong className="text-white">
										{pct(accountVerdict.controlPct)}%
									</strong>{" "}
									das visitas. Boa parte dessa diferença é esperada, porque quem chega
									sem anúncio em geral já conhece a loja. O que isso prova é mais
									estreito e ainda importa: as suas páginas funcionam. Se estivessem
									quebradas, quem chega sem anúncio também quebraria nelas.
								</p>
							)}
							<p className="mt-2 text-[12.5px] leading-relaxed text-[#9ECFBC]">
								Procurar a campanha ruim na tabela abaixo não vai levar a nada aqui. O
								que pede decisão é de onde vem esse tráfego, antes de qual anúncio dentro
								dele.
							</p>
						</div>
					)}

					{/* The page comes first because that is where the waste
					    is. On the live account this single row covers 71,6%
					    of everything wasted in the month, which no campaign
					    verdict could ever reach: a page pools good and bad
					    campaigns, so its rate never crosses a floor built
					    for campaigns. */}
					{pagesNeedingDecision.length > 0 && (
						<ul className="mt-4 divide-y divide-white/[0.14] border-y border-white/[0.14]">
							{pagesNeedingDecision.map((g) => (
								<li key={g.path} className="px-5 py-3.5">
									<div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
										<span className="rounded-pill bg-white/15 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-white">
											{g.verdict === "corrigir" ? "a página" : "os anúncios"}
										</span>
										<span className="font-mono text-[12.5px] text-white">{g.path}</span>
									</div>
									<p className="mt-1.5 text-[13.5px] leading-relaxed text-[#D3EDE2]">
										<strong className="text-white">{pct(g.arrivedBlindPct)}%</strong> de
										quem você manda para aqui não faz nada, e isso é{" "}
										<strong className="text-white">{pct(g.wasteShare)}%</strong> de todo o
										desperdício da conta no período.{" "}
										{/* Justified with the number that produced the
										    verdict, which is the comparison against
										    campaigns landing elsewhere on this site, not
										    the account median. Explaining a conclusion
										    with a different statistic than the one that
										    reached it is the defect that arithmetic
										    checking cannot find. */}
										{g.verdict === "corrigir" ? (
											<>
												{g.campaignsDegrading} das {g.campaignsJudged} campanhas que caem
												aqui vão pior do que a campanha típica que cai em outra página
												sua
												{g.elsewhereMedianPct !== null && (
													<> ({pct(g.elsewhereMedianPct)}%)</>
												)}
												, então o alvo é a página e não os anúncios.
											</>
										) : (
											<>
												Mas só {g.campaignsDegrading} das {g.campaignsJudged} campanhas
												vão pior do que a campanha típica que cai em outra página sua
												{g.elsewhereMedianPct !== null && (
													<> ({pct(g.elsewhereMedianPct)}%)</>
												)}
												. As outras convertem nesta mesma página, então o alvo é o
												anúncio e não a página.
											</>
										)}
									</p>
									<div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-[#9ECFBC]">
										<span>
											{n(g.arrivedBlind)} de {n(g.sessions)} acessos, ±
											{pct(g.marginPoints)} pontos
										</span>
										{/* The split the product could not make. Without it,
										    "corrigir" sends the operator to rewrite copy
										    when the fix is milliseconds. Null until the
										    new pixel accumulates, and null is never drawn
										    as fast. */}
										{g.medianLoadMs !== null && (
											<span>
												carrega em {(g.medianLoadMs / 1000).toFixed(1)}s
												{g.medianLoadMs > 3000
													? ", o que já explica parte da perda"
													: ", então a perda não é lentidão"}
											</span>
										)}
									</div>
								</li>
							))}
						</ul>
					)}
					{/* The conclusion before its evidence. Three campaigns
					    worsening on one page is what the live account
					    produced, and listing them as three problems invites
					    three investigations of one cause. */}
					{(() => {
						const grouped = sharedPath(moves);
						if (!grouped) return null;
						return (
							<p className="mx-5 mt-4 flex gap-2.5 rounded-mid bg-white/10 px-4 py-3 text-[13.5px] leading-relaxed text-[#D3EDE2]">
								<IconVerdict className="mt-0.5 shrink-0" />
								<span>
									<strong className="text-white">{grouped.count} campanhas</strong> que caem
									em{" "}
									<span className="font-mono text-[12px] text-white">{grouped.path}</span>{" "}
									mudaram na mesma direção nesta semana. Quando campanhas diferentes se
									movem no mesmo lugar, o problema tende a ser a página, não os anúncios.
								</span>
							</p>
						);
					})()}
					{/* Campaigns that are NOT already inside a flagged page.
					    On the live account this list is empty, because all
					    eight campaigns that asked for a decision land on the
					    one page above. That is the correct outcome and the
					    reason the empty state below says so out loud rather
					    than rendering nothing. */}
					<ul className="flex flex-col gap-2.5 px-5 pb-5 pt-3">
						{campaignsNeedingDecision.slice(0, 5).map((c) => {
							const mv = moveOf.get(`campaign:${c.displayName}`);
							return (
								<li
									key={c.platformId ?? c.name}
									className="rounded-mid border border-white/[0.14] bg-white/10 px-4 py-3"
								>
									<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
										<span className="text-[17px] font-semibold tabular-nums text-white">
											{pct(c.arrivedBlindPct)}% {MUTE.many}
										</span>
										{c.marginPoints >= 5 && (
											<span className="text-[12px] text-[#9ECFBC]">
												±{pct(c.marginPoints)} pontos, {n(c.sessions)} acessos
											</span>
										)}
										{mv && (
											<span
												className={`inline-flex items-center gap-1 text-[12.5px] font-semibold tabular-nums ${
													mv.direction === "worse" ? "text-[#F7C9A4]" : "text-[#8FE3C0]"
												}`}
											>
												{mv.direction === "worse" ? (
													<IconWorse size={12} />
												) : (
													<IconBetter size={12} />
												)}
												{mv.deltaPoints > 0 ? "+" : ""}
												{pct(mv.deltaPoints)} vs. semana
											</span>
										)}
										<CampaignPill name={c.name} label={c.displayName} tone="deep" />
									</div>
									<p className="mt-2 text-[13px] leading-relaxed text-[#D3EDE2]">
										{c.verdict === "medicao_suspeita" ? (
											<>
												Taxa alta demais para ser comportamento. Antes de mexer na verba,
												vale conferir se a medição desta campanha está certa.
											</>
										) : c.pauseCost > 0 ? (
											<>
												Pausar custa{" "}
												<strong className="font-semibold text-white">
													{n(c.pauseCost)}{" "}
													{c.pauseCost === 1 ? c.pauseCostUnit.slice(0, -1) : c.pauseCostUnit}
												</strong>
												, então o alvo é a página onde ela cai, não o anúncio.
											</>
										) : (
											<>
												Pausar não custa {c.pauseCostUnit.slice(0, -1)} nenhuma.{" "}
												<strong className="font-semibold text-white">
													{n(c.sessions)} acessos
												</strong>{" "}
												comprados nesta janela.
											</>
										)}
									</p>
								</li>
							);
						})}
					</ul>
					{campaignsNeedingDecision.length > 5 && (
						<div className="border-t border-white/[0.14] px-5 py-2.5 text-[11.5px] text-[#9ECFBC]">
							Outras {campaignsNeedingDecision.length - 5} campanhas pedem decisão e estão
							na tabela abaixo.
						</div>
					)}
					{campaignsNeedingDecision.length === 0 && pagesNeedingDecision.length > 0 && (
						// Not an empty state, a conclusion. Saying that every
						// flagged campaign lands on the page above is the
						// difference between one investigation and eight.
						<div className="px-5 pb-5 pt-3 text-[12.5px] leading-relaxed text-[#9ECFBC]">
							{needsDecision.length > 0 ? (
								<>
									As {needsDecision.length}{" "}
									{needsDecision.length === 1 ? "campanha" : "campanhas"} que também
									{needsDecision.length === 1 ? " pedia" : " pediam"} decisão{" "}
									{needsDecision.length === 1 ? "cai" : "caem"} nessa mesma página, então{" "}
									{needsDecision.length === 1 ? "ela já está" : "elas já estão"} contada
									{needsDecision.length === 1 ? "" : "s"} acima. É um problema, não{" "}
									{needsDecision.length + pagesNeedingDecision.length}.
								</>
							) : (
								<>
									Nenhuma campanha individual pede decisão fora dessa página.
								</>
							)}
						</div>
					)}
				</div>
			)}

			{/* Our own record, placed here on purpose. The card above
			    tells the operator to cut something, and the next
			    question a person actually has is whether to believe it.
			    The answer belongs next to the claim, not in a footer.

			    It is also the one section whose numbers change every
			    week even when the customer's site does not, because it
			    is measuring us rather than their store. That is the
			    month-two problem solving itself. */}
			{scoreboard && <Scoreboard data={scoreboard} />}

			<div className="mb-6 rounded-card border border-edge bg-surface-card px-5 py-4">
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
					{/* Pooled, not the median. The page used to print the
					    median under these words, which name a pooled rate,
					    and a reviewer who audits statements tried to
					    reconcile it against the per-page table and could
					    not. The number was right and the sentence was
					    wrong, which is the harder defect because checking
					    the arithmetic cannot find it. */}
					Na conta inteira, {pct(data.accountBlindPct)}% dos acessos pagos são{" "}
					{MUTE.many} <MetricInfo>{MUTE.def}</MetricInfo>, e a campanha típica fica em{" "}
					{pct(data.accountMedianBlindPct)}%{" "}
					<MetricInfo>
						A mediana das campanhas desta conta. É a régua usada para dizer se uma campanha
						está fora do padrão, e não a taxa da conta inteira, que é a de cima.
					</MetricInfo>
					. Quem chega sem anúncio:{" "}
					{data.control ? `${pct(data.control.blindPct)}%` : "sem base para comparar"}.
				</p>
				{series && series.account.length >= 3 && (
					// The memory, finally read. A rate that rots in 4 to 6
					// point steps never trips the weekly alert, which is
					// the failure the dentist on the council described and
					// nobody else saw: "o meu CPL dobrou em seis meses e
					// nunca cruzou nenhum limite. O padrão é que apodreceu."
					<p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-edge pt-3 text-[12.5px] text-content-muted">
						<Sparkline points={series.account} />
						<span>
							{series.driftPoints === null ? (
								<>
									Medindo há {series.account.length} semanas. A tendência aparece com mais
									história.
								</>
							) : Math.abs(series.driftPoints) < 3 ? (
								<>
									Estável há {series.account.length} semanas, desde {series.since}.
								</>
							) : (
								<>
									<strong
										className={
											series.driftPoints > 0 ? "text-attention" : "text-accent-text"
										}
									>
										{series.driftPoints > 0 ? "+" : ""}
										{pct(series.driftPoints)} pontos
									</strong>{" "}
									em {series.account.length} semanas, desde {series.since}. Isso não
									aparece no aviso semanal: a subida vem em passos pequenos demais para
									cruzar limite.
									{/* The sentence that was wrong until now, and it was
									    wrong in the direction that costs the operator
									    work. Measured on the live account: of 34,5 points
									    of drift, 23,1 are mix and minus 0,2 is
									    behaviour. The campaigns did not get worse. The
									    operator moved budget toward campaigns that were
									    always worse. The old copy would have sent them to
									    fix a page that never changed. */}
									{series.drift?.usable && (
										<>
											{" "}
											Mas quase tudo isso é{" "}
											{Math.abs(series.drift.mixPoints) >
											Math.abs(series.drift.behaviourPoints) ? (
												<>
													<strong className="text-content">mudança de mix</strong>:{" "}
													{pct(series.drift.mixPoints)} pontos vêm de você ter
													passado a comprar outras campanhas, e só{" "}
													{pct(series.drift.behaviourPoints)} de as campanhas em si
													terem piorado. As suas páginas não degradaram. A verba
													mudou de lugar.
												</>
											) : (
												<>
													<strong className="text-attention">
														piora de verdade
													</strong>
													: {pct(series.drift.behaviourPoints)} pontos vêm de as
													mesmas campanhas renderem pior do que rendiam, e só{" "}
													{pct(series.drift.mixPoints)} de mudança de mix. Isso é
													coisa para consertar, não para reequilibrar.
												</>
											)}{" "}
											<MetricInfo>
												{`Separado comparando a média de 3 semanas de cada ponta, campanha por campanha (${series.drift.campaigns} apareceram nas duas pontas). "Mix" é o quanto a taxa da conta se moveu só porque você mudou quanto gasta em cada campanha, mantendo a taxa de cada uma parada. "Comportamento" é o contrário: o quanto se moveu com as mesmas campanhas rendendo diferente. Sem essa separação, escalar uma campanha que sempre foi ruim parece a sua página apodrecendo.`}
											</MetricInfo>
										</>
									)}
								</>
							)}
						</span>
					</p>
				)}
			</div>

			{/* Paid clicks that never became a readable session.
			    Previously these were dropped by a three-event gate with
			    no trace, which six of nine media-buying specialists
			    flagged independently. Measured on this account: 9.790
			    sessions, 93,9% carrying an fbclid against 96,0% in the
			    counted population, so they are clicks the operator paid
			    for. Median 1,9 second, and 9.405 of 9.406 never scrolled.

			    Deliberately NOT folded into the mute rate. Their device
			    profile is inverted against the counted traffic (81%
			    plain browser against 24%, where Meta paid traffic is 75%
			    in-app webview), so averaging them into the rate the
			    verdicts are calibrated on would move every threshold
			    without anyone deciding to. Different finding, different
			    owner: page delivery, not ad targeting. */}
			{data.notLoaded.sessions > 0 && (
				<div className="mb-6 rounded-card border border-edge bg-surface-card px-5 py-4">
					<div className="mb-1 text-[14.5px] font-semibold text-content">
						Cliques que nem viraram visita
					</div>
					<p className="text-[15px] leading-relaxed text-content">
						<strong>{n(data.notLoaded.withPaidMarker)}</strong> cliques que você pagou
						abriram o site e saíram antes de dar tempo de ver qualquer coisa. São{" "}
						{pct(data.notLoaded.sharePct)}% de tudo que chegou por anúncio.
					</p>
					<p className="mt-2 text-[12.5px] leading-relaxed text-content-muted">
						Esses não entram na conta de {MUTE.many} de propósito, e vale dizer por quê:
						a gente não sabe se a pessoa não quis ou se a página não apareceu em tempo.
						São duas causas diferentes, com dois consertos diferentes, e misturar as duas
						mudaria todos os números desta tela sem ninguém ter decidido isso.{" "}
						<MetricInfo>
							Antes essas visitas eram descartadas sem aparecer em lugar nenhum, tratadas
							como robô. A maioria carrega marca de clique pago, então era dinheiro seu
							saindo de uma conta que você nunca via. O conserto foi passar a contar e a
							mostrar, não passar a somar.
						</MetricInfo>
					</p>
				</div>
			)}

			{/* The human column, placed right after the drift sentence
			    because that paragraph ends on an open question. The
			    account rate climbed 32 points over eleven weeks and the
			    product cannot say why; the person reading it often can,
			    and until now had nowhere to write it down.

			    It is also the half of the trade we owe: "eu preencho
			    duas células por semana SE vocês me devolverem a
			    costura." A form that takes two numbers and returns
			    nothing is data entry, and nobody does data entry for a
			    vendor twice. */}
			<GroundTruthColumn stitch={stitch} onSaved={() => setNonce((k) => k + 1)} />

			{/* Contact, for the businesses that close off the site. The
			    esthetician had exactly one question, "quantas mensagens
			    cada anúncio me trouxe", and until the pixel learned to
			    see a WhatsApp tap the statement could say nothing at all
			    about her business. */}
			{data.contactsByChannel.length > 0 && (
				<div className="mb-6 rounded-card border border-edge bg-surface-card px-5 py-4">
					<div className="mb-4 flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-mid bg-surface-inset text-content-secondary"><IconMessage /></span><span className="text-[14.5px] font-semibold text-content">Quem saiu do site para falar com você</span></div>
					<ul className="flex flex-wrap gap-x-6 gap-y-2">
						{data.contactsByChannel.map((c) => (
							<li key={c.channel} className="flex items-center gap-2.5 text-[13.5px] text-content">
								<span className="grid h-7 w-7 place-items-center rounded-mid text-white" style={{ background: CHANNEL_TINT[c.channel] ?? "#3F5663" }}>
									{c.channel === "whatsapp" ? (
										<IconWhatsapp size={15} />
									) : c.channel.startsWith("phone") ? (
										<IconPhone size={15} />
									) : c.channel === "email" ? (
										<IconMail size={15} />
									) : (
										<IconMessage size={15} />
									)}
								</span>
								<span>
									<strong className="tabular-nums">{n(c.sessions)}</strong>{" "}
									<span className="text-content-secondary">
										{CHANNEL_LABEL[c.channel] ?? c.channel}
									</span>
								</span>
							</li>
						))}
					</ul>
					<p className="mt-2 text-[12px] leading-relaxed text-content-muted">
						Contado por toque no link, uma vez por canal por visita. É a intenção de
						falar, não a conversa: se a mensagem foi enviada ou se a ligação foi
						atendida acontece fora do site e o pixel não vê.
					</p>
				</div>
			)}

			{/* The one case no pixel reaches. An ad that opens a Direct
			    message never loads the site, so there is nothing to
			    measure and the platform's own count is the only number
			    that exists. Shown with the dependency named, because
			    reducing exactly this dependency is the product's reason
			    to exist. */}
			{platformConversations !== null && (
				<div className="mb-6 rounded-card border border-edge bg-surface-inset/40 px-5 py-4">
					<div className="mb-3 flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-mid bg-surface-inset text-content-secondary"><IconMessage /></span><span className="text-[14px] font-semibold text-content">Conversas que nem passaram pelo site</span></div>
					<p className="text-[14px] leading-relaxed text-content">
						O Meta diz ter iniciado{" "}
						<strong>{n(platformConversations)}</strong>{" "}
						{platformConversations === 1 ? "conversa" : "conversas"} nos últimos 30 dias
						em campanhas de clique para mensagem.
					</p>
					<p className="mt-2 text-[12px] leading-relaxed text-content-muted">
						Esse número não é nosso e não temos como conferir: quem clica num anúncio de
						mensagem não abre o seu site, então não existe nada para o pixel medir. É o
						Meta avaliando o próprio trabalho, e está aqui porque é a única fonte que
						existe, não porque é a melhor.
					</p>
				</div>
			)}

			{/* The page view. Promoted because the campaign floor excludes
			    the small advertiser and the fast tester alike, and both
			    ends of the review proposed this same way out. */}
			{pages.length > 0 && (
				<div className="mb-6 overflow-hidden rounded-card border border-edge">
					<div className="flex items-center gap-3 border-b border-edge px-4 py-3"><span className="grid h-8 w-8 place-items-center rounded-mid bg-surface-inset text-content-secondary"><IconPage /></span><span className="text-[14px] font-semibold text-content">Por página de destino, da que mais desperdiça acesso para a que menos</span></div>
					<table className="w-full border-collapse text-[13px]">
						<thead>
							<tr className="text-left text-[11px] text-content-muted">
								<th className="px-4 pb-2 pt-3 font-medium">Página</th>
								<th className="px-4 pb-2 pt-3 text-right font-medium">vs. semana</th>
								<th className="px-4 pb-2 pt-3 text-right font-medium">
									<span className="inline-flex items-center gap-1.5">
										{MUTE.Many}
										<MetricInfo align="right">{MUTE.def}</MetricInfo>
									</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{pages.map((pg) => {
								// Which half is to blame, instead of flatly saying
								// "the page". If every campaign landing here
								// degrades, the page is the common factor; if only
								// some do, the others prove the page converts and
								// the difference is in the ads. The flat version
								// contradicted the control, which shows non-paid
								// traffic doing fine on these same pages.
								const agree =
									pg.campaignsJudged >= 2
										? pg.campaignsAboveMedian / pg.campaignsJudged
										: null;
								const buyRate = (100 * pg.purchases) / pg.sessions;
								return (
								<tr key={pg.path} className="border-t border-edge first:border-t-0">
									<td className="px-4 py-2.5">
										<div className="font-mono text-[12px] text-content">{pg.path}</div>
										<div className="mt-1">
											<OpenTheCount
												dimension="page"
												keyValue={pg.path}
												expected={pg.arrivedBlind}
											/>
										</div>
										<div className="text-[11px] text-content-muted">
											{pg.campaigns} campanhas, {n(pg.purchases)}{" "}
											{pg.purchases === 1 ? "compra" : "compras"}, {pct(buyRate)}% de
											quem chega
										</div>
										{agree !== null && agree >= 0.7 && (
											<div className="mt-1 text-[11px] text-attention">
												{pg.campaignsAboveMedian} das {pg.campaignsJudged} campanhas
												medidas aqui perdem acima do seu padrão. Quando quase todas
												perdem no mesmo lugar, o alvo é a página.
											</div>
										)}
										{agree !== null && agree <= 0.4 && pg.campaignsAboveMedian > 0 && (
											<div className="mt-1 text-[11px] text-content-secondary">
												Só {pg.campaignsAboveMedian} das {pg.campaignsJudged} campanhas
												perdem acima do padrão. As outras convertem aqui, então o alvo
												é o anúncio e não a página.
											</div>
										)}
									</td>
									<td className="px-4 py-2.5">
										<div className="flex items-center justify-end gap-3">
											{series?.byPage?.[pg.path] && (
												<Sparkline points={series.byPage[pg.path]} width={64} height={22} />
											)}
											<Delta move={moveOf.get(`page:${pg.path}`)} />
										</div>
									</td>
									<td className="w-[38%] px-4 py-2.5">
										<div className="flex items-center gap-2">
											<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-inset">
												<div
													className={`h-full rounded-full ${
														pg.arrivedBlindPct >= 30 ? "bg-attention/70" : "bg-accent/60"
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
								);
							})}
						</tbody>
					</table>
				</div>
			)}

			{/* The term view. Empty for a feed advertiser, which is every
			    account measured so far, so it simply does not render.
			    Two reviewers whose whole budget is search named this as
			    the question they arrived with, and a campaign row
			    averages a buyer and a browser into nothing. */}
			{data.searchTerms.length > 0 && (
				<div className="mb-6 overflow-hidden rounded-card border border-edge">
					<div className="flex items-center gap-3 border-b border-edge px-4 py-3"><span className="grid h-8 w-8 place-items-center rounded-mid bg-surface-inset text-content-secondary"><IconSearch /></span><span className="text-[14px] font-semibold text-content">Por termo de busca</span></div>
					<table className="w-full border-collapse text-[13px]">
						<tbody>
							{data.searchTerms.slice(0, 12).map((t) => (
								<tr key={t.term} className="border-t border-edge first:border-t-0">
									<td className="px-4 py-2.5">
										<div className="text-content">{t.term}</div>
										<div className="text-[11px] text-content-muted">
											{n(t.sessions)} acessos, {n(t.reachedAction)} chegaram à ação,{" "}
											{n(t.purchases)} {t.purchases === 1 ? "compra" : "compras"}
										</div>
									</td>
									<td className="w-[30%] px-4 py-2.5 text-right tabular-nums">
										<div className="text-content">
											<strong>{pct(t.arrivedBlindPct)}%</strong> não fez nada
										</div>
										<div className="text-[11px] text-content-muted">
											{t.campaigns === 1 ? "1 campanha" : `${t.campaigns} campanhas`}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{data.control && (
				<div className="mb-6 rounded-card border border-edge bg-surface-inset/40 px-5 py-4">
					<div className="mb-4 flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-mid bg-surface-inset text-content-secondary"><IconCompare /></span><span className="text-[14.5px] font-semibold text-content">A sua própria base de comparação</span></div>
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
				<div className="overflow-x-auto rounded-card border border-edge">
					{/* Was nine columns, which ten reviewers said is
					    unusable on the phone they all read this on. The
					    secondary numbers moved into the campaign cell. */}
					<table className="w-full min-w-[620px] border-collapse text-[13px]">
						<thead>
							<tr className="bg-surface-inset text-left text-[11px] uppercase tracking-[0.08em] text-content-muted">
								<th className="px-4 py-3 font-semibold">campanha</th>
								<th className="px-3 py-3 text-right font-semibold">
									<span className="inline-flex items-center gap-1.5">
										{MUTE.col}
										<MetricInfo align="right">{MUTE.def}</MetricInfo>
									</span>
								</th>
								<th className="px-3 py-3 text-right font-semibold">
									<span className="inline-flex items-center gap-1.5">
										vs. semana
										<MetricInfo align="right">
											Quanto a taxa se moveu contra a semana anterior, em pontos. Vazio
											quando a campanha não rodou os dois períodos, porque comparar com
											nada seria inventar.
										</MetricInfo>
									</span>
								</th>
								<th className="px-3 py-3 text-right font-semibold">acima do padrão</th>
								<th className="px-3 py-3 text-right font-semibold">pausar custa</th>
								<th className="px-3 py-3 text-right font-semibold">
									{hasSpend ? (
										"gasto perdido"
									) : (
										<a
											href="/app/integrations"
											className="font-normal text-content-muted underline decoration-dotted underline-offset-2 hover:text-content"
											title="Conecte a conta de anúncio para ver quanto cada linha custou"
										>
											gasto perdido
										</a>
									)}
								</th>
								<th className="px-3 py-3 font-semibold">alerta</th>
							</tr>
						</thead>
						<tbody>
							{needsDecision.map((c) => (
								<tr
									key={c.platformId ?? c.name}
									className="border-t border-edge align-top hover:bg-surface-card-hover"
								>
									<td className="px-4 py-3">
										<CampaignPill name={c.name} label={c.displayName} />
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
														? "text-attention"
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
										<div className="mt-1">
											<OpenTheCount
												dimension="campaign"
												keyValue={c.platformId ?? c.name}
												expected={c.arrivedBlind}
											/>
										</div>
										{c.contactSessions > 0 && (
											<div className="mt-1 text-[11px] text-content-secondary">
												{n(c.contactSessions)}{" "}
												{c.contactSessions === 1 ? "visita saiu" : "visitas saíram"} para
												falar com você
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
											{/* The margin rides on every row, not only the thin
											    ones: a reader who sees it sometimes learns to
											    distrust its absence. */}
											<span className={c.marginPoints >= 5 ? "text-attention" : ""}>
												{" "}±{pct(c.marginPoints)}
											</span>
										</div>
									</td>
									<td className="px-3 py-3 text-right tabular-nums">
										<Delta move={moveOf.get(`campaign:${c.displayName}`)} />
									</td>
									<td className="px-3 py-3 text-right tabular-nums">
										<div className="text-content">{n(c.excessBlind)}</div>
										<div className="text-[11px] text-content-muted">acessos</div>
									</td>
									<td className="px-3 py-3 text-right tabular-nums">
										<div className="text-content">{n(c.pauseCost)}</div>
										<div className="text-[11px] text-content-muted">
											{c.pauseCost === 1 ? c.pauseCostUnit.slice(0, -1) : c.pauseCostUnit}
										</div>
									</td>
									{hasSpend ? (
										<td className="px-3 py-3 text-right tabular-nums">
											<div className="text-content">
												{c.spendWastedBrl === null ? "sem dado" : brl(c.spendWastedBrl)}
											</div>
											<div className="text-[11px] text-content-muted">
												{c.spendBrl === null ? "campanha nova" : `de ${brl(c.spendBrl)}`}
											</div>
										</td>
									) : (
										<td className="px-3 py-3 text-right">
											<span className="text-[11px] text-content-faint">sem conexão</span>
										</td>
									)}
									<td className="px-3 py-3">
										<span
											className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11.5px] font-medium ${VERDICT[c.verdict].cls}`}
										>
											{c.verdict === "entregando" ? <IconCheck size={12} /> : <IconFix size={12} />}
											{VERDICT[c.verdict].label}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<div className="rounded-card border border-edge bg-surface-card px-5 py-4 text-[13.5px] leading-relaxed text-content">
					Nenhuma campanha desta janela está ao mesmo tempo acima de 45% de acessos que não
					fazem nada e 10 pontos acima da sua mediana. Nada a cortar nem a corrigir no nível
					da campanha.
				</div>
			)}

			{fixRows.length > 0 && (
				<div className="mt-6 rounded-card border border-edge bg-surface-card px-5 py-4">
					<div className="mb-3 flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-mid bg-surface-inset text-content-secondary"><IconFix /></span><span className="text-[14px] font-semibold text-content">Por que corrigir e não cortar</span></div>
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
				<div className="mt-6 rounded-card border border-edge bg-surface-card px-5 py-4">
					<div className="mb-3 flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-mid bg-surface-inset text-content-secondary"><IconVerdict /></span><span className="text-[14px] font-semibold text-content">A troca, se você cortar {cutRows.length === 1 ? "essa" : `essas ${cutRows.length}`}</span></div>
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

			{/* Two findings from the second council live in this
			    paragraph, and both were about honesty rather than
			    arithmetic.

			    It used to end on "não pedem decisão agora", which sells
			    the watching bucket as tranquillity. Measured on the live
			    account, those campaigns hold 52,7% of all the waste. A
			    product that finds half the problem and files it under
			    calm is doing the thing it accuses dashboards of doing.

			    And the cut was invisible. The whole headline is a
			    function of one constant nobody chose in front of the
			    customer, so the sensitivity is now printed next to it,
			    computed rather than written down: move the cut five
			    points and the list changes size. */}
			<p className="mt-5 text-[12.5px] leading-relaxed text-content-secondary">
				{watching > 0 && (
					<>
						Outras {watching} campanhas estão acima do seu padrão mas abaixo de{" "}
						{pct(data.thresholds.absoluteBlindPct)}%, e somam{" "}
						<strong className="text-content">{n(watchingBlind)}</strong> {MUTE.many}. Não
						pedem decisão hoje porque o corte não as alcança, e não porque estejam bem.{" "}
					</>
				)}
				{fine > 0 && <>{fine} estão dentro do padrão da conta. </>}
			</p>

			<p className="mt-2 text-[12.5px] leading-relaxed text-content-muted">
				O corte é {pct(data.thresholds.absoluteBlindPct)}%, medido na ponta pessimista da
				taxa.{" "}
				<MetricInfo>
					{`É uma escolha nossa, não um número da natureza. Com o corte em ${data.thresholds.absoluteBlindPct}% são ${atFloor} campanhas pedindo decisão; com 5 pontos menos seriam ${atLower}; com 5 pontos mais seriam ${atHigher}. Mostramos isso porque uma lista que muda de tamanho quando a régua anda é uma lista que você tem o direito de conferir.`}
				</MetricInfo>{" "}
				{nearFloor > 0 && (
					<>
						{nearFloor === 1
							? "Uma delas está a menos de 2 pontos do corte"
							: `${nearFloor} delas estão a menos de 2 pontos do corte`}
						, então é das que mudam de lado se a régua andar.
					</>
				)}
			</p>

			{/* The history is the customer's. A paid tool that locks the
			    series is strictly worse than an open source one on an
			    axis the buyer already checks, and the CFO asked about it
			    for three rounds before anyone answered. */}
			{series && series.account.length > 0 && (
				<p className="mt-5 text-[12.5px] text-content-secondary">
					<a
						href="/api/traffic-statement/export"
						className="underline decoration-dotted underline-offset-2 hover:text-content"
					>
						Baixar a série inteira em CSV
					</a>
					, {series.account.length} semanas desde {series.since}. Os dados são seus, e a
					régua usada vai no arquivo.
				</p>
			)}

			<p className="mt-2 text-[12px] leading-relaxed text-content-muted">
				{pct(data.attributionCoveragePct)}% das {n(data.measuredSessions)} sessões medidas trazem
				campanha identificada.
				{data.belowFloor.campaigns > 0 && (
					<>
						{" "}
						{data.belowFloor.campaigns} campanhas com menos de{" "}
						{n(data.thresholds.minSessions)} acessos ficaram fora da tabela de campanha,
						porque abaixo disso não há taxa, há um punhado de visitas. Elas somam{" "}
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
