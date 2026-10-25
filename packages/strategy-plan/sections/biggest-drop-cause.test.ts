import { describe, it, expect } from "vitest";
import {
	annotateBiggestDropCause,
	type MeasuredFunnelOutput,
} from "./behavioral-measurement";

// The funnel answers "where do people leave". Nothing in it answers
// "why". These pin that the document never lets the layout imply it
// knows the cause when it does not.

function funnel(over: Partial<NonNullable<MeasuredFunnelOutput["biggestDrop"]>>) {
	return {
		basis: "pixel_measured",
		instrumentedSince: null,
		sessionsConsidered: 89474,
		note: null,
		stages: [],
		biggestDrop: {
			fromLabel: "Viu produto",
			toLabel: "Carrinho",
			fromKey: "product" as const,
			toKey: "cart" as const,
			lostSessions: 79633,
			dropPct: 94.4,
			causeNote: null,
			...over,
		},
	} as MeasuredFunnelOutput;
}

describe("annotateBiggestDropCause", () => {
	it("refuses to blame friction that cannot account for the drop", () => {
		// Casa Montelle's real shape: 94.4% leave between product and
		// cart, and the measured friction on those product pages is
		// 4.3%. Pointing at 4.3% as the reason for 94.4% would be
		// dressing up a guess.
		const f = funnel({});
		annotateBiggestDropCause(
			f,
			{
				pages: [
					{ path: "/products/vedaplus", label: "VedaPlus", frictionRatePct: 4.3 },
					{ path: "/c/NX-1", label: "Checkout", frictionRatePct: 37.5 },
				],
			},
			"pt-BR",
		);
		expect(f.biggestDrop!.causeNote).toContain("baixo demais para explicar");
		// It must not end in abandonment. The first version said "o
		// plano não atribui uma causa a ela", which reads as "figure it
		// out yourself" and costs trust in the measurement above it.
		expect(f.biggestDrop!.causeNote).not.toContain("não atribui");
		// And it must hand the reader somewhere to start.
		expect(f.biggestDrop!.causeNote).toContain("primeira tela");
		expect(f.biggestDrop!.causeNote).toContain("4,3%");
		// The 37.5% checkout page is NOT borrowed: the drop is on
		// product pages, and checkout friction has nothing to do with it.
		expect(f.biggestDrop!.causeNote).not.toContain("37,5");
	});

	it("points at friction when it is big enough to be a real lead", () => {
		const f = funnel({ fromKey: "checkout", toKey: "paid", dropPct: 65.8 });
		annotateBiggestDropCause(
			f,
			{ pages: [{ path: "/c/NX-1", label: "Checkout", frictionRatePct: 37.5 }] },
			"pt-BR",
		);
		expect(f.biggestDrop!.causeNote).toContain("pista mais forte");
		expect(f.biggestDrop!.causeNote).toContain("Checkout");
	});

	it("says so plainly when there is no friction measured at all", () => {
		const f = funnel({});
		annotateBiggestDropCause(f, { pages: [] }, "pt-BR");
		expect(f.biggestDrop!.causeNote).toContain("Não há atrito medido");
		expect(f.biggestDrop!.causeNote).not.toContain("não atribui");
	});

	it("does nothing when there is no drop to explain", () => {
		const f = { biggestDrop: null } as MeasuredFunnelOutput;
		expect(() => annotateBiggestDropCause(f, { pages: [] })).not.toThrow();
	});
});
