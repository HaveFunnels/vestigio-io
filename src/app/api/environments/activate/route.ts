import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { NextResponse } from "next/server";
import { z } from "zod";

// ──────────────────────────────────────────────
// POST /api/environments/activate  (Wave 5 Fase 2)
//
// Owner-driven first-audit trigger. Replaces the inline org+env+profile
// creation that /api/onboard did during the self-serve funnel.
//
// Flow:
//   1. Caller is an authenticated member of an active org.
//   2. If the org has no env yet, create one from the submitted domain.
//      Otherwise reuse the caller's env (idempotent activation).
//   3. Upsert BusinessProfile with the onboarding inputs.
//   4. Flip Environment.activated = true (load-bearing signal that the
//      middleware / layout gate reads to decide "send to onboarding?").
//   5. Create a fresh AuditCycle (cycleType=full) and fire-and-forget
//      the audit-runner — same dispatch pattern used by Stripe/Paddle
//      webhooks. The heal cron recovers orphans if the process dies.
//
// This endpoint DOES NOT touch Organization.plan or open Paddle/Stripe
// checkout. Plan assignment happens via admin-create or payment webhook.
// Keeping those concerns separate means admin-provisioned orgs can
// activate without hitting a checkout wall.
// ──────────────────────────────────────────────

const activateSchema = z.object({
	domain: z.string().min(3),
	landingUrl: z.string().url().optional().nullable(),
	isProduction: z.boolean().optional().default(true),
	businessModel: z.enum(["ecommerce", "lead_gen", "saas", "hybrid"]),
	conversionModel: z
		.enum(["checkout", "whatsapp", "form", "external"])
		.optional()
		.default("checkout"),
	monthlyRevenue: z.number().nullable().optional(),
	averageOrderValue: z.number().nullable().optional(),
	// Industry vertical captured in the onboarding "Industry" step. The
	// schema was missing this field, so Zod stripped it and BusinessProfile
	// .targetIndustry was always null — even though copy-persona-rewrite
	// reads it. Free-form string keeps the door open for verticals we
	// haven't enumerated yet.
	targetIndustry: z.string().trim().min(1).optional().nullable(),
	// Legal/abuse posture captured in the onboarding "I own this domain"
	// checkbox. Persisted as a timestamp on BusinessProfile so an audit
	// trail exists if the domain is ever disputed.
	ownershipConfirmed: z.boolean().optional(),
	// SaaS optional fields — mirror the self-serve shape so a single
	// onboarding form can POST here.
	saasLoginUrl: z.string().url().optional(),
	saasEmail: z.string().email().optional(),
	saasAuthMethod: z
		.enum(["unknown", "password", "oauth", "magic_link"])
		.optional(),
	saasMfaMode: z.enum(["unknown", "none", "optional", "required"]).optional(),
});

function normalizeDomain(input: string): string {
	return input
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.replace(/\/+$/, "");
}

function deriveLandingUrl(
	domain: string,
	provided: string | null | undefined,
): string {
	if (provided && provided.trim()) {
		const v = provided.trim();
		return v.startsWith("http") ? v : `https://${v}`;
	}
	return `https://${domain}`;
}

export const POST = withErrorTracking(
	async function POST(request: Request) {
		const user = await isAuthorized();
		if (!user) {
			return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		}

		const payload = await request.json();
		const parsed = activateSchema.safeParse(payload);
		if (!parsed.success) {
			return NextResponse.json(
				{
					message: "Invalid payload",
					errors: parsed.error.flatten().fieldErrors,
				},
				{ status: 400 },
			);
		}

		const data = parsed.data;
		const normalizedDomain = normalizeDomain(data.domain);
		const landingUrl = deriveLandingUrl(normalizedDomain, data.landingUrl);

		// Caller must be a member of an active org. We don't require the
		// owner role — admins/members of an admin-provisioned org should
		// also be able to finish setup.
		const membership = await prisma.membership.findFirst({
			where: { userId: user.id },
			include: { organization: true },
			orderBy: { createdAt: "desc" },
		});

		if (!membership?.organization) {
			return NextResponse.json(
				{ message: "No organization for user" },
				{ status: 404 },
			);
		}

		const org = membership.organization;
		if (org.status === "suspended") {
			return NextResponse.json(
				{ message: "Organization is suspended" },
				{ status: 403 },
			);
		}

		try {
			// Wave 22 Fase B+ — Upsert Environment by (organizationId, domain).
			// Previously this lookup did `findFirst orderBy createdAt asc` to
			// match the assumption "one env per org" — but Fase A introduced
			// multi-env orgs (new-domain flow via the org panel). For a user
			// with 2+ envs, the old code would UPDATE the OLDEST env with the
			// submitted domain, corrupting the first env's row AND orphaning
			// the env the user just created in the modal.
			//
			// The new (organizationId, domain) unique constraint Fase A added
			// lets us look up the right row directly. If the env was just
			// created via the Add Domain modal, we find + update it. If we're
			// in the first-time onboarding flow (no env exists yet), the
			// findUnique returns null and we create.
			const existingEnv = await prisma.environment.findUnique({
				where: {
					organizationId_domain: {
						organizationId: org.id,
						domain: normalizedDomain,
					},
				},
			});

			const env = existingEnv
				? await prisma.environment.update({
						where: { id: existingEnv.id },
						data: {
							landingUrl,
							isProduction: data.isProduction,
							activated: true,
							// An accidental re-activation clears any stale pause
							// so the scheduler/audit-runner treats it as live again.
							continuousPaused: false,
						},
					})
				: await prisma.environment.create({
						data: {
							organizationId: org.id,
							domain: normalizedDomain,
							landingUrl,
							isProduction: data.isProduction,
							activated: true,
						},
					});

			// Step 3: BusinessProfile upsert. One per org (unique constraint).
			// `targetIndustry` and `ownershipConfirmedAt` were previously
			// captured in the onboarding UI but stripped by Zod here and
			// never persisted. They are now part of the schema + persistence.
			const targetIndustry = data.targetIndustry?.trim() || null;
			const ownershipConfirmedAt = data.ownershipConfirmed ? new Date() : undefined;
			await prisma.businessProfile.upsert({
				where: { organizationId: org.id },
				create: {
					organizationId: org.id,
					businessModel: data.businessModel,
					conversionModel: data.conversionModel,
					monthlyRevenue: data.monthlyRevenue ?? null,
					averageOrderValue: data.averageOrderValue ?? null,
					targetIndustry,
					ownershipConfirmedAt: ownershipConfirmedAt ?? null,
				},
				update: {
					businessModel: data.businessModel,
					conversionModel: data.conversionModel,
					monthlyRevenue: data.monthlyRevenue ?? null,
					averageOrderValue: data.averageOrderValue ?? null,
					targetIndustry,
					// Only stamp confirmation when the checkbox is ticked —
					// never blank out an earlier confirmation on re-activate.
					...(ownershipConfirmedAt ? { ownershipConfirmedAt } : {}),
				},
			});

			// Step 3b: SaaS access config (only when provided)
			if (data.saasLoginUrl) {
				await prisma.saasAccessConfig.upsert({
					where: { environmentId: env.id },
					create: {
						environmentId: env.id,
						loginUrl: data.saasLoginUrl,
						email: data.saasEmail || null,
						authMethod: data.saasAuthMethod || "unknown",
						mfaMode: data.saasMfaMode || "unknown",
						status: "configured",
					},
					update: {
						loginUrl: data.saasLoginUrl,
						email: data.saasEmail || null,
						authMethod: data.saasAuthMethod || "unknown",
						mfaMode: data.saasMfaMode || "unknown",
						status: "configured",
					},
				});
			}

			// Step 4: If the org is still "pending" (admin-created without
			// payment), bump to active. An org that was suspended must be
			// unsuspended by admin, not here.
			if (org.status === "pending") {
				await prisma.organization.update({
					where: { id: org.id },
					data: { status: "active" },
				});
			}

			// Step 5: Create AuditCycle ONLY if one doesn't already exist
			// (Gap 2 fix: promoteLeadToOrg may have already created one).
			let cycle = await prisma.auditCycle.findFirst({
				where: {
					environmentId: env.id,
					status: { in: ["pending", "running"] },
				},
				orderBy: { createdAt: "desc" },
			});
			if (!cycle) {
				cycle = await prisma.auditCycle.create({
					data: {
						organizationId: org.id,
						environmentId: env.id,
						status: "pending",
						cycleType: "full",
					},
				});
			}

			// Dispatch path (Wave 5 Fase 1A): prefer the Redis queue so a
			// dedicated worker service drains the cycle, surviving web
			// process restarts and multi-replica deploys. Fall back to
			// legacy in-process Promise.then() when Redis isn't configured
			// (local dev, early production before the worker service ships)
			// so demos don't silently stall.
			const { enqueueAuditCycle } = await import(
				"../../../../../apps/platform/audit-cycle-queue"
			);
			// First activation is a cold full baseline, so tier "cold".
			const enqueued = await enqueueAuditCycle({
				cycleId: cycle.id,
				environmentId: env.id,
				organizationId: org.id,
				priority: "cold",
			});
			if (!enqueued) {
				const { inProcessFallbackAllowed } = await import(
					"@/libs/audit-dispatch"
				);
				if (inProcessFallbackAllowed()) {
					import("../../../../../apps/audit-runner/run-cycle")
						.then((m) => m.runAuditCycle(cycle.id))
						.catch((err) => {
							console.error(
								`[environments.activate] audit dispatch failed for cycle ${cycle.id}:`,
								err,
							);
						});
				} else {
					console.error(
						`[environments.activate] worker dispatch failed and in-process fallback disabled in production. cycle=${cycle.id}`,
					);
					// Cycle row stays pending; the heal cron in worker-loop
					// re-enqueues stale pending rows on the next Redis recovery.
				}
			}

			return NextResponse.json(
				{
					environment: {
						id: env.id,
						domain: env.domain,
						landingUrl: env.landingUrl,
						activated: true,
					},
					cycle: {
						id: cycle.id,
						status: cycle.status,
					},
					// Wave 22 Fase B+ — land on the dashboard so the user lands
					// on the FirstAuditCard with live progress streaming.
					// /app/inventory bypassed the new card and showed only
					// the legacy CycleProgressBanner.
					redirectTo: "/app/dashboard",
				},
				{ status: 201 },
			);
		} catch (err: any) {
			console.error("[environments.activate] failed:", err);
			return NextResponse.json(
				{ message: "Failed to activate environment" },
				{ status: 500 },
			);
		}
	},
	{ endpoint: "/api/environments/activate", method: "POST" },
);
