import { describe, it, expect } from "vitest";
import { SourceKind, CollectionMethod } from "../domain";
import { recomputeAll } from "../workspace";
import { projectFindings } from "./index";
import {
	testScoping,
	pageContentEvidence,
	checkoutIndicatorEvidence,
	policyEvidence,
} from "../../tests/helpers";

// Measured on the customer's 2026-11-05 cycle: all 22 findings came
// back with origin=null and claimType=null. FindingProjection had
// declared both fields and prisma-finding-store persisted both, but
// nothing on the projection path ever SET them.
//
// That mattered more than a null column. classifyClaim in the adaptive
// plan reads exactly those two fields:
//
//   if (f.claimType === "behavioral" || f.origin === "pixel") ...
//
// so its primary discriminator was dead and every finding fell through
// to 'inference'. The plan could not tell a counted session from a
// detector's guess, which is the distinction the whole "measured vs
// inferred" promise rests on.

function resultFrom(evidence: ReturnType<typeof pageContentEvidence>[]) {
	return recomputeAll({
		evidence,
		scoping: testScoping(),
		cycle_ref: "audit_cycle:c1",
		root_domain: "shop.com",
		landing_url: "https://shop.com/",
		conversion_proximity: 2,
		is_production: true,
	});
}

const crawled = () => [
	pageContentEvidence("https://shop.com/"),
	checkoutIndicatorEvidence("https://shop.com/", "https://pay.external.com/checkout", true),
	policyEvidence("https://shop.com/", "https://shop.com/privacy", "privacy"),
];

describe("finding provenance", () => {
	it("never leaves origin or claim_type null when evidence was cited", () => {
		const findings = projectFindings(resultFrom(crawled()));
		expect(findings.length).toBeGreaterThan(0);
		for (const f of findings) {
			expect(f.origin, `${f.inference_key} has null origin`).toBeTruthy();
			expect(f.claim_type, `${f.inference_key} has null claim_type`).toBeTruthy();
		}
	});

	it("calls page-fetched evidence 'crawler', not 'pixel'", () => {
		const findings = projectFindings(resultFrom(crawled()));
		const fetched = findings.filter((f) => f.origin === "crawler");
		expect(fetched.length).toBeGreaterThan(0);
		// Nothing in this fixture was counted from a session, so nothing
		// may claim it was.
		expect(findings.some((f) => f.origin === "pixel")).toBe(false);
	});

	it("maps claim_type from origin, and never invents 'defect'", () => {
		const findings = projectFindings(resultFrom(crawled()));
		for (const f of findings) {
			expect(f.claim_type).toBe(f.origin === "pixel" ? "behavioral" : "inference");
			// A detector firing is not a reproducible defect. Promoting it
			// to one is the overclaim this field exists to prevent.
			expect(f.claim_type).not.toBe("defect");
			expect(f.claim_type).not.toBe("anomaly");
		}
	});

	it("promotes a session-counted finding to pixel/behavioral", () => {
		// Same page evidence, re-stamped as the behavioral snippet's
		// passive collection, which is what the pixel produces.
		const measured = crawled().map((e) => ({
			...e,
			source_kind: SourceKind.BehavioralSnippet,
			collection_method: CollectionMethod.PassiveCollection,
		}));
		const findings = projectFindings(resultFrom(measured as typeof measured));
		const pixel = findings.filter((f) => f.origin === "pixel");
		expect(pixel.length).toBeGreaterThan(0);
		for (const f of pixel) expect(f.claim_type).toBe("behavioral");
	});

	it("derives, rather than defaulting: no evidence means 'inference'", () => {
		// The honest answer for an inference that cites nothing is
		// 'inference', not a convenient 'crawler'.
		const findings = projectFindings(resultFrom(crawled()));
		const withNoEvidence = findings.filter((f) => f.origin === "inference");
		for (const f of withNoEvidence) {
			expect(f.claim_type).toBe("inference");
		}
		// And the mapping is total: every finding lands in one of four.
		for (const f of findings) {
			expect(["crawler", "pixel", "integration", "inference"]).toContain(f.origin);
		}
	});
});
