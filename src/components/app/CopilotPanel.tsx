"use client";

// ──────────────────────────────────────────────
// CopilotPanel — Floating chat panel for Vestigio AI (3.14)
//
// Bottom-right floating card. z-[45].
// Reuses ChatMessageRenderer + ChatInputBar from the chat page.
// Auto-minimizes when SideDrawer opens.
// ──────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCopilot } from "./CopilotProvider";
import { ChatMessageRenderer } from "@/components/console/chat/ChatMessageRenderer";
import { ChatInputBar } from "@/components/console/chat/ChatInputBar";
import CopilotQuickActions from "./CopilotQuickActions";

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
			className="fixed bottom-20 right-4 z-[45] flex w-[420px] max-h-[min(600px,80vh)] flex-col overflow-hidden rounded-2xl border border-edge bg-card shadow-2xl shadow-black/30"
			role="dialog"
			aria-label="Vestigio AI"
		>
			{/* Header */}
			<div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
				<div className="flex items-center gap-2">
					<svg
						className="h-4 w-4 text-emerald-500"
						fill="none"
						viewBox="0 0 24 24"
						strokeWidth={1.5}
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
						/>
					</svg>
					<span className="text-sm font-semibold text-content">
						Vestigio AI
					</span>
					{budgetText && (
						<span className="rounded-full bg-surface-inset px-2 py-0.5 text-[10px] font-mono text-content-faint">
							{budgetText}
						</span>
					)}
				</div>
				<div className="flex items-center gap-1">
					{/* New conversation */}
					<button
						onClick={newConversation}
						className="rounded-md p-1.5 text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
						title="New conversation"
					>
						<svg
							className="h-3.5 w-3.5"
							fill="none"
							viewBox="0 0 24 24"
							strokeWidth={1.5}
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M12 4.5v15m7.5-7.5h-15"
							/>
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
						className="rounded-md p-1.5 text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
						title="Open full chat"
					>
						<svg
							className="h-3.5 w-3.5"
							fill="none"
							viewBox="0 0 24 24"
							strokeWidth={1.5}
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
							/>
						</svg>
					</button>
					{/* Minimize */}
					<button
						onClick={minimize}
						className="rounded-md p-1.5 text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
						title="Minimize"
					>
						<svg
							className="h-3.5 w-3.5"
							fill="none"
							viewBox="0 0 24 24"
							strokeWidth={2}
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M19.5 12h-15"
							/>
						</svg>
					</button>
					{/* Close */}
					<button
						onClick={close}
						className="rounded-md p-1.5 text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
						title="Close"
					>
						<svg
							className="h-3.5 w-3.5"
							fill="none"
							viewBox="0 0 24 24"
							strokeWidth={2}
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>
			</div>

			{/* Context chips */}
			{contextItems.length > 0 && (
				<div className="flex flex-wrap gap-1.5 border-b border-edge/50 px-4 py-2">
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

			{/* Messages or Empty State */}
			<div
				ref={scrollRef}
				className="flex-1 overflow-y-auto"
			>
				{hasMessages ? (
					<div className="space-y-3 p-3">
						{messages.map((msg) => (
							<ChatMessageRenderer
								key={msg.id}
								message={msg}
								onSuggestedPrompt={(prompt) => send(prompt)}
								onNavigate={(href) => router.push(href)}
							/>
						))}
						{streamingMessage && (
							<ChatMessageRenderer
								key="streaming"
								message={streamingMessage}
							/>
						)}
					</div>
				) : (
					/* Empty state — welcome + quick actions */
					<div className="flex flex-col items-center justify-center p-6 text-center">
						<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-edge bg-surface-card">
							<svg
								className="h-6 w-6 text-emerald-500"
								fill="none"
								viewBox="0 0 24 24"
								strokeWidth={1.5}
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
								/>
							</svg>
						</div>
						<h3 className="text-sm font-medium text-content-secondary">
							How can I help?
						</h3>
						<p className="mt-1 text-xs text-content-muted">
							Ask about your findings, explore insights, or run an
							audit.
						</p>
						<div className="mt-4 w-full">
							<CopilotQuickActions
								pageContext={pageContext}
								onAction={(prompt) => send(prompt)}
							/>
						</div>
					</div>
				)}
			</div>

			{/* Quick actions strip (compact, when in conversation) */}
			{hasMessages && (
				<div className="border-t border-edge/50 px-3 py-2">
					<CopilotQuickActions
						pageContext={pageContext}
						onAction={(prompt) => send(prompt)}
						compact
					/>
				</div>
			)}

			{/* Input bar */}
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
				/>
			</div>
		</div>
	);
}
