import { describe, it, expect } from "vitest";
import { generateBehavioralMeasurement } from "./behavioral-measurement";

// The one plan section allowed to say "medido" — so what it computes
// has to survive cross-examination. These pin the bot filter, source
// normalization, the no-intent alert on both sides of its thresholds,
// and the null contract for pixel-less environments.

const ctx = {
	environmentId: "env_test",
	monthStart: new Date("2026-09-01"),
	monthEnd: new Date("2026-10-01"),
} as never;

function aggRow(
	source: string | null,
	durationS: number,
	scrolled: boolean,
	eventCount = 10,
	formStarted = false,
) {
	return {
		eventCount,
		aggregate: JSON.stringify({
			attribution: { first_touch: { source } },
			session_duration_ms: durationS * 1000,
			max_scroll_depth: scrolled ? 50 : 0,
			form_started: formStarted,
		}),
	};
}

function prismaWith(rows: unknown[]) {
	return {
		behavioralSessionAggregate: { findMany: async () => rows },
	} as never;
}

describe("generateBehavioralMeasurement", () => {
	it("returns null when there are no sessions — no pixel, no section", async () => {
		expect(await generateBehavioralMeasurement(prismaWith([]), ctx)).toBeNull();
	});

	it("excludes single-event sessions and discloses the count", async () => {
		const rows = [
			...Array.from({ length: 120 }, () => aggRow("facebook", 30, true)),
			...Array.from({ length: 40 }, () => aggRow("facebook", 0, false, 1)),
		];
		const out = (await generateBehavioralMeasurement(prismaWith(rows), ctx))!;
		expect(out.sessionsTotal).toBe(160);
		expect(out.sessionsFiltered).toBe(120);
		expect(out.sessionsExcluded).toBe(40);
	});

	it("normalizes source aliases so fb and facebook are one row", async () => {
		const rows = [
			...Array.from({ length: 60 }, () => aggRow("fb", 30, true)),
			...Array.from({ length: 60 }, () => aggRow("facebook", 30, true)),
		];
		const out = (await generateBehavioralMeasurement(prismaWith(rows), ctx))!;
		expect(out.sources).toHaveLength(1);
		expect(out.sources[0].source).toBe("facebook");
		expect(out.sources[0].sessions).toBe(120);
	});

	it("buckets unattributed sessions under the canonical direct key, not as a crash", async () => {
		const rows = Array.from({ length: 110 }, () => aggRow(null, 45, true));
		const out = (await generateBehavioralMeasurement(prismaWith(rows), ctx))!;
		// EXAME A2 — canonical key; the UI renders the label ("Direto")
		expect(out.sources[0].source).toBe("direct");
	});

	it("hides sources below the minimum sample instead of alerting on noise", async () => {
		const rows = [
			...Array.from({ length: 150 }, () => aggRow("facebook", 30, true)),
			// 20 terrible sessions from a tiny source: not enough to judge.
			...Array.from({ length: 20 }, () => aggRow("rptn", 2, false)),
		];
		const out = (await generateBehavioralMeasurement(prismaWith(rows), ctx))!;
		expect(out.sources.map((s) => s.source)).toEqual(["facebook"]);
		expect(out.alerts).toHaveLength(0);
	});

	it("fires the no-intent alert for a 2s-median 94%-no-scroll source", async () => {
		// The measured casamontelle TikTok shape.
		const tiktok = [
			...Array.from({ length: 188 }, () => aggRow("tiktok", 2, false)),
			...Array.from({ length: 12 }, () => aggRow("tiktok", 40, true)),
		];
		const facebook = Array.from({ length: 200 }, () => aggRow("facebook", 32, false));
		const out = (await generateBehavioralMeasurement(prismaWith([...tiktok, ...facebook]), ctx))!;

		expect(out.alerts).toHaveLength(1);
		expect(out.alerts[0].source).toBe("tiktok");
		expect(out.alerts[0].text).toContain("Medido pelo pixel");
		// Facebook at 32s median must NOT alert even with high no-scroll:
		// slow-but-present traffic is a page problem, not a traffic problem.
		expect(out.alerts.some((a) => a.source === "facebook")).toBe(false);
	});
});
