import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';

// ──────────────────────────────────────────────
// Phase 22 — Stabilization Pass Tests
//
// Validates that audit findings are resolved:
//   - ESLint config is valid JSON (no comments, no conflicts)
//   - tsconfig target raised from es5
//   - package.json has correct Node engine + scripts
//   - Prisma schema has Phase 20 models
//   - store-enforcement initializes MCP persistence
//   - instrumentation.ts exists and exports register()
//   - resolveOrgContext() helper exists
//   - globals.css has no Google Fonts @import
// ──────────────────────────────────────────────

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

function readFile(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('Phase 22 — Stabilization', () => {

  describe('ESLint Config', () => {
    it('is valid JSON (no comments that break parsing)', () => {
      const raw = readFile('.eslintrc.json');
      const config = JSON.parse(raw);
      assert.ok(config.extends, 'extends should exist');
    });

    it('does not duplicate react-hooks with next/core-web-vitals', () => {
      const raw = readFile('.eslintrc.json');
      const config = JSON.parse(raw);
      const extends_ = config.extends as string[];
      const reactHooksCount = extends_.filter(e => e.includes('react-hooks')).length;
      assert.equal(reactHooksCount, 0, 'react-hooks should not be in extends (next/core-web-vitals includes it)');
    });

    it('does not duplicate plugin:react/recommended with next', () => {
      const raw = readFile('.eslintrc.json');
      const config = JSON.parse(raw);
      const extends_ = config.extends as string[];
      const reactCount = extends_.filter(e => e === 'plugin:react/recommended').length;
      assert.equal(reactCount, 0, 'plugin:react/recommended not needed with next/core-web-vitals');
    });
  });

  describe('TypeScript Config', () => {
    it('target is es2022 or higher', () => {
      const raw = readFile('tsconfig.json');
      const config = JSON.parse(raw);
      const target = config.compilerOptions.target.toLowerCase();
      assert.ok(
        !['es5', 'es6', 'es2015', 'es2016', 'es2017', 'es2018', 'es2019', 'es2020', 'es2021'].includes(target),
        `target should be es2022+, got ${target}`,
      );
    });

    it('include does not have comma-separated entries', () => {
      const raw = readFile('tsconfig.json');
      const config = JSON.parse(raw);
      for (const entry of config.include) {
        assert.ok(!entry.includes(','), `include entry should not contain commas: ${entry}`);
      }
    });
  });

  describe('package.json', () => {
    it('Node engine is >=18.18.0', () => {
      const raw = readFile('package.json');
      const pkg = JSON.parse(raw);
      assert.ok(pkg.engines.node.includes('18'), `engine should require Node 18+, got ${pkg.engines.node}`);
    });

    it('has typecheck script', () => {
      const raw = readFile('package.json');
      const pkg = JSON.parse(raw);
      assert.ok(pkg.scripts.typecheck, 'typecheck script should exist');
      assert.ok(pkg.scripts.typecheck.includes('tsc'), 'typecheck should run tsc');
    });

    it('has test script', () => {
      const raw = readFile('package.json');
      const pkg = JSON.parse(raw);
      assert.ok(pkg.scripts.test, 'test script should exist');
    });

    it('has seed script', () => {
      const raw = readFile('package.json');
      const pkg = JSON.parse(raw);
      assert.ok(pkg.scripts.seed, 'seed script should exist');
    });
  });

  describe('Google Fonts', () => {
    it('globals.css does not import Google Fonts (next/font/google handles it)', () => {
      const raw = readFile('src/styles/globals.css');
      assert.ok(!raw.includes('fonts.googleapis.com'), 'globals.css should not import Google Fonts directly');
    });
  });

  describe('Prisma Schema — Phase 20 Models', () => {
    const schema = readFile('prisma/schema.prisma');

    it('has McpPromptEvent model', () => {
      assert.ok(schema.includes('model McpPromptEvent'), 'McpPromptEvent model missing');
    });

    it('has McpSession model', () => {
      assert.ok(schema.includes('model McpSession'), 'McpSession model missing');
    });

    it('has McpSuggestionClick model', () => {
      assert.ok(schema.includes('model McpSuggestionClick'), 'McpSuggestionClick model missing');
    });

    it('has PlaybookRun model', () => {
      assert.ok(schema.includes('model PlaybookRun'), 'PlaybookRun model missing');
    });

    it('has AnalysisJob model', () => {
      assert.ok(schema.includes('model AnalysisJob'), 'AnalysisJob model missing');
    });
  });

  describe('Seed Script', () => {
    it('is executable (imports PrismaClient, not a stub)', () => {
      const raw = readFile('prisma/seed.ts');
      assert.ok(raw.includes("import { PrismaClient }"), 'seed should import PrismaClient');
      assert.ok(!raw.includes('Uncomment Prisma operations'), 'seed should not be a stub');
    });
  });

  describe('Instrumentation Hook', () => {
    it('src/instrumentation.ts exists', () => {
      assert.ok(fs.existsSync(path.join(ROOT, 'src/instrumentation.ts')), 'instrumentation.ts should exist');
    });

    it('exports register function', () => {
      const raw = readFile('src/instrumentation.ts');
      assert.ok(raw.includes('export async function register'), 'should export register()');
    });

    it('calls vestigioStartup', () => {
      const raw = readFile('src/instrumentation.ts');
      assert.ok(raw.includes('vestigioStartup'), 'should call vestigioStartup');
    });

    it('calls enforceProductionLock', () => {
      const raw = readFile('src/instrumentation.ts');
      assert.ok(raw.includes('enforceProductionLock'), 'should call enforceProductionLock');
    });

    it('wires MCP persistence store', () => {
      const raw = readFile('src/instrumentation.ts');
      assert.ok(raw.includes('setMcpPersistenceStore'), 'should wire MCP persistence');
    });
  });

  describe('Session-Based Org Resolution', () => {
    it('resolve-org.ts exists', () => {
      assert.ok(fs.existsSync(path.join(ROOT, 'src/libs/resolve-org.ts')), 'resolve-org.ts should exist');
    });

    it('exports resolveOrgContext', () => {
      const raw = readFile('src/libs/resolve-org.ts');
      assert.ok(raw.includes('export async function resolveOrgContext'), 'should export resolveOrgContext');
    });

    it('console layout uses resolveOrgContext', () => {
      const raw = readFile('src/app/(console)/layout.tsx');
      assert.ok(raw.includes('resolveOrgContext'), 'console layout should use resolveOrgContext');
      assert.ok(!raw.includes('orgId: "demo"'), 'console layout should not hardcode demo org');
    });

    it('app layout uses resolveOrgContext', () => {
      const raw = readFile('src/app/app/layout.tsx');
      assert.ok(raw.includes('resolveOrgContext'), 'app layout should use resolveOrgContext');
      assert.ok(!raw.includes('orgId: "demo"'), 'app layout should not hardcode demo org');
    });

    it('usage API does not hardcode demo org', () => {
      const raw = readFile('src/app/api/usage/route.ts');
      assert.ok(!raw.includes('"demo"'), 'usage API should not hardcode demo');
      assert.ok(raw.includes('resolveOrgContext'), 'usage API should use resolveOrgContext');
    });
  });

  describe('Store Enforcement — MCP Persistence', () => {
    it('store-enforcement initializes MCP persistence store', () => {
      const raw = readFile('apps/platform/store-enforcement.ts');
      assert.ok(raw.includes('setMcpPersistenceStore'), 'should initialize MCP persistence');
      assert.ok(raw.includes('PrismaMcpPersistenceStore'), 'should use Prisma in production');
      assert.ok(raw.includes('InMemoryMcpPersistenceStore'), 'should use InMemory in dev');
    });
  });

  describe('Error Tracking Wiring', () => {
    it('onboard route uses withErrorTracking', () => {
      const raw = readFile('src/app/api/onboard/route.ts');
      assert.ok(raw.includes('withErrorTracking'), 'onboard should use withErrorTracking');
    });

    it('data-sources/saas route uses withErrorTracking', () => {
      const raw = readFile('src/app/api/data-sources/saas/route.ts');
      assert.ok(raw.includes('withErrorTracking'), 'saas route should use withErrorTracking');
    });

    it('analysis stream route uses trackError', () => {
      const raw = readFile('src/app/api/analysis/stream/route.ts');
      assert.ok(raw.includes('trackError'), 'analysis stream should use trackError');
    });
  });

  describe('Analysis Stream — MCP Bootstrap', () => {
    it('bootstraps MCP context after analysis', () => {
      const raw = readFile('src/app/api/analysis/stream/route.ts');
      assert.ok(raw.includes('bootstrapMcpContextSync'), 'should bootstrap MCP context');
    });

    it('persists job records', () => {
      const raw = readFile('src/app/api/analysis/stream/route.ts');
      assert.ok(raw.includes('getMcpPersistenceStore'), 'should use persistence store');
      assert.ok(raw.includes('store.saveJob'), 'should save job record');
    });
  });
});

// ──────────────────────────────────────────────
// Run
// ──────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════');
console.log('  Phase 22 — Stabilization Tests');
console.log('═══════════════════════════════════════════════\n');
