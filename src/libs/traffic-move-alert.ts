import { prisma } from "@/libs/prismaDb";
import { notifyOrganization } from "@/libs/notifications";
import { renderEmailFromTemplate, renderSmsFromTemplate, rawHtml } from "@/libs/notification-templates";
import { wasRecentlySent } from "@/libs/notification-triggers";
import {
	buildTrafficStatement,
	detectTrafficMoves,
	MIN_SESSIONS_PER_MOVE,
	sharedPageMove,
	type StatementSessionInput,
	type TrafficMove,
} from "../../packages/strategy-plan/sections/traffic-statement";

// ──────────────────────────────────────────────
// Weekly traffic-move alert.
//
// The twenty-persona review scored one question lowest in sixteen of
// twenty responses: would you pay again in month two. Every one of
// them gave the same reason, and none of them was about the content.
//
//   "Não porque é ruim. Porque não chega na hora da decisão."
//
// Month one hands over an architectural finding, the operator fixes
// the page, and month two hands over the same table. What they asked
// for instead was one sentence, delivered when it becomes true. The
// supplements founder wrote the spec himself and also pointed out the
// data was already there: "só está no lugar errado, no formato errado
// e na frequência errada".
//
// So nothing new is measured here. This is the same statement read
// over a week instead of a month, filtered to what moved, and pushed
// through the notification path that already exists.
//
// Reuses the "regression" event on purpose rather than minting a new
// one: alertOnRegression already defaults true, the WhatsApp template
// is already approved, and the bell UI already renders it. A new event
// type would mean a migration and a preference nobody has toggled.
// ──────────────────────────────────────────────

/** Both weeks of sessions, read once. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Dedupe horizon. The tag carries the ISO week, so this only has to
 *  outlast one week's worth of scheduler ticks. */
const WEEK_DEDUPE_MS = 6 * 24 * 60 * 60 * 1000;

/** Cap per pass, same shape as the daily digest. */
const MAX_ENVS = 100;

/** Sessions pulled per environment. Two weeks on the busiest account
 *  measured is ~25k rows. */
const MAX_ROWS = 60_000;

/** ISO-ish week stamp for the dedupe tag: 2026-W45. */
export function weekStamp(d: Date): string {
	const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
	// Thursday of the current week decides the year, per ISO 8601.
	const day = t.getUTCDay() || 7;
	t.setUTCDate(t.getUTCDate() + 4 - day);
	const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
	const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
	return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * One sentence per move, in the operator's words rather than the
 * engine's.
 *
 * The shape is the reviewer's own: what it was, what it is, and the
 * fact that nothing else changed, because that last clause is what
 * makes the number worth reading instead of arguing with.
 */
export function moveSentence(m: TrafficMove): string {
	const kind = m.kind === "campaign" ? "A campanha" : m.kind === "page" ? "A página" : "O termo";
	const verb = m.direction === "worse" ? "piorou" : "melhorou";
	const pts = Math.abs(m.deltaPoints).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
	const was = m.beforePct.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
	const now = m.nowPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
	let s = `${kind} ${m.label} ${verb} ${pts} pontos: estava em ${was}% e está em ${now}% de acessos que não fazem nada.`;
	if (m.kind === "campaign" && m.samePage) {
		s += " Ela cai na mesma página de antes.";
	}
	if (m.purchases > 0) {
		s += ` Ainda produziu ${m.purchases.toLocaleString("pt-BR")} ${
			m.purchases === 1 ? "compra" : "compras"
		} nesta semana, então não é para pausar sem olhar.`;
	}
	return s;
}

export async function sendTrafficMoveAlerts(
	now: Date = new Date(),
): Promise<{ sent: number; skipped: number }> {
	let sent = 0;
	let skipped = 0;

	const environments = await prisma.environment.findMany({
		where: {
			activated: true,
			continuousPaused: false,
			organization: { plan: { not: "demo" }, status: "active" },
		},
		select: {
			id: true,
			domain: true,
			organizationId: true,
			organization: { select: { id: true } },
		},
		take: MAX_ENVS,
	});

	const thisWeekStart = new Date(now.getTime() - WEEK_MS);
	const priorWeekStart = new Date(now.getTime() - 2 * WEEK_MS);

	for (const env of environments) {
		try {
			const tag = `traffic-move:${env.id}:${weekStamp(now)}`;
			// Checked before the query, not after: an environment already
			// alerted this week should not cost two weeks of session
			// reads to discover that.
			if (await wasRecentlySent(tag, undefined, WEEK_DEDUPE_MS)) {
				skipped++;
				continue;
			}

			const rows = await prisma.behavioralSessionAggregate.findMany({
				where: { envId: env.id, startedAt: { gte: priorWeekStart, lt: now } },
				select: {
					aggregate: true,
					eventCount: true,
					userAgent: true,
					startedAt: true,
				},
				take: MAX_ROWS,
			});
			if (rows.length === 0) {
				skipped++;
				continue;
			}

			const profile = await prisma.businessProfile
				.findUnique({
					where: { organizationId: env.organizationId },
					select: { conversionModel: true },
				})
				.catch(() => null);

			const parsed: (StatementSessionInput & { startedAt: Date })[] = [];
			for (const r of rows) {
				try {
					parsed.push({
						aggregate: JSON.parse(r.aggregate) as Record<string, unknown>,
						eventCount: r.eventCount,
						userAgent: r.userAgent,
						startedAt: r.startedAt,
					});
				} catch {
					// One malformed aggregate drops a session, never the pass.
				}
			}

			const opts = {
				windowStart: thisWeekStart.toISOString().slice(0, 10),
				windowEnd: now.toISOString().slice(0, 10),
				conversionModel: profile?.conversionModel ?? null,
				previous: null,
				minSessions: MIN_SESSIONS_PER_MOVE,
			};
			const current = buildTrafficStatement(
				parsed.filter((r) => r.startedAt >= thisWeekStart),
				opts,
			);
			const previous = buildTrafficStatement(
				parsed.filter((r) => r.startedAt < thisWeekStart),
				{ ...opts, windowStart: priorWeekStart.toISOString().slice(0, 10) },
			);

			// Only a worsening is worth interrupting someone's Monday.
			// Improvements belong on the page, where the operator went
			// looking, not in their inbox.
			const moves = detectTrafficMoves(current, previous).filter(
				(m) => m.direction === "worse",
			);
			if (moves.length === 0) {
				skipped++;
				continue;
			}

			// When several campaigns moved the same way on one page, that
			// is the headline and the individual rows are its evidence.
			// Three campaigns worsening on one product page is what the
			// live account actually produced, and reporting it as three
			// problems invites three investigations of one cause.
			const shared = sharedPageMove(moves);
			const headline = moves[0];
			const lead = shared
				? `${shared.count} campanhas que caem em ${shared.path} pioraram na mesma semana. Quando campanhas diferentes pioram no mesmo lugar, o problema tende a ser a página, não os anúncios.`
				: moveSentence(headline);
			const rest = shared ? moves.slice(0, 4) : moves.slice(1, 4);
			const vars = {
				count: String(moves.length),
				domain: env.domain,
				headline: lead,
				rootCauseSuffix:
					rest.length > 0
						? rawHtml(
								`<br/><br/>${rest
									.map((m) => escapeForEmail(moveSentence(m)))
									.join("<br/><br/>")}`,
							)
						: "",
			};

			const email = renderEmailFromTemplate("regression", vars, baseUrl());
			const smsText = renderSmsFromTemplate("regression", vars);
			if (!email) {
				skipped++;
				continue;
			}

			await notifyOrganization(env.organizationId, {
				event: "regression",
				subject: email.subject,
				bodyHtml: email.html,
				bodyText: smsText ?? lead,
				tag,
				// vestigio_regression: {{1}} domain, {{2}} headline, {{3}} count
				whatsappBodyParams: [env.domain, lead.slice(0, 120), String(moves.length)],
			});
			sent++;
		} catch (err) {
			console.error(`[traffic-move] env=${env.id} failed:`, err);
			skipped++;
		}
	}

	return { sent, skipped };
}

/** Same resolution order every other notification sender uses. The
 *  first thing I reached for was a variable that is not a Dockerfile
 *  ARG, so it would have compiled to undefined and every link in the
 *  email would have pointed at nothing. The invariant caught it. */
function baseUrl(): string {
	return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://vestigio.io";
}

/** The sentence is ours, not user input, but it carries a campaign
 *  name the customer typed in their ad platform, which is. */
function escapeForEmail(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
