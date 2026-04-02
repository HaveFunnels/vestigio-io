"use client";

/**
 * ChatMessageRenderer — Renders a ChatMessage as ContentBlocks.
 * Includes: message actions (copy/retry/edit/feedback), thinking indicator.
 */

import type { ChatMessage, ContentBlock } from "@/lib/chat-types";
import { ChatMarkdown } from "./ChatMarkdown";
import { ToolCallStep } from "./ToolCallStep";
import { FindingCard } from "./FindingCard";
import { ActionCard } from "./ActionCard";
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
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

export function ChatMessageRenderer({
  message,
  onSuggestedPrompt,
  onNavigate,
  onRetry,
  onEdit,
  onFeedback,
  onSaveAction,
}: ChatMessageRendererProps) {
  // Thinking state: streaming with no blocks yet
  if (message.streaming && message.blocks.length === 0) {
    return <ThinkingIndicator />;
  }

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
        />
        <div className="max-w-xl rounded-xl rounded-br-sm border border-zinc-700/50 bg-zinc-800 px-4 py-2.5">
          <p className="text-sm text-zinc-100">{text}</p>
        </div>
      </div>
    );
  }

  // Assistant message
  const plainText = message.blocks
    .filter((b): b is { type: "markdown"; content: string } => b.type === "markdown")
    .map((b) => b.content)
    .join("\n");

  return (
    <div className="group flex justify-start gap-2">
      <div className="max-w-2xl space-y-0.5">
        {message.blocks.map((block, idx) => (
          <BlockRenderer
            key={idx}
            block={block}
            onSuggestedPrompt={onSuggestedPrompt}
            onNavigate={onNavigate}
            onSaveAction={onSaveAction}
          />
        ))}
        {message.streaming && <StreamingCursor />}

        {/* Actions bar — visible on hover */}
        {!message.streaming && (
          <div className="pt-1">
            <MessageActions
              role="assistant"
              content={plainText}
              messageId={message.id}
              onRetry={onRetry}
              onFeedback={onFeedback}
            />
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
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Estimated monthly impact</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-lg font-bold text-red-400">{formatCurrency(block.summary.mid)}</span>
            <span className="font-mono text-xs text-zinc-500">({formatCurrency(block.summary.min)} – {formatCurrency(block.summary.max)})</span>
            <span className="text-[10px] text-zinc-600">/mo</span>
          </div>
          <div className="mt-0.5 text-[10px] text-zinc-600">{block.summary.type.replace(/_/g, " ")}</div>
        </div>
      );

    case "confidence":
      return (
        <div className="my-1 inline-flex items-center gap-1.5">
          <div className={`h-1.5 w-1.5 rounded-full ${block.value >= 70 ? "bg-emerald-500" : block.value >= 50 ? "bg-amber-500" : "bg-red-500"}`} />
          <span className={`font-mono text-xs ${block.value >= 70 ? "text-emerald-400" : block.value >= 50 ? "text-amber-400" : "text-red-400"}`}>
            {block.value}% confidence
          </span>
        </div>
      );

    case "navigation_cta":
      return (
        <div className="my-2 flex flex-wrap gap-2">
          {block.targets.map((target, idx) => {
            const styles: Record<string, string> = {
              workspace: "border-blue-800/50 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20",
              map: "border-emerald-800/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20",
              analysis: "border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300",
              actions: "border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300",
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
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Follow up</div>
          <div className="flex flex-wrap gap-1.5">
            {block.prompts.map((prompt, idx) => (
              <button key={idx} onClick={() => onSuggestedPrompt?.(prompt)} className="rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-emerald-600/50 hover:bg-emerald-500/5 hover:text-emerald-400">
                {prompt}
              </button>
            ))}
          </div>
        </div>
      );

    case "quote":
      return (
        <div className="my-2 border-l-2 border-zinc-600 pl-3">
          <p className="text-sm italic text-zinc-400">{block.text}</p>
          {block.source && <p className="mt-0.5 text-[10px] text-zinc-600">{block.source}</p>}
        </div>
      );

    case "data_rows":
      return (
        <div className="my-2 rounded-md border border-zinc-800 bg-zinc-900/50">
          <div className="border-b border-zinc-800 px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{block.label}</span>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {block.rows.map((row, idx) => (
              <div key={idx} className="flex items-center justify-between px-3 py-1.5">
                <span className="text-xs text-zinc-400">{row.label}</span>
                <div className="flex items-center gap-2">
                  {row.severity && <SeverityBadge value={row.severity} />}
                  <span className="font-mono text-xs text-zinc-200">{row.value}</span>
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
