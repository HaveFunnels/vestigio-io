import { NextResponse } from "next/server";
import type { readTrafficSeries } from "../../../../packages/strategy-plan/sections/traffic-series";
import type { scoreVerdicts } from "../../../../packages/strategy-plan/sections/traffic-scoreboard";
import type { readStitch } from "../../../../packages/strategy-plan/sections/traffic-ground-truth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { resolveOrgContext } from "@/libs/resolve-org";
import {
	buildTrafficStatement,
	detectTrafficMoves,
	MIN_SESSIONS_PER_MOVE,
	type StatementSessionInput,
} from "../../../../packages/strategy-plan/sections/traffic-statement";

/**
 * GET /api/traffic-statement — Authenticated.
 *
 * The first v2 surface: which paid campaigns bought arrivals that did
 * nothing. Reads session aggregates the pixel has been collecting for
 * months and never grouped by campaign.
 *
 * Window is 30 days by default. No money in the response on purpose:
 * see the module header in traffic-statement.ts.
 */
const WINDOW_DAYS = 30;
/** Sessions pulled per request. 30 days on the instrumented account is
 *  ~65k, and the aggregate JSON is small, but an unbounded findMany on
 *  the busiest table is how a page becomes a timeout. */
const MAX_ROWS = 120_000;

export async function GET(request: Request) {
	const session = await getServerSession(authOptions);
	if (!session?.user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const orgCtx = await resolveOrgContext();
	if (!orgCtx.orgId || !orgCtx.envId) {
		return NextResponse.json({ statement: null, reason: "no-environment" });
	}

	const url = new URL(request.url);
	const days = Math.min(90, Math.max(7, Number(url.searchParams.get("days")) || WINDOW_DAYS));
	const end = new Date();
	const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

	try {
		const { prisma } = await import("@/libs/prismaDb");

		// conversionModel decides what "the action" means, so a service
		// business is not judged on reaching a checkout it does not have.
		// Read per organization because that is where BusinessProfile
		// lives; the figure is a shape, not a money input, so the
		// sibling-contamination problem that affects revenue does not
		// apply here.
		const profile = await prisma.businessProfile
			.findUnique({
				where: { organizationId: orgCtx.orgId },
				select: { conversionModel: true },
			})
			.catch(() => null);

		// Two windows of equal length: the current one and the one before
		// it, for the month-over-month comparison. Fetched together
		// because the second is the same query with a shifted bound.
		const prevStart = new Date(start.getTime() - days * 24 * 60 * 60 * 1000);
		const [rows, prevRows] = await Promise.all([
			prisma.behavioralSessionAggregate.findMany({
				where: { envId: orgCtx.envId, startedAt: { gte: start, lt: end } },
				// startedAt comes along so the last two weeks can be
				// partitioned out of these same rows. The week-over-week
				// comparison therefore costs no extra query: both weeks
				// are already inside the 30-day window.
				select: {
					aggregate: true,
					eventCount: true,
					userAgent: true,
					startedAt: true,
				},
				take: MAX_ROWS,
			}),
			prisma.behavioralSessionAggregate.findMany({
				where: { envId: orgCtx.envId, startedAt: { gte: prevStart, lt: start } },
				select: {
					aggregate: true,
					eventCount: true,
					userAgent: true,
					startedAt: true,
				},
				take: MAX_ROWS,
			}),
		]);

		type Row = {
			aggregate: string;
			eventCount: number;
			userAgent: string | null;
			startedAt: Date;
		};
		const parse = (list: Row[]): (StatementSessionInput & { startedAt: Date })[] => {
			const out: (StatementSessionInput & { startedAt: Date })[] = [];
			for (const r of list) {
				try {
					out.push({
						aggregate: JSON.parse(r.aggregate) as Record<string, unknown>,
						eventCount: r.eventCount,
						userAgent: r.userAgent,
						startedAt: r.startedAt,
					});
				} catch {
					// A malformed aggregate drops the session rather than the
					// request. One bad row must not blank the statement.
				}
			}
			return out;
		};
		const parsed = parse(rows);
		const parsedPrev = parse(prevRows);

		// Spend per campaign, when an ad account is connected. The
		// poller caches it in syncMetadata, so this is a cheap read and
		// not a Graph call on every page load. Null when nothing is
		// connected, and the statement then reports counts only.
		// Both ad platforms, not just Meta. Three of the twenty reviewers
		// spend their entire budget on Google search, and one of them
		// put it plainly: "todo o meu dinheiro está no Google, e o
		// Google não aparece na peça". The poller already collected it.
		//
		// Keyed twice on purpose. Meta passes a numeric campaign id in
		// the landing URL and the pixel captures it; Google Ads passes
		// the campaign NAME in utm_campaign and no id, so an id-only
		// join could never match a Google campaign.
		let spendByCampaignId: Map<string, number> | null = null;
		// Conversations the platform says it started. Declared out here
		// because the response needs it; read inside the same try as
		// spend, from the same cached snapshot.
		let platformConversations: number | null = null;
		try {
			const conns = await prisma.integrationConnection.findMany({
				where: {
					environmentId: orgCtx.envId,
					provider: { in: ["meta_ads", "google_ads"] },
					status: "connected",
				},
				select: { syncMetadata: true },
			});
			const merged = new Map<string, number>();

			for (const conn of conns) {
				if (!conn.syncMetadata) continue;
				let parsed: {
					campaigns?: { id?: string; name?: string; spend_30d?: number }[];
					messaging_conversations_30d?: number;
					has_messaging_campaigns?: boolean;
				};
				try {
					parsed = JSON.parse(conn.syncMetadata);
				} catch {
					// One malformed snapshot must not cost the other's spend.
					continue;
				}
				if (typeof parsed.messaging_conversations_30d === "number" && parsed.has_messaging_campaigns) {
					platformConversations =
						(platformConversations ?? 0) + parsed.messaging_conversations_30d;
				}
				if (!Array.isArray(parsed.campaigns)) continue;
				for (const c of parsed.campaigns) {
					const spend = Number(c.spend_30d) || 0;
					if (c.id) merged.set(String(c.id), spend);
					if (c.name) merged.set(String(c.name).trim().toLowerCase(), spend);
				}
			}
			if (merged.size > 0) spendByCampaignId = merged;
		} catch {
			// A malformed or absent snapshot drops the money, never the
			// statement. Counts are the product; spend is the upgrade.
		}

		// The operator's own numbers, read for the first time by anything
		// other than the screen that collects them. Used to audit our
		// conversion measurement, which is the one job only an outside
		// number can do: if they declared results and we measured none,
		// our side is losing the conversion and no campaign may be told
		// to cut.
		let declared: {
			weeks: number;
			booked: number;
			showed: number;
			revenueBrl: number;
		} | null = null;
		try {
			const gt = await prisma.$queryRawUnsafe<
				{ weeks: bigint; booked: bigint; showed: bigint; revenue: bigint }[]
			>(
				`SELECT COUNT(*)::bigint AS weeks,
				        COALESCE(SUM("booked"),0)::bigint AS booked,
				        COALESCE(SUM("showed"),0)::bigint AS showed,
				        COALESCE(SUM("revenueBrl"),0)::bigint AS revenue
				 FROM "TrafficGroundTruth"
				 WHERE "envId" = $1 AND "week" >= $2`,
				orgCtx.envId,
				start,
			);
			const row = gt[0];
			if (row && Number(row.weeks) > 0) {
				declared = {
					weeks: Number(row.weeks),
					booked: Number(row.booked),
					showed: Number(row.showed),
					revenueBrl: Number(row.revenue),
				};
			}
		} catch (err) {
			// A missing column costs the audit, never the statement.
			console.error("[traffic-statement] declared", err);
		}

		const statement = buildTrafficStatement(parsed, {
			windowStart: start.toISOString().slice(0, 10),
			windowEnd: end.toISOString().slice(0, 10),
			conversionModel: profile?.conversionModel ?? null,
			spendByCampaignId,
			previous: parsedPrev.length > 0 ? parsedPrev : null,
			declared,
		});

		// What moved, from the same rows. The statement on its own is a
		// photograph, and the review's lowest score in sixteen of twenty
		// responses was "would you pay again in month two", for one
		// reason: month two shows the same table. A week against the
		// week before is the cheapest thing that answers it.
		const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
		const lastWeekStart = new Date(end.getTime() - WEEK_MS);
		const priorWeekStart = new Date(end.getTime() - 2 * WEEK_MS);
		const inRange = (r: { startedAt: Date }, from: Date, to: Date) =>
			r.startedAt >= from && r.startedAt < to;
		const weekOpts = {
			windowStart: lastWeekStart.toISOString().slice(0, 10),
			windowEnd: end.toISOString().slice(0, 10),
			conversionModel: profile?.conversionModel ?? null,
			spendByCampaignId,
			previous: null,
			minSessions: MIN_SESSIONS_PER_MOVE,
		};
		const thisWeek = buildTrafficStatement(
			parsed.filter((r) => inRange(r, lastWeekStart, end)),
			weekOpts,
		);
		const lastWeek = buildTrafficStatement(
			parsed.filter((r) => inRange(r, priorWeekStart, lastWeekStart)),
			{ ...weekOpts, windowStart: priorWeekStart.toISOString().slice(0, 10) },
		);
		const moves = detectTrafficMoves(thisWeek, lastWeek);

		// The memory, read for the first time. It has been accumulating
		// since the backfill and nothing consumed it, which is the
		// half-built shape this repo already names: collection shipped
		// without consumption.
		let series: Awaited<ReturnType<typeof readTrafficSeries>> | null = null;
		try {
			const { readTrafficSeries } = await import(
				"../../../../packages/strategy-plan/sections/traffic-series"
			);
			series = await readTrafficSeries(prisma, orgCtx.envId);
		} catch (err) {
			// A missing series costs a sparkline, never the statement.
			console.error("[traffic-statement] series", err);
		}

		// The loop closes here, because this is the moment the verdict
		// exists. Writing on a read is deliberate and bounded: the
		// insert is idempotent on (env, dimension, key, day), so a
		// customer refreshing the page twenty times leaves one
		// prediction, not twenty.
		//
		// Only verdicts that ask for an action are recorded. Scoring
		// "entregando" would pad the hit rate with predictions nobody
		// acted on.
		let scoreboard: Awaited<ReturnType<typeof scoreVerdicts>> | null = null;
		try {
			const { recordVerdicts, scoreVerdicts } = await import(
				"../../../../packages/strategy-plan/sections/traffic-scoreboard"
			);
			await recordVerdicts(prisma, orgCtx.envId, statement);
			scoreboard = await scoreVerdicts(prisma, orgCtx.envId);
		} catch (err) {
			// A broken scoreboard must never cost the statement. It is
			// the surface that holds us to account, not the one the
			// customer paid for.
			console.error("[traffic-statement] scoreboard", err);
		}

		// The human column, stitched onto the measured one. Only
		// possible once there is a series to stitch to, which is why it
		// reads from `series` rather than from the aggregates: the
		// stitch is week against week, and the weekly rate is already
		// gated on having enough sessions to mean anything.
		let stitch: Awaited<ReturnType<typeof readStitch>> | null = null;
		if (series && series.account.length >= 2) {
			try {
				const { readStitch } = await import(
					"../../../../packages/strategy-plan/sections/traffic-ground-truth"
				);
				stitch = await readStitch(prisma, orgCtx.envId, series.account);
			} catch (err) {
				console.error("[traffic-statement] stitch", err);
			}
		}

		return NextResponse.json({
			statement,
			platformConversations,
			series,
			scoreboard,
			stitch,
			moves,
			moveWindow: {
				start: lastWeekStart.toISOString().slice(0, 10),
				end: end.toISOString().slice(0, 10),
			},
		});
	} catch (err) {
		console.error("[traffic-statement]", err);
		return NextResponse.json({ message: "Failed to build statement" }, { status: 500 });
	}
}
