// ──────────────────────────────────────────────
// Wave 22.8 — Competitor radar section generator (STUB)
//
// Will query CompetitorDomain + CompetitorPageSnapshot to surface
// what changed in the competitor set this cycle. For now returns null
// so the section self-hides while we ship the Copy Lens pilot first.
//
// TODO (Wave 22.8.2):
//   - Pull active CompetitorDomain rows for ctx.environmentId
//   - For each, find CompetitorPageSnapshot rows in the cycle window
//   - Aggregate: total competitors monitored, count with detected
//     changes this cycle, top 3 entries with one-line observation
//   - Return CompetitorSectionOutput
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type { GenerateContext, CompetitorSectionOutput } from "../types";

export async function generateCompetitorRadar(
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_prisma: PrismaClient,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_ctx: GenerateContext,
): Promise<CompetitorSectionOutput | null> {
	return null;
}
