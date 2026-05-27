// ──────────────────────────────────────────────
// LLM helpers for the strategy-plan generator
//
// Thin adapter around the existing MCP llm/client.ts callModel
// helper so the per-section generators don't each re-derive token
// math, cost translation, and fallback handling.
//
// Cost model (per spec §5):
//   - Sonnet 4.6: $3/M input, $15/M output
//   - Haiku 4.5:  $1/M input, $5/M output
// Cents are rounded UP so cumulative llmCostCents never under-counts.
// ──────────────────────────────────────────────

import { callModel, type LlmCallContext } from "../../apps/mcp/llm/client";
import type { ModelId } from "../../apps/mcp/llm/types";

// Per-million-token USD prices (mirrors Anthropic public pricing
// 2026-Q1). Multiply by 100 for cents.
const MODEL_PRICING_USD: Record<ModelId, { input: number; output: number }> = {
	haiku_4_5: { input: 1.0, output: 5.0 },
	sonnet_4_6: { input: 3.0, output: 15.0 },
	opus_4_6: { input: 15.0, output: 75.0 },
};

export function usageToCents(
	model: ModelId,
	usage: { input_tokens: number; output_tokens: number },
): number {
	const p = MODEL_PRICING_USD[model];
	const usd =
		(usage.input_tokens / 1_000_000) * p.input +
		(usage.output_tokens / 1_000_000) * p.output;
	return Math.ceil(usd * 100);
}

export interface LlmTextResult {
	text: string;
	costCents: number;
	callsCount: number;
	/** True when the call failed and `text` is a deterministic fallback.
	    Caller can use this to decide whether to retry partial regen on
	    a later event trigger. */
	fallback: boolean;
}

interface CallTextOptions {
	model: ModelId;
	systemPrompt: string;
	userPrompt: string;
	maxTokens: number;
	/** Defaults to 0.4 for narrative-quality calls; 0.2 for
	    deterministic step reasoning. */
	temperature?: number;
	purpose: string;
	organizationId: string | null;
	environmentId: string;
	/** Fallback text rendered when the LLM call fails (cost cap, API
	    error, timeout). Should be a coherent placeholder so the plan
	    section still reads as intentional — not "ERROR". */
	fallbackText: string;
}

/**
 * Call an LLM and extract the single text block reply. Wraps the
 * MCP client with cost accounting + fallback handling so callers
 * always get LlmTextResult regardless of upstream errors. */
export async function callForText(opts: CallTextOptions): Promise<LlmTextResult> {
	const ctx: LlmCallContext = {
		purpose: opts.purpose,
		organizationId: opts.organizationId,
		environmentId: opts.environmentId,
	};

	try {
		const res = await callModel(
			opts.model,
			[{ role: "user", content: opts.userPrompt }],
			{
				max_tokens: opts.maxTokens,
				temperature: opts.temperature ?? 0.4,
				system: opts.systemPrompt,
			},
			ctx,
		);

		const textBlocks = res.content
			.filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
			.map((b) => b.text);
		const text = textBlocks.join("\n").trim();

		if (!text) {
			return {
				text: opts.fallbackText,
				costCents: usageToCents(opts.model, res.usage),
				callsCount: 1,
				fallback: true,
			};
		}

		return {
			text,
			costCents: usageToCents(opts.model, res.usage),
			callsCount: 1,
			fallback: false,
		};
	} catch (err) {
		// LlmError or anything else upstream — log loud and fall back to
		// the deterministic text. Cost stays 0 because nothing billable
		// happened (the circuit-breaker fires before the API call).
		console.warn(
			`[strategy-plan/llm] ${opts.purpose} fell back:`,
			err instanceof Error ? err.message : err,
		);
		return {
			text: opts.fallbackText,
			costCents: 0,
			callsCount: 0,
			fallback: true,
		};
	}
}
