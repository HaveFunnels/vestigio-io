import { describe, it, expect } from "vitest";
import {
	buildTrafficStatement,
	DAYS_SILENT_BEFORE_STOPPED,
} from "./traffic-statement";
import { judge } from "./traffic-scoreboard";

// ──────────────────────────────────────────────
// The campaign that already stopped.
//
// Caught because the founder refused to take 302 campaigns at face
// value and asked whether we were looking at abandoned accounts. We
// were. On the live account, 186 of 357 campaigns with traffic in a 28
// day window had brought none for two weeks or more, and 123 of them
// had brought traffic on exactly one day, 1.329 sessions between them.
// Shared links and residual fbclids, not campaigns.
//
// Two harms, and the second is the one that matters.
//
// The visible one: two of six action verdicts told the operator to cut
// campaigns that had stopped 18 and 20 days earlier. Advice nobody can
// act on, about money nobody is spending.
//
// The one that would have been worse: three weeks later the scoreboard
// reads vanished traffic as the operator following our advice, and
// scores it a hit. We would have published a hit rate padded with
// campaigns that were already off before we spoke. The scoreboard
// exists specifically to stop us flattering ourselves, so that is its
// most embarrassing possible failure mode, and it would have been
// invisible: the number would simply have looked good.
// ──────────────────────────────────────────────

const DAY = 86400000;
const WINDOW_END = "2026-11-08";
const END_MS = new Date(`${WINDOW_END}T23:59:59.999Z`).getTime();

const MUTE = { max_scroll_depth: 0, surface_progression: ["a"] };
const LIVE = { max_scroll_depth: 70, checkout_reached: true, reached_thank_you: true };

/** Sessions for one campaign, placed `daysAgo` before the window end. */
function sess(n: number, over: Record<string, unknown>, campaign: string, daysAgo: number) {
	return Array.from({ length: n }, (_, i) => ({
		aggregate: {
			attribution: {
				first_touch: { source: "FB", campaign, landing_url: "https://loja.com/p" },
			},
			...over,
		},
		eventCount: 5,
		userAgent: null,
		// Spread across a couple of days so activeDays is realistic.
		startedAt: new Date(END_MS - daysAgo * DAY - (i % 3) * DAY),
	}));
}

const OPTS = {
	windowStart: "2026-10-11",
	windowEnd: WINDOW_END,
	conversionModel: "checkout",
	minSessions: 80,
};

/** One terrible campaign that stopped, plus enough healthy ones that
 *  the account has a sane median to judge against. */
function accountWithAStoppedOffender(daysAgo: number) {
	const rows = [
		...sess(140, MUTE, "MORTA|900000000001", daysAgo),
		...sess(60, LIVE, "MORTA|900000000001", daysAgo),
	];
	for (let i = 0; i < 5; i++) {
		rows.push(...sess(150 + i * 10, MUTE, `VIVA${i}|80000000000${i}`, 1));
		rows.push(...sess(850 - i * 10, LIVE, `VIVA${i}|80000000000${i}`, 1));
	}
	return buildTrafficStatement(rows, OPTS);
}

describe("a campaign that has not run for two weeks", () => {
	it("is reported as stopped instead of as something to cut", () => {
		const st = accountWithAStoppedOffender(20);
		const dead = st.campaigns.find((c) => c.platformId === "900000000001")!;
		expect(dead.daysSinceLastSession).toBeGreaterThanOrEqual(DAYS_SILENT_BEFORE_STOPPED);
		expect(dead.verdict).toBe("parada");
	});

	it("would have been told to cut it before this existed", () => {
		// The premise, asserted so the test above cannot quietly stop
		// testing anything. Same campaign, same numbers, still running:
		// it absolutely does earn an action verdict.
		const st = accountWithAStoppedOffender(1);
		const live = st.campaigns.find((c) => c.platformId === "900000000001")!;
		expect(live.verdict === "cortar" || live.verdict === "corrigir").toBe(true);
	});

	it("wins over medicao_suspeita, because off is the honest answer", () => {
		// A stopped campaign with an absurd rate is still stopped. There
		// is nothing to investigate and nothing to spend.
		const rows = [
			...sess(200, MUTE, "ABSURDA|900000000002", 21),
			...sess(1000, LIVE, "OK|800000000009", 1),
		];
		const st = buildTrafficStatement(rows, OPTS);
		const row = st.campaigns.find((c) => c.platformId === "900000000002")!;
		expect(row.arrivedBlindPct).toBe(100);
		expect(row.verdict).toBe("parada");
	});

	it("keeps judging campaigns that merely went quiet for a few days", () => {
		// 14 days rather than 7 on purpose: a thin campaign can go quiet
		// over a weekend or a slow week without being off, and the cost
		// of a false "parada" is that we stop advising on live money.
		const st = accountWithAStoppedOffender(DAYS_SILENT_BEFORE_STOPPED - 8);
		const row = st.campaigns.find((c) => c.platformId === "900000000001")!;
		expect(row.verdict).not.toBe("parada");
	});

	it("counts the distinct days a campaign actually ran", () => {
		// One day and a handful of sessions is a shared link. The number
		// is reported so the screen can say so instead of presenting it
		// as a campaign.
		const st = accountWithAStoppedOffender(20);
		const dead = st.campaigns.find((c) => c.platformId === "900000000001")!;
		expect(dead.activeDays).toBeGreaterThan(0);
		expect(dead.activeDays).toBeLessThanOrEqual(3);
	});
});

describe("callers that supply no dates keep working exactly as before", () => {
	it("treats a campaign as running when there is nothing to judge liveness by", () => {
		// Every older fixture and any caller that does not select
		// startedAt. The safe default is running: marking an entire
		// account stopped because we lack dates would be worse than the
		// bug this fixes.
		const rows = [
			...Array.from({ length: 200 }, () => ({
				aggregate: {
					attribution: { first_touch: { source: "FB", campaign: "X|700000000001" } },
					...MUTE,
				},
				eventCount: 5,
				userAgent: null,
			})),
		];
		const st = buildTrafficStatement(rows, OPTS);
		expect(st.campaigns[0].daysSinceLastSession).toBe(null);
		expect(st.campaigns[0].verdict).not.toBe("parada");
	});
});

describe("the scoreboard cannot be padded with campaigns that were already off", () => {
	it("no longer reads a dead campaign's silence as a hit", () => {
		// This test used to demonstrate the harm by asserting the harm.
		// It is now fixed at the source: traffic stopping yields
		// `acted: null`, unknown, because 82% of campaigns on the live
		// account stop on their own with no advice from anyone. The
		// engine-side guard below is still the first line of defence,
		// and this is the second.
		const r = judge({
			verdict: "cortar",
			claimedPct: 62,
			laterPct: null,
			laterSessions: 0,
			originalSessions: 186,
			rulerThen: 2,
			rulerNow: 2,
		});
		expect(r.outcome).toBe("sumiu");
		expect(r.acted).toBe(null);
	});

	it("so the engine never emits an action verdict for one to record", () => {
		// The fix is upstream, at the only place it can be: recordVerdicts
		// writes whatever asked for an action, so nothing stopped may ask.
		// This is the line that keeps our published hit rate honest.
		const st = accountWithAStoppedOffender(20);
		// Exactly the set recordVerdicts writes, for campaigns.
		// "anuncio_errado" is deliberately absent: it is a page verdict,
		// and the compiler said so when I tried to include it here.
		const actionable = st.campaigns.filter(
			(c) =>
				c.verdict === "cortar" ||
				c.verdict === "corrigir" ||
				c.verdict === "medicao_suspeita",
		);
		for (const c of actionable) {
			expect(
				c.daysSinceLastSession === null ||
					c.daysSinceLastSession < DAYS_SILENT_BEFORE_STOPPED,
			).toBe(true);
		}
	});
});
