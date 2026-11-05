import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import IntlMessageFormat from "intl-messageformat";

// The em-dash sweep rewrote punctuation inside ICU plural messages,
// and the first pass of the classifier ran its parenthetical rule
// ACROSS two plural branches:
//
//   {count, plural, one {# entrou neste ciclo (exige atencao} other {...)}}
//
// Worth being precise about what that is: ICU treats parentheses as
// literal text, so this PARSES and FORMATS without error. It is a copy
// defect, not a crash. The customer would read "1 entrou neste ciclo
// (exige atencao imediata" with the paren never closed. So two checks
// are needed, and only the second one catches it:
//
//   1. every ICU message still parses (guards genuine syntax damage)
//   2. brackets balance per message AND per ICU branch (guards this)

const ROOT = path.join(__dirname, "..", "..");
const LOCALES = ["pt-BR", "es", "de", "en"].filter((l) =>
	fs.existsSync(path.join(ROOT, "dictionary", `${l}.json`)),
);

function messages(node: unknown, at: string, out: Array<[string, string]>) {
	if (typeof node === "string") out.push([at, node]);
	else if (Array.isArray(node)) node.forEach((v, i) => messages(v, `${at}[${i}]`, out));
	else if (node && typeof node === "object") {
		for (const [k, v] of Object.entries(node)) messages(v, at ? `${at}.${k}` : k, out);
	}
}

describe.each(LOCALES)("dictionary/%s.json", (loc) => {
	const all: Array<[string, string]> = [];
	messages(
		JSON.parse(fs.readFileSync(path.join(ROOT, "dictionary", `${loc}.json`), "utf8")),
		"",
		all,
	);

	it("has messages to check", () => {
		expect(all.length).toBeGreaterThan(100);
	});

	it("every ICU message parses", () => {
		const broken: string[] = [];
		for (const [at, msg] of all) {
			// Only the ones that actually use ICU syntax; a plain string
			// with a stray brace is a different problem.
			if (!/\{[^}]*,\s*(plural|select|selectordinal|number|date|time)\b/.test(msg)) {
				continue;
			}
			try {
				new IntlMessageFormat(msg, loc);
			} catch (e) {
				broken.push(`${at}: ${(e as Error).message.slice(0, 120)}`);
			}
		}
		expect(broken, `unparseable ICU in ${loc}:\n${broken.join("\n")}`).toEqual([]);
	});

	it("every message has balanced braces", () => {
		const bad = all
			.filter(([, m]) => (m.match(/\{/g) ?? []).length !== (m.match(/\}/g) ?? []).length)
			.map(([at]) => at);
		expect(bad).toEqual([]);
	});

	it("brackets balance inside every ICU branch, not just overall", () => {
		// The overall count balances in the garbled case: one "(" in the
		// first branch and one ")" in the second. Checking each branch
		// body on its own is what catches it.
		const unbalanced = (s: string) => {
			for (const [open, close] of [
				["(", ")"],
				["[", "]"],
			]) {
				let depth = 0;
				for (const ch of s) {
					if (ch === open) depth++;
					else if (ch === close) depth--;
					if (depth < 0) return true;
				}
				if (depth !== 0) return true;
			}
			return false;
		};

		const broken: string[] = [];
		for (const [at, msg] of all) {
			if (unbalanced(msg)) {
				broken.push(`${at}: message (${msg.slice(0, 70)})`);
				continue;
			}
			// Innermost brace groups are the branch bodies.
			for (const m of msg.matchAll(/\{([^{}]*)\}/g)) {
				// A bare {placeholder} or an ICU header is not a branch.
				if (!/[a-zà-ÿ]\s/i.test(m[1])) continue;
				if (unbalanced(m[1])) broken.push(`${at}: branch (${m[1].slice(0, 70)})`);
			}
		}
		expect(broken, `unbalanced brackets:\n${broken.join("\n")}`).toEqual([]);
	});
});
