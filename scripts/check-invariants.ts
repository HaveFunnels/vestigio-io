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
    name: "one session id across the funnel",
    check: () => {
      // The marketing tracker keyed events on "_vtg_sid" while the
      // audit funnel minted its own under "vestigio_lp_session", so
      // the two halves of the same visit carried different ids and
      // could not be joined. "Ad click → homepage → /audit → lead →
      // signup" was unqueryable, which is the only journey that tells
      // you whether ad spend worked.
      //
      // So the key lives in exactly one module and everyone else
      // imports the accessor.
      const files = [
        ...walkDir(path.join(ROOT, "src"), (f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)),
      ];
      const owner = path.join(ROOT, "src", "libs", "marketing-session.ts");
      // The in-app tracker keeps its own id on purpose: its events are
      // post-auth and join to everything else through userId, which
      // signup.attempt records on success. The rule being enforced is
      // about the PRE-auth funnel, where there is no user yet and the
      // session id is the only key there is.
      const allowed = new Set([path.join(ROOT, "src", "hooks", "useProductTrack.tsx")]);
      const offenders: string[] = [];
      for (const f of files) {
        if (f === owner || allowed.has(f)) continue;
        const text = fs.readFileSync(f, "utf8");
        // A module that mints its own visit id, rather than reading the
        // shared one.
        if (/sessionStorage\.setItem\(\s*(SESSION_KEY|["'`][^"'`]*(sid|session)[^"'`]*["'`])/i.test(text)) {
          offenders.push(path.relative(ROOT, f));
        }
      }
      if (offenders.length === 0) return null;
      return (
        `${offenders.length} file(s) mint their own session id instead of ` +
        `importing getOrCreateSessionId from src/libs/marketing-session.ts:\n  ` +
        offenders.join("\n  ")
      );
    },
  },
  {
    name: "every Turnstile-gated route has a caller that sends the token",
    check: () => {
      // verifyTurnstile fails OPEN while TURNSTILE_SECRET_KEY is unset
      // and fails CLOSED the moment it is set. So a route can be added
      // to the gate, pass every test and every local run, and start
      // rejecting 100% of real traffic the day the secret lands in
      // production, with no error anywhere but a 400 the visitor sees.
      //
      // That happened. Turnstile shipped 2026-07-05; the signup form
      // and the password-reset form never sent a token. Signup was
      // dead from that day until 2026-10-16, and the only reason it
      // took three months to notice is that almost nobody tried. The
      // last user in the database predates the regression.
      //
      // So: a route that verifies a token must have a client that
      // sends one. Routes with no client caller at all are skipped,
      // since there is nothing to check against.
      const apiDir = path.join(ROOT, "src", "app", "api");
      const gated = walkDir(apiDir, (f) => /route\.tsx?$/.test(f)).filter((f) =>
        fs.readFileSync(f, "utf8").includes("verifyTurnstile"),
      );
      if (gated.length === 0) return null;

      const clientFiles = [
        ...walkDir(path.join(ROOT, "src", "components"), (f) => /\.tsx?$/.test(f)),
        ...walkDir(path.join(ROOT, "src", "app"), (f) => /\.tsx?$/.test(f) && !/\/route\.tsx?$/.test(f)),
      ].map((f) => {
        const raw = fs.readFileSync(f, "utf8");
        // Comments are stripped once, and the stripped text drives BOTH
        // "does this file call the route" and "does it send a token".
        // Using raw text for the first made TurnstileWidget.tsx look
        // like a caller of run-audit because its header comment names
        // the route.
        const code = raw
          .split("\n")
          .filter((line) => {
            const t = line.trim();
            return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
          })
          .join("\n");
        return { file: f, code };
      });

      const broken: string[] = [];
      for (const routeFile of gated) {
        // src/app/api/user/register/route.ts -> /api/user/register
        const urlPath =
          "/" +
          path
            .relative(path.join(ROOT, "src", "app"), path.dirname(routeFile))
            .split(path.sep)
            .join("/");
        // Dynamic segments are template holes in the caller
        // (`/api/lead/${leadId}/run-audit`), so each becomes a
        // wildcard. Truncating at the first segment instead would
        // reduce this route to "/api/lead" and match every file that
        // merely mentions a lead URL, which turns the whole check into
        // noise.
        const pattern = new RegExp(
          urlPath
            .split("/")
            .map((seg) =>
              /^\[.*\]$/.test(seg) ? "[^/\"'`\\s]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            )
            .join("/"),
        );
        const callers = clientFiles.filter((c) => pattern.test(c.code));
        if (callers.length === 0) continue; // nothing calls it
        // The token must be SENT, not merely declared. Checking for
        // the identifier anywhere in the file is too weak: a form that
        // still holds `const [turnstileToken, setTurnstileToken] =
        // useState(...)` but no longer puts it in the request body
        // reads as fine and is just as broken. Comments and the
        // declaration itself are stripped before looking.
        // EVERY caller, not some. One correct form masking a broken
        // one is exactly how this regression would come back: the live
        // page works, a second form 400s, and the check stays green.
        const allSendToken = callers.every((c) => {
          // Declaring the token is not sending it: a form holding
          // `const [turnstileToken] = useState(...)` with nothing in
          // the request body reads as fine and is just as broken.
          const sending = c.code
            .split("\n")
            .filter((line) => !/useState|useRef|useImperativeHandle/.test(line))
            .join("\n");
          return sending.includes("turnstileToken");
        });
        if (!allSendToken) {
          broken.push(
            `${path.relative(ROOT, routeFile)} (callers: ${callers
              .map((c) => path.relative(ROOT, c.file))
              .join(", ")})`,
          );
        }
      }
      if (broken.length === 0) return null;
      return (
        `${broken.length} Turnstile-gated route(s) with a caller that never sends a token.\n  ` +
        broken.join("\n  ") +
        `\n  These return 400 for every visitor once TURNSTILE_SECRET_KEY is set.`
      );
    },
  },
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
  {
    name: "every Prisma model declares what bounds its growth",
    check: () => {
      // The Sept 2026 volume-full outage was not one runaway table. It
      // was the absence of any place that answered "what stops this from
      // growing forever?" for each model. Four tables had no prune at
      // all and nobody noticed until the database stopped booting.
      //
      // This invariant makes that question unskippable: a new model has
      // to be classified before the build passes. Classifying it as
      // ENTITY_BOUNDED is a fine answer — but it has to be a decision
      // someone made, with a reason, not an omission.
      const schema = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf-8");
      const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);

      const policiesSrc = fs.readFileSync(
        path.join(ROOT, "src/libs/retention-policies.ts"),
        "utf-8",
      );
      // Deliberately textual rather than an import: this must keep
      // working even when the module fails to typecheck, which is
      // exactly when someone is mid-edit on the schema.
      const classified = new Set<string>();
      for (const m of policiesSrc.matchAll(/^\t\tmodel:\s*"(\w+)"/gm)) classified.add(m[1]);
      for (const m of policiesSrc.matchAll(/^\t(\w+):\s*$/gm)) classified.add(m[1]);
      for (const m of policiesSrc.matchAll(/^\t(\w+):\s*"/gm)) classified.add(m[1]);

      // A policy naming a field the model does not have would throw at
      // runtime, inside a catch, once an hour, forever — the same shape
      // of silent failure this whole file exists to prevent. Check the
      // field against the schema instead of finding out in production.
      const modelBlocks = new Map<string, string>();
      for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
        modelBlocks.set(m[1], m[2]);
      }
      const badFields: string[] = [];
      const policyRe = /\{\s*model:\s*"(\w+)",\s*(?:column:\s*"(\w+)",\s*)?field:\s*"(\w+)"/g;
      for (const m of policiesSrc.matchAll(policyRe)) {
        const [, model, column, field] = m;
        const block = modelBlocks.get(model);
        if (!block) {
          badFields.push(`${model} (no such model)`);
          continue;
        }
        for (const col of [field, column].filter(Boolean) as string[]) {
          if (!new RegExp(`^\\s*${col}\\s`, "m").test(block)) {
            badFields.push(`${model}.${col}`);
          }
        }
      }
      if (badFields.length > 0) {
        return (
          `Retention policy references fields that do not exist: ${badFields.join(", ")}.\n` +
          `  Fix the field name in src/libs/retention-policies.ts — at runtime this\n` +
          `  would throw inside a catch once an hour and prune nothing.`
        );
      }

      const unclassified = models.filter((m) => !classified.has(m));
      if (unclassified.length > 0) {
        return (
          `${unclassified.length} model(s) have no declared growth bound: ${unclassified.join(", ")}.\n` +
          `  Add each one to src/libs/retention-policies.ts, in exactly one of:\n` +
          `    RETENTION_POLICIES  — grows with time, deleted on age\n` +
          `    NULLIFY_POLICIES    — row is kept, a fat column is blanked\n` +
          `    PRUNED_ELSEWHERE    — bounded by dedicated logic (cascade, per-plan window, ...)\n` +
          `    ENTITY_BOUNDED      — grows with customers/environments, not with time\n` +
          `  The test for ENTITY_BOUNDED is: does one environment running\n` +
          `  forever add rows forever? If yes, it needs a retention window.\n` +
          `  "It's small" is not a reason — RawBehavioralEvent was small once.`
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
