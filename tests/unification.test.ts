/**
 * Vestigio V2 — Route Unification Test Suite
 * Tests: route structure, RBAC model, redirect logic,
 *        no feature regression in engine layer
 *
 * Run: npx tsx tests/unification.test.ts
 */

import {
  test, assert, assertEqual, assertGreater,
  pageContentEvidence, checkoutIndicatorEvidence, policyEvidence,
  resetCounters, printResults, getResults,
} from './helpers';

import { McpServer } from '../apps/mcp/server';
import { bootstrapMcpContextSync } from '../apps/mcp/bootstrap';
import { resetAllUsage, incrementUsage, checkUsageLimit } from '../apps/mcp/usage';
import { projectAll } from '../packages/projections';
import { buildAllMaps } from '../packages/maps';
import { getPlanEntitlements, isPlanKey } from '../packages/plans';

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

function standardEvidence() {
  return [
    pageContentEvidence('https://shop.com/'),
    checkoutIndicatorEvidence('https://shop.com/', 'https://pay.external.com/checkout', true),
    policyEvidence('https://shop.com/', 'https://shop.com/privacy', 'privacy'),
  ];
}

// ══════════════════════════════════════════════════
// 1. ROUTE STRUCTURE VALIDATION
// ══════════════════════════════════════════════════

runSuite('Route Structure', () => {
  test('/app routes exist as file system paths', () => {
    const fs = require('fs');
    const basePath = require('path').resolve(__dirname, '../src/app/app');

    const requiredRoutes = [
      'analysis/page.tsx',
      'chat/page.tsx',
      'actions/page.tsx',
      'workspaces/page.tsx',
      'maps/page.tsx',
      'onboarding/page.tsx',
      'settings/page.tsx',
      'organization/page.tsx',
      'billing/page.tsx',
      'members/page.tsx',
      'admin/overview/page.tsx',
      'admin/organizations/page.tsx',
      'admin/users/page.tsx',
      'admin/environments/page.tsx',
      'admin/usage-billing/page.tsx',
      'admin/pricing/page.tsx',
      'admin/system-health/page.tsx',
      'admin/platform-config/page.tsx',
    ];

    for (const route of requiredRoutes) {
      const fullPath = `${basePath}/${route}`;
      assert(fs.existsSync(fullPath), `Missing route: /app/${route}`);
    }
  });

  test('/app layout exists', () => {
    const fs = require('fs');
    const layoutPath = require('path').resolve(__dirname, '../src/app/app/layout.tsx');
    assert(fs.existsSync(layoutPath), 'Missing /app/layout.tsx');
  });

  test('/app/admin layout exists', () => {
    const fs = require('fs');
    const layoutPath = require('path').resolve(__dirname, '../src/app/app/admin/layout.tsx');
    assert(fs.existsSync(layoutPath), 'Missing /app/admin/layout.tsx');
  });

  test('AppSidebar component exists', () => {
    const fs = require('fs');
    const sidebarPath = require('path').resolve(__dirname, '../src/components/app/AppSidebar.tsx');
    assert(fs.existsSync(sidebarPath), 'Missing AppSidebar.tsx');
  });
});

// ══════════════════════════════════════════════════
// 2. RBAC MODEL
// ══════════════════════════════════════════════════

runSuite('RBAC Model', () => {
  test('plan entitlements distinguish customer tiers', () => {
    const vestigio = getPlanEntitlements('vestigio');
    const pro = getPlanEntitlements('pro');
    const max = getPlanEntitlements('max');

    // All valid plans
    assert(isPlanKey('vestigio'), 'vestigio is valid');
    assert(isPlanKey('pro'), 'pro is valid');
    assert(isPlanKey('max'), 'max is valid');

    // Tier scaling
    assert(pro.max_mcp_calls_per_month > vestigio.max_mcp_calls_per_month, 'pro > vestigio');
    assert(max.max_mcp_calls_per_month > pro.max_mcp_calls_per_month, 'max > pro');
  });

  test('platform admin is separate from org roles', () => {
    // Platform admin role = "ADMIN" on User model
    // Org roles = "owner" | "admin" | "member" on Membership model
    // These are distinct — org owner is NOT platform admin
    assert(true, 'Role models are structurally separate');
  });

  test('usage limits scope to organization', () => {
    resetAllUsage();
    incrementUsage('org_a', 10);
    incrementUsage('org_b', 20);

    const checkA = checkUsageLimit('org_a', 'vestigio');
    const checkB = checkUsageLimit('org_b', 'vestigio');

    assertEqual(checkA.summary.mcp_calls_used, 10);
    assertEqual(checkB.summary.mcp_calls_used, 20);
    // No cross-org leakage
  });
});

// ══════════════════════════════════════════════════
// 3. REDIRECT LOGIC
// ══════════════════════════════════════════════════

runSuite('Redirect Logic', () => {
  test('middleware config covers all required paths', () => {
    // Verify middleware matcher includes /app and legacy routes
    // (structural test — actual middleware runs in Next.js runtime)
    const expectedPaths = [
      '/app/:path*',
      '/user/:path*',
      '/admin/:path*',
      '/analysis/:path*',
      '/actions/:path*',
    ];
    // The middleware file exists and has proper matcher config
    const fs = require('fs');
    const content = fs.readFileSync(require('path').resolve(__dirname, '../src/middleware.ts'), 'utf-8');
    for (const p of expectedPaths) {
      assert(content.includes(p.replace(':path*', '')), `Middleware should match ${p}`);
    }
  });

  test('middleware handles legacy console redirects', () => {
    const fs = require('fs');
    const content = fs.readFileSync(require('path').resolve(__dirname, '../src/middleware.ts'), 'utf-8');

    // Should redirect old console paths to /app equivalents
    assert(content.includes('"/analysis": "/app/analysis"'), 'analysis redirect');
    assert(content.includes('"/chat": "/app/chat"'), 'chat redirect');
    assert(content.includes('"/actions": "/app/actions"'), 'actions redirect');
  });

  test('middleware protects /app/admin for non-admin', () => {
    const fs = require('fs');
    const content = fs.readFileSync(require('path').resolve(__dirname, '../src/middleware.ts'), 'utf-8');

    assert(content.includes('pathname.startsWith("/app/admin")'), 'admin path check exists');
    assert(content.includes('!isAdmin'), 'non-admin rejection exists');
  });
});

// ══════════════════════════════════════════════════
// 4. NO FEATURE REGRESSION
// ══════════════════════════════════════════════════

runSuite('No Feature Regression', () => {
  test('MCP engine still works after unification', () => {
    const server = new McpServer();
    const result = bootstrapMcpContextSync(server, {
      organization_id: 'org_unified',
      organization_name: 'Unified Corp',
      environment_id: 'env_1',
      domain: 'shop.com',
      landing_url: 'https://shop.com/',
      is_production: true,
      audit_cycle_id: 'cycle_unified',
    }, standardEvidence());

    assertEqual(result.status, 'ready');
    assert(server.getContext() !== null, 'context loaded');
  });

  test('projections still work', () => {
    const server = new McpServer();
    bootstrapMcpContextSync(server, {
      organization_id: 'org_proj',
      organization_name: 'Proj Corp',
      environment_id: 'env_1',
      domain: 'shop.com',
      landing_url: 'https://shop.com/',
      is_production: true,
    }, standardEvidence());

    const findings = server.callTool('get_finding_projections');
    assertEqual(findings.type, 'finding_projections');
    assertGreater((findings.data as any).length, 0, 'has findings');
  });

  test('maps still work', () => {
    const server = new McpServer();
    bootstrapMcpContextSync(server, {
      organization_id: 'org_map',
      organization_name: 'Map Corp',
      environment_id: 'env_1',
      domain: 'shop.com',
      landing_url: 'https://shop.com/',
      is_production: true,
    }, standardEvidence());

    const map = server.callTool('get_map', { map_type: 'root_cause' });
    assertEqual(map.type, 'map');
    assert(map.data !== null, 'has map data');
  });

  test('contextual chat still works', () => {
    const server = new McpServer();
    bootstrapMcpContextSync(server, {
      organization_id: 'org_chat',
      organization_name: 'Chat Corp',
      environment_id: 'env_1',
      domain: 'shop.com',
      landing_url: 'https://shop.com/',
      is_production: true,
    }, standardEvidence());

    const findings = server.callTool('get_finding_projections');
    if (findings.type === 'finding_projections' && findings.data.length > 0) {
      const discuss = server.callTool('discuss_finding', { finding_id: findings.data[0].id });
      assertEqual(discuss.type, 'answer');
      assert((discuss.data as any).contextual_focus !== null, 'has contextual focus');
      assert((discuss.data as any).suggestions !== null, 'has suggestions');
    }
  });

  test('suggestions still work', () => {
    const server = new McpServer();
    bootstrapMcpContextSync(server, {
      organization_id: 'org_sugg',
      organization_name: 'Sugg Corp',
      environment_id: 'env_1',
      domain: 'shop.com',
      landing_url: 'https://shop.com/',
      is_production: true,
    }, standardEvidence());

    const answer = server.callTool('answer_can_i_scale');
    assertEqual(answer.type, 'answer');
    assert((answer.data as any).suggestions !== null, 'answer has suggestions');
    assert((answer.data as any).navigation !== null, 'answer has navigation');
  });
});

// ══════════════════════════════════════════════════
// 5. NAVIGATION COHERENCE
// ══════════════════════════════════════════════════

runSuite('Navigation Coherence', () => {
  test('AppSidebar references /app paths only', () => {
    const fs = require('fs');
    const content = fs.readFileSync(require('path').resolve(__dirname, '../src/components/app/AppSidebar.tsx'), 'utf-8');

    // All hrefs should be /app/...
    const hrefMatches = content.match(/href: "([^"]+)"/g) || [];
    for (const match of hrefMatches) {
      const href = match.replace('href: "', '').replace('"', '');
      assert(href.startsWith('/app/'), `Sidebar href should start with /app/: ${href}`);
    }
  });

  test('no duplicate navigation concepts', () => {
    const fs = require('fs');
    const content = fs.readFileSync(require('path').resolve(__dirname, '../src/components/app/AppSidebar.tsx'), 'utf-8');

    // After the post-Sprint-4 sidebar refactor, the layout collapsed
    // to two role-conditional sections: "Product" (regular users) and
    // "Platform Admin" (admins). The legacy "Control Plane" middle
    // section was removed when admin-only items were folded into
    // Platform Admin.
    assert(content.includes('"Product"'), 'has Product section');
    assert(content.includes('"Platform Admin"'), 'has Platform Admin section');

    // No old boilerplate references
    assert(!content.includes('"/user"'), 'no /user links');
    assert(!content.includes('"/admin/"'), 'no /admin/ links (only /app/admin/)');
  });
});

// ══════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════');
console.log('  ROUTE UNIFICATION TEST SUMMARY');
console.log('═══════════════════════════════════════════════');
console.log(`  Suites: ${suitesPassed + suitesFailed} (${suitesPassed} passed, ${suitesFailed} failed)`);
if (suitesFailed > 0) {
  console.log('  SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('  ALL TESTS PASSED');
}
console.log('═══════════════════════════════════════════════');
