"use client";

// ──────────────────────────────────────────────
// CopilotPanel — Full-height floating panel for Vestigio AI (3.14)
//
// Right-side panel, z-[45]. Full browser interior height minus paddings.
// Reuses ChatMessageRenderer + ChatInputBar (compact/island mode).
// Auto-minimizes when SideDrawer opens.
// Header: playbooks grid menu, expand, minimize.
// ──────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCopilot } from "./CopilotProvider";
import { ChatMessageRenderer } from "@/components/console/chat/ChatMessageRenderer";
import { ChatInputBar } from "@/components/console/chat/ChatInputBar";
import CopilotQuickActions from "./CopilotQuickActions";

// ── Playbooks data (visual metadata — text from translations) ──

interface FeaturedPlaybook {
	id: string;
	color: string;
	queries: number;
}

const FEATURED_PLAYBOOKS: FeaturedPlaybook[] = [
	{ id: "revenue_leak_full_audit", color: "red", queries: 2 },
	{ id: "conversion_bottleneck", color: "emerald", queries: 3 },
	{ id: "trust_signal_audit", color: "violet", queries: 2 },
	{ id: "executive_summary", color: "amber", queries: 3 },
	{ id: "cross_pack_correlation", color: "cyan", queries: 3 },
];

const PB_COLORS: Record<string, { border: string; bg: string; badge: string }> = {
	red:     { border: "border-red-500/30 hover:border-red-500/50 hover:bg-red-500/5",         bg: "bg-red-500/10",     badge: "bg-red-500/10 text-red-400 border-red-500/30" },
	emerald: { border: "border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/5", bg: "bg-emerald-500/10", badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
	violet:  { border: "border-violet-500/30 hover:border-violet-500/50 hover:bg-violet-500/5",   bg: "bg-violet-500/10",  badge: "bg-violet-500/10 text-violet-400 border-violet-500/30" },
	amber:   { border: "border-amber-500/30 hover:border-amber-500/50 hover:bg-amber-500/5",     bg: "bg-amber-500/10",   badge: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
	cyan:    { border: "border-cyan-500/30 hover:border-cyan-500/50 hover:bg-cyan-500/5",       bg: "bg-cyan-500/10",    badge: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30" },
};

// ── Budget exhausted card ──

function BudgetExhaustedCard({
	onUpgrade,
	onDismiss,
	t,
}: {
	onUpgrade: () => void;
	onDismiss: () => void;
	t: (key: string) => string;
}) {
	return (
		<div className="flex flex-col items-center rounded-xl border border-amber-800/30 bg-amber-500/5 px-4 py-5 text-center">
			<div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
				<svg
					className="h-5 w-5 text-amber-400"
					fill="none"
					viewBox="0 0 24 24"
					strokeWidth={1.5}
					stroke="currentColor"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
					/>
				</svg>
			</div>
			<p className="text-sm font-medium text-content-secondary">
				{t("budget_exhausted_title")}
			</p>
			<p className="mt-1 text-xs text-content-muted">
				{t("budget_exhausted_description")}
			</p>
			<div className="mt-4 flex w-full gap-2">
				<button
					onClick={onUpgrade}
					className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
				>
					{t("budget_upgrade")}
				</button>
				<button
					onClick={onDismiss}
					className="flex-1 rounded-lg border border-edge px-3 py-2 text-xs font-medium text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
				>
					{t("budget_later")}
				</button>
			</div>
		</div>
	);
}

// ── Sparkle icon (template-inspired, emerald-tinted) ──

function SparkleIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			fill="none"
			viewBox="0 0 48 48"
			xmlns="http://www.w3.org/2000/svg"
		>
			<defs>
				<linearGradient id="copilot-star" x1="24" y1="6" x2="24" y2="42" gradientUnits="userSpaceOnUse">
					<stop offset="0" stopColor="#34d399" stopOpacity="0.9" />
					<stop offset="1" stopColor="#10b981" stopOpacity="0.5" />
				</linearGradient>
				<linearGradient id="copilot-border" x1="24" y1="0" x2="24" y2="48" gradientUnits="userSpaceOnUse">
					<stop offset="0" stopColor="#34d399" stopOpacity="0.2" />
					<stop offset="1" stopColor="#10b981" stopOpacity="0" />
				</linearGradient>
			</defs>
			<rect width="48" height="48" rx="12" fill="#0A0D12" />
			<path
				d="M6 24c11.441 0 18-6.559 18-18 0 11.441 6.559 18 18 18-11.441 0-18 6.559-18 18 0-11.441-6.559-18-18-18z"
				fill="url(#copilot-star)"
				fillRule="evenodd"
				clipRule="evenodd"
			/>
			<rect
				x="1"
				y="1"
				width="46"
				height="46"
				rx="11"
				stroke="url(#copilot-border)"
				strokeWidth="2"
				fill="none"
			/>
		</svg>
	);
}

// ── 3x3 dots grid icon (from template) ──

function GridDotsIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="1em"
			height="1em"
			viewBox="0 0 24 24"
			className={className}
		>
			<path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="2"
				d="M4 5a1 1 0 1 0 2 0a1 1 0 1 0-2 0m7 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0m7 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0M4 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0m7 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0m7 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0M4 19a1 1 0 1 0 2 0a1 1 0 1 0-2 0m7 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0m7 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0"
			/>
		</svg>
	);
}

// ── Playbooks overlay (renders inside the panel) ──

function PlaybooksOverlay({
	onUsePrompt,
	onClose,
	mcpRemaining,
}: {
	onUsePrompt: (prompt: string) => void;
	onClose: () => void;
	mcpRemaining: number;
}) {
	const t = useTranslations("console.copilot");
	const tChat = useTranslations("console.chat");

	return (
		<div className="absolute inset-0 z-10 flex flex-col bg-card">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
				<span className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">
					{t("playbooks_header")}
				</span>
				<button
					onClick={onClose}
					className="flex h-7 w-7 items-center justify-center rounded-md text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
					title={t("close")}
				>
					<svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
						<path d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
					</svg>
				</button>
			</div>

			{/* Divider label */}
			<div className="px-4 pb-1.5 pt-3">
				<span className="text-[10px] font-semibold uppercase tracking-wider text-content-faint">
					{t("playbooks_expert")}
				</span>
			</div>

			{/* Playbook list */}
			<div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3">
				{FEATURED_PLAYBOOKS.map((pb) => {
					const colors = PB_COLORS[pb.color] || PB_COLORS.emerald;
					const canAfford = mcpRemaining >= pb.queries;

					return (
						<button
							key={pb.id}
							onClick={() => {
								if (canAfford) {
									onUsePrompt(tChat(`playbook_prompts.${pb.id}`));
									onClose();
								}
							}}
							disabled={!canAfford}
							className={`group flex w-full flex-col rounded-lg border bg-surface-card/30 p-3 text-left transition-all ${
								canAfford ? colors.border : "cursor-not-allowed border-edge opacity-50"
							}`}
						>
							<div className="flex items-center gap-2">
								<span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${colors.badge}`}>
									{tChat(`featured_playbooks.${pb.id}.category`)}
								</span>
								<span className="text-[10px] text-content-faint">
									{t("playbooks_queries", { count: pb.queries })}
								</span>
							</div>
							<h3 className="mt-1.5 text-sm font-medium text-content-secondary group-hover:text-content">
								{tChat(`featured_playbooks.${pb.id}.title`)}
							</h3>
							<p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-content-muted">
								{tChat(`featured_playbooks.${pb.id}.description`)}
							</p>
						</button>
					);
				})}
			</div>
		</div>
	);
}

// ── Main panel ──

export default function CopilotPanel() {
	const router = useRouter();
	const t = useTranslations("console.copilot");
	const {
		isOpen,
		isMinimized,
		isExpanded,
		messages,
		streamingMessage,
		isStreaming,
		conversationId,
		contextItems,
		pageContext,
		usage,
		selectedModel,
		send,
		close,
		minimize,
		expand,
		collapse,
		newConversation,
		setModel,
		abort,
	} = useCopilot();

	const scrollRef = useRef<HTMLDivElement>(null);
	const [playbooksOpen, setPlaybooksOpen] = useState(false);

	// Auto-scroll on new messages
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messages.length, streamingMessage]);

	// Listen for SideDrawer open → auto-minimize
	useEffect(() => {
		const handler = (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (detail?.open && isOpen) {
				minimize();
			}
		};
		window.addEventListener("vestigio:sidedrawer", handler);
		return () =>
			window.removeEventListener("vestigio:sidedrawer", handler);
	}, [isOpen, minimize]);

	// Don't render when closed or minimized
	if (!isOpen || isMinimized) return null;

	const hasMessages = messages.length > 0 || streamingMessage;
	const budgetText = usage
		? `${usage.remaining}/${usage.limit}`
		: "";

	return (
		<div
			className={`fixed z-[45] flex flex-col overflow-hidden rounded-2xl border border-edge bg-card shadow-2xl shadow-black/30 animate-panel-in ${
			isExpanded
				? "inset-3 top-14 w-auto"
				: "top-14 right-3 bottom-3 w-[420px]"
		}`}
			role="dialog"
			aria-label={t("fab_label")}
		>
			{/* ── Header ── */}
			<div className="flex items-center justify-end gap-1 px-3 py-2">
				{budgetText && (
					<span className="mr-auto rounded-full bg-surface-inset px-2 py-0.5 text-[10px] font-mono text-content-faint">
						{budgetText}
					</span>
				)}
				{/* New conversation — hide when conversation is already empty */}
				{hasMessages && (
					<button
						onClick={newConversation}
						className="flex h-8 w-8 items-center justify-center rounded-md text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
						title={t("new_conversation")}
					>
						<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
						</svg>
					</button>
				)}
				{/* Playbooks menu (3x3 dots grid) */}
				<button
					onClick={() => setPlaybooksOpen(!playbooksOpen)}
					className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
						playbooksOpen
							? "bg-surface-inset text-content-secondary"
							: "text-content-faint hover:bg-surface-card-hover hover:text-content-secondary"
					}`}
					title={t("playbooks")}
				>
					<GridDotsIcon className="h-4 w-4" />
				</button>
				{/* Expand / Collapse toggle */}
				<button
					onClick={() => (isExpanded ? collapse() : expand())}
					className="flex h-8 w-8 items-center justify-center rounded-md text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
					title={isExpanded ? t("minimize") : t("open_full_chat")}
				>
					{isExpanded ? (
						/* Collapse icon (arrows inward) */
						<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
						</svg>
					) : (
						/* Expand icon (arrows outward) */
						<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
						</svg>
					)}
				</button>
				{/* Minimize */}
				<button
					onClick={minimize}
					className="flex h-8 w-8 items-center justify-center rounded-md text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
					title={t("minimize")}
				>
					<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
						<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
					</svg>
				</button>
			</div>

			{/* ── Playbooks overlay (inside the panel) ── */}
			{playbooksOpen && (
				<PlaybooksOverlay
					onUsePrompt={(prompt) => send(prompt)}
					onClose={() => setPlaybooksOpen(false)}
					mcpRemaining={usage?.remaining ?? 0}
				/>
			)}

			{/* ── Context chips ── */}
			{contextItems.length > 0 && (
				<div className="flex flex-wrap justify-center gap-1.5 border-t border-edge/50 px-4 py-2">
					{contextItems.map((item) => (
						<span
							key={item.id}
							className="inline-flex items-center gap-1 rounded-full border border-edge bg-surface-inset px-2 py-0.5 text-[10px] text-content-muted"
						>
							<span
								className={`h-1.5 w-1.5 rounded-full ${
									item.kind === "finding"
										? "bg-red-500"
										: item.kind === "action"
											? "bg-emerald-500"
											: "bg-amber-500"
								}`}
							/>
							{item.title.length > 40
								? item.title.slice(0, 40) + "..."
								: item.title}
						</span>
					))}
				</div>
			)}

			{/* ── Messages or Empty State ── */}
			<div
				ref={scrollRef}
				className="flex-1 overflow-y-auto"
			>
				{hasMessages ? (
					<div className="space-y-3 p-3">
						{messages.map((msg) =>
							msg.id.startsWith("budget_exhausted_") ? (
								<BudgetExhaustedCard
									key={msg.id}
									onUpgrade={() => router.push("/app/billing")}
									onDismiss={close}
									t={t}
								/>
							) : (
								<ChatMessageRenderer
									key={msg.id}
									message={msg}
									onSuggestedPrompt={(prompt) => send(prompt)}
									onNavigate={(href) => router.push(href)}
								/>
							),
						)}
						{streamingMessage && (
							<ChatMessageRenderer
								key="streaming"
								message={streamingMessage}
							/>
						)}
					</div>
				) : (
					/* ── Empty state — template-inspired centered layout ── */
					<div className="flex h-full flex-col items-center justify-center px-6 text-center">
						<SparkleIcon className="mb-6 h-12 w-12" />

						<div className="space-y-1.5">
							<h2 className="text-lg font-medium tracking-tight text-content-muted">
								{t("greeting_title")}
							</h2>
							<h3 className="text-base font-medium tracking-tight text-content">
								{t("greeting_subtitle")}
							</h3>
						</div>

						<p className="mt-2.5 text-sm text-content-muted">
							{t("greeting_description")}
						</p>

						<div className="mt-6 w-full">
							<CopilotQuickActions
								pageContext={pageContext}
								onAction={(prompt) => send(prompt)}
							/>
						</div>
					</div>
				)}
			</div>

			{/* ── Quick actions strip (compact, when in conversation) ── */}
			{hasMessages && (
				<div className="border-t border-edge/50 px-3 py-2">
					<CopilotQuickActions
						pageContext={pageContext}
						onAction={(prompt) => send(prompt)}
						compact
					/>
				</div>
			)}

			{/* ── Input island (compact/mobile mode) ── */}
			<div className="border-t border-edge">
				<ChatInputBar
					onSend={(text) => send(text)}
					disabled={isStreaming}
					plan={usage?.plan || "vestigio"}
					selectedModel={selectedModel}
					onModelChange={setModel}
					isStreaming={isStreaming}
					onStop={abort}
					placeholder={t("input_placeholder")}
					compact
				/>
			</div>
		</div>
	);
}
