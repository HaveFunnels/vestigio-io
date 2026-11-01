import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The plan is a pt-BR document and two of the three priorities it now
// opens with arrived in English: "Script supply chain risk high. 7
// external script(s) load..." and "Your social proof doesn't
// convince". The engine has a translation layer for exactly this, and
// it was locked shut.

const ROOT = path.join(__dirname, "..", "..");
const ENGINE = fs.readFileSync(path.join(__dirname, "engine.ts"), "utf8");

function templates(): Record<string, string> {
	const d = JSON.parse(
		fs.readFileSync(path.join(ROOT, "dictionary", "pt-BR.json"), "utf8"),
	);
	return d.engine.reasoning_templates;
}

describe("resolveReasoning", () => {
	it("does not require slots to use a template", () => {
		// It used to demand BOTH, which discarded a found Portuguese
		// template in favour of the English fallback for every
		// slot-less inference. 33 of the 37 keys that actually fire are
		// slot-less, so the layer was shut for almost the whole engine.
		const fn = ENGINE.slice(ENGINE.indexOf("function resolveReasoning"));
		const body = fn.slice(0, fn.indexOf("\n}"));
		expect(body).toContain("if (!template) return fallbackReasoning;");
		expect(body).not.toMatch(/!template \|\| !inf\.reasoning_slots/);
		// Interpolation still happens, just conditionally.
		expect(body).toContain("if (inf.reasoning_slots)");
	});
});

describe("pt-BR reasoning templates", () => {
	const tpl = templates();

	it("covers the keys that were rendering English", () => {
		for (const k of [
			"script_supply_chain_risk",
			"social_proof_ineffective",
			"cta_clarity_weak_on_commercial",
			"copy_cross_page_inconsistent",
			"seo_conversion_conflict",
			"oscillation_clustering",
			"commercial_pages_weak_search_representation",
			"social_previews_fail_commercial_value",
			"weak_semantic_intent_signals",
			"commercial_pages_not_exposed_for_discovery",
		]) {
			expect(tpl[k], `missing template for ${k}`).toBeTruthy();
		}
	});

	it("translates the severity value, which arrives as an English token", () => {
		// The packs emit severity as 'high' / 'medium' / 'critical'. 25 of
		// the 38 templates interpolate it, so a fully translated template
		// still rendered "Severidade do vazamento de receita: high."
		const d = JSON.parse(
			fs.readFileSync(path.join(ROOT, "dictionary", "pt-BR.json"), "utf8"),
		);
		const sev = d.engine.reasoning_slot_values?.severity;
		expect(sev).toBeTruthy();
		for (const token of ["critical", "high", "medium", "low", "none", "info"]) {
			expect(sev[token], `severity '${token}' has no pt-BR word`).toBeTruthy();
			expect(sev[token]).not.toMatch(/^(critical|high|medium|low|none|info)$/);
		}
	});

	it("resolveReasoning substitutes the slot VALUE, not just the template", () => {
		const fn = ENGINE.slice(ENGINE.indexOf("function resolveReasoning"));
		const body = fn.slice(0, fn.indexOf("\n}"));
		expect(body).toContain("reasoning_slot_values");
		// An unmapped value must pass through rather than become empty.
		expect(body).toContain("?? String(value)");
	});

	it("carries no em-dash and no interpunct", () => {
		for (const [k, v] of Object.entries(tpl)) {
			expect(v, `${k} has an em-dash`).not.toContain("—");
			expect(v, `${k} has an interpunct`).not.toContain("·");
		}
	});

	it("connects the observation to buyer behaviour, not to a generic best practice", () => {
		// House rule: a finding has to reach money or behaviour. The
		// ten new templates are checked for a buyer-facing noun rather
		// than pure technical description.
		const added = [
			"script_supply_chain_risk",
			"social_proof_ineffective",
			"cta_clarity_weak_on_commercial",
			"seo_conversion_conflict",
			"commercial_pages_weak_search_representation",
			"social_previews_fail_commercial_value",
			"commercial_pages_not_exposed_for_discovery",
		];
		for (const k of added) {
			expect(
				/compra|comprador|visitante|venda|vende|visita|confian|decidir|decis/i.test(tpl[k]),
				`${k} reads as a generic best practice`,
			).toBe(true);
		}
	});
});
