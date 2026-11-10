import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import {
	RULER_VERSION,
	sawNothing,
	searchTermOf,
	splitCampaignRef,
	type StatementSessionInput,
} from "./traffic-statement";
import { MIN_EVENTS_INTERACTIVE } from "./measured-friction";

// ──────────────────────────────────────────────
// Daily memory of paid traffic.
//
// Nine reviewers were asked to choose between three delivery formats
// and refused the question. Five of them arrived, by routes that do
// not touch, at the same missing thing, and it was in none of the
// three options: the product cannot remember.
//
// What that costs, in their words. The media buyer: "o mês 2 parecer
// igual não é problema de formato nem de frequência, é falta de
// memória". The dentist, whose cost per booking doubled over six
// months without one abnormal week: "a minha planilha, que é mais
// burra que o pixel de vocês, lembra de 26 semanas". The consultant:
// a recommendation whose outcome nobody checks is an opinion, not a
// judgment.
//
// Two properties make this worth doing before anything else.
//
// It is the cheapest table we keep. Measured rather than guessed: 63
// rows a day on the instrumented account, so ~25k rows and ~5 MB per
// environment over the 400-day retention, against the ~670k raw
// sessions the same year produces.
//
// And it is the only one whose value cannot be bought later. Every day
// not stored is a day that is gone. That is also the clearest moat the
// replicability auditor could name: a layout copies in a weekend and a
// judgment copies in a prompt, but nobody copies a series that started
// six months ago.
//
// The counting rules are NOT reimplemented here. This calls the same
// `sawNothing`, `splitCampaignRef` and `searchTermOf` the statement
// uses, so the series and the screen cannot disagree about what a
// blind session is, and the ruler in force is stamped on every row for
// the same reason.
// ──────────────────────────────────────────────

/** Days recomputed on each pass. Today is still accumulating and late
 *  beacons land against yesterday, so both are always redone. */
export const TRAFFIC_ROLLUP_RECOMPUTE_DAYS = 2;

export type RollupDimension = "campaign" | "page" | "term" | "account" | "placement";

export interface TrafficRollupRow {
	day: string;
	dimension: RollupDimension;
	key: string;
	label: string | null;
	sessions: number;
	blind: number;
	action: number;
	purchases: number;
	contacts: number;
}

/** Did the visitor try to reach a human? Mirrors the statement. */
function contacted(a: Record<string, unknown>): boolean {
	if (a.contact_started) return true;
	return Array.isArray(a.contact_channels) && a.contact_channels.length > 0;
}

/** Did this session reach the action that matters for this business? */
function reachedAction(a: Record<string, unknown>, model: string): boolean {
	switch (model) {
		case "form":
			return Boolean(a.form_started) || contacted(a);
		case "whatsapp":
		case "external":
			return contacted(a) || Boolean(a.handoff_started) || Boolean(a.support_opened);
		default:
			return Boolean(a.checkout_reached);
	}
}

/**
 * Fold one day's sessions into rollup rows.
 *
 * Pure, so the shape of the memory is testable without a database.
 *
 * Every session lands in exactly one row per dimension, which is the
 * property that lets a 90-day read be a SUM over 90 rows instead of a
 * scan over hundreds of thousands of sessions. It is also what makes
 * the 300-session floor dissolve on its own: six campaigns of 150 in a
 * month are 5.400 sessions in a quarter.
 */
export function foldDay(
	day: string,
	rows: StatementSessionInput[],
	conversionModel: string | null,
): TrafficRollupRow[] {
	interface Acc {
		label: string | null;
		sessions: number;
		blind: number;
		action: number;
		purchases: number;
		contacts: number;
	}
	const model = conversionModel ?? "checkout";
	const dims: Record<Exclude<RollupDimension, "account">, Map<string, Acc>> = {
		campaign: new Map(),
		page: new Map(),
		term: new Map(),
			placement: new Map(),
	};
	const account: Acc = {
		label: null,
		sessions: 0,
		blind: 0,
		action: 0,
		purchases: 0,
		contacts: 0,
	};

	for (const row of rows) {
		// The same bot gate the statement applies. Without it the series
		// would count bounces and quietly deflate every rate, and the
		// two would disagree forever after.
		if (row.eventCount < MIN_EVENTS_INTERACTIVE) continue;
		const a = row.aggregate;
		const ft = (a.attribution as { first_touch?: Record<string, unknown> } | undefined)
			?.first_touch;
		const campaignRaw = typeof ft?.campaign === "string" ? ft.campaign : null;
		// Paid only. The organic control is a statement-level
		// comparison, not a series: folding it in here would make every
		// stored rate mean something different from the screen.
		if (!campaignRaw) continue;

		const blind = sawNothing(a);
		const action = reachedAction(a, model);
		const purchase = Boolean(a.reached_thank_you);
		const contact = contacted(a);

		const bump = (m: Map<string, Acc>, key: string, label: string | null) => {
			const acc = m.get(key) ?? {
				label,
				sessions: 0,
				blind: 0,
				action: 0,
				purchases: 0,
				contacts: 0,
			};
			acc.sessions++;
			if (blind) acc.blind++;
			if (action) acc.action++;
			if (purchase) acc.purchases++;
			if (contact) acc.contacts++;
			// Last name wins, so a renamed campaign carries its current
			// name while the series stays joined on the platform id.
			if (label) acc.label = label;
			m.set(key, acc);
		};

		const { name, platformId } = splitCampaignRef(campaignRaw);
		bump(dims.campaign, platformId ?? name, name);

		const landing = typeof ft?.landing_url === "string" ? ft.landing_url : null;
		if (landing) {
			let path = landing;
			try {
				path = new URL(landing).pathname;
			} catch {
				// A malformed URL is still a label.
			}
			bump(dims.page, path, null);
		}

		const term = searchTermOf(ft?.landing_url);
		if (term) bump(dims.term, term, null);

		// Where the ad was shown, written by Utmify into utm_term and
		// never stored until now. It earns a place in the series for one
		// reason: a placement verdict has to be scoreable, and the
		// scoreboard reads history out of this table. Without the daily
		// rows there is nothing to settle a placement claim against.
		const placement = typeof ft?.utm_term === "string" ? ft.utm_term.trim() : "";
		if (placement && placement.length <= 60) bump(dims.placement, placement, null);

		account.sessions++;
		if (blind) account.blind++;
		if (action) account.action++;
		if (purchase) account.purchases++;
		if (contact) account.contacts++;
	}

	const out: TrafficRollupRow[] = [];
	for (const [dimension, m] of Object.entries(dims) as [
		Exclude<RollupDimension, "account">,
		Map<string, Acc>,
	][]) {
		for (const [key, acc] of m) out.push({ day, dimension, key, ...acc });
	}
	// The day's totals in their own row rather than repeated on all 63,
	// and safe here because an explicit dimension column cannot be
	// mistaken for a campaign and ranked, which was the reason the
	// friction rollup avoided a sentinel.
	if (account.sessions > 0) {
		out.push({ day, dimension: "account", key: "_", ...account });
	}
	return out;
}

export interface TrafficRollupResult {
	daysProcessed: number;
	rowsWritten: number;
	sessionsScanned: number;
}

function dayKey(d: Date): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Recompute traffic memory for an environment.
 *
 * `daysBack` controls how far back to redo. The cycle passes the
 * default of two; a backfill passes the whole retained window once.
 */
export async function rollUpTraffic(
	prisma: PrismaClient,
	environmentId: string,
	daysBack: number = TRAFFIC_ROLLUP_RECOMPUTE_DAYS,
	now: Date = new Date(),
	conversionModel: string | null = null,
): Promise<TrafficRollupResult> {
	const result: TrafficRollupResult = {
		daysProcessed: 0,
		rowsWritten: 0,
		sessionsScanned: 0,
	};

	for (let i = 0; i < daysBack; i++) {
		const dayStart = dayKey(new Date(now.getTime() - i * 86400000));
		const dayEnd = new Date(dayStart.getTime() + 86400000);

		const raw = (await prisma.behavioralSessionAggregate.findMany({
			where: { envId: environmentId, startedAt: { gte: dayStart, lt: dayEnd } },
			select: { aggregate: true, eventCount: true, userAgent: true },
		})) as { aggregate: string; eventCount: number; userAgent: string | null }[];

		result.daysProcessed++;
		result.sessionsScanned += raw.length;
		if (raw.length === 0) continue;

		const parsed: StatementSessionInput[] = [];
		for (const r of raw) {
			try {
				parsed.push({
					aggregate: JSON.parse(r.aggregate) as Record<string, unknown>,
					eventCount: r.eventCount,
					userAgent: r.userAgent,
				});
			} catch {
				// One malformed aggregate drops a session, never the day.
			}
		}

		const dayIso = dayStart.toISOString().slice(0, 10);
		const folded = foldDay(dayIso, parsed, conversionModel);
		if (folded.length === 0) continue;

		// One statement per chunk rather than per row: a busy day is ~63
		// rows, and at a round trip each a backfill could not finish.
		// Upsert rather than delete-then-insert, so a concurrent reader
		// never observes the day missing.
		for (let off = 0; off < folded.length; off += 400) {
			const chunk = folded.slice(off, off + 400);
			const values: unknown[] = [];
			const tuples: string[] = [];
			chunk.forEach((r, idx) => {
				const b = idx * 11;
				tuples.push(
					`($${b + 1},$${b + 2},$${b + 3}::date,$${b + 4},$${b + 5},$${b + 6},` +
						`$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11})`,
				);
				values.push(
					// Deterministic id over the same tuple as the unique
					// index, so a re-run updates its own row instead of
					// burning a fresh cuid. Hashed rather than concatenated,
					// because a campaign name can contain anything.
					`trd_${createHash("sha1")
						.update(`${environmentId} ${r.day} ${r.dimension} ${r.key}`)
						.digest("hex")}`,
					environmentId,
					r.day,
					r.dimension,
					r.key,
					r.label,
					r.sessions,
					r.blind,
					r.action,
					r.purchases,
					r.contacts,
				);
			});

			await prisma.$executeRawUnsafe(
				`INSERT INTO "TrafficDailyRollup"
				 ("id","envId","day","dimension","key","label",
				  "sessions","blind","action","purchases","contacts","rulerVersion")
				 VALUES ${tuples
						.map((t) => t.replace(/\)$/, `,${RULER_VERSION})`))
						.join(",")}
				 ON CONFLICT ("envId","day","dimension","key") DO UPDATE SET
				   "label" = EXCLUDED."label",
				   "sessions" = EXCLUDED."sessions",
				   "blind" = EXCLUDED."blind",
				   "action" = EXCLUDED."action",
				   "purchases" = EXCLUDED."purchases",
				   "contacts" = EXCLUDED."contacts",
				   "rulerVersion" = EXCLUDED."rulerVersion",
				   "computedAt" = now()`,
				...values,
			);
			result.rowsWritten += chunk.length;
		}
	}

	return result;
}
