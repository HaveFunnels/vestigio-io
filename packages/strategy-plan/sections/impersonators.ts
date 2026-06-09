// ──────────────────────────────────────────────
// Wave 22.8 — Brand Impersonators section generator (STUB)
//
// Will query Finding rows with inferenceKeys like
// `lookalike_domain_competing_for_traffic` /
// `lookalike_domains_active_commerce`. For now returns null so the
// section self-hides while we ship the Copy Lens pilot first.
//
// TODO (Wave 22.8.3):
//   - Find rows: inferenceKey IN ('lookalike_domain_*'), env-scoped,
//     status IN created|confirmed, lt monthEnd
//   - Parse projection JSON for per-domain metadata (threat level,
//     commerce intent, payment capture)
//   - Aggregate counts + take top 5 entries
//   - Return ImpersonatorsSectionOutput
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type { GenerateContext, ImpersonatorsSectionOutput } from "../types";

export async function generateImpersonators(
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_prisma: PrismaClient,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_ctx: GenerateContext,
): Promise<ImpersonatorsSectionOutput | null> {
	return null;
}
