#!/usr/bin/env tsx
/**
 * codegen-inference-keys — extract every `inference_key: 'foo'` string
 * literal from packages/inference/packs/*.ts and emit a const-object
 * in packages/domain/inference-keys.ts.
 *
 * Why: 177 unique inference_keys are referenced as string literals
 * across packs + projections + impact + decision. A rename is grep-
 * and-pray today. With this codegen + the matching invariant check,
 * the keys become IDE-renamable + typo-safe.
 *
 * Run: npm run codegen:inference-keys
 * Check (CI):  npm run check:invariants  (compares emitted vs current)
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const PACKS_DIR = path.join(ROOT, "packages/inference/packs");
const OUTPUT_FILE = path.join(ROOT, "packages/domain/inference-keys.ts");

function extractKeys(): { key: string; pack: string }[] {
  const out: { key: string; pack: string }[] = [];
  const seen = new Set<string>();
  for (const file of fs.readdirSync(PACKS_DIR)) {
    if (!file.endsWith(".ts")) continue;
    const pack = file.replace(/\.ts$/, "");
    const content = fs.readFileSync(path.join(PACKS_DIR, file), "utf-8");
    const matches = content.matchAll(/inference_key:\s*['"]([a-z0-9_]+)['"]/g);
    for (const m of matches) {
      const key = m[1];
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, pack });
    }
  }
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

function toPascalCase(snake: string): string {
  return snake
    .split("_")
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

function emit(keys: { key: string; pack: string }[]): string {
  const header = [
    "// ──────────────────────────────────────────────",
    "// GENERATED FILE — do not edit by hand.",
    "//",
    `// Source: packages/inference/packs/*.ts (${keys.length} unique inference keys).`,
    "// Regenerate: npm run codegen:inference-keys",
    "// Check: npm run check:invariants",
    "//",
    "// Adding a new inference: write an `inference_key` literal in a pack",
    "// file. The codegen + invariant check picks it up automatically.",
    "// ──────────────────────────────────────────────",
    "",
  ].join("\n");

  const entries = keys
    .map(({ key, pack }) => `  /** From packs/${pack}.ts */\n  ${toPascalCase(key)}: '${key}',`)
    .join("\n");

  const body = `export const InferenceKey = {\n${entries}\n} as const;\n\n` +
    `export type InferenceKeyValue = (typeof InferenceKey)[keyof typeof InferenceKey];\n`;

  return header + body;
}

function main(): void {
  const keys = extractKeys();
  const content = emit(keys);
  fs.writeFileSync(OUTPUT_FILE, content);
  console.log(`Wrote ${keys.length} inference keys to ${path.relative(ROOT, OUTPUT_FILE)}`);
}

main();
