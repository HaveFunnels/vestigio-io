import { describe, it, expect } from "vitest";
import { computeScaleReadinessPack } from "./scale-readiness";
import { IdGenerator, type Signal, type Scoping } from "../../domain";
import type { PackInput } from "../shared/types";

// GHOST-KILLER (Sept/2026): "compradores são jogados pra outro domínio
// no checkout" shipped as the plan's R$ 24k step #1 while the SAME
// document measured 23 confirmed purchases across that hop. These pin
// the measured-contradiction gate: counted confirmations falsify the
// abandonment claim; a stray confirm or their absence changes nothing.

function sig(attribute: string, value: string, numeric: number | null): Signal {
	return {
		id: `sig_${attribute}`,
		signal_key: attribute.replace(/\./g, "_"),
		category: "trust",
		attribute,
		value,
		numeric_value: numeric,
		confidence: 70,
		cycle_ref: "cycle:test",
		evidence_refs: [],
		description: "",
	} as unknown as Signal;
}

function packInput(signals: Signal[]): PackInput {
	const byAttr = new Map<string, Signal[]>();
	for (const s of signals) {
		const list = byAttr.get(s.attribute) ?? [];
		list.push(s);
		byAttr.set(s.attribute, list);
	}
	const byKey = new Map<string, Signal[]>();
	for (const s of signals) {
		const list = byKey.get((s as { signal_key: string }).signal_key) ?? [];
		list.push(s);
		byKey.set((s as { signal_key: string }).signal_key, list);
	}
	return {
		signals,
		byAttribute: byAttr,
		byKey,
		first: (attr: string) => byAttr.get(attr)?.[0],
		scoping: { organization_ref: "org:test", environment_ref: "env:test" } as unknown as Scoping,
		cycle_ref: "cycle:test",
		ids: new IdGenerator("test"),
	} as unknown as PackInput;
}

function trustInference(out: ReturnType<typeof computeScaleReadinessPack>) {
	return out.find((i) => i.inference_key === "trust_boundary_crossed");
}

describe("trust_boundary_crossed × measured confirmed purchases", () => {
	it("without measurement, a crossed boundary still infers true (old behavior)", () => {
		const out = computeScaleReadinessPack(
			packInput([sig("trust.boundary_crossed", "true", 1)]),
		);
		expect(trustInference(out)?.conclusion_value).toBe("true");
	});

	it("measured confirmations >= 5 falsify the abandonment claim", () => {
		const out = computeScaleReadinessPack(
			packInput([
				sig("trust.boundary_crossed", "true", 1),
				sig("behavioral.confirmed_purchases", "true", 23),
			]),
		);
		const inf = trustInference(out);
		expect(inf?.conclusion_value).toBe("false");
		expect(inf?.reasoning).toContain("23 confirmed purchases");
	});

	it("a stray confirm below the floor never flips the claim", () => {
		const out = computeScaleReadinessPack(
			packInput([
				sig("trust.boundary_crossed", "true", 1),
				sig("behavioral.confirmed_purchases", "true", 2),
			]),
		);
		expect(trustInference(out)?.conclusion_value).toBe("true");
	});

	it("checkout.off_domain alone is also gated by measurement", () => {
		const out = computeScaleReadinessPack(
			packInput([
				sig("checkout.off_domain", "true", 1),
				sig("behavioral.confirmed_purchases", "true", 10),
			]),
		);
		expect(trustInference(out)?.conclusion_value).toBe("false");
	});
});
