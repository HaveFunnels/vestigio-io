// ──────────────────────────────────────────────
// LLM Purpose Audit — dead-spend detector.
//
// Compares actual TokenCostLedger activity against the static
// registry in apps/platform/llm-purpose-registry.ts. Surfaces:
//
//   - UNREGISTERED purposes: ledger has spend on this purpose but
//     the registry doesn't know about it. Means a new LLM call
//     went in without registering its consumer — possible dead
//     spend. Action: add a registry entry + verify the consumer.
//
//   - DEPRECATED-WITH-ACTIVITY: registry says deprecated, but
//     ledger still shows spend in the lookback window. Means a
//     producer wasn't fully removed. Action: find + kill the
//     remaining call site.
//
//   - GATED-WITH-ACTIVITY: registry says gated (env-flag off),
//     but ledger shows spend. Means the gate isn't holding —
//     either it's flipped on somewhere unexpected or the gate
//     code path is broken.
//
//   - SUSPECT-DEAD: registered purpose with spend in the window
//     but the consumerPaths files don't contain references to the
//     output field names. Heuristic check — may have false
//     positives if outputs are read via destructuring or aliases.
//
// Run monthly: `npx tsx scripts/audit-llm-purposes.ts`
//
// Optional: `--lookback 7` for last 7 days (default 30).
// ──────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join } from "path";
import { PURPOSE_REGISTRY, findPurposeEntry, type PurposeRegistryEntry } from "../apps/platform/llm-purpose-registry";

const prisma = new PrismaClient();

interface LedgerSummary {
	purpose: string;
	calls: number;
	costUsd: number;
	lastSeen: Date;
}

async function fetchLedgerSummaries(daysBack: number): Promise<LedgerSummary[]> {
	const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
	const rows: Array<{
		purpose: string;
		calls: bigint;
		costCents: number;
		lastSeen: Date;
	}> = await prisma.$queryRaw`
		SELECT
			purpose,
			COUNT(*)::bigint as calls,
			SUM("costCents")::float as "costCents",
			MAX("createdAt") as "lastSeen"
		FROM "TokenCostLedger"
		WHERE "createdAt" >= ${since}
		GROUP BY purpose
		ORDER BY SUM("costCents") DESC
	`;
	return rows.map((r) => ({
		purpose: r.purpose,
		calls: Number(r.calls),
		costUsd: Number(r.costCents) / 100,
		lastSeen: r.lastSeen,
	}));
}

/** Walk a path (file or dir) and return true on the first .ts/.tsx
 *  file whose contents contain ANY of the needles as a substring.
 *
 *  Pure fs — no child_process / shell involved. Two reasons:
 *    1. consumerPaths from the registry may contain shell-meta
 *       characters (e.g. `src/app/api/library/strategy/[month]/...`
 *       — brackets in Next.js dynamic routes break grep without
 *       per-path escaping). Path-string-as-shell-argument is a
 *       latent injection vector even though the only source today
 *       is a static registry file in the same repo.
 *    2. Substring match is cheaper and clearer than spawning grep
 *       per (path × output) pair. */
const EXT_SCAN_REGEX = /\.(ts|tsx|md)$/;
const MAX_BYTES_PER_FILE = 1_000_000; // skip oversized generated files

function fileContainsAny(file: string, needles: string[]): boolean {
	let content: string;
	try {
		const stat = statSync(file);
		if (stat.size > MAX_BYTES_PER_FILE) return false;
		content = readFileSync(file, "utf-8");
	} catch {
		return false;
	}
	for (const n of needles) {
		if (content.includes(n)) return true;
	}
	return false;
}

function walkContainsAny(root: string, needles: string[]): boolean {
	if (!existsSync(root)) return false;
	let stat;
	try {
		stat = statSync(root);
	} catch {
		return false;
	}
	if (stat.isFile()) {
		if (!EXT_SCAN_REGEX.test(root)) return false;
		return fileContainsAny(root, needles);
	}
	if (!stat.isDirectory()) return false;
	// Stack-based DFS to avoid blowing the call stack on deep trees.
	const stack: string[] = [root];
	while (stack.length > 0) {
		const cur = stack.pop()!;
		let entries: string[];
		try {
			entries = readdirSync(cur);
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry === "node_modules" || entry === ".next" || entry === ".git" || entry === "dist") continue;
			const full = join(cur, entry);
			let est;
			try {
				est = statSync(full);
			} catch {
				continue;
			}
			if (est.isDirectory()) {
				stack.push(full);
			} else if (est.isFile() && EXT_SCAN_REGEX.test(full)) {
				if (fileContainsAny(full, needles)) return true;
			}
		}
	}
	return false;
}

/** Heuristic check: do any of the consumer files reference any of
 *  the output field names? Skips entries with consumerPaths like
 *  '(none — ...)' — those are declared dead consumers. */
function hasConsumerReferences(entry: PurposeRegistryEntry): boolean {
	for (const path of entry.consumerPaths) {
		if (path.startsWith("(")) return false; // explicit "no consumer"
		if (walkContainsAny(path, entry.outputs)) return true;
	}
	return false;
}

async function main() {
	const lookbackArg = process.argv.indexOf("--lookback");
	const daysBack = lookbackArg > -1 ? parseInt(process.argv[lookbackArg + 1] || "30", 10) : 30;

	const summaries = await fetchLedgerSummaries(daysBack);
	const seenPurposes = new Set(summaries.map((s) => s.purpose));

	const unregistered: LedgerSummary[] = [];
	const deprecatedWithActivity: Array<LedgerSummary & { entry: PurposeRegistryEntry }> = [];
	const gatedWithActivity: Array<LedgerSummary & { entry: PurposeRegistryEntry }> = [];
	const suspectDead: Array<LedgerSummary & { entry: PurposeRegistryEntry }> = [];

	for (const s of summaries) {
		const entry = findPurposeEntry(s.purpose);
		if (!entry) {
			unregistered.push(s);
			continue;
		}
		if (entry.status === "deprecated") {
			deprecatedWithActivity.push({ ...s, entry });
			continue;
		}
		if (entry.status === "gated") {
			gatedWithActivity.push({ ...s, entry });
			continue;
		}
		if (!hasConsumerReferences(entry)) {
			suspectDead.push({ ...s, entry });
		}
	}

	// Registered but no recent ledger entries — informational, not
	// necessarily dead (might just be cold cycle that hasn't run).
	const noRecentActivity = PURPOSE_REGISTRY.filter(
		(e) => e.status === "active" && !seenPurposes.has(e.purpose),
	);

	console.log("\n──────────────────────────────────────────────");
	console.log(`LLM Purpose Audit — last ${daysBack} days`);
	console.log("──────────────────────────────────────────────\n");

	console.log(`Ledger purposes seen: ${summaries.length}`);
	console.log(`Registry entries:    ${PURPOSE_REGISTRY.length}`);
	const totalSpend = summaries.reduce((acc, s) => acc + s.costUsd, 0);
	console.log(`Total spend window:  $${totalSpend.toFixed(2)}`);

	if (unregistered.length > 0) {
		console.log("\n🚨 UNREGISTERED PURPOSES — possible dead spend, register or remove:");
		for (const s of unregistered) {
			console.log(
				`   - ${s.purpose.padEnd(45)} calls=${String(s.calls).padStart(5)}  $${s.costUsd.toFixed(2)}  lastSeen=${s.lastSeen.toISOString().slice(0, 10)}`,
			);
		}
	}

	if (deprecatedWithActivity.length > 0) {
		console.log("\n⚠️  DEPRECATED PURPOSES STILL FIRING — finish the cleanup:");
		for (const s of deprecatedWithActivity) {
			console.log(
				`   - ${s.purpose.padEnd(45)} calls=${String(s.calls).padStart(5)}  $${s.costUsd.toFixed(2)}`,
			);
			if (s.entry.notes) console.log(`     ${s.entry.notes}`);
		}
	}

	if (gatedWithActivity.length > 0) {
		console.log("\n⚠️  GATED PURPOSES WITH ACTIVITY — check the env flag:");
		for (const s of gatedWithActivity) {
			console.log(
				`   - ${s.purpose.padEnd(45)} calls=${String(s.calls).padStart(5)}  $${s.costUsd.toFixed(2)}`,
			);
			if (s.entry.notes) console.log(`     ${s.entry.notes}`);
		}
	}

	if (suspectDead.length > 0) {
		console.log("\n❓ SUSPECT DEAD — registered but no consumer references found (heuristic):");
		for (const s of suspectDead) {
			console.log(
				`   - ${s.purpose.padEnd(45)} calls=${String(s.calls).padStart(5)}  $${s.costUsd.toFixed(2)}`,
			);
			console.log(`     Checked: ${s.entry.consumerPaths.join(", ")}`);
			console.log(`     Outputs: ${s.entry.outputs.join(", ")}`);
		}
		console.log("   (Heuristic may have false positives if outputs are read via destructuring/aliases. Verify manually before deleting.)");
	}

	if (noRecentActivity.length > 0) {
		console.log("\nℹ️  Registered active purposes with no recent activity (cold cycles or unused):");
		for (const e of noRecentActivity) {
			console.log(`   - ${e.purpose}`);
		}
	}

	const issueCount = unregistered.length + deprecatedWithActivity.length + gatedWithActivity.length + suspectDead.length;
	console.log(`\n──────────────────────────────────────────────`);
	console.log(`Issues to triage: ${issueCount}`);
	console.log("──────────────────────────────────────────────\n");

	await prisma.$disconnect();
	process.exit(issueCount > 0 ? 1 : 0);
}

main().catch((e) => {
	console.error(e);
	process.exit(2);
});
