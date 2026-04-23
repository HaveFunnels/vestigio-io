// ──────────────────────────────────────────────
// Chat Block Parser — shared between client + server
//
// Pure data transform. No React, no DOM, no client-only APIs. Safe
// to import from server routes (api/chat) and from the client
// streaming hook (use-chat-stream).
//
// **Why this lives outside use-chat-stream:** the client hook used
// to own these functions, but assistant messages were persisted to
// the database as raw `result.response_text` (the LLM's output with
// $$MARKER{...}$$ tokens still inline). On re-mount, the client's
// loadConversation() pulled the raw string back from the API and
// fell through to a markdown-only fallback — so all the rich
// finding cards / impact summaries / KB articles re-rendered as
// literal "$$FINDING{abc}$$" text. The fix is to parse + resolve
// blocks server-side after the SSE done event and persist the
// resolved blocks as JSON, so loadConversation() can JSON.parse
// them and feed them straight to the renderer with no parser
// re-invocation needed. That requires the parser to be importable
// from the server, which means it can't live in a "use client"
// file. Hence this module.
// ──────────────────────────────────────────────

import type { ContentBlock } from "./chat-types";

// ── Marker grammar ──────────────────────────
//
// The LLM emits these markers inline in its text output. The grammar
// matches what apps/mcp/llm/system-prompt.ts teaches the model.
//
//   $$FINDING{<id>}$$
//   $$ACTION{<id>}$$
//   $$IMPACT{"min":N,"max":N,"mid":N,"type":"...","currency":"..."}$$
//   $$CREATEACTION{"title":"...","description":"...","severity":"...","estimatedImpact":N}$$
//   $$NAVIGATE{"label":"...","href":"...","variant":"..."}$$
//   $$KB{finding:<inference_key>}$$  or  $$KB{root_cause:<root_cause_key>}$$
//   $$PACKINSIGHT{"pack":"revenue","message":"..."}$$
//
// IMPORTANT: the regex below uses `[^}]+` for the body of the marker,
// which means a marker payload that itself contains a `}` character
// would terminate early and break parsing. The current LLM grammar
// avoids `}` inside marker payloads (we use only flat key:value JSON).
// If we ever want nested objects, this regex needs a depth-aware
// matcher.
const BLOCK_MARKER_REGEX = /\$\$(FINDING|ACTION|IMPACT|CREATEACTION|NAVIGATE|KB|PACKINSIGHT)\{([^}]+)\}\$\$/g;

/**
 * Convert raw LLM text containing $$MARKER{...}$$ tokens into a
 * typed `ContentBlock[]`. Cards (`finding_card`, `action_card`,
 * `kb_article_card`) come out as **placeholder blocks** — they
 * carry only the `id` / `key` from the marker. To turn them into
 * fully-rendered cards, the caller MUST run the result through
 * `resolveCardData()` with the matching data maps from MCP / Sanity.
 */
export function parseBlockMarkers(text: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(BLOCK_MARKER_REGEX)) {
    const markerType = match[1];
    const markerContent = match[2];
    const matchStart = match.index!;

    // Text before marker
    if (matchStart > lastIndex) {
      const before = text.slice(lastIndex, matchStart);
      if (before.trim()) {
        blocks.push({ type: "markdown", content: before });
      }
    }

    // Parse marker into block
    try {
      if (markerType === "FINDING") {
        blocks.push({
          type: "finding_card",
          finding: {
            id: markerContent,
            title: `Finding ${markerContent}`,
            severity: "medium",
            impact_mid: 0,
            impact_min: 0,
            impact_max: 0,
            pack: "",
            root_cause: null,
          },
        });
      } else if (markerType === "ACTION") {
        blocks.push({
          type: "action_card",
          action: {
            id: markerContent,
            title: `Action ${markerContent}`,
            severity: "medium",
            impact_mid: 0,
            cross_pack: false,
            priority_score: 0,
          },
        });
      } else if (markerType === "IMPACT") {
        const data = JSON.parse(markerContent);
        blocks.push({
          type: "impact_summary",
          summary: {
            min: data.min || 0,
            max: data.max || 0,
            mid: data.mid || 0,
            type: data.type || "revenue_loss",
            currency: data.currency || "USD",
          },
        });
      } else if (markerType === "CREATEACTION") {
        const data = JSON.parse(markerContent);
        blocks.push({
          type: "create_action",
          title: data.title || "New action",
          description: data.description || "",
          severity: data.severity || "medium",
          estimatedImpact: data.estimatedImpact,
        });
      } else if (markerType === "NAVIGATE") {
        // Try parsing as-is first, then with braces wrapper
        let data;
        try { data = JSON.parse(markerContent); } catch { data = JSON.parse(`{${markerContent}}`); }
        // Support single target shorthand or array
        const targets = Array.isArray(data)
          ? data
          : [{ label: data.label || "Go", href: data.href || "/", variant: data.variant || "primary" }];
        blocks.push({
          type: "navigation_cta",
          targets,
        });
      } else if (markerType === "KB") {
        // $$KB{finding:<inference_key>}$$ or $$KB{root_cause:<root_cause_key>}$$
        const colonIdx = markerContent.indexOf(":");
        if (colonIdx > 0) {
          const kindRaw = markerContent.slice(0, colonIdx).trim();
          const key = markerContent.slice(colonIdx + 1).trim();
          const kind: "finding" | "root_cause" =
            kindRaw === "root_cause" ? "root_cause" : "finding";
          if (key) {
            blocks.push({
              type: "kb_article_card",
              key,
              key_kind: kind,
              title: null,
              slug: null,
              excerpt: null,
            });
          }
        }
      } else if (markerType === "PACKINSIGHT") {
        // $$PACKINSIGHT{"pack":"revenue","message":"Found 3 checkout friction points..."}$$
        const data = JSON.parse(markerContent);
        if (data.pack && data.message) {
          blocks.push({
            type: "pack_insight",
            pack: data.pack,
            message: data.message,
          });
        }
      }
    } catch {
      // If parsing fails, keep as text
      blocks.push({ type: "markdown", content: match[0] });
    }

    lastIndex = matchStart + match[0].length;
  }

  // Remaining text after last marker
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (remaining.trim()) {
      blocks.push({ type: "markdown", content: remaining });
    }
  }

  // If no markers found, return as single markdown block
  if (blocks.length === 0 && text.trim()) {
    blocks.push({ type: "markdown", content: text });
  }

  return blocks;
}

/**
 * Inverse of `parseBlockMarkers`. Walks a `ContentBlock[]` and
 * reconstructs the marker-laden text the LLM would have emitted to
 * produce it.
 *
 * **Why this exists:** when the chat page builds the conversation
 * history that gets sent back to the LLM on a follow-up message, it
 * used to filter out every block except `markdown` — meaning the
 * LLM only saw the prose portions of its previous responses and
 * silently lost track of every finding card, action card, KB
 * article, impact summary, navigation CTA and create-action it had
 * generated. The user would ask "tell me more about that finding
 * you mentioned" and the LLM would have no way to know which
 * finding because the `$$FINDING{abc123}$$` marker was gone. This
 * function rebuilds those markers so the LLM sees a faithful
 * transcript of its own prior output and can reference its earlier
 * cards by id in follow-up turns.
 *
 * Skipped on purpose:
 *   - tool_call: the LLM doesn't need its own execution log replayed
 *   - suggested_prompts: pure UI affordance, not LLM-emitted content
 *
 * Notes on serialization:
 *   - finding_card / action_card serialize to the bare-id form the
 *     marker grammar uses (`$$FINDING{abc123}$$`).
 *   - impact_summary, create_action, navigation_cta serialize their
 *     full inline JSON payload because the marker grammar carries it.
 *   - kb_article_card uses `kind:key` shape (e.g.
 *     `$$KB{finding:trust_boundary_crossed}$$`).
 *   - quote becomes a Markdown blockquote line so the LLM still sees
 *     it as a quote in the conversation context.
 *   - data_rows becomes a labelled bullet list — it's the closest
 *     plain-text representation the LLM can reference back later.
 */
export function serializeBlocksToText(blocks: ContentBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "markdown":
        parts.push(block.content);
        break;
      case "finding_card":
        parts.push(`$$FINDING{${block.finding.id}}$$`);
        break;
      case "action_card":
        parts.push(`$$ACTION{${block.action.id}}$$`);
        break;
      case "impact_summary":
        parts.push(
          `$$IMPACT{${JSON.stringify({
            min: block.summary.min,
            max: block.summary.max,
            mid: block.summary.mid,
            type: block.summary.type,
            currency: block.summary.currency,
          })}}$$`,
        );
        break;
      case "create_action":
        parts.push(
          `$$CREATEACTION{${JSON.stringify({
            title: block.title,
            description: block.description,
            severity: block.severity,
            estimatedImpact: block.estimatedImpact,
          })}}$$`,
        );
        break;
      case "navigation_cta":
        // Single target → object shorthand; multiple → array form.
        if (block.targets.length === 1) {
          parts.push(`$$NAVIGATE{${JSON.stringify(block.targets[0])}}$$`);
        } else if (block.targets.length > 1) {
          parts.push(`$$NAVIGATE{${JSON.stringify(block.targets)}}$$`);
        }
        break;
      case "kb_article_card":
        parts.push(`$$KB{${block.key_kind}:${block.key}}$$`);
        break;
      case "quote":
        parts.push(`> ${block.text}${block.source ? ` — ${block.source}` : ""}`);
        break;
      case "data_rows": {
        const rows = block.rows
          .map((r) => `- ${r.label}: ${r.value}${r.severity ? ` [${r.severity}]` : ""}`)
          .join("\n");
        parts.push(`**${block.label}**\n${rows}`);
        break;
      }
      case "pack_insight":
        parts.push(
          `$$PACKINSIGHT{${JSON.stringify({
            pack: block.pack,
            message: block.message,
          })}}$$`,
        );
        break;
      // tool_call + suggested_prompts + voice_message intentionally skipped (see jsdoc)
    }
  }
  return parts.join("\n").trim();
}

/**
 * Replace the placeholder data on `finding_card`, `action_card`, and
 * `kb_article_card` blocks with the real titles / impact / severity /
 * KB metadata pulled from MCP and Sanity. After this runs, the blocks
 * carry everything the renderer needs to draw a fully-styled card —
 * no further fetches required, even after the chat is restored from
 * the database on a later page load.
 */
export function resolveCardData(
  blocks: ContentBlock[],
  findingsData: Record<string, any>,
  actionsData: Record<string, any>,
  kbArticlesData: Record<string, any>,
): ContentBlock[] {
  return blocks.map((block) => {
    if (block.type === "finding_card" && block.finding.id) {
      const real = findingsData[block.finding.id];
      if (real) {
        return { ...block, finding: { ...block.finding, ...real } };
      }
    }
    if (block.type === "action_card" && block.action.id) {
      const real = actionsData[block.action.id];
      if (real) {
        return { ...block, action: { ...block.action, ...real } };
      }
    }
    if (block.type === "kb_article_card" && block.key) {
      // Lookup format: "<kind>:<key>" — matches the server-side payload key
      const lookup = `${block.key_kind}:${block.key}`;
      const real = kbArticlesData[lookup];
      if (real) {
        return {
          ...block,
          title: real.title ?? null,
          slug: real.slug ?? null,
          excerpt: real.excerpt ?? null,
        };
      }
    }
    return block;
  });
}
