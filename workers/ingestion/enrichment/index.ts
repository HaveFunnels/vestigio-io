// Enrichment pass framework — Wave 1 (Stage D) and beyond.
// See README.md in this folder for the full architecture rationale.
export type {
  EnrichmentContext,
  EnrichmentPass,
  EnrichmentResult,
  ShouldRunDecision,
  EnrichmentPipelineMode,
} from "./types";
export { buildSkippedResult, buildFailedResult } from "./types";
export { runEnrichmentPasses, listRegisteredPasses } from "./runner";
export { selectiveHeadlessPass } from "./selective-headless";
export {
  buildStageDScenarios,
  pickCommercialPathScenario,
  buildSupportReachScenario,
} from "./scenarios";
