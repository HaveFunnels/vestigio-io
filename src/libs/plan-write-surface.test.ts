import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Every HTTP route that can mutate a Strategy Plan must gate on a
// session. The MCP write tools are now behind a kill switch, and this
// covers the alternative paths the switch does not sit in front of:
// the REST routes under /api/library/strategy/[month]/*.
//
// Structural rather than behavioural on purpose. Exercising these for
// real needs a live session and a real plan, and the failure being
// guarded against is "a new mutating route ships with no auth check",
// which is visible in the source.

const API = path.join(process.cwd(), "src", "app", "api", "library", "strategy");

function walk(dir: string, out: string[] = []): string[] {
	if (!fs.existsSync(dir)) return out;
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, e.name);
		if (e.isDirectory()) walk(full, out);
		else if (/^route\.tsx?$/.test(e.name)) out.push(full);
	}
	return out;
}

const MUTATING = /export\s+(?:async\s+function|const)\s+(POST|PATCH|PUT|DELETE)/;

describe("plan write surface", () => {
	const routes = walk(API);

	it("finds the strategy-plan routes at all", () => {
		expect(routes.length).toBeGreaterThan(0);
	});

	it("every mutating plan route gates on a session", () => {
		const unguarded: string[] = [];
		for (const f of routes) {
			const src = fs.readFileSync(f, "utf8");
			if (!MUTATING.test(src)) continue;
			// isAuthorized is this codebase's own session helper and is
			// what the strategy-plan routes actually use; an earlier
			// version of this test only looked for getServerSession and
			// reported five guarded routes as unguarded. Verified by
			// reading all five: each calls isAuthorized and returns
			// 401/403.
			const guarded =
				/isAuthorized|getServerSession|requireAdmin|requireAuth|tokenAuthorized/.test(src) &&
				/401|403|Unauthorized|Forbidden/.test(src);
			if (!guarded) unguarded.push(path.relative(process.cwd(), f));
		}
		expect(unguarded, `mutating routes with no auth gate:\n${unguarded.join("\n")}`).toEqual([]);
	});
});
