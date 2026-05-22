#!/usr/bin/env tsx
/**
 * Mercado Pago — provision PreApproval Plans.
 *
 * MP's dashboard exposes NO UI for creating plans; they must be
 * created via API. This script creates four plans (Pro/Max ×
 * Monthly/Annual) using the prices in PlanConfig, then writes the
 * resulting plan ids back into the same PlanConfig row so the
 * billing page can pick them up.
 *
 * Run with:
 *   npx tsx scripts/mp-provision-plans.ts
 *
 * Idempotent: skips plans that already have an `mpPreapprovalPlanId`
 * or `mpAnnualPreapprovalPlanId` in PlanConfig. Pass `--force` to
 * recreate (rare — most often you only want to fill missing ids).
 *
 * Test vs prod: reads MP_ACCESS_TOKEN at runtime. Whichever creds are
 * present in your env (.env / .env.local) decide which MP account
 * the plans land on. Run twice — once with test creds, once with
 * prod creds — and PlanConfig will end up holding test ids; flip them
 * to prod ids manually (or re-run with --force after switching env).
 *
 * Failure mode: if MP rejects one plan (e.g. duplicate name), the
 * script still attempts the remaining three; failures are summarized
 * at the end and exit code is non-zero so CI/automation can detect.
 */

// No dotenv import — the script reads env vars directly. Caller sets
// MP_ACCESS_TOKEN, DATABASE_URL, SITE_URL (e.g. via .env.local sourced
// into the shell, or `npm run db:migrate:deploy`-style invocation).

import {
	createPreapprovalPlan,
	isMpConfigured,
	isMpTestMode,
} from "../src/libs/mp-api";
import {
	annualPriceCentsFromMonthly,
	getPlanConfigs,
	invalidatePlanCache,
	type PlanConfig,
} from "../src/libs/plan-config";
import { prisma } from "../src/libs/prismaDb";

const FORCE = process.argv.includes("--force");

const SITE_URL =
	process.env.SITE_URL || process.env.NEXTAUTH_URL || "https://app.vestigio.io";

interface ProvisionResult {
	planKey: string;
	cycle: "monthly" | "annually";
	mpPlanId?: string;
	skipped?: boolean;
	error?: string;
}

function reaisFromCents(cents: number) {
	return Math.round(cents) / 100;
}

async function provisionOne(opts: {
	planKey: string;
	planLabel: string;
	cycle: "monthly" | "annually";
	amountCents: number;
	existingId?: string;
}): Promise<ProvisionResult> {
	if (opts.existingId && !FORCE) {
		return { planKey: opts.planKey, cycle: opts.cycle, mpPlanId: opts.existingId, skipped: true };
	}
	if (!opts.amountCents || opts.amountCents <= 0) {
		return {
			planKey: opts.planKey,
			cycle: opts.cycle,
			error: `no BRL amount configured (monthlyPriceCentsBrl missing on ${opts.planKey})`,
		};
	}

	const cadenceLabel = opts.cycle === "annually" ? "Anual" : "Mensal";
	const reason = `Vestigio ${opts.planLabel} — ${cadenceLabel}`;
	try {
		const plan = await createPreapprovalPlan({
			reason,
			transactionAmountBrl: reaisFromCents(opts.amountCents),
			frequency: opts.cycle === "annually" ? 12 : 1,
			frequencyType: "months",
			backUrl: `${SITE_URL}/app/billing?mp=preapproval`,
		});
		return { planKey: opts.planKey, cycle: opts.cycle, mpPlanId: plan.id };
	} catch (err) {
		return {
			planKey: opts.planKey,
			cycle: opts.cycle,
			error: (err as Error).message,
		};
	}
}

// BRL defaults — applied when a plan exists in PlatformConfig but
// has no monthlyPriceCentsBrl yet (typical when migrating from a
// Paddle-only deploy whose DB never had BRL prices written).
//
// `free` is the lapsed/pending sentinel — zero price, no MP plan,
// no checkout. The three paid tiers below get provisioned.
const BRL_DEFAULTS: Record<string, number> = {
	free:     0,
	vestigio: 9900,   // R$ 99 — Starter (paid)
	pro:      19900,  // R$ 199
	max:      39900,  // R$ 399
};

async function main() {
	if (!isMpConfigured()) {
		console.error("✗ MP_ACCESS_TOKEN not set in env. Aborting.");
		process.exit(2);
	}
	console.log(`→ MP provisioning starting (${isMpTestMode() ? "TEST" : "PROD"} mode)`);
	if (FORCE) console.log("→ --force: existing ids will be replaced");

	const plans = await getPlanConfigs();
	// Fill BRL prices where missing — non-destructive, just adds the
	// `monthlyPriceCentsBrl` field if absent so subsequent steps have
	// the value to send to MP.
	for (const p of plans) {
		if (!p.monthlyPriceCentsBrl && BRL_DEFAULTS[p.key]) {
			p.monthlyPriceCentsBrl = BRL_DEFAULTS[p.key];
			console.log(`  · filled monthlyPriceCentsBrl=${p.monthlyPriceCentsBrl} for ${p.key}`);
		}
	}
	// Three paid tiers × 2 cadences = 6 MP plans to provision.
	// `free` is skipped — it's the sentinel, has no checkout.
	const billable = plans.filter((p) => p.key === "vestigio" || p.key === "pro" || p.key === "max");

	const results: ProvisionResult[] = [];
	for (const plan of billable) {
		// Monthly
		results.push(
			await provisionOne({
				planKey: plan.key,
				planLabel: plan.label,
				cycle: "monthly",
				amountCents: plan.monthlyPriceCentsBrl ?? 0,
				existingId: plan.mpPreapprovalPlanId,
			}),
		);
		// Annual
		const annualCents = plan.monthlyPriceCentsBrl
			? annualPriceCentsFromMonthly(plan.monthlyPriceCentsBrl)
			: 0;
		results.push(
			await provisionOne({
				planKey: plan.key,
				planLabel: plan.label,
				cycle: "annually",
				amountCents: annualCents,
				existingId: plan.mpAnnualPreapprovalPlanId,
			}),
		);
	}

	// Persist back to PlanConfig — includes the BRL price fills above.
	const updatedPlans: PlanConfig[] = plans.map((p) => {
		const monthly = results.find((r) => r.planKey === p.key && r.cycle === "monthly");
		const annual = results.find((r) => r.planKey === p.key && r.cycle === "annually");
		return {
			...p,
			mpPreapprovalPlanId: monthly?.mpPlanId ?? p.mpPreapprovalPlanId,
			mpAnnualPreapprovalPlanId: annual?.mpPlanId ?? p.mpAnnualPreapprovalPlanId,
		};
	});

	await prisma.platformConfig.upsert({
		where: { configKey: "plan_configs" },
		create: { configKey: "plan_configs", value: JSON.stringify(updatedPlans) },
		update: { value: JSON.stringify(updatedPlans) },
	});
	invalidatePlanCache();

	// Summary
	console.log("");
	console.log("── Results ────────────────────────────────");
	let hadError = false;
	for (const r of results) {
		const cycleLabel = r.cycle === "annually" ? "anual " : "mensal";
		if (r.skipped) {
			console.log(`  ↻ ${r.planKey} ${cycleLabel}  skipped (already set: ${r.mpPlanId})`);
		} else if (r.error) {
			console.log(`  ✗ ${r.planKey} ${cycleLabel}  ERROR: ${r.error}`);
			hadError = true;
		} else {
			console.log(`  ✓ ${r.planKey} ${cycleLabel}  → ${r.mpPlanId}`);
		}
	}
	console.log("───────────────────────────────────────────");
	console.log(`PlatformConfig.plan_configs updated with MP plan ids.`);
	if (hadError) {
		process.exitCode = 1;
	}
	await prisma.$disconnect();
}

main().catch((err) => {
	console.error("Fatal:", err);
	process.exit(2);
});
