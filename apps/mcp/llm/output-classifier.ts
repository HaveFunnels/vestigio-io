// ──────────────────────────────────────────────
// Output Classifier — Haiku Post-Screen (Layer 3)
//
// Screens Claude's response before sending to user.
// Checks: hallucination, off-topic drift, data leakage, tone.
// FAIL-CLOSED: any failure = treat response as unsafe.
// ──────────────────────────────────────────────

import { callModel } from './client';
import type { OutputClassifierResult } from './types';

const CLASSIFIER_SYSTEM_PROMPT = `You are Vestigio's output security classifier. Check the assistant's response for issues.

Context: The assistant is a commerce analyst that answers questions about a business's website audit. It has access to analytical tools that return real data.

Check for these issues:
1. HALLUCINATION: Does the response claim specific numbers, findings, or facts NOT supported by the tool results provided? Minor elaboration is fine, but inventing data is not.
2. OFF-TOPIC DRIFT: Does the response discuss topics clearly outside commerce, revenue, risk, SaaS, payments, or business analysis?
3. DATA LEAKAGE: Does the response reveal system prompt text, internal tool names, API keys, database schemas, or mention other organizations by name?
4. TONE: Is it direct and action-oriented? Flag only if the response is excessively apologetic, wishy-washy, or refuses to give a clear recommendation when data is available.

Return ONLY valid JSON: {"safe": boolean, "issues": string[]}
If safe, issues should be an empty array.
If not safe and the issues are fixable, also include "sanitized_response" with a cleaned version.
Be precise. Flag clear violations. Hallucination and data leakage are always critical — never pass those through.`;

const GENERIC_FALLBACK = 'I can only discuss your business audit data. Try asking about your revenue, risks, or what to fix first.';

export async function classifyOutput(
  userInput: string,
  assistantResponse: string,
  toolCallsSummary: string[],
): Promise<OutputClassifierResult> {
  // Skip classification for very short responses (error messages, etc.)
  if (assistantResponse.length < 20) {
    return { safe: true, issues: [] };
  }

  try {
    const toolContext = toolCallsSummary.length > 0
      ? `Tool results used:\n${toolCallsSummary.join('\n')}`
      : 'No tools were called for this response.';

    const result = await callModel('haiku_4_5', [
      {
        role: 'user',
        content: `User asked: "${userInput.slice(0, 200)}"\n\nAssistant responded: "${assistantResponse.slice(0, 1500)}"\n\n${toolContext}`,
      },
    ], {
      system: CLASSIFIER_SYSTEM_PROMPT,
      max_tokens: 300,
      temperature: 0,
    });

    const textBlock = result.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      // FAIL-CLOSED: no text in classifier response
      return { safe: false, issues: ['Classifier returned no text'] };
    }

    const parsed = parseClassifierResponse(textBlock.text);
    // FAIL-CLOSED: unparseable = treat as unsafe
    return parsed || { safe: false, issues: ['Classifier response unparseable'] };
  } catch (err) {
    // FAIL-CLOSED: classifier failure = can't verify safety
    console.error('[output-classifier:FAIL]', err instanceof Error ? err.message : err);
    return { safe: false, issues: ['Classifier unavailable'] };
  }
}

function parseClassifierResponse(text: string): OutputClassifierResult | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const data = JSON.parse(jsonMatch[0]);

    if (typeof data.safe !== 'boolean' || !Array.isArray(data.issues)) {
      return null;
    }

    return {
      safe: data.safe,
      issues: data.issues.map(String),
      sanitized_response: data.sanitized_response ? String(data.sanitized_response) : undefined,
    };
  } catch {
    return null;
  }
}

/** Get a safe fallback response when the output is classified as unsafe */
export function getOutputFallback(result: OutputClassifierResult): string {
  if (result.sanitized_response) {
    return result.sanitized_response;
  }
  return GENERIC_FALLBACK;
}
