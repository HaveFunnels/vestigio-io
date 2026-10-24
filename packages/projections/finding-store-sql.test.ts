import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The findings batch insert is hand-written SQL with indexed
// parameters. Adding a column means touching the param list, the
// placeholder count, the column list and the ON CONFLICT clause, and
// getting any one of them wrong is a runtime 42P10/42601 that only
// shows up mid-cycle.
//
// That exact failure already happened once: the Postgres 18 bump
// broke an implicit text->timestamp cast on this statement and every
// audit wrote 0/N findings until it was diagnosed. This test pins the
// shape so the next column addition cannot repeat it.

const SRC = fs.readFileSync(
	path.join(__dirname, "prisma-finding-store.ts"),
	"utf8",
);

describe("findings batch insert SQL", () => {
	it("has one value slot per inserted column", () => {
		const cols = SRC.match(
			/INSERT INTO "Finding" \(([\s\S]*?)\)\s*\n\s*VALUES/,
		);
		expect(cols, "could not locate the INSERT column list").toBeTruthy();
		const columnCount = (cols![1].match(/"[A-Za-z]+"/g) ?? []).length;

		const placeholders = SRC.match(/Array\.from\(\{ length: (\d+) \}/);
		expect(placeholders, "could not locate the placeholder count").toBeTruthy();
		const paramCount = Number(placeholders![1]);

		// The row is (gen_random_uuid(), ...params, NOW()) — two
		// literals plus the bound parameters.
		expect(columnCount).toBe(paramCount + 2);
	});

	it("pushes exactly as many params as the placeholder count claims", () => {
		const block = SRC.match(/for \(const f of batch\) \{([\s\S]*?)\n\t\t\t\}/);
		expect(block).toBeTruthy();
		// Each param is annotated with its index comment, which is the
		// convention this file uses to stay auditable by eye.
		const annotated = (block![1].match(/\/\/ \$baseIdx\+\d+/g) ?? []).length;
		const placeholders = Number(SRC.match(/Array\.from\(\{ length: (\d+) \}/)![1]);
		expect(annotated).toBe(placeholders);
	});

	it("updates the new provenance columns on conflict", () => {
		// A column present in the INSERT but absent from ON CONFLICT
		// silently keeps its first-written value forever, which for a
		// re-emitted finding means stale provenance.
		const conflict = SRC.match(/ON CONFLICT[\s\S]*?;?\n\t\t\t`/);
		expect(conflict).toBeTruthy();
		expect(conflict![0]).toContain('"origin"');
		expect(conflict![0]).toContain('"claimType"');
	});
});
