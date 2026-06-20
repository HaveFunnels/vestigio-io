/* eslint-disable */
// Read-only diagnostic: pulls the structural shape of havefunnels'
// latest MonthlyStrategyPlan + a sample of findings, to inform Ship A
// ProductTour rebuild. Output is structural/shape data only — no
// identifiable info should be relayed downstream into marketing copy
// (per [[havefunnels-redacted-plan-consent]] brand-only constraint).
//
// Usage:
//   railway run --service audit-worker tsx scripts/diagnostics/havefunnels-plano-structure.ts
//   (or any service that has DATABASE_URL injected)

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ log: [] });

function fmtBRL(v: number): string {
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
}

function summarizeJson(label: string, raw: unknown) {
  if (raw == null) {
    console.log(`  ${label}: (null)`);
    return;
  }
  const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
  const keys = Object.keys(obj as Record<string, unknown>);
  console.log(`  ${label}: ${keys.length} keys → [${keys.slice(0, 8).join(", ")}${keys.length > 8 ? "…" : ""}]`);
}

async function main() {
  // ── Locate havefunnels environment ──
  const env = await prisma.environment.findFirst({
    where: { domain: { contains: "havefunnels", mode: "insensitive" } },
    select: { id: true, domain: true, isProduction: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  if (!env) {
    console.log("No havefunnels environment found.");
    process.exit(1);
  }
  console.log(`\nEnvironment: ${env.id} (${env.domain}, isProd=${env.isProduction})\n`);

  // ── Latest MonthlyStrategyPlan ──
  const plan = await prisma.monthlyStrategyPlan.findFirst({
    where: { environmentId: env.id, status: "ready" },
    orderBy: { generatedAt: "desc" },
  });
  if (!plan) {
    console.log("No ready plan found for havefunnels.");
    process.exit(1);
  }

  console.log(`════════════════════════════════════════════════════`);
  console.log(`Latest Plano:  ${plan.month}  (id=${plan.id})`);
  console.log(`Generated:    ${plan.generatedAt.toISOString()}`);
  console.log(`Locale:       ${plan.locale}`);
  console.log(`LLM cost:     ${plan.llmCostCents} cents, ${plan.llmCallsCount} calls`);
  console.log(`Regenerated:  ${plan.regenCount}x this month`);
  console.log(`════════════════════════════════════════════════════\n`);

  // ── Thesis ──
  console.log("📝 thesisOfMonth (length-only):");
  console.log(`   ${plan.thesisOfMonth?.length || 0} chars`);
  console.log(`   preview: "${(plan.thesisOfMonth || "").slice(0, 120)}${(plan.thesisOfMonth || "").length > 120 ? "…" : ""}"`);
  console.log();

  // ── HeroMetrics shape + values ──
  console.log("📊 heroMetricsJson:");
  const hero = plan.heroMetricsJson as any;
  if (hero) {
    console.log(`   retainedMid:        ${fmtBRL(hero.retainedMid || 0)}  (MoM delta: ${hero.retainedDeltaMoM ?? "?"})`);
    console.log(`   capturedMid:        ${fmtBRL(hero.capturedMid || 0)}  (MoM delta: ${hero.capturedDeltaMoM ?? "?"})`);
    console.log(`   criticalCount:      ${hero.criticalCount ?? "?"}      (MoM delta: ${hero.criticalDeltaMoM ?? "?"})`);
    console.log(`   inProgressCount:    ${hero.inProgressCount ?? "?"}    (MoM delta: ${hero.inProgressDeltaMoM ?? "?"})`);
    console.log(`   retainedSpark len:  ${(hero.retainedSpark || []).length} pts`);
    console.log(`   capturedSpark len:  ${(hero.capturedSpark || []).length} pts`);
  }
  console.log();

  // ── BuyerSegments ──
  console.log("👥 buyerSegmentsJson:");
  const bs = plan.buyerSegmentsJson as any;
  if (Array.isArray(bs)) {
    for (const seg of bs) {
      console.log(`   ${seg.buyer}: ${seg.count} findings, impact ${fmtBRL(seg.impactMin)}–${fmtBRL(seg.impactMax)} (mid ${fmtBRL(seg.impactMidpoint)})`);
    }
  }
  console.log();

  // ── Narrative shape ──
  console.log("📖 narrativeWhatHappened:");
  console.log(`   ${plan.narrativeWhatHappened?.length || 0} chars`);
  console.log();
  console.log("💡 valuePreviewNarrative:");
  console.log(`   ${plan.valuePreviewNarrative?.length || 0} chars`);
  console.log();

  // ── Other section shapes ──
  console.log("📦 other section keys:");
  summarizeJson("memoryRollupsJson", plan.memoryRollupsJson);
  summarizeJson("valuePreviewJson", plan.valuePreviewJson);
  summarizeJson("continuityJson", plan.continuityJson);
  summarizeJson("crossCustomerPatternJson", plan.crossCustomerPatternJson);
  summarizeJson("copyLensJson", plan.copyLensJson);
  summarizeJson("competitorJson", plan.competitorJson);
  summarizeJson("impersonatorsJson", plan.impersonatorsJson);
  summarizeJson("mapsJson", plan.mapsJson);
  console.log();

  // ── Sample findings (the actual "problem shapes" Ship A might surface) ──
  // Pull the latest cycle and the top-impact findings from it.
  const latestCycle = await prisma.auditCycle.findFirst({
    where: { environmentId: env.id, status: "completed" },
    orderBy: { completedAt: "desc" },
    select: { id: true, completedAt: true },
  });
  if (latestCycle) {
    console.log(`════════════════════════════════════════════════════`);
    console.log(`Latest completed cycle:  ${latestCycle.id} (${latestCycle.completedAt?.toISOString()})`);
    console.log(`════════════════════════════════════════════════════\n`);

    const findings = await prisma.finding.findMany({
      where: { cycleId: latestCycle.id, severity: { in: ["critical", "high"] } },
      orderBy: { impactMidpoint: "desc" },
      take: 8,
      select: {
        pack: true, severity: true, surface: true, confidence: true,
        impactMin: true, impactMax: true, impactMidpoint: true,
        status: true, changeClass: true, cyclesSeen: true,
        inferenceKey: true, // for shape analysis only — DO NOT echo to marketing copy
      },
    });
    console.log(`🔍 Top ${findings.length} critical/high findings (problem shapes):`);
    for (const f of findings) {
      console.log(`   [${f.pack}/${f.severity}] surface=${f.surface}`);
      console.log(`      impact ${fmtBRL(f.impactMin)}–${fmtBRL(f.impactMax)} (mid ${fmtBRL(f.impactMidpoint)})`);
      console.log(`      status=${f.status} change=${f.changeClass ?? "?"} cyclesSeen=${f.cyclesSeen} conf=${f.confidence}%`);
      console.log(`      shape: ${f.inferenceKey}`);
      console.log();
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
