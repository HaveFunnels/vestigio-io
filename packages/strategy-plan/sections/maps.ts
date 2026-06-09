// ──────────────────────────────────────────────
// Wave 22.8 — Maps section generator (STUB)
//
// Will surface this cycle's auto-generated maps + CustomMap count for
// the org. For now returns null so the section self-hides while we
// ship the Copy Lens pilot first.
//
// TODO (Wave 22.8.4):
//   - Find recent SurfaceRelation entries for the env (relations
//     created during the cycle).
//   - Count distinct surfaces touched.
//   - Pull org-scoped CustomMap count.
//   - Return MapsSectionOutput
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type { GenerateContext, MapsSectionOutput } from "../types";

export async function generateMapsSection(
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_prisma: PrismaClient,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_ctx: GenerateContext,
): Promise<MapsSectionOutput | null> {
	return null;
}
