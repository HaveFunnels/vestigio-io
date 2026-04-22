"use client";

// ──────────────────────────────────────────────
// CopilotQuickActions — Contextual quick action badges (3.14)
//
// Renders page-aware quick actions. Each sends a predefined prompt.
// Shown in empty state (prominent) and during conversation (compact strip).
// ──────────────────────────────────────────────

import type { PageContextType } from "./CopilotProvider";

export interface QuickAction {
	id: string;
	label: string;
	prompt: string;
	color: string; // tailwind text color class
}

const ACTIONS_BY_PAGE: Record<string, QuickAction[]> = {
	workspaces: [
		{ id: "what_changed", label: "What changed?", prompt: "What changed in the latest audit cycle? Highlight regressions and improvements.", color: "text-amber-500" },
		{ id: "revenue_audit", label: "Revenue audit", prompt: "Perform a quick revenue leak audit. Where am I losing money?", color: "text-red-500" },
		{ id: "explain_workspace", label: "Explain this", prompt: "Explain the current workspace findings in plain language. What matters most?", color: "text-sky-500" },
	],
	perspective: [
		{ id: "what_changed", label: "What changed?", prompt: "What changed in this perspective since the last cycle?", color: "text-amber-500" },
		{ id: "deep_dive", label: "Deep dive", prompt: "Give me a deep analysis of this perspective. What are the most critical issues?", color: "text-violet-500" },
	],
	workspace: [
		{ id: "explain_workspace", label: "Explain this", prompt: "Explain this workspace's findings and their business impact.", color: "text-sky-500" },
		{ id: "fix_first", label: "Fix first", prompt: "What should I fix first in this workspace? Prioritize by impact.", color: "text-emerald-500" },
	],
	actions: [
		{ id: "fix_first", label: "Fix first", prompt: "What should I fix first? Prioritize all actions by impact and effort.", color: "text-emerald-500" },
		{ id: "explain_action", label: "Explain action", prompt: "Explain the top priority action in detail. What's broken and how do I fix it?", color: "text-sky-500" },
		{ id: "verify", label: "Verify a fix", prompt: "I've made a fix. Help me verify it works correctly.", color: "text-blue-500" },
	],
	analysis: [
		{ id: "summarize", label: "Summarize", prompt: "Summarize all current findings. What's the overall health of my site?", color: "text-sky-500" },
		{ id: "cross_signal", label: "Cross-signal check", prompt: "Are there any findings that correlate across different perspectives (security + revenue + behavior)?", color: "text-violet-500" },
		{ id: "high_impact", label: "High impact only", prompt: "Show me only the high-impact findings above $1,000/month. What should I prioritize?", color: "text-red-500" },
	],
	inventory: [
		{ id: "audit_page", label: "Audit a page", prompt: "Which pages on my site have the most issues? Show me the worst surfaces.", color: "text-amber-500" },
		{ id: "down_pages", label: "Down pages", prompt: "Are any of my pages returning errors or down? What's the impact?", color: "text-red-500" },
	],
	dashboard: [
		{ id: "executive_summary", label: "Executive summary", prompt: "Give me an executive summary of my site's health, revenue risks, and what improved.", color: "text-amber-500" },
		{ id: "losing_money", label: "Where am I losing money?", prompt: "Where am I losing money? Show me the top revenue leaks with dollar amounts.", color: "text-red-500" },
		{ id: "improvements", label: "What improved?", prompt: "What improved since the last audit cycle? Any wins to celebrate?", color: "text-emerald-500" },
	],
	other: [
		{ id: "whats_up", label: "What should I know?", prompt: "What are the most important things I should know about my site right now?", color: "text-sky-500" },
		{ id: "revenue_audit", label: "Revenue audit", prompt: "Perform a quick revenue leak audit. Where am I losing money?", color: "text-red-500" },
		{ id: "trust_check", label: "Trust check", prompt: "How trustworthy does my site look to buyers? Check trust signals across all pages.", color: "text-violet-500" },
	],
};

export function getQuickActionsForPage(
	pageContext: PageContextType,
): QuickAction[] {
	return ACTIONS_BY_PAGE[pageContext.type] || ACTIONS_BY_PAGE.other;
}

export default function CopilotQuickActions({
	pageContext,
	onAction,
	compact = false,
}: {
	pageContext: PageContextType;
	onAction: (prompt: string) => void;
	compact?: boolean;
}) {
	const actions = getQuickActionsForPage(pageContext);

	return (
		<div className={`flex flex-wrap ${compact ? "gap-1.5" : "gap-2"}`}>
			{actions.map((action) => (
				<button
					key={action.id}
					onClick={() => onAction(action.prompt)}
					className={`
						inline-flex items-center gap-1.5 rounded-md border border-edge
						bg-surface-card transition-colors hover:border-accent/40 hover:bg-surface-card-hover
						${compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"}
						font-medium text-content-secondary
					`}
				>
					<span className={`h-1.5 w-1.5 rounded-full ${action.color.replace("text-", "bg-")}`} />
					{action.label}
				</button>
			))}
		</div>
	);
}
