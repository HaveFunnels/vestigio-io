import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// detectedPlatforms was [] on every environment in production,
// including the one whose own evidence says platform_name="shopify"
// (pattern "cdn\.shopify\.com", confidence 60) collected the same day.
//
// The cause was a cost gate doing double duty. The 90-day freshness
// check exists so back-to-back cold cycles don't re-pay for the Haiku
// industry call, and it returned before the deterministic snapshot,
// which is a database read of evidence the cycle already produced.
// The file's own comment said those fields "don't gate on LLM
// availability" while the early return gated them.
//
// This matters beyond tidiness: the platform decides whether a
// customer's checkout can be measured at all, because a DOM snippet
// cannot run inside a Shopify-hosted checkout. The platform-risk
// branch in signals/engine.ts reads detectedPlatforms and has
// therefore never fired for anyone.

const SRC = fs.readFileSync(
	path.join(__dirname, "populate-domain-fingerprint.ts"),
	"utf8",
);

describe("domain fingerprint freshness gate", () => {
	it("no longer returns early on still-fresh", () => {
		expect(SRC).not.toContain('reason: "still-fresh"');
	});

	it("gates only the LLM call", () => {
		expect(SRC).toContain("const industryStillFresh = Boolean(");
		expect(SRC).toContain("if (!industryStillFresh && isLlmEnabled()");
	});

	it("keeps the cycle-mode gate, which is about cost of a different kind", () => {
		// cold-only is still correct: hot and warm cycles do not crawl
		// the homepage, so there is nothing fresh to snapshot.
		expect(SRC).toContain('if (cycleMode !== "cold")');
	});

	it("still reads the platform evidence after the gate", () => {
		const gateAt = SRC.indexOf("const industryStillFresh");
		const readAt = SRC.indexOf('evidenceType: "platform_indicator"');
		expect(gateAt).toBeGreaterThan(-1);
		expect(readAt).toBeGreaterThan(gateAt);
	});

	it("reads the payload field the evidence actually carries", () => {
		// Verified against production: the payload is
		// { type, platform_name, detection_source, confidence,
		//   matched_pattern }. A name mismatch here would be silent,
		// which is how the sibling {pairLabel} defect shipped.
		expect(SRC).toContain("platform_name");
	});
});
