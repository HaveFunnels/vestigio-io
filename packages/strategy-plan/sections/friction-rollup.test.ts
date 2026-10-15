import { describe, it, expect } from "vitest";
import { scanTimelinesByPath, computeMeasuredFriction } from "./measured-friction";

// The rollup replaces a 30-day scan of raw timelines with a SUM over
// 30 pre-computed daily rows. That substitution is only valid if
// splitting the sessions into daily buckets and summing the buckets
// gives exactly what scanning the whole window gives.
//
// This pins that property. It is the thing that has to hold before
// timeline retention can be shortened, because once timelines are
// gone the live scan cannot be run again to check.

type Entry = [number, string, number, Record<string, unknown>?];

function row(entries: Entry[], urls: string[]) {
	return { timeline: JSON.stringify(entries), urls: JSON.stringify(urls) };
}

const URLS = ["https://loja.com/", "https://loja.com/products/kit", "https://loja.com/cart"];

function frictionSession() {
	return row(
		[
			[0, "page_view", 0],
			[3000, "page_view", 1],
			[5000, "dead_click", 1],
			[8000, "hesitation_pause", 1, { near_cta: true }],
			[9000, "form_retry", 2],
		],
		URLS,
	);
}

function cleanSession() {
	return row(
		[
			[0, "page_view", 0],
			[2000, "page_view", 1],
			[4000, "cta_click", 1, { label: "Comprar" }],
		],
		URLS,
	);
}

/** What the rollup writer stores for one day. */
function bucket(rows: { timeline: string; urls: string }[]) {
	const out = new Map<
		string,
		{
			sessions: number;
			sessionsWithFriction: number;
			deadClicks: number;
			hesitationsNearCta: number;
			inputAbandons: number;
			backtracks: number;
			formRetries: number;
		}
	>();
	for (const [path, a] of scanTimelinesByPath(rows)) {
		out.set(path, {
			sessions: a.sessions.size,
			sessionsWithFriction: a.frictionSessions.size,
			deadClicks: a.deadClicks,
			hesitationsNearCta: a.hesitationsNearCta,
			inputAbandons: a.inputAbandons,
			backtracks: a.backtracks,
			formRetries: a.formRetries,
		});
	}
	return out;
}

describe("friction daily rollup", () => {
	it("summing daily buckets equals scanning the whole window", () => {
		// Thirty uneven days, so the split is not a tidy multiple.
		const days: { timeline: string; urls: string }[][] = [];
		for (let d = 0; d < 30; d++) {
			const nFriction = (d * 7) % 13;
			const nClean = (d * 11) % 17;
			days.push([
				...Array.from({ length: nFriction }, frictionSession),
				...Array.from({ length: nClean }, cleanSession),
			]);
		}
		const all = days.flat();

		const summed = new Map<string, Record<string, number>>();
		for (const day of days) {
			for (const [path, b] of bucket(day)) {
				const acc = summed.get(path) ?? {
					sessions: 0,
					sessionsWithFriction: 0,
					deadClicks: 0,
					hesitationsNearCta: 0,
					inputAbandons: 0,
					backtracks: 0,
					formRetries: 0,
				};
				for (const k of Object.keys(acc)) {
					acc[k] += (b as Record<string, number>)[k];
				}
				summed.set(path, acc);
			}
		}

		const live = computeMeasuredFriction(all, new Date("2026-09-15"), new Date("2026-10-15"))!;
		expect(live.pages.length).toBeGreaterThan(0);

		for (const pg of live.pages) {
			const got = summed.get(pg.path)!;
			expect(got, `missing bucket for ${pg.path}`).toBeDefined();
			expect(got.sessions, `${pg.path}.sessions`).toBe(pg.sessions);
			expect(got.sessionsWithFriction, `${pg.path}.sessionsWithFriction`).toBe(
				pg.sessionsWithFriction,
			);
			expect(got.deadClicks, `${pg.path}.deadClicks`).toBe(pg.deadClicks);
			expect(got.hesitationsNearCta, `${pg.path}.hesitationsNearCta`).toBe(
				pg.hesitationsNearCta,
			);
			expect(got.inputAbandons, `${pg.path}.inputAbandons`).toBe(pg.inputAbandons);
			expect(got.backtracks, `${pg.path}.backtracks`).toBe(pg.backtracks);
			expect(got.formRetries, `${pg.path}.formRetries`).toBe(pg.formRetries);
		}
	});

	it("distinct-session counts do not double-count across buckets", () => {
		// A session lives in exactly one day, so the same session can
		// never be counted by two buckets. If bucketing ever changed to
		// overlap, this is the test that would catch it.
		const dayA = Array.from({ length: 20 }, frictionSession);
		const dayB = Array.from({ length: 20 }, frictionSession);

		const a = bucket(dayA).get("/products/kit")!;
		const b = bucket(dayB).get("/products/kit")!;
		const live = computeMeasuredFriction(
			[...dayA, ...dayB],
			new Date("2026-09-15"),
			new Date("2026-10-15"),
		)!;
		const pdp = live.pages.find((p) => p.path === "/products/kit")!;

		expect(a.sessionsWithFriction + b.sessionsWithFriction).toBe(pdp.sessionsWithFriction);
		expect(a.sessions + b.sessions).toBe(pdp.sessions);
	});

	it("the near-CTA rule survives bucketing", () => {
		// A pause away from the CTA is engagement, not friction. If the
		// rollup ever reimplemented the scan instead of calling it, this
		// is the rule most likely to be dropped.
		const day = Array.from({ length: 40 }, () =>
			row(
				[
					[0, "page_view", 1],
					[5000, "hesitation_pause", 1, { near_cta: false }],
				],
				URLS,
			),
		);
		const b = bucket(day).get("/products/kit")!;
		expect(b.hesitationsNearCta).toBe(0);
		expect(b.sessionsWithFriction).toBe(0);
		expect(b.sessions).toBe(40);
	});
});
