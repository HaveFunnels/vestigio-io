#!/usr/bin/env tsx
/**
 * check-invariants — guard against regressions that lint + typecheck miss.
 *
 * Each invariant is small, fast, and self-contained. Failures exit
 * non-zero with a clear diagnostic. Wire into `npm test` or `test-build`
 * so the next dev can't accidentally undo the constraints documented
 * in the Wave 20.6 post-mortem.
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

interface Invariant {
  name: string;
  check: () => string | null; // null = OK, string = failure reason
}

function walkDir(dir: string, predicate: (filePath: string) => boolean, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist") continue;
      walkDir(full, predicate, out);
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

const INVARIANTS: Invariant[] = [
  {
    name: "engine.ts stays orchestrator-only (< 200 lines)",
    check: () => {
      const enginePath = path.join(ROOT, "packages/inference/engine.ts");
      const lines = fs.readFileSync(enginePath, "utf-8").split("\n").length;
      if (lines > 200) {
        return `packages/inference/engine.ts has ${lines} lines (limit 200). ` +
          `Wave 20.6 carved the inference packs out into packages/inference/packs/. ` +
          `New inferences should land in a pack file, not in engine.ts.`;
      }
      return null;
    },
  },
  {
    name: "engine.ts contains no inline inferX functions",
    check: () => {
      const enginePath = path.join(ROOT, "packages/inference/engine.ts");
      const content = fs.readFileSync(enginePath, "utf-8");
      const match = content.match(/^function infer[A-Z]\w+/m);
      if (match) {
        return `packages/inference/engine.ts defines an inline ${match[0]} function. ` +
          `Move it into packages/inference/packs/<topic>.ts and import the pack here.`;
      }
      return null;
    },
  },
  {
    name: "prisma migration timestamps are monotonic and unique",
    check: () => {
      const dir = path.join(ROOT, "prisma/migrations");
      if (!fs.existsSync(dir)) return null;
      const entries = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isDirectory() && /^\d{14}_/.test(e.name))
        .map(e => e.name);
      const timestamps = entries.map(n => n.slice(0, 14));
      const sorted = [...timestamps].sort();
      if (JSON.stringify(timestamps) !== JSON.stringify(sorted)) {
        return `prisma/migrations entries are not in chronological order. ` +
          `Rename out-of-order folders so their timestamps sort lexicographically — ` +
          `Prisma uses this order to apply migrations and a regression breaks deploys.`;
      }
      const seen = new Set<string>();
      for (const t of timestamps) {
        if (seen.has(t)) return `Migration timestamp ${t} appears twice. Each migration must use a unique YYYYMMDDHHMMSS prefix.`;
        seen.add(t);
      }
      return null;
    },
  },
  {
    name: "no test-helpers imported from src/ code",
    check: () => {
      // credits-test-helpers wipes data — runtime-guarded against
      // NODE_ENV=production, but a build-time check surfaces the bug
      // at the diff stage instead of the deploy.
      const srcDir = path.join(ROOT, "src");
      const offenders: string[] = [];
      const tsFiles = walkDir(srcDir, p => p.endsWith(".ts") || p.endsWith(".tsx"));
      for (const file of tsFiles) {
        const content = fs.readFileSync(file, "utf-8");
        if (/from\s+['"][^'"]*credits-test-helpers['"]/.test(content)) {
          offenders.push(path.relative(ROOT, file));
        }
      }
      if (offenders.length > 0) {
        return `src/ imports credits-test-helpers:\n  ${offenders.join("\n  ")}\n` +
          `Test helpers must never be imported from app code.`;
      }
      return null;
    },
  },
  {
    name: "every pack-emitted inference_key has an INFERENCE_TO_PACK entry",
    check: () => {
      const packsDir = path.join(ROOT, "packages/inference/packs");
      const emittedKeys = new Set<string>();
      for (const file of fs.readdirSync(packsDir)) {
        if (!file.endsWith(".ts")) continue;
        const content = fs.readFileSync(path.join(packsDir, file), "utf-8");
        for (const m of content.matchAll(/inference_key:\s*['"]([a-z0-9_]+)['"]/g)) {
          emittedKeys.add(m[1]);
        }
      }
      const mapFile = path.join(ROOT, "packages/projections/inference-to-pack.ts");
      if (!fs.existsSync(mapFile)) {
        return `packages/projections/inference-to-pack.ts missing.`;
      }
      const mapContent = fs.readFileSync(mapFile, "utf-8");
      const mapKeys = new Set<string>();
      for (const m of mapContent.matchAll(/^\s+([a-z0-9_]+):\s*['"][a-z_]+['"]/gm)) {
        mapKeys.add(m[1]);
      }
      const missing = [...emittedKeys].filter(k => !mapKeys.has(k));
      if (missing.length > 0) {
        return (
          `Pack-emitted inference keys missing from INFERENCE_TO_PACK:\n  ${missing.join("\n  ")}\n` +
          `Without a mapping the finding ends up orphaned (no workspace surfaces it). ` +
          `Add an entry in packages/projections/inference-to-pack.ts.`
        );
      }
      return null;
    },
  },
  {
    name: "inference-keys.ts is up-to-date with packs/*.ts",
    check: () => {
      const keysFile = path.join(ROOT, "packages/domain/inference-keys.ts");
      if (!fs.existsSync(keysFile)) {
        return `packages/domain/inference-keys.ts missing. Run: npm run codegen:inference-keys`;
      }
      const packsDir = path.join(ROOT, "packages/inference/packs");
      const emittedKeys = new Set<string>();
      for (const file of fs.readdirSync(packsDir)) {
        if (!file.endsWith(".ts")) continue;
        const content = fs.readFileSync(path.join(packsDir, file), "utf-8");
        for (const m of content.matchAll(/inference_key:\s*['"]([a-z0-9_]+)['"]/g)) {
          emittedKeys.add(m[1]);
        }
      }
      const generated = fs.readFileSync(keysFile, "utf-8");
      const generatedKeys = new Set<string>();
      for (const m of generated.matchAll(/:\s*'([a-z0-9_]+)'/g)) {
        generatedKeys.add(m[1]);
      }
      const missing = [...emittedKeys].filter(k => !generatedKeys.has(k));
      const extra = [...generatedKeys].filter(k => !emittedKeys.has(k));
      if (missing.length > 0 || extra.length > 0) {
        return (
          `Drift between pack files and inference-keys.ts.\n` +
          (missing.length ? `  Pack emits but key not in inference-keys.ts: ${missing.join(", ")}\n` : "") +
          (extra.length ? `  inference-keys.ts has key not emitted by any pack: ${extra.join(", ")}\n` : "") +
          `  Run: npm run codegen:inference-keys`
        );
      }
      return null;
    },
  },
];

function main(): void {
  let failed = 0;
  for (const inv of INVARIANTS) {
    const fail = inv.check();
    if (fail) {
      console.error(`✖ ${inv.name}`);
      console.error(`  ${fail}\n`);
      failed++;
    } else {
      console.log(`✓ ${inv.name}`);
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} invariant(s) violated.`);
    process.exit(1);
  }
  console.log(`\nAll ${INVARIANTS.length} invariants pass.`);
}

main();
