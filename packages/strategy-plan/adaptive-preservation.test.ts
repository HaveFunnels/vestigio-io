import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ADAPTIVE_PLAN_ENABLED is set on the vestigio-io service and NOT on
// audit-worker. Plan regens run in both: the web route and the
// worker's auto-regen. So a worker-triggered regen computed no
// adaptive section and then wrote `adaptiveJson: null` over the one the
// customer already had, under a comment claiming null "is how an
// existing plan keeps rendering exactly as before".
//
// The plan examined on 2026-11-05 still had its adaptive section only
// because the last regen happened to come through the web path. It had
// already survived 4 regens on luck.

const SRC = fs.readFileSync(
	path.join(__dirname, "generator.ts"),
	"utf8",
);

describe("flag-gated sections survive a regen that did not compute them", () => {
	it("never assigns adaptiveJson unconditionally in the update payload", () => {
		// The unconditional form is the bug. Narrative and thesis already
		// guard with `if (!output.skipped.X)`; this one had no guard.
		const updateBlock = SRC.slice(
			SRC.indexOf("whatChangedJson:"),
			SRC.indexOf("llmCostCents:"),
		);
		expect(updateBlock).not.toMatch(/adaptiveJson:\s*output\.adaptive/);
	});

	it("assigns it only when the section was computed", () => {
		expect(SRC).toContain("if (output.adaptiveComputed) {");
		expect(SRC).toMatch(/updateData\.adaptiveJson\s*=/);
	});

	it("sets adaptiveComputed exactly where the flag is honoured", () => {
		const i = SRC.indexOf("if (adaptivePlanEnabled()) {");
		expect(i).toBeGreaterThan(-1);
		// Immediately inside the flag branch, so "computed" can never be
		// true on a run that skipped the work.
		expect(SRC.slice(i, i + 200)).toContain("adaptiveComputed = true;");
	});

	it("still initialises the flag to false", () => {
		// A missing initialiser would make the guard pass on a thrown
		// run, which is the path the catch block exists for.
		expect(SRC).toContain("let adaptiveComputed = false;");
	});
});
