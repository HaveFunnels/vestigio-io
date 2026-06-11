import { prisma } from '../../src/libs/prismaDb';
import type { BusinessProfile } from '../../packages/domain';

// ──────────────────────────────────────────────
// Business profile lookups for verification context
//
// Centralizes the `prisma.businessProfile.findUnique` call so callers
// (AuthenticatedJourneyExecutor, audit-runner, future verifications)
// don't reimplement it. Returns null silently when the org has no
// profile yet — every consumer must tolerate null.
//
// The profile drives heuristic choices downstream:
//   - authenticated-crawler seed paths (saas vs ecommerce vs lead_gen)
//   - Stage D scenario selection in run-cycle
//   - pack eligibility for ecommerce/saas-specific detectors
// ──────────────────────────────────────────────

/**
 * Load business profile by organizationId. Returns null when missing
 * or when the lookup fails (network error, etc.) — callers should
 * fall back to defaults rather than block.
 */
export async function getBusinessProfileByOrgId(
	organizationId: string,
): Promise<BusinessProfile | null> {
	try {
		const row = await prisma.businessProfile.findUnique({
			where: { organizationId },
		});
		return row as unknown as BusinessProfile | null;
	} catch {
		return null;
	}
}
