import { NextResponse } from "next/server";

import { withErrorTracking } from "@/libs/error-tracker";
import { prisma } from "@/libs/prismaDb";
import {
	annualPriceCentsFromMonthly,
	invalidatePlanCache,
	type PlanConfig,
} from "@/libs/plan-config";
import { createPreapprovalPlan, isMpConfigured } from "@/libs/mp-api";
import { requireAdmin } from "@/libs/require-admin";

// ──────────────────────────────────────────────
// POST /api/admin/pricing/mp-sync
//
// Admin-only counterpart to scripts/mp-provision-plans.ts. Reads the
// current plan_configs row, calls createPreapprovalPlan for each
// (planKey × cadence) that is missing an MP id, and writes the
// resulting ids back into the same row.
//
// Idempotent: plans with an existing id are skipped unless `force` is
// in the body. We never bulk-delete on MP — orphaned plans just sit
// in the dashboard and don't get used.
// ──────────────────────────────────────────────

const CONFIG_KEY_PLANS = "plan_configs";

const BRL_DEFAULTS: Record<string, number> = {
	free: 0,
	vestigio: 9900,
	pro: 19900,
	max: 39900,
};

export const POST = withErrorTracking(
	async function POST(req: Request) {
		const gate = await requireAdmin();
		if (gate.denied) return gate.denied;
		if (!isMpConfigured()) {
			return NextResponse.json({ message: "MP_ACCESS_TOKEN not configured" }, { status: 400 });
		}

		let force = false;
		try {
			const body = await req.json().catch(() => ({}));
			force = body?.force === true;
		} catch {
			/* ignore */
		}

		const row = await prisma.platformConfig.findUnique({
			where: { configKey: CONFIG_KEY_PLANS },
		});
		if (!row) {
			return NextResponse.json(
				{ message: "No plans configured yet. Save pricing config first." },
				{ status: 400 },
			);
		}

		const plans = JSON.parse(row.value) as PlanConfig[];
		const siteUrl =
			process.env.SITE_URL || process.env.NEXTAUTH_URL || "https://app.vestigio.io";
		const errors: string[] = [];
		let created = 0;
		let skipped = 0;

		// Fill BRL prices on plans missing them so the API call has a
		// non-zero `transaction_amount`. Non-destructive — only fills.
		for (const p of plans) {
			if (!p.monthlyPriceCentsBrl && BRL_DEFAULTS[p.key]) {
				p.monthlyPriceCentsBrl = BRL_DEFAULTS[p.key];
			}
		}

		for (const plan of plans) {
			if (plan.key === "free") continue; // sentinel, no checkout

			// Monthly
			if ((force || !plan.mpPreapprovalPlanId) && plan.monthlyPriceCentsBrl) {
				try {
					const mp = await createPreapprovalPlan({
						reason: `Vestigio ${plan.label} — Mensal`,
						transactionAmountBrl: plan.monthlyPriceCentsBrl / 100,
						frequency: 1,
						frequencyType: "months",
						backUrl: `${siteUrl}/app/billing?mp=preapproval`,
					});
					plan.mpPreapprovalPlanId = mp.id;
					created++;
				} catch (err) {
					errors.push(`${plan.key} monthly: ${(err as Error).message}`);
				}
			} else {
				skipped++;
			}

			// Annual
			const annualCents = plan.monthlyPriceCentsBrl
				? annualPriceCentsFromMonthly(plan.monthlyPriceCentsBrl)
				: 0;
			if ((force || !plan.mpAnnualPreapprovalPlanId) && annualCents) {
				try {
					const mp = await createPreapprovalPlan({
						reason: `Vestigio ${plan.label} — Anual`,
						transactionAmountBrl: annualCents / 100,
						frequency: 12,
						frequencyType: "months",
						backUrl: `${siteUrl}/app/billing?mp=preapproval`,
					});
					plan.mpAnnualPreapprovalPlanId = mp.id;
					created++;
				} catch (err) {
					errors.push(`${plan.key} annual: ${(err as Error).message}`);
				}
			} else {
				skipped++;
			}
		}

		await prisma.platformConfig.update({
			where: { configKey: CONFIG_KEY_PLANS },
			data: { value: JSON.stringify(plans) },
		});
		invalidatePlanCache();

		return NextResponse.json(
			{
				message: "MP sync complete",
				created,
				skipped,
				errors,
				plans: plans.map((p) => ({
					key: p.key,
					mpPreapprovalPlanId: p.mpPreapprovalPlanId,
					mpAnnualPreapprovalPlanId: p.mpAnnualPreapprovalPlanId,
					monthlyPriceCentsBrl: p.monthlyPriceCentsBrl,
				})),
			},
			{ status: errors.length ? 207 : 200 },
		);
	},
	{ endpoint: "/api/admin/pricing/mp-sync", method: "POST" },
);
