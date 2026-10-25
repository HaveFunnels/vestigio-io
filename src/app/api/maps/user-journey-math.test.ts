import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Two defects the customer saw on their own journey map:
//   "2555% of users advanced from one page to another"
//   "several pages on the map that don't exist on the domain"
//
// Both came from this route and both are structural, so they are
// pinned structurally. Exercising the handler needs a session, an
// environment and 200k aggregate rows.

const SRC = fs.readFileSync(
	path.join(__dirname, "user-journey", "route.ts"),
	"utf8",
);

describe("user journey: phantom pages", () => {
	it("excludes pages that do not answer", () => {
		// The inventory holds URLs the crawler guesses — common cart and
		// checkout paths — so a store that does not use them keeps 404
		// rows. On Casa Montelle that was 11 of 62, two of them typed
		// `checkout`, so they were drawn as funnel stages.
		const q = SRC.slice(SRC.indexOf("pageInventoryItem.findMany"));
		const where = q.slice(0, q.indexOf("select:"));
		expect(where).toContain("removedAt: null");
		expect(where).toMatch(/statusCode:\s*\{\s*lt:\s*400\s*\}/);
	});
});

describe("user journey: keep-rate", () => {
	it("computes the edge label from counts, not from a ratio of percentages", () => {
		// conversionRate is already a percentage of the anchor stage.
		// Dividing one by another and multiplying by 100 compounds the
		// scaling, which is how 2% -> 51% printed as 2555%.
		const block = SRC.slice(SRC.indexOf("Enrich edges with keep-rate"));
		const upToEnd = block.slice(0, 2000);
		expect(upToEnd).toContain("stageCounts.get");
		expect(upToEnd).not.toMatch(/tgtRate\s*\/\s*srcRate/);
	});

	it("clamps the keep-rate at 100%", () => {
		// This funnel is not monotonic: the NX4 checkout goes
		// product -> /c/ directly, so a later stage can hold more
		// sessions than an earlier one. Above 100% is an artefact of
		// skippable stages, not a measurement.
		const block = SRC.slice(SRC.indexOf("Enrich edges with keep-rate")).slice(0, 2000);
		expect(block).toMatch(/Math\.min\(\s*100\s*,/);
	});
});
