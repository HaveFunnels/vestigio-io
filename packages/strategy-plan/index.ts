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
} from "./generator";

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
