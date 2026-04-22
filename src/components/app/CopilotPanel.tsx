"use client";

// ──────────────────────────────────────────────
// CopilotPanel — Full-height floating panel for Vestigio AI (3.14)
//
// Right-side panel, z-[45]. Full browser interior height minus paddings.
// Reuses ChatMessageRenderer + ChatInputBar (compact/island mode).
// Auto-minimizes when SideDrawer opens.
// ──────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCopilot } from "./CopilotProvider";
import { ChatMessageRenderer } from "@/components/console/chat/ChatMessageRenderer";
import { ChatInputBar } from "@/components/console/chat/ChatInputBar";
import CopilotQuickActions from "./CopilotQuickActions";

// ── Budget exhausted card ──

function BudgetExhaustedCard({
	onUpgrade,
	onDismiss,
}: {
	onUpgrade: () => void;
	onDismiss: () => void;
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
				You&apos;ve used all your AI queries for today
			</p>
			<p className="mt-1 text-xs text-content-muted">
				Upgrade for more daily queries and deeper analysis.
			</p>
			<div className="mt-4 flex w-full gap-2">
				<button
					onClick={onUpgrade}
					className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
				>
					Upgrade plan
				</button>
				<button
					onClick={onDismiss}
					className="flex-1 rounded-lg border border-edge px-3 py-2 text-xs font-medium text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
				>
					Maybe later
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

// ── Main panel ──

export default function CopilotPanel() {
	const router = useRouter();
	const {
		isOpen,
		isMinimized,
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
		newConversation,
		setModel,
		abort,
	} = useCopilot();

	const scrollRef = useRef<HTMLDivElement>(null);

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
			className="fixed top-12 right-2 bottom-2 z-[45] flex w-[420px] flex-col overflow-hidden rounded-2xl border border-edge bg-card shadow-2xl shadow-black/30"
			role="dialog"
			aria-label="Vestigio AI"
		>
			{/* ── Header ── */}
			<div className="flex items-center justify-end gap-1 px-3 py-2">
				{budgetText && (
					<span className="mr-auto rounded-full bg-surface-inset px-2 py-0.5 text-[10px] font-mono text-content-faint">
						{budgetText}
					</span>
				)}
				{/* New conversation */}
				<button
					onClick={newConversation}
					className="flex h-8 w-8 items-center justify-center rounded-md text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
					title="New conversation"
				>
					<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
						<path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
					</svg>
				</button>
				{/* Expand to full page */}
				<button
					onClick={() => {
						const url = conversationId
							? `/app/chat?conversation=${conversationId}`
							: "/app/chat";
						router.push(url);
						close();
					}}
					className="flex h-8 w-8 items-center justify-center rounded-md text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
					title="Open full chat"
				>
					<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
						<path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
					</svg>
				</button>
				{/* Minimize */}
				<button
					onClick={minimize}
					className="flex h-8 w-8 items-center justify-center rounded-md text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
					title="Minimize"
				>
					<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
						<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
					</svg>
				</button>
				{/* Close */}
				<button
					onClick={close}
					className="flex h-8 w-8 items-center justify-center rounded-md text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
					title="Close"
				>
					<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
						<path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

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
								Vestigio AI
							</h2>
							<h3 className="text-base font-medium tracking-tight text-content">
								How can I help?
							</h3>
						</div>

						<p className="mt-2.5 text-sm text-content-muted">
							Ask about your findings, explore insights, or run an
							audit.
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
					placeholder="Ask Vestigio AI..."
					compact
				/>
			</div>
		</div>
	);
}
