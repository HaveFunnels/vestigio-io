// ──────────────────────────────────────────────
// Strategy Plan generator — public API
//
// Single import surface for the API route + admin trigger + cron.
// All sub-section + helper internals live behind this barrel.
// ──────────────────────────────────────────────

export {
	generatePlan,
	generateAndPersistPlan,
	type GeneratePlanArgs,
	type RegenScope,
} from "./generator";

export {
	maybeTriggerRenarrative,
	type RenarrateTrigger,
} from "./renarrate";

export { resolvePlanAccess, type PlanAccess } from "./rbac";

export {
	decideAutoRegen,
	maybeAutoRegenPlan,
	type AutoRegenDecision,
} from "./auto-regen";

export type {
	GenerateContext,
	HeroMetricsOutput,
	BuyerSegmentOutput,
	MemoryRollupsOutput,
	MemoryWindowOutput,
	ValuePreviewOutput,
	ValuePreviewMarkerOutput,
	NextStepOutput,
	PlanGeneratorOutput,
	GenerationCost,
	BuyerKind,
} from "./types";

export { packToBuyer, BUYER_LABEL_PT_BR } from "./pack-to-buyer";
