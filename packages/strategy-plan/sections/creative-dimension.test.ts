import { describe, it, expect } from "vitest";
import {
	buildTrafficStatement,
	MIN_SESSIONS_PER_CREATIVE,
	MAX_CREATIVES_TO_COMPARE,
	MIN_SESSIONS_PER_ADSET,
	MIN_SESSIONS_PER_PLACEMENT,
} from "./traffic-statement";

// ──────────────────────────────────────────────
// The ad layer, which is where the operator actually decides.
//
// Four of nine media-buying specialists named this the decisive gap,
// and the sharpest version was that the pixel already read utm_content
// and read it only to strip it from the URL.
//
// What makes this product entitled to judge creative, when a creative
// generator is not: the base rate. The council's creative specialist
// did the comparison. Telling two creatives apart on PURCHASES needs
// about 16.292 clicks per pair, twenty months of a small advertiser's
// budget. On MUTE VISITS it needs 586 to 1.178, three to five weeks.
// Not a better model. A better base rate.
//
// And the discipline that keeps it honest: refusing to rank what the
// sample cannot separate. Every competitor in this category sells the
// opposite.
// ──────────────────────────────────────────────

const WIN = {
	windowStart: "2026-10-13",
	windowEnd: "2026-11-10",
	conversionModel: "checkout",
	minSessions: 80,
};
const MUTE = { max_scroll_depth: 0, surface_progression: ["a"] };
const BUYS = { max_scroll_depth: 70, checkout_reached: true, reached_thank_you: true };

function sess(n: number, over: Record<string, unknown>, creative: string | null) {
	return Array.from({ length: n }, () => ({
		aggregate: {
			attribution: {
				first_touch: {
					source: "FB",
					campaign: "C|700000000001",
					landing_url: "https://l.com/p",
					...(creative === null ? {} : { utm_content: creative }),
				},
			},
			...over,
		},
		eventCount: 5,
		userAgent: null,
	}));
}

describe("seeing the ad layer at all", () => {
	it("stays empty when the operator never pasted the parameters", () => {
		// The state of the live account today, measured at 0%. Empty is
		// honest: it means we cannot see the ad, not that every ad
		// performs the same. The product must not invent a creative
		// dimension out of campaign names.
		const st = buildTrafficStatement(
			[...sess(300, MUTE, null), ...sess(700, BUYS, null)],
			WIN,
		);
		expect(st.creatives).toEqual([]);
		expect(st.creativePower.tooThin).toBe(true);
		expect(st.creativePower.detectablePoints).toBe(null);
	});

	it("separates two creatives inside one campaign", () => {
		// The frase no generator can say: this creative buys accidental
		// clicks, that one brings people who arrive and act. Same
		// campaign, same page, same week.
		const st = buildTrafficStatement(
			[
				...sess(420, MUTE, "gancho-preco"),
				...sess(180, BUYS, "gancho-preco"),
				...sess(120, MUTE, "gancho-garantia"),
				...sess(480, BUYS, "gancho-garantia"),
			],
			WIN,
		);
		const a = st.creatives.find((c) => c.name === "gancho-preco")!;
		const b = st.creatives.find((c) => c.name === "gancho-garantia")!;
		expect(a.arrivedBlindPct).toBe(70);
		expect(b.arrivedBlindPct).toBe(20);
		// Both live in the same campaign, which is the point: this is a
		// layer the campaign verdict could never reach.
		expect(a.campaigns).toBe(1);
		expect(b.campaigns).toBe(1);
	});

	it("ignores a creative too thin to name", () => {
		const st = buildTrafficStatement(
			[
				...sess(400, MUTE, "grande"),
				...sess(600, BUYS, "grande"),
				...sess(MIN_SESSIONS_PER_CREATIVE - 20, MUTE, "minusculo"),
			],
			WIN,
		);
		expect(st.creatives.map((c) => c.name)).toEqual(["grande"]);
	});

	it("ranks by waste in absolute terms, like every other dimension", () => {
		const st = buildTrafficStatement(
			[
				...sess(200, MUTE, "pequeno-ruim"),
				...sess(100, BUYS, "pequeno-ruim"),
				...sess(500, MUTE, "grande-medio"),
				...sess(1500, BUYS, "grande-medio"),
			],
			WIN,
		);
		// 500 wasted beats 200 wasted even though the rate is lower,
		// because the operator's money is in the count.
		expect(st.creatives[0].name).toBe("grande-medio");
	});
});

describe("refusing to rank what the sample cannot separate", () => {
	it("says how small a difference it could actually detect", () => {
		// The number every competitor hides. Two creatives at 600
		// sessions each cannot tell a 2-point difference apart, and the
		// product says so instead of ranking them anyway.
		const st = buildTrafficStatement(
			[
				...sess(180, MUTE, "a"),
				...sess(420, BUYS, "a"),
				...sess(180, MUTE, "b"),
				...sess(420, BUYS, "b"),
			],
			WIN,
		);
		expect(st.creativePower.comparable).toBe(2);
		expect(st.creativePower.detectablePoints).toBeGreaterThan(2);
		expect(st.creativePower.tooThin).toBe(false);
	});

	it("needs less sample to separate than a purchase rate would", () => {
		// The arithmetic that entitles this product to the question. At
		// these volumes a purchase-rate comparison is hopeless and a
		// mute-rate comparison is not.
		const st = buildTrafficStatement(
			[
				...sess(300, MUTE, "a"),
				...sess(900, BUYS, "a"),
				...sess(300, MUTE, "b"),
				...sess(900, BUYS, "b"),
			],
			WIN,
		);
		// A real 10-point gap between creatives is detectable here.
		expect(st.creativePower.detectablePoints!).toBeLessThan(10);
	});

	it("never offers to compare more than the ceiling", () => {
		// With N identical creatives the best of N looks better than
		// the truth by roughly 1,42 standard errors at N=8. Eight
		// variants on a small budget is a lottery with a leaderboard,
		// and the regression next cycle would land in the drift
		// decomposition's behaviour term.
		const rows = [];
		for (let i = 0; i < 8; i++) {
			rows.push(...sess(200, MUTE, `v${i}`));
			rows.push(...sess(300, BUYS, `v${i}`));
		}
		const st = buildTrafficStatement(rows, WIN);
		expect(st.creatives.length).toBe(8);
		expect(st.creativePower.comparable).toBe(8);
		expect(st.creativePower.maxComparable).toBe(MAX_CREATIVES_TO_COMPARE);
	});

	it("calls a single creative too thin to compare, not a winner", () => {
		// One creative is not a comparison. Declaring it best would be
		// the purest form of the lottery.
		const st = buildTrafficStatement(
			[...sess(300, MUTE, "unico"), ...sess(700, BUYS, "unico")],
			WIN,
		);
		expect(st.creatives.length).toBe(1);
		expect(st.creativePower.tooThin).toBe(true);
		expect(st.creativePower.detectablePoints).toBe(null);
	});
});

describe("the layers that were in the data all along", () => {
	// The product had been describing itself as unable to see ad sets,
	// and four council members built arguments on that limitation. The
	// limitation was a field nobody read.
	//
	// Utmify, which the account already uses, writes
	// `{{adset.name}}|{{adset.id}}` into utm_medium and `{{placement}}`
	// into utm_term, and the pixel has always captured medium. Measured:
	// 99,5% of paid sessions carry the ad set, 96% with an id,
	// retroactive across the whole history. Nothing had to change on the
	// operator's side.

	function withLayers(
		n: number,
		over: Record<string, unknown>,
		adset: string,
		placement: string,
	) {
		return Array.from({ length: n }, () => ({
			aggregate: {
				attribution: {
					first_touch: {
						source: "FB",
						campaign: "Campanha|700000000001",
						medium: adset,
						utm_term: placement,
						landing_url: "https://l.com/p",
					},
				},
				...over,
			},
			eventCount: 5,
			userAgent: null,
		}));
	}

	it("reads the ad set out of utm_medium, with its id", () => {
		const st = buildTrafficStatement(
			[
				...withLayers(300, MUTE, "Publico aberto 55+|120251111111111", "Instagram_Feed"),
				...withLayers(700, BUYS, "Publico aberto 55+|120251111111111", "Instagram_Feed"),
			],
			WIN,
		);
		expect(st.adSets).toHaveLength(1);
		expect(st.adSets[0].name).toBe("Publico aberto 55+");
		expect(st.adSets[0].platformId).toBe("120251111111111");
		expect(st.adSets[0].arrivedBlindPct).toBe(30);
	});

	it("separates two ad sets inside one campaign", () => {
		// A layer the campaign verdict could never reach, and the layer
		// where budget actually lives in Meta.
		const st = buildTrafficStatement(
			[
				...withLayers(600, MUTE, "aberto|120251111111111", "Instagram_Feed"),
				...withLayers(400, BUYS, "aberto|120251111111111", "Instagram_Feed"),
				...withLayers(150, MUTE, "lookalike|120252222222222", "Instagram_Feed"),
				...withLayers(850, BUYS, "lookalike|120252222222222", "Instagram_Feed"),
			],
			WIN,
		);
		expect(st.adSets).toHaveLength(2);
		const aberto = st.adSets.find((a) => a.name === "aberto")!;
		const look = st.adSets.find((a) => a.name === "lookalike")!;
		expect(aberto.arrivedBlindPct).toBe(60);
		expect(look.arrivedBlindPct).toBe(15);
	});

	it("ignores a medium that is not an ad set reference", () => {
		// Plain "cpc" or "social" is a medium, not an ad set. Without
		// the pipe there is no id and no reason to believe it names one.
		const st = buildTrafficStatement(
			[...withLayers(500, MUTE, "cpc", "Instagram_Feed"), ...withLayers(500, BUYS, "cpc", "Instagram_Feed")],
			WIN,
		);
		expect(st.adSets).toEqual([]);
	});

	it("ranks placements by rate, because the fix is a toggle", () => {
		// The one dimension where ranking by rate rather than by
		// absolute waste is correct: the operator turns a placement off
		// with a checkbox, so the question is which is worst, not which
		// holds the most money.
		//
		// Measured on the first days of real data: Audience Network at
		// 71,8% against Instagram Stories at 19,7%, a 52 point spread,
		// and the pessimistic end of Audience Network is still 61,5%.
		const st = buildTrafficStatement(
			[
				...withLayers(50, MUTE, "a|120251111111111", "an"),
				...withLayers(20, BUYS, "a|120251111111111", "an"),
				...withLayers(60, MUTE, "a|120251111111111", "Instagram_Stories"),
				...withLayers(240, BUYS, "a|120251111111111", "Instagram_Stories"),
			],
			WIN,
		);
		expect(st.placements[0].name).toBe("an");
		expect(st.placements[0].arrivedBlindPct).toBeGreaterThan(
			st.placements[1].arrivedBlindPct,
		);
		// Even the cautious end has to stay clear of the better one, or
		// the recommendation is noise.
		expect(st.placements[0].blindPctLow).toBeGreaterThan(
			st.placements[1].arrivedBlindPct,
		);
	});

	it("uses a lower floor for placement than for budget layers", () => {
		// Meta's whole inventory is under ten placements, so there is no
		// multiple-comparison problem to correct for, and acting costs a
		// checkbox rather than money.
		expect(MIN_SESSIONS_PER_PLACEMENT).toBeLessThan(MIN_SESSIONS_PER_ADSET);
	});

	it("gives the creative a readable name instead of name piped to id", () => {
		const st = buildTrafficStatement(
			[
				...sess(200, MUTE, "Gancho preco|120253333333333"),
				...sess(300, BUYS, "Gancho preco|120253333333333"),
			],
			WIN,
		);
		expect(st.creatives[0].name).toBe("Gancho preco");
	});
});
