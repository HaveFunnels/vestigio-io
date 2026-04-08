"use client";

/**
 * ChatMessageRenderer — Renders a ChatMessage as ContentBlocks.
 * Includes: message actions (copy/retry/edit/feedback), thinking indicator.
 */

import { useState } from "react";
import type { ChatMessage, ContentBlock, ToolCallBlock } from "@/lib/chat-types";
import { ChatMarkdown } from "./ChatMarkdown";
import { ToolCallStep } from "./ToolCallStep";
import { FindingCard } from "./FindingCard";
import { ActionCard } from "./ActionCard";
import { KbArticleCard } from "./KbArticleCard";
import { StreamingCursor } from "./StreamingCursor";
import { MessageActions } from "./MessageActions";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { CreateActionCard } from "./CreateActionCard";
import SeverityBadge from "../SeverityBadge";

interface ChatMessageRendererProps {
  message: ChatMessage;
  onSuggestedPrompt?: (prompt: string) => void;
  onNavigate?: (href: string) => void;
  onRetry?: () => void;
  onEdit?: (newContent: string) => void;
  onFeedback?: (messageId: string, rating: "positive" | "negative") => void;
  onSaveAction?: (action: { title: string; description: string; severity: string; estimatedImpact?: number }) => void;
  onRegenerate?: (messageId: string) => void;
  onFork?: (messageId: string) => void;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

// Smart timestamp formatter — short and contextual:
//   - same day  → "2:34 PM"
//   - yesterday → "Yesterday 2:34 PM"
//   - older     → "Apr 5, 2:34 PM"
// Pre-fix the chat showed no timestamps at all on messages (only
// the per-conversation date grouping in the sidebar), so a long
// thread had no anchor for "when did I ask this" / "is this
// recent". This shows a small subtle line under each bubble.
function formatMessageTime(d: Date): string {
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();

  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  if (isYesterday) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

export function ChatMessageRenderer({
  message,
  onSuggestedPrompt,
  onNavigate,
  onRetry,
  onEdit,
  onFeedback,
  onSaveAction,
  onRegenerate,
  onFork,
}: ChatMessageRendererProps) {
  // Thinking state: streaming with no blocks yet
  if (message.streaming && message.blocks.length === 0) {
    return <ThinkingIndicator />;
  }

  const timestamp = formatMessageTime(message.createdAt);

  if (message.role === "user") {
    const text = message.blocks[0]?.type === "markdown"
      ? (message.blocks[0] as { type: "markdown"; content: string }).content
      : "";
    return (
      <div className="group flex justify-end gap-2">
        <MessageActions
          role="user"
          content={text}
          messageId={message.id}
          onEdit={onEdit}
          onFork={onFork}
        />
        <div className="flex max-w-xl flex-col items-end">
          <div className="rounded-xl rounded-br-sm border border-edge/50 bg-surface-inset px-4 py-2.5">
            <p className="text-sm text-content">{text}</p>
          </div>
          <span className="mt-1 text-[10px] text-content-faint opacity-0 transition-opacity group-hover:opacity-100">
            {timestamp}
          </span>
        </div>
      </div>
    );
  }

  // Assistant message
  const plainText = message.blocks
    .filter((b): b is { type: "markdown"; content: string } => b.type === "markdown")
    .map((b) => b.content)
    .join("\n");

  // Once streaming is done, fold consecutive tool_call blocks into
  // a single collapsible group so the message body isn't dominated
  // by the tool execution log. While streaming, leave them inline
  // so the user sees per-tool spinners + completion ticks live.
  const renderableBlocks = message.streaming
    ? message.blocks.map((block, idx) => ({ kind: "single" as const, block, idx }))
    : foldToolCallRuns(message.blocks);

  return (
    <div className="group flex justify-start gap-2">
      <div className="max-w-2xl space-y-0.5">
        {renderableBlocks.map((entry) =>
          entry.kind === "single" ? (
            <BlockRenderer
              key={entry.idx}
              block={entry.block}
              onSuggestedPrompt={onSuggestedPrompt}
              onNavigate={onNavigate}
              onSaveAction={onSaveAction}
            />
          ) : (
            <ToolCallGroup key={entry.idx} blocks={entry.blocks} />
          ),
        )}
        {message.streaming && <StreamingCursor />}

        {/* Actions bar — visible on hover */}
        {!message.streaming && (
          <div className="flex items-center gap-2 pt-1">
            <MessageActions
              role="assistant"
              content={plainText}
              messageId={message.id}
              onRetry={onRetry}
              onFeedback={onFeedback}
              onRegenerate={onRegenerate}
              onFork={onFork}
            />
            <span className="text-[10px] text-content-faint opacity-0 transition-opacity group-hover:opacity-100">
              {timestamp}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function BlockRenderer({
  block,
  onSuggestedPrompt,
  onNavigate,
  onSaveAction,
}: {
  block: ContentBlock;
  onSuggestedPrompt?: (prompt: string) => void;
  onNavigate?: (href: string) => void;
  onSaveAction?: (action: { title: string; description: string; severity: string; estimatedImpact?: number }) => void;
}) {
  switch (block.type) {
    case "markdown":
      return <ChatMarkdown content={block.content} />;

    case "tool_call":
      return <ToolCallStep block={block} />;

    case "finding_card":
      return <FindingCard block={block} onNavigate={onNavigate} />;

    case "action_card":
      return <ActionCard block={block} onNavigate={onNavigate} />;

    case "kb_article_card":
      return <KbArticleCard block={block} onNavigate={onNavigate} />;

    case "create_action":
      return (
        <CreateActionCard
          suggestedTitle={block.title}
          suggestedDescription={block.description}
          severity={block.severity}
          estimatedImpact={block.estimatedImpact}
          onSave={(action) => onSaveAction?.(action)}
        />
      );

    case "impact_summary":
      return (
        <div className="my-2 rounded-md border border-red-800/30 bg-red-500/5 px-3.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-content-muted">Estimated monthly impact</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-lg font-bold text-red-400">{formatCurrency(block.summary.mid)}</span>
            <span className="font-mono text-xs text-content-muted">({formatCurrency(block.summary.min)} – {formatCurrency(block.summary.max)})</span>
            <span className="text-[10px] text-content-faint">/mo</span>
          </div>
          <div className="mt-0.5 text-[10px] text-content-faint">{block.summary.type.replace(/_/g, " ")}</div>
        </div>
      );

    case "navigation_cta":
      return (
        <div className="my-2 flex flex-wrap gap-2">
          {block.targets.map((target, idx) => {
            const styles: Record<string, string> = {
              workspace: "border-blue-800/50 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20",
              map: "border-emerald-800/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20",
              analysis: "border-edge text-content-muted hover:bg-surface-card-hover hover:text-content-secondary",
              actions: "border-edge text-content-muted hover:bg-surface-card-hover hover:text-content-secondary",
              changes: "border-amber-800/50 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20",
              primary: "border-emerald-600 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20",
              secondary: "border-edge text-content-muted hover:bg-surface-card-hover hover:text-content-secondary",
            };
            return (
              <button key={idx} onClick={() => onNavigate?.(target.href)} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${styles[target.variant] || styles.analysis}`}>
                {target.label}
                <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            );
          })}
        </div>
      );

    case "suggested_prompts":
      return (
        <div className="mt-3 space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-content-faint">Follow up</div>
          <div className="flex flex-wrap gap-1.5">
            {block.prompts.map((prompt, idx) => (
              <button key={idx} onClick={() => onSuggestedPrompt?.(prompt)} className="rounded-md border border-edge bg-surface-inset px-3 py-1.5 text-xs text-content-secondary transition-colors hover:border-emerald-600/50 hover:bg-emerald-500/5 hover:text-emerald-400">
                {prompt}
              </button>
            ))}
          </div>
        </div>
      );

    case "quote":
      return (
        <div className="my-2 border-l-2 border-edge pl-3">
          <p className="text-sm italic text-content-muted">{block.text}</p>
          {block.source && <p className="mt-0.5 text-[10px] text-content-faint">{block.source}</p>}
        </div>
      );

    case "data_rows":
      return (
        <div className="my-2 rounded-md border border-edge bg-surface-card">
          <div className="border-b border-edge px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-content-muted">{block.label}</span>
          </div>
          <div className="divide-y divide-edge/50">
            {block.rows.map((row, idx) => (
              <div key={idx} className="flex items-center justify-between px-3 py-1.5">
                <span className="text-xs text-content-muted">{row.label}</span>
                <div className="flex items-center gap-2">
                  {row.severity && <SeverityBadge value={row.severity} />}
                  <span className="font-mono text-xs text-content-secondary">{row.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    default:
      return null;
  }
}

// ── Tool call grouping ──────────────────────
//
// Walk a message's blocks and fold consecutive `tool_call` blocks
// into a single grouped entry. Non-tool blocks pass through as
// individual entries. The grouping is purely visual — the underlying
// blocks aren't mutated and the LLM history (which already skips
// tool_call serialization) is unaffected. Only runs after streaming
// is complete; during streaming the inline per-tool spinners are
// the more useful feedback.
type RenderEntry =
  | { kind: "single"; block: ContentBlock; idx: number }
  | { kind: "group"; blocks: ToolCallBlock[]; idx: number };

function foldToolCallRuns(blocks: ContentBlock[]): RenderEntry[] {
  const entries: RenderEntry[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type === "tool_call") {
      const run: ToolCallBlock[] = [];
      let j = i;
      while (j < blocks.length && blocks[j].type === "tool_call") {
        run.push(blocks[j] as ToolCallBlock);
        j++;
      }
      entries.push({ kind: "group", blocks: run, idx: i });
      i = j;
    } else {
      entries.push({ kind: "single", block, idx: i });
      i++;
    }
  }
  return entries;
}

function ToolCallGroup({ blocks }: { blocks: ToolCallBlock[] }) {
  const [expanded, setExpanded] = useState(false);

  // Single tool call → render as-is, grouping adds no value.
  if (blocks.length === 1) {
    return <ToolCallStep block={blocks[0]} />;
  }

  const totalMs = blocks.reduce((sum, b) => sum + (b.durationMs || 0), 0);
  const allComplete = blocks.every((b) => b.status === "complete");
  const anyError = blocks.some((b) => b.status === "error");

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-surface-inset"
      >
        <div className="flex h-4 w-4 shrink-0 items-center justify-center">
          {anyError ? (
            <svg className="h-3.5 w-3.5 text-red-400" viewBox="0 0 16 16" fill="none">
              <path d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : allComplete ? (
            <svg className="h-3.5 w-3.5 text-emerald-500" viewBox="0 0 16 16" fill="none">
              <path d="M13.25 4.75L6 12 2.75 8.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
        </div>
        <span className="flex-1 text-xs text-content-muted">
          Used {blocks.length} tools
        </span>
        {totalMs > 0 && (
          <span className="font-mono text-[10px] text-content-faint">
            {totalMs}ms
          </span>
        )}
        <svg
          className={`h-3 w-3 text-content-faint transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
          viewBox="0 0 16 16"
          fill="none"
        >
          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div className="ml-6 mt-1 space-y-0.5">
          {blocks.map((block, idx) => (
            <ToolCallStep key={idx} block={block} />
          ))}
        </div>
      )}
    </div>
  );
}
