/**
 * Vestigio V2 — Foundation Knowledge Base Articles Test Suite
 * Tests: every finding/root_cause has a foundation article,
 *        articles have well-formed structure, slug routing works.
 *
 * Run: npx tsx tests/foundation-articles.test.ts
 */

import {
  test, assert, assertEqual, assertGreater,
  resetCounters, printResults, getResults,
} from './helpers';

import {
  getFoundationArticleByFindingKey,
  getFoundationArticleByRootCauseKey,
  getFoundationArticleBySlug,
  listFoundationArticles,
  getFoundationCoverage,
} from '../packages/knowledge/foundation-articles';
import { INFERENCE_TITLES, POSITIVE_CHECKS } from '../packages/projections/engine';
import { ROOT_CAUSE_TITLES } from '../packages/intelligence/root-causes';

let suitesPassed = 0;
let suitesFailed = 0;

function runSuite(name: string, fn: () => void): void {
  resetCounters();
  fn();
  const r = getResults();
  printResults(name);
  if (r.failed > 0) suitesFailed++;
  else suitesPassed++;
}

// ══════════════════════════════════════════════════
// 1. COVERAGE — every finding/root_cause has an article
// ══════════════════════════════════════════════════

runSuite('Foundation Article Coverage', () => {
  test('every inference_key in INFERENCE_TITLES has a foundation article', () => {
    const missing: string[] = [];
    for (const key of Object.keys(INFERENCE_TITLES)) {
      if (!getFoundationArticleByFindingKey(key)) missing.push(key);
    }
    assertEqual(missing.length, 0,
      `missing foundation articles for: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ', ...' : ''}`);
  });

  test('every positive check has a foundation article', () => {
    const missing: string[] = [];
    for (const positive of POSITIVE_CHECKS) {
      if (!getFoundationArticleByFindingKey(positive.key)) missing.push(positive.key);
    }
    assertEqual(missing.length, 0,
      `missing foundation articles for positives: ${missing.join(', ')}`);
  });

  test('every root_cause_key in ROOT_CAUSE_TITLES has a foundation article', () => {
    const missing: string[] = [];
    for (const key of Object.keys(ROOT_CAUSE_TITLES)) {
      if (!getFoundationArticleByRootCauseKey(key)) missing.push(key);
    }
    assertEqual(missing.length, 0,
      `missing foundation articles for: ${missing.join(', ')}`);
  });

  test('coverage report shows non-zero counts', () => {
    const coverage = getFoundationCoverage();
    assertGreater(coverage.total_findings, 50, 'has many findings');
    assertGreater(coverage.total_root_causes, 20, 'has many root causes');
    assertGreater(coverage.total_articles, 70, 'has many total articles');
  });
});

// ══════════════════════════════════════════════════
// 2. ARTICLE STRUCTURE
// ══════════════════════════════════════════════════

runSuite('Foundation Article Structure', () => {
  test('finding article has all required fields', () => {
    const article = getFoundationArticleByFindingKey('trust_boundary_crossed');
    assert(article !== null, 'should exist');
    assert(typeof article!.title === 'string' && article!.title.length > 0, 'has title');
    assertEqual(article!.slug.current, 'finding-trust_boundary_crossed');
    assertEqual(article!.category, 'finding');
    assertEqual(article!.finding_key, 'trust_boundary_crossed');
    assert(article!.excerpt.length > 0, 'has excerpt');
    assertGreater(article!.body.length, 3, 'has multiple body blocks');
    assertEqual(article!.is_foundation, true);
  });

  test('root cause article has all required fields', () => {
    const article = getFoundationArticleByRootCauseKey('trust_failure_at_checkout');
    assert(article !== null, 'should exist');
    assert(typeof article!.title === 'string' && article!.title.length > 0, 'has title');
    assertEqual(article!.slug.current, 'root-cause-trust_failure_at_checkout');
    assertEqual(article!.category, 'concept');
    assertEqual(article!.root_cause_key, 'trust_failure_at_checkout');
    assertGreater(article!.body.length, 4, 'has multiple body blocks');
    assertEqual(article!.is_foundation, true);
  });

  test('article body uses Sanity portable text format', () => {
    const article = getFoundationArticleByFindingKey('trust_boundary_crossed');
    for (const block of article!.body) {
      assertEqual(block._type, 'block');
      assert(['h2', 'h3', 'normal', 'blockquote'].includes(block.style), `valid style: ${block.style}`);
      assert(Array.isArray(block.children), 'has children array');
      for (const span of block.children) {
        assertEqual(span._type, 'span');
        assert(typeof span.text === 'string', 'span has text');
      }
      assert(typeof block._key === 'string' && block._key.length > 0, 'has _key');
    }
  });

  test('finding article links structurally to its root cause description', () => {
    // trust_boundary_crossed → trust_failure_at_checkout
    const article = getFoundationArticleByFindingKey('trust_boundary_crossed');
    const bodyText = article!.body
      .flatMap((b) => b.children.map((c) => c.text))
      .join(' ');
    assert(
      bodyText.includes('Trust failure at checkout') || bodyText.includes('checkout'),
      'should reference linked root cause',
    );
  });
});

// ══════════════════════════════════════════════════
// 3. SLUG ROUTING
// ══════════════════════════════════════════════════

runSuite('Foundation Slug Routing', () => {
  test('finding article is reachable by slug', () => {
    const slug = 'finding-trust_boundary_crossed';
    const bySlug = getFoundationArticleBySlug(slug);
    const byKey = getFoundationArticleByFindingKey('trust_boundary_crossed');
    assert(bySlug !== null, 'reachable by slug');
    assertEqual(bySlug!._id, byKey!._id);
  });

  test('root cause article is reachable by slug', () => {
    const slug = 'root-cause-trust_failure_at_checkout';
    const bySlug = getFoundationArticleBySlug(slug);
    const byKey = getFoundationArticleByRootCauseKey('trust_failure_at_checkout');
    assert(bySlug !== null, 'reachable by slug');
    assertEqual(bySlug!._id, byKey!._id);
  });

  test('unknown slug returns null', () => {
    assertEqual(getFoundationArticleBySlug('finding-this_does_not_exist'), null);
    assertEqual(getFoundationArticleBySlug('completely-bogus'), null);
  });

  test('listFoundationArticles returns all articles', () => {
    const all = listFoundationArticles();
    const coverage = getFoundationCoverage();
    assertEqual(all.length, coverage.total_articles);
    // Each article appears exactly once
    const slugs = new Set(all.map((a) => a.slug.current));
    assertEqual(slugs.size, all.length, 'no duplicate slugs');
  });
});

// ══════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════');
console.log('  FOUNDATION ARTICLES TEST SUMMARY');
console.log('═══════════════════════════════════════════════');
console.log(`  Suites: ${suitesPassed + suitesFailed} (${suitesPassed} passed, ${suitesFailed} failed)`);
if (suitesFailed > 0) {
  console.log('  SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('  ALL TESTS PASSED');
}
console.log('═══════════════════════════════════════════════');
