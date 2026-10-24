// ──────────────────────────────────────────────
// Kill switch for the MCP's plan-write tools.
//
// `propose_plan_edit` and `add_plan_comment` mutate the customer's
// main deliverable. They are implemented, RBAC-gated and
// section-locking — and they have never been called: zero
// Conversation rows, zero PlanEdit rows, zero PlanComment rows in the
// entire life of the database.
//
// Unexercised authorization code on the main deliverable is where a
// vulnerability lives unnoticed. Unlike the inference packs, which are
// pure functions returning empty arrays, this is a write path with an
// auth decision in it. So it stays closed until a customer actually
// needs it.
//
// Reversible by design: set MCP_PLAN_WRITES_ENABLED=true. Nothing is
// deleted, no capability is lost, and the read tools are untouched.
// ──────────────────────────────────────────────

/** Tools gated by this switch. Read tools are never affected. */
export const MCP_PLAN_WRITE_TOOLS = ["propose_plan_edit", "add_plan_comment"] as const;

export type McpPlanWriteTool = (typeof MCP_PLAN_WRITE_TOOLS)[number];

/**
 * Closed unless explicitly opened.
 *
 * Deliberately fails CLOSED on an unset variable, which is the
 * opposite of how the Turnstile verifier was written and the reason
 * signup could ship broken for three months: a security control whose
 * default is "allow" is a control that is off in every environment
 * nobody configured.
 */
export function arePlanWritesEnabled(): boolean {
	return process.env.MCP_PLAN_WRITES_ENABLED === "true";
}

export function isPlanWriteTool(toolName: string): toolName is McpPlanWriteTool {
	return (MCP_PLAN_WRITE_TOOLS as readonly string[]).includes(toolName);
}

/** The refusal returned in place of the write. */
export function planWriteDisabledResponse(toolName: string) {
	return {
		type: "error" as const,
		data: {
			message:
				`Tool '${toolName}' is disabled. Plan writes through MCP are turned off ` +
				`until there is a validated need for them; the read tools are unaffected.`,
			code: "plan_writes_disabled",
		},
	};
}
