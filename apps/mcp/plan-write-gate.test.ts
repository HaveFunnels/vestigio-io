import { describe, it, expect, afterEach } from "vitest";
import {
	arePlanWritesEnabled,
	isPlanWriteTool,
	planWriteDisabledResponse,
	MCP_PLAN_WRITE_TOOLS,
} from "./plan-write-gate";
import fs from "node:fs";
import path from "node:path";

const original = process.env.MCP_PLAN_WRITES_ENABLED;
afterEach(() => {
	if (original === undefined) delete process.env.MCP_PLAN_WRITES_ENABLED;
	else process.env.MCP_PLAN_WRITES_ENABLED = original;
});

describe("MCP plan-write gate", () => {
	it("is closed when the variable is unset", () => {
		// The Turnstile verifier failed OPEN on an unset secret, which
		// is how signup shipped broken for three months. A control whose
		// default is "allow" is off in every environment nobody
		// configured.
		delete process.env.MCP_PLAN_WRITES_ENABLED;
		expect(arePlanWritesEnabled()).toBe(false);
	});

	it("stays closed for anything that is not exactly 'true'", () => {
		for (const v of ["", "false", "1", "yes", "TRUE", "True", " true"]) {
			process.env.MCP_PLAN_WRITES_ENABLED = v;
			expect(arePlanWritesEnabled(), `value ${JSON.stringify(v)}`).toBe(false);
		}
	});

	it("opens only on the explicit opt-in", () => {
		process.env.MCP_PLAN_WRITES_ENABLED = "true";
		expect(arePlanWritesEnabled()).toBe(true);
	});

	it("gates both write tools and no read tool", () => {
		expect(isPlanWriteTool("propose_plan_edit")).toBe(true);
		expect(isPlanWriteTool("add_plan_comment")).toBe(true);
		for (const read of [
			"get_strategy_plan",
			"get_finding_projections",
			"get_prioritized_actions",
			"search_findings",
			"get_root_causes",
			"get_change_report",
		]) {
			expect(isPlanWriteTool(read), read).toBe(false);
		}
		expect(MCP_PLAN_WRITE_TOOLS).toHaveLength(2);
	});

	it("refuses with a machine-readable code, not a crash", () => {
		const res = planWriteDisabledResponse("propose_plan_edit");
		expect(res.type).toBe("error");
		expect(res.data.code).toBe("plan_writes_disabled");
	});
});

describe("no alternative path reaches the write without the gate", () => {
	const SRC = fs.readFileSync(path.join(__dirname, "server.ts"), "utf8");

	it("dispatches the write tools only inside the gate", () => {
		// A second dispatch site would bypass the switch entirely, which
		// is the realistic way this protection gets lost later.
		const proposeCalls = (SRC.match(/this\.proposePlanEditTool\(/g) ?? []).length;
		const commentCalls = (SRC.match(/this\.addPlanCommentTool\(/g) ?? []).length;
		expect(proposeCalls).toBe(1);
		expect(commentCalls).toBe(1);

		// Both calls must sit after the gate check in the file.
		const gateIdx = SRC.indexOf("isPlanWriteTool(toolName)");
		expect(gateIdx).toBeGreaterThan(-1);
		expect(SRC.indexOf("this.proposePlanEditTool(")).toBeGreaterThan(gateIdx);
		expect(SRC.indexOf("this.addPlanCommentTool(")).toBeGreaterThan(gateIdx);
	});

	it("keeps the read dispatch outside the gate", () => {
		// Gating reads would be a regression of a different kind:
		// the audit's whole point is that the read accessors stay.
		expect(SRC).toContain("get_strategy_plan");
		const gateIdx = SRC.indexOf("isPlanWriteTool(toolName)");
		expect(SRC.indexOf("toolName === 'get_strategy_plan'")).toBeLessThan(gateIdx);
	});
});
