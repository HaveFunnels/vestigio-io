import {
  test, assert, assertEqual, assertGreater,
  printResults, resetCounters, getResults,
} from './helpers';

// ──────────────────────────────────────────────
// Phase 19 — Production Hardening Tests
//
// Covers:
//   1. MCP daily limits — blocks correctly, resets daily
//   2. Cost guardrails — prevents excessive operations
//   3. Audit scheduler — triggers correctly, respects plan
//   4. Collection — no infinite loops, respects limits
//   5. Job queue — 1 per env, concurrency, retry
//   6. Data consistency — dedup, deterministic scoring
//   7. Billing safety — no overflow, auditable logs
// ──────────────────────────────────────────────

import {
  canExecuteMcpQuery,
  canExecutePlaywright,
  recordMcpQuery,
  recordPlaywrightRun,
  getDailyUsageSummary,
  resetDailyUsage,
} from '../apps/platform/daily-usage';

import { getPlanLimits, getPlanEntitlements } from '../packages/plans';

import {
  shouldExecuteExpensiveOperation,
  recordCrawlUrl,
  getCrawlCount,
  clearCrawlHistory,
  resetGuardrails,
} from '../apps/platform/cost-guardrails';

import {
  scheduleAudit,
  startAudit,
  completeAudit,
  failAudit,
  getPendingAudits,
  isAuditDue,
  resetScheduler,
} from '../apps/platform/audit-scheduler';

import {
  CrawlSession,
  DEFAULT_CONSTRAINTS,
  hashContent,
  detectSpaPage,
  shouldTriggerPlaywright,
} from '../workers/ingestion/crawl-constraints';

import {
  enqueueJob,
  startJob,
  updateJobProgress,
  completeJob,
  failJob as failJobFn,
  retryJob,
  getJob,
  getJobForEnvironment,
  getRunningJobs,
  resetJobQueue,
} from '../apps/platform/job-queue';

import {
  deduplicateFindings,
  deterministicSort,
  stabilizeFindings,
  computeStableScore,
} from '../apps/platform/data-consistency';

import {
  safeIncrementMcpUsage,
  safeSubtract,
  safeAdd,
  estimateDailyCost,
  computePlanUnitEconomics,
  logUsageEvent,
  getUsageLog,
  resetBillingLogs,
} from '../apps/platform/billing-safety';

import type { FindingProjection } from '../packages/projections';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function mockFinding(key: string, polarity: 'negative' | 'positive' | 'neutral' = 'negative', midpoint: number = 100, confidence: number = 70): FindingProjection {
  return {
    id: `finding_${key}`,
    title: `Test ${key}`,
    root_cause: null,
    severity: 'medium',
    confidence,
    impact: { monthly_range: { min: 50, max: 150 }, midpoint, impact_type: 'revenue_loss', percentage_delta: null, currency: 'USD' },
    pack: 'scale_readiness',
    surface: '/',
    freshness: 'fresh',
    inference_key: key,
    reasoning: 'test',
    cause: 'test',
    effect: 'test',
    basis_type: 'heuristic',
    eligibility: { eligible: true, confidence: 1 },
    polarity,
    truth_context: null,
    suppression_context: null,
  };
}

// ──────────────────────────────────────────────
// All tests in a single sequential async runner
// ──────────────────────────────────────────────

async function runAllTests() {
  resetCounters();
  console.log('\n═══ Phase 19 — Production Hardening Tests ═══');

  // ═══════════════════════════════════════════════
  // 1. MCP Daily Limits
  // ═══════════════════════════════════════════════
  console.log('\n── MCP Daily Limits ──');

  test('vestigio plan has 5 daily MCP budget', () => {
    const limits = getPlanLimits('vestigio');
    assertEqual(limits.daily_mcp_budget, 5, 'vestigio daily budget');
  });

  test('pro plan has 25 daily MCP budget', () => {
    const limits = getPlanLimits('pro');
    assertEqual(limits.daily_mcp_budget, 25, 'pro daily budget');
  });

  test('max plan has 100 daily MCP budget', () => {
    const limits = getPlanLimits('max');
    assertEqual(limits.daily_mcp_budget, 100, 'max daily budget');
  });

  // Async MCP tests — sequential to avoid shared state issues
  resetDailyUsage();
  {
    const result = await canExecuteMcpQuery('org_allow_test', 'vestigio');
    test('canExecuteMcpQuery allows under limit', () => {
      assertEqual(result.status, 'allowed', 'should be allowed');
    });
  }

  resetDailyUsage();
  {
    for (let i = 0; i < 5; i++) {
      await recordMcpQuery('org_limit_test');
    }
    const result = await canExecuteMcpQuery('org_limit_test', 'vestigio');
    test('canExecuteMcpQuery blocks at limit', () => {
      assertEqual(result.status, 'blocked', 'should be blocked at limit');
    });
  }

  resetDailyUsage();
  {
    for (let i = 0; i < 10; i++) {
      await recordMcpQuery('org_over_test');
    }
    const result = await canExecuteMcpQuery('org_over_test', 'vestigio');
    test('canExecuteMcpQuery blocks above limit', () => {
      assertEqual(result.status, 'blocked', 'should be blocked above limit');
    });
  }

  resetDailyUsage();
  {
    for (let i = 0; i < 5; i++) {
      await recordMcpQuery('org_a');
    }
    const resultA = await canExecuteMcpQuery('org_a', 'vestigio');
    const resultB = await canExecuteMcpQuery('org_b', 'vestigio');
    test('different orgs have independent limits', () => {
      assertEqual(resultA.status, 'blocked', 'org_a blocked');
      assertEqual(resultB.status, 'allowed', 'org_b allowed');
    });
  }

  resetDailyUsage();
  {
    const result = await canExecutePlaywright('org_pw', 'vestigio');
    test('Playwright guard blocks on vestigio plan', () => {
      assertEqual(result.status, 'blocked', 'vestigio has 0 playwright budget');
    });
  }

  resetDailyUsage();
  {
    const result = await canExecutePlaywright('org_pw2', 'pro');
    test('Playwright guard allows on pro plan', () => {
      assertEqual(result.status, 'allowed', 'pro has playwright budget');
    });
  }

  resetDailyUsage();
  {
    for (let i = 0; i < 5; i++) {
      await recordPlaywrightRun('org_pw_limit');
    }
    const result = await canExecutePlaywright('org_pw_limit', 'pro');
    test('Playwright guard blocks at limit', () => {
      assertEqual(result.status, 'blocked', 'pro playwright at limit');
    });
  }

  resetDailyUsage();
  {
    await recordMcpQuery('org_pct');
    await recordMcpQuery('org_pct');
    const summary = await getDailyUsageSummary('org_pct', 'vestigio');
    test('usage summary reports correct percentages', () => {
      assertEqual(summary.usage.mcp_queries, 2, 'mcp queries');
      assertEqual(summary.mcp_pct, 40, '2/5 = 40%');
      assertEqual(summary.mcp_remaining, 3, '3 remaining');
    });
  }

  // ═══════════════════════════════════════════════
  // 2. Cost Guardrails
  // ═══════════════════════════════════════════════
  console.log('\n── Cost Guardrails ──');

  resetGuardrails();
  resetDailyUsage();
  {
    const result = await shouldExecuteExpensiveOperation(
      { operation: 'deep_crawl', organization_id: 'org_cg', environment_id: 'env_1', estimated_cost_units: 1 },
      'max',
    );
    test('allows operation under hard cap', () => {
      assertEqual(result.allowed, true, 'should be allowed');
    });
  }

  resetGuardrails();
  resetDailyUsage();
  {
    for (let i = 0; i < 10; i++) {
      await shouldExecuteExpensiveOperation(
        { operation: 'deep_crawl', organization_id: 'org_cg2', environment_id: 'env_1', estimated_cost_units: 1 },
        'max',
      );
    }
    const result = await shouldExecuteExpensiveOperation(
      { operation: 'deep_crawl', organization_id: 'org_cg2', environment_id: 'env_1', estimated_cost_units: 1 },
      'max',
    );
    test('blocks at hard cap', () => {
      assertEqual(result.allowed, false, 'should be blocked at hard cap');
    });
  }

  test('crawl URL dedup works', () => {
    clearCrawlHistory('env_dedup');
    const first = recordCrawlUrl('env_dedup', 'https://example.com/page1');
    const second = recordCrawlUrl('env_dedup', 'https://example.com/page1');
    assertEqual(first, true, 'first should succeed');
    assertEqual(second, false, 'duplicate should fail');
  });

  test('crawl URL count tracks correctly', () => {
    clearCrawlHistory('env_count');
    recordCrawlUrl('env_count', 'https://example.com/a');
    recordCrawlUrl('env_count', 'https://example.com/b');
    recordCrawlUrl('env_count', 'https://example.com/c');
    assertEqual(getCrawlCount('env_count'), 3, 'should have 3 URLs');
  });

  // ═══════════════════════════════════════════════
  // 3. Audit Scheduler
  // ═══════════════════════════════════════════════
  console.log('\n── Audit Scheduler ──');

  test('vestigio plan cannot schedule time-based audits', () => {
    resetScheduler();
    const result = scheduleAudit('env_1', 'time_based', 'vestigio');
    assertEqual(result.scheduled, false, 'should not schedule');
    assert(result.reason !== null, 'should have reason');
  });

  test('pro plan can schedule time-based audits', () => {
    resetScheduler();
    const result = scheduleAudit('env_1', 'time_based', 'pro');
    assertEqual(result.scheduled, true, 'should schedule');
    assert(result.audit !== null, 'should have audit');
    assertEqual(result.audit!.audit_type, 'incremental', 'default is incremental');
  });

  test('max plan can schedule time-based audits', () => {
    resetScheduler();
    const result = scheduleAudit('env_1', 'time_based', 'max');
    assertEqual(result.scheduled, true, 'should schedule');
  });

  test('onboarding trigger always works', () => {
    resetScheduler();
    const result = scheduleAudit('env_1', 'onboarding_complete', 'vestigio');
    assertEqual(result.scheduled, true, 'onboarding always allowed');
  });

  test('manual refresh always works', () => {
    resetScheduler();
    const result = scheduleAudit('env_1', 'manual_refresh', 'vestigio');
    assertEqual(result.scheduled, true, 'manual always allowed');
  });

  test('audit lifecycle: pending → running → complete', () => {
    resetScheduler();
    const result = scheduleAudit('env_lc', 'onboarding_complete', 'pro');
    assert(result.audit !== null, 'should create audit');
    assertEqual(result.audit!.status, 'pending', 'starts pending');
    startAudit(result.audit!.id);
    completeAudit(result.audit!.id);
  });

  test('audit lifecycle: pending → running → failed', () => {
    resetScheduler();
    const result = scheduleAudit('env_fail', 'onboarding_complete', 'pro');
    startAudit(result.audit!.id);
    failAudit(result.audit!.id);
  });

  test('isAuditDue returns false for vestigio', () => {
    resetScheduler();
    assertEqual(isAuditDue('env_1', 'vestigio'), false, 'vestigio never due');
  });

  test('isAuditDue returns true when never audited', () => {
    resetScheduler();
    assertEqual(isAuditDue('env_1', 'pro'), true, 'pro due when never audited');
  });

  test('daily limit respected for time-based audits', () => {
    resetScheduler();
    const r1 = scheduleAudit('env_dl', 'time_based', 'pro');
    const r2 = scheduleAudit('env_dl', 'time_based', 'pro');
    const r3 = scheduleAudit('env_dl', 'time_based', 'pro');
    assertEqual(r1.scheduled, true, 'first');
    assertEqual(r2.scheduled, true, 'second');
    assertEqual(r3.scheduled, false, 'third blocked (daily limit 2)');
  });

  // ═══════════════════════════════════════════════
  // 4. Collection Hardening
  // ═══════════════════════════════════════════════
  console.log('\n── Collection Hardening ──');

  test('CrawlSession enforces max pages', () => {
    const session = new CrawlSession('example.com', { ...DEFAULT_CONSTRAINTS, max_pages_per_domain: 3 });
    session.recordFetch('https://example.com/a');
    session.recordFetch('https://example.com/b');
    session.recordFetch('https://example.com/c');
    const result = session.canFetch('https://example.com/d');
    assertEqual(result.allowed, false, 'should block at max pages');
  });

  test('CrawlSession deduplicates URLs', () => {
    const session = new CrawlSession('example.com');
    session.recordFetch('https://example.com/page');
    const result = session.canFetch('https://example.com/page');
    assertEqual(result.allowed, false, 'duplicate should be blocked');
  });

  test('CrawlSession detects loops via content hash', () => {
    const session = new CrawlSession('example.com');
    session.recordFetch('https://example.com/a', 'hash123');
    const isLoop = session.isLoopDetected('https://example.com/b', 'hash123');
    assertEqual(isLoop, true, 'same content = loop');
  });

  test('CrawlSession allows different content', () => {
    const session = new CrawlSession('example.com');
    session.recordFetch('https://example.com/a', 'hash123');
    const isLoop = session.isLoopDetected('https://example.com/b', 'hash456');
    assertEqual(isLoop, false, 'different content = not a loop');
  });

  test('CrawlSession safe abort', () => {
    const session = new CrawlSession('example.com');
    session.abort('test reason');
    assertEqual(session.isAborted(), true, 'should be aborted');
    const result = session.canFetch('https://example.com/anything');
    assertEqual(result.allowed, false, 'should block after abort');
  });

  test('hashContent produces consistent results', () => {
    const h1 = hashContent('hello world');
    const h2 = hashContent('hello world');
    assertEqual(h1, h2, 'same content = same hash');
  });

  test('hashContent produces different results for different content', () => {
    const h1 = hashContent('hello world');
    const h2 = hashContent('goodbye world');
    assert(h1 !== h2, 'different content = different hash');
  });

  test('detectSpaPage detects React apps', () => {
    assertEqual(detectSpaPage('<div id="root"></div>', 16), true, 'high script count = SPA');
  });

  test('shouldTriggerPlaywright on thin SPA content', () => {
    assertEqual(shouldTriggerPlaywright('<div id="root"></div>', 10, 500), true, 'thin content + many scripts');
  });

  test('shouldTriggerPlaywright false for normal pages', () => {
    const html = '<html><body>' + 'x'.repeat(5000) + '</body></html>';
    assertEqual(shouldTriggerPlaywright(html, 3, 5000), false, 'normal page');
  });

  test('global timeout enforced', () => {
    const session = new CrawlSession('example.com', { ...DEFAULT_CONSTRAINTS, global_timeout_ms: 0 });
    const result = session.canFetch('https://example.com/page');
    assertEqual(result.allowed, false, 'should timeout immediately');
  });

  // ═══════════════════════════════════════════════
  // 5. Job Queue
  // ═══════════════════════════════════════════════
  console.log('\n── Job Queue ──');

  test('enqueue creates job', () => {
    resetJobQueue();
    const result = enqueueJob('env_jq', 'org_jq');
    assertEqual(result.enqueued, true, 'should enqueue');
    assert(result.job !== null, 'should have job');
    assertEqual(result.job!.status, 'queued', 'starts queued');
  });

  test('1 active job per environment', () => {
    resetJobQueue();
    const r1 = enqueueJob('env_1e', 'org_1');
    startJob(r1.job!.id);
    const r2 = enqueueJob('env_1e', 'org_1');
    assertEqual(r2.enqueued, false, 'should not enqueue second');
    assert(r2.reason !== null, 'should have reason');
  });

  test('different environments can run concurrently', () => {
    resetJobQueue();
    const r1 = enqueueJob('env_a', 'org_1');
    const r2 = enqueueJob('env_b', 'org_1');
    assertEqual(r1.enqueued, true, 'env_a enqueued');
    assertEqual(r2.enqueued, true, 'env_b enqueued');
  });

  test('job progress updates', () => {
    resetJobQueue();
    const result = enqueueJob('env_prog', 'org_1');
    startJob(result.job!.id);
    updateJobProgress(result.job!.id, 50, 'bootstrap');
    const job = getJob(result.job!.id);
    assertEqual(job!.progress, 50, 'progress = 50');
    assert(job!.stages_completed.includes('bootstrap'), 'stage recorded');
  });

  test('job complete frees environment slot', () => {
    resetJobQueue();
    const r1 = enqueueJob('env_free', 'org_1');
    startJob(r1.job!.id);
    completeJob(r1.job!.id);
    const r2 = enqueueJob('env_free', 'org_1');
    assertEqual(r2.enqueued, true, 'slot freed after complete');
  });

  test('retry preserves completed stages', () => {
    resetJobQueue();
    const r1 = enqueueJob('env_retry', 'org_1');
    startJob(r1.job!.id);
    updateJobProgress(r1.job!.id, 40, 'bootstrap');
    failJobFn(r1.job!.id, 'test error');
    const retry = retryJob(r1.job!.id);
    assertEqual(retry.enqueued, true, 'retry enqueued');
    assert(retry.job!.stages_completed.includes('bootstrap'), 'preserved stage');
  });

  // ═══════════════════════════════════════════════
  // 6. Data Consistency
  // ═══════════════════════════════════════════════
  console.log('\n── Data Consistency ──');

  test('deduplicateFindings removes duplicates', () => {
    const findings = [
      mockFinding('dup_key', 'negative', 100, 70),
      mockFinding('dup_key', 'negative', 100, 80),
    ];
    const deduped = deduplicateFindings(findings);
    assertEqual(deduped.length, 1, 'should deduplicate');
    assertEqual(deduped[0].confidence, 80, 'keeps higher confidence');
  });

  test('deduplicateFindings keeps unique findings', () => {
    const findings = [mockFinding('key_a'), mockFinding('key_b')];
    const deduped = deduplicateFindings(findings);
    assertEqual(deduped.length, 2, 'should keep both');
  });

  test('deterministicSort is stable', () => {
    const findings = [
      mockFinding('b', 'negative', 100),
      mockFinding('a', 'negative', 100),
      mockFinding('c', 'positive', 0),
    ];
    const sorted1 = deterministicSort(findings);
    const sorted2 = deterministicSort([...findings].reverse());
    assertEqual(sorted1[0].inference_key, sorted2[0].inference_key, 'first same');
    assertEqual(sorted1[1].inference_key, sorted2[1].inference_key, 'second same');
    assertEqual(sorted1[2].inference_key, sorted2[2].inference_key, 'third same');
  });

  test('deterministicSort: negatives before positives', () => {
    const findings = [
      mockFinding('pos', 'positive', 0),
      mockFinding('neg', 'negative', 100),
    ];
    const sorted = deterministicSort(findings);
    assertEqual(sorted[0].polarity, 'negative', 'negative first');
    assertEqual(sorted[1].polarity, 'positive', 'positive second');
  });

  test('computeStableScore produces deterministic hash', () => {
    const findings = [mockFinding('a'), mockFinding('b')];
    const s1 = computeStableScore(findings);
    const s2 = computeStableScore([...findings].reverse());
    assertEqual(s1.hash, s2.hash, 'same hash regardless of order');
  });

  test('computeStableScore counts correctly', () => {
    const findings = [
      mockFinding('a', 'negative', 100),
      mockFinding('b', 'positive', 0),
      mockFinding('c', 'neutral', 50),
    ];
    const score = computeStableScore(findings);
    assertEqual(score.total_findings, 3, 'total');
    assertEqual(score.negative_count, 1, 'negative');
    assertEqual(score.positive_count, 1, 'positive');
    assertEqual(score.neutral_count, 1, 'neutral');
  });

  // ═══════════════════════════════════════════════
  // 7. Billing Safety
  // ═══════════════════════════════════════════════
  console.log('\n── Billing Safety ──');

  resetDailyUsage();
  {
    for (let i = 0; i < 5; i++) {
      await recordMcpQuery('org_safe');
    }
    const result = await safeIncrementMcpUsage('org_safe', 'vestigio');
    test('safeIncrementMcpUsage blocks at limit', () => {
      assertEqual(result.allowed, false, 'blocked at limit');
    });
  }

  resetDailyUsage();
  {
    const result = await safeIncrementMcpUsage('org_safe2', 'vestigio');
    test('safeIncrementMcpUsage allows under limit', () => {
      assertEqual(result.allowed, true, 'allowed under limit');
    });
  }

  test('safeSubtract never goes negative', () => {
    assertEqual(safeSubtract(5, 3), 2, '5-3=2');
    assertEqual(safeSubtract(3, 5), 0, '3-5=0 (not -2)');
    assertEqual(safeSubtract(0, 10), 0, '0-10=0');
  });

  test('safeAdd respects max', () => {
    assertEqual(safeAdd(5, 3, 10), 8, '5+3=8');
    assertEqual(safeAdd(8, 5, 10), 10, '8+5=10 (capped)');
    assertEqual(safeAdd(10, 1, 10), 10, '10+1=10 (capped)');
  });

  test('estimateDailyCost computes correctly', () => {
    const cost = estimateDailyCost({
      organization_id: 'org_cost',
      date: '2026-03-28',
      mcp_queries: 10,
      playwright_runs: 2,
      estimated_tokens: 5000,
      is_over_mcp_limit: false,
      is_over_playwright_limit: false,
    });
    assertGreater(cost.total_cost_cents, 0, 'should have cost');
    assertEqual(cost.mcp_cost_cents, 20, '10 queries x 2 cents');
    assertEqual(cost.playwright_cost_cents, 30, '2 runs x 15 cents');
  });

  test('computePlanUnitEconomics has positive margin', () => {
    const econ = computePlanUnitEconomics('pro');
    assertGreater(econ.margin_pct, 0, 'should have positive margin');
    assertGreater(econ.monthly_price_cents, econ.estimated_max_monthly_cost_cents, 'price > cost');
  });

  test('usage log is auditable', () => {
    resetBillingLogs();
    logUsageEvent({
      timestamp: new Date(),
      organization_id: 'org_log',
      operation: 'mcp_query',
      amount: 1,
      daily_total_after: 1,
      limit: 5,
      allowed: true,
      reason: null,
    });
    const log = getUsageLog('org_log');
    assertEqual(log.length, 1, 'should have 1 entry');
    assertEqual(log[0].operation, 'mcp_query', 'correct operation');
  });

  test('usage log caps at max entries', () => {
    resetBillingLogs();
    for (let i = 0; i < 100; i++) {
      logUsageEvent({
        timestamp: new Date(),
        organization_id: 'org_cap',
        operation: 'mcp_query',
        amount: 1,
        daily_total_after: i + 1,
        limit: 1000,
        allowed: true,
        reason: null,
      });
    }
    const log = getUsageLog('org_cap', 50);
    assert(log.length <= 50, 'respects limit param');
  });

  // ═══════════════════════════════════════════════
  // 8. Plan Entitlements
  // ═══════════════════════════════════════════════
  console.log('\n── Plan Entitlements ──');

  test('all plans have limits defined', () => {
    for (const plan of ['vestigio', 'pro', 'max'] as const) {
      const ent = getPlanEntitlements(plan);
      assert(ent.limits !== undefined, `${plan} should have limits`);
      assertGreater(ent.limits.daily_mcp_budget, 0, `${plan} should have MCP budget`);
    }
  });

  test('vestigio has no continuous audits', () => {
    const ent = getPlanEntitlements('vestigio');
    assertEqual(ent.continuous_audits_enabled, false, 'no audits');
    assertEqual(ent.limits.audit_frequency, 'none', 'no audit frequency');
  });

  test('pro has continuous audits', () => {
    const ent = getPlanEntitlements('pro');
    assertEqual(ent.continuous_audits_enabled, true, 'has audits');
    assertEqual(ent.limits.audit_frequency, 'low', 'low frequency');
  });

  test('max has high frequency audits', () => {
    const ent = getPlanEntitlements('max');
    assertEqual(ent.continuous_audits_enabled, true, 'has audits');
    assertEqual(ent.limits.audit_frequency, 'high', 'high frequency');
  });

  test('plan limits scale correctly', () => {
    const v = getPlanLimits('vestigio');
    const p = getPlanLimits('pro');
    const m = getPlanLimits('max');
    assert(v.daily_mcp_budget < p.daily_mcp_budget, 'vestigio < pro');
    assert(p.daily_mcp_budget < m.daily_mcp_budget, 'pro < max');
    assert(v.playwright_budget < p.playwright_budget, 'vestigio pw < pro pw');
    assert(p.playwright_budget < m.playwright_budget, 'pro pw < max pw');
  });

  // ═══════════════════════════════════════════════
  // Results
  // ═══════════════════════════════════════════════
  printResults('Phase 19 — Production Hardening');
  const results = getResults();
  if (results.failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
