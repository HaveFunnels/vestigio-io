import { describe, it, expect } from "vitest";
import {
	buildSessionRow,
	rebuildEventsFromTimeline,
	MAX_TIMELINE_ENTRIES,
	type CompactEntry,
	type RawSessionRow,
} from "./session-row-builder";

const ENV = "env_test";
const SESSION = "sess_test";
const T0 = new Date("2026-09-09T10:00:00.000Z");

function row(
	offsetMs: number,
	eventType: string,
	url: string,
	data: Record<string, unknown> | null = null,
	attribution: string | null = null,
): RawSessionRow {
	return {
		url,
		eventType,
		occurredAt: new Date(T0.getTime() + offsetMs),
		payload: JSON.stringify({
			type: eventType,
			ts: T0.getTime() + offsetMs,
			session_id: SESSION,
			env_id: ENV,
			url,
			...(data ? { data } : {}),
		}),
		attribution,
		userAgent: "Mozilla/5.0 test",
	};
}

describe("buildSessionRow", () => {
	it("returns null when there is nothing to keep", () => {
		expect(buildSessionRow(ENV, SESSION, [])).toBeNull();
	});

	it("returns null when every payload is malformed, so the caller drops the rows", () => {
		const rows: RawSessionRow[] = [
			{ ...row(0, "page_view", "https://x.com/"), payload: "{not json" },
			{ ...row(10, "page_view", "https://x.com/"), payload: "" },
		];
		expect(buildSessionRow(ENV, SESSION, rows)).toBeNull();
	});

	it("keeps the good rows when only some are malformed", () => {
		const rows: RawSessionRow[] = [
			row(0, "page_view", "https://x.com/"),
			{ ...row(10, "page_view", "https://x.com/a"), payload: "{broken" },
			row(20, "cta_click", "https://x.com/a"),
		];
		const built = buildSessionRow(ENV, SESSION, rows)!;
		expect(built.eventCount).toBe(2);
		expect(JSON.parse(built.timeline)).toHaveLength(2);
	});

	it("bounds startedAt/endedAt by the first and last row", () => {
		const rows = [
			row(0, "page_view", "https://x.com/"),
			row(5_000, "scroll_depth", "https://x.com/"),
			row(12_000, "page_leave", "https://x.com/"),
		];
		const built = buildSessionRow(ENV, SESSION, rows)!;
		expect(built.startedAt.getTime()).toBe(T0.getTime());
		expect(built.endedAt.getTime()).toBe(T0.getTime() + 12_000);
	});

	it("dedupes URLs and references them by index", () => {
		const rows = [
			row(0, "page_view", "https://x.com/a"),
			row(1_000, "cta_viewed", "https://x.com/a"),
			row(2_000, "page_view", "https://x.com/b"),
			row(3_000, "cta_viewed", "https://x.com/a"),
		];
		const built = buildSessionRow(ENV, SESSION, rows)!;
		const urls = JSON.parse(built.urls) as string[];
		const timeline = JSON.parse(built.timeline) as CompactEntry[];

		expect(urls).toEqual(["https://x.com/a", "https://x.com/b"]);
		expect(timeline.map((e) => e[2])).toEqual([0, 0, 1, 0]);
	});

	it("stores offsets from the session start, not absolute timestamps", () => {
		const rows = [row(0, "page_view", "https://x.com/"), row(7_500, "cta_click", "https://x.com/")];
		const timeline = JSON.parse(buildSessionRow(ENV, SESSION, rows)!.timeline) as CompactEntry[];
		expect(timeline.map((e) => e[0])).toEqual([0, 7_500]);
	});

	it("omits the data slot when there is no data, and keeps it when there is", () => {
		const rows = [
			row(0, "page_view", "https://x.com/"),
			row(1_000, "scroll_depth", "https://x.com/", { depth_pct: 50 }),
			row(2_000, "cta_click", "https://x.com/", {}),
		];
		const timeline = JSON.parse(buildSessionRow(ENV, SESSION, rows)!.timeline) as CompactEntry[];
		expect(timeline[0]).toHaveLength(3);
		expect(timeline[1]).toHaveLength(4);
		expect(timeline[1][3]).toEqual({ depth_pct: 50 });
		// An empty data object carries nothing, so it should not cost a slot.
		expect(timeline[2]).toHaveLength(3);
	});

	it("takes the first non-null attribution and tolerates malformed ones", () => {
		const good = JSON.stringify({ source: "google", medium: "cpc" });
		const rows = [
			row(0, "page_view", "https://x.com/", null, "{broken"),
			row(1_000, "page_view", "https://x.com/", null, good),
			row(2_000, "page_view", "https://x.com/", null, JSON.stringify({ source: "later" })),
		];
		const built = buildSessionRow(ENV, SESSION, rows)!;
		const agg = JSON.parse(built.aggregate);
		// aggregateSession owns the attribution shape; assert only that the
		// first *parseable* one reached it rather than the later "later".
		expect(JSON.stringify(agg)).toContain("google");
		expect(JSON.stringify(agg)).not.toContain("later");
	});

	it("caps the timeline but still aggregates every event", () => {
		const rows = Array.from({ length: MAX_TIMELINE_ENTRIES + 25 }, (_, i) =>
			row(i * 100, "page_view", `https://x.com/p${i}`),
		);
		const built = buildSessionRow(ENV, SESSION, rows)!;
		expect(built.timelineTruncated).toBe(true);
		expect(JSON.parse(built.timeline)).toHaveLength(MAX_TIMELINE_ENTRIES);
		expect(built.eventCount).toBe(MAX_TIMELINE_ENTRIES + 25);
	});

	it("does not flag truncation when the session fits", () => {
		const rows = Array.from({ length: 20 }, (_, i) => row(i * 100, "page_view", "https://x.com/"));
		expect(buildSessionRow(ENV, SESSION, rows)!.timelineTruncated).toBe(false);
	});
});

describe("timeline round-trip", () => {
	// The property the whole compact format rests on: journey replay reads
	// type, data, ts and url per event, so if rebuilding reproduces those,
	// replay output is unchanged by construction.
	it("reproduces type, data, url and relative time for every event", () => {
		const rows = [
			row(0, "page_view", "https://x.com/"),
			row(1_200, "scroll_depth", "https://x.com/", { depth_pct: 75 }),
			row(4_000, "cta_click", "https://x.com/produto", { label: "Comprar" }),
			row(9_100, "form_start", "https://x.com/checkout"),
			row(15_000, "page_leave", "https://x.com/checkout", { time_on_page_ms: 5_900 }),
		];
		const built = buildSessionRow(ENV, SESSION, rows)!;

		const rebuilt = rebuildEventsFromTimeline({
			envId: ENV,
			sessionId: SESSION,
			startedAt: built.startedAt,
			timeline: JSON.parse(built.timeline),
			urls: JSON.parse(built.urls),
		});

		expect(rebuilt).toHaveLength(rows.length);
		rows.forEach((original, i) => {
			const originalPayload = JSON.parse(original.payload);
			expect(rebuilt[i].type).toBe(originalPayload.type);
			expect(rebuilt[i].url).toBe(original.url);
			expect(rebuilt[i].ts).toBe(original.occurredAt.getTime());
			expect(rebuilt[i].data).toEqual(originalPayload.data ?? {});
		});
	});

	it("survives a session that revisits the same URLs", () => {
		const rows = [
			row(0, "page_view", "https://x.com/a"),
			row(1_000, "page_view", "https://x.com/b"),
			row(2_000, "backtrack", "https://x.com/a"),
			row(3_000, "page_view", "https://x.com/b"),
		];
		const built = buildSessionRow(ENV, SESSION, rows)!;
		const rebuilt = rebuildEventsFromTimeline({
			envId: ENV,
			sessionId: SESSION,
			startedAt: built.startedAt,
			timeline: JSON.parse(built.timeline),
			urls: JSON.parse(built.urls),
		});
		expect(rebuilt.map((e) => e.url)).toEqual([
			"https://x.com/a",
			"https://x.com/b",
			"https://x.com/a",
			"https://x.com/b",
		]);
	});
});
