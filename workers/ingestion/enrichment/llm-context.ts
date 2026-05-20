// ──────────────────────────────────────────────
// Enrichment LLM context helper.
//
// Every enrichment that calls callModel needs an LlmCallContext with
// orgId + env/cycle for the TokenCostLedger + circuit-breaker. The
// orgId is encoded into Scoping.workspace_ref as "workspace:<orgId>";
// envId likewise in environment_ref. This helper centralizes the
// parsing so every enrichment uses the same shape and we can't drift.
// ──────────────────────────────────────────────

import type { Scoping } from "../../../packages/domain";
import type { LlmCallContext } from "../../../apps/mcp/llm/client";

/**
 * Build an LlmCallContext for an enrichment LLM call. Strips the
 * "workspace:" / "environment:" prefixes the scoping wraps every ref
 * with — TokenCostLedger.organizationId is the bare cuid.
 */
export function buildEnrichmentLlmContext(
	purpose: string,
	scoping: Scoping,
	cycleRef: string,
): LlmCallContext {
	const organizationId = scoping.workspace_ref.startsWith("workspace:")
		? scoping.workspace_ref.slice("workspace:".length)
		: null;
	const environmentId = scoping.environment_ref.startsWith("environment:")
		? scoping.environment_ref.slice("environment:".length)
		: null;
	const cycleId = cycleRef.startsWith("audit_cycle:")
		? cycleRef.slice("audit_cycle:".length)
		: cycleRef;
	return {
		purpose,
		organizationId,
		environmentId,
		cycleId,
	};
}
