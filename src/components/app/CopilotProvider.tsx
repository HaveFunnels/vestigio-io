"use client";

// ──────────────────────────────────────────────
// CopilotProvider — Global state for the Vestigio AI copilot (3.14)
//
// Mounted at app layout level. Survives page navigation.
// Provides useCopilot() hook for any component to open/send/attach context.
// ──────────────────────────────────────────────

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useChatStream } from "@/lib/use-chat-stream";
import { serializeBlocksToText } from "@/lib/chat-block-parser";
import type {
	ChatMessage,
	ContentBlock,
	ModelId,
	Conversation,
} from "@/lib/chat-types";
import type { FindingProjection } from "../../../packages/projections/types";

// ── Types ──

export interface CopilotContextItem {
	kind: "finding" | "action" | "workspace";
	id: string;
	title: string;
}

export interface CopilotUsage {
	remaining: number;
	limit: number;
	plan: string;
}

export type PageContextType =
	| { type: "analysis" }
	| { type: "actions" }
	| { type: "dashboard" }
	| { type: "inventory" }
	| { type: "workspace"; id: string }
	| { type: "perspective"; slug: string }
	| { type: "workspaces" }
	| { type: "other" };

interface CopilotState {
	isOpen: boolean;
	isMinimized: boolean;
	conversationId: string | null;
	messages: ChatMessage[];
	contextItems: CopilotContextItem[];
	pageContext: PageContextType;
	usage: CopilotUsage | null;
	isStreaming: boolean;
	streamingMessage: ChatMessage | null;
	selectedModel: ModelId;
}

interface CopilotActions {
	open: (context?: { finding?: FindingProjection; prompt?: string }) => void;
	close: () => void;
	minimize: () => void;
	restore: () => void;
	send: (text: string) => void;
	newConversation: () => void;
	setModel: (model: ModelId) => void;
	abort: () => void;
	refreshUsage: () => void;
}

type CopilotContextValue = CopilotState & CopilotActions;

const CopilotContext = createContext<CopilotContextValue | null>(null);

const STORAGE_KEY = "vestigio_copilot_conv";

// ── Provider ──

export function CopilotProvider({ children }: { children: ReactNode }) {
	const pathname = usePathname();

	// Visibility
	const [isOpen, setIsOpen] = useState(false);
	const [isMinimized, setIsMinimized] = useState(false);

	// Conversation
	const [conversationId, setConversationId] = useState<string | null>(() => {
		if (typeof window === "undefined") return null;
		return localStorage.getItem(STORAGE_KEY) || null;
	});
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [contextItems, setContextItems] = useState<CopilotContextItem[]>([]);
	const [selectedModel, setSelectedModel] = useState<ModelId>("sonnet_4_6");

	// Usage
	const [usage, setUsage] = useState<CopilotUsage | null>(null);

	// Queue for messages sent before conversation is created
	const pendingSendRef = useRef<string | null>(null);

	// Page context — auto-detect from pathname
	const pageContext = useMemo<PageContextType>(() => {
		if (!pathname) return { type: "other" };
		if (pathname.startsWith("/app/workspaces/perspective/"))
			return { type: "perspective", slug: pathname.split("/").pop() || "" };
		if (pathname.match(/^\/app\/workspaces\/[^/]+$/))
			return { type: "workspace", id: pathname.split("/").pop() || "" };
		if (pathname === "/app/workspaces") return { type: "workspaces" };
		if (pathname.startsWith("/app/analysis")) return { type: "analysis" };
		if (pathname.startsWith("/app/actions")) return { type: "actions" };
		if (pathname.startsWith("/app/dashboard")) return { type: "dashboard" };
		if (pathname.startsWith("/app/inventory")) return { type: "inventory" };
		return { type: "other" };
	}, [pathname]);

	// SSE streaming hook
	const { sendMessage, isStreaming, streamingMessage, error, abort } =
		useChatStream({
			onDone: (response: any) => {
				// Merge the final streaming message into the messages array
				if (response?.message) {
					const assistantMsg: ChatMessage = {
						id: response.message.id || `assistant_${Date.now()}`,
						conversationId: conversationId || "copilot",
						role: "assistant",
						blocks: response.message.blocks || [],
						model: selectedModel,
						tokens: response.usage,
						createdAt: new Date(),
					};
					setMessages((prev) => [...prev, assistantMsg]);
				}
				// Refresh budget after each response
				fetchUsage();
			},
		});

	// ── Conversation management ──

	const createConversation = useCallback(async (): Promise<string | null> => {
		try {
			const res = await fetch("/api/conversations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "Vestigio AI" }),
			});
			if (!res.ok) return null;
			const data = await res.json();
			const id = data.id || data.conversation?.id;
			if (id) {
				setConversationId(id);
				localStorage.setItem(STORAGE_KEY, id);
			}
			return id || null;
		} catch {
			return null;
		}
	}, []);

	const loadConversation = useCallback(
		async (id: string) => {
			try {
				const res = await fetch(
					`/api/conversations/${id}?message_limit=50`,
				);
				if (!res.ok) {
					// Conversation not found — clear and start fresh
					localStorage.removeItem(STORAGE_KEY);
					setConversationId(null);
					setMessages([]);
					return;
				}
				const data = await res.json();
				if (data.messages?.length > 0) {
					const loaded: ChatMessage[] = data.messages.map(
						(m: any) => ({
							id: m.id,
							conversationId: id,
							role: m.role,
							blocks: typeof m.content === "string"
								? [{ type: "markdown" as const, content: m.content }]
								: (m.content as ContentBlock[]),
							model: m.model,
							createdAt: new Date(m.createdAt),
						}),
					);
					setMessages(loaded);
				}
			} catch {
				// silently fail
			}
		},
		[],
	);

	// Load saved conversation on mount
	useEffect(() => {
		if (conversationId) {
			loadConversation(conversationId);
		}
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// ── Send message ──

	const send = useCallback(
		async (text: string) => {
			if (!text.trim() || isStreaming) return;

			// Budget exhausted — inject canned upgrade message instead of calling API
			if (usage && usage.remaining <= 0) {
				const userMsg: ChatMessage = {
					id: `user_${Date.now()}`,
					conversationId: conversationId || "copilot",
					role: "user",
					blocks: [{ type: "markdown", content: text }],
					createdAt: new Date(),
				};
				const upgradeMsg: ChatMessage = {
					id: `budget_exhausted_${Date.now()}`,
					conversationId: conversationId || "copilot",
					role: "assistant",
					blocks: [
						{
							type: "markdown",
							content:
								"You've used all your AI queries for today. Upgrade your plan for more daily queries and deeper analysis.",
						},
					],
					createdAt: new Date(),
				};
				setMessages((prev) => [...prev, userMsg, upgradeMsg]);
				return;
			}

			// Ensure conversation exists
			let convId = conversationId;
			if (!convId) {
				convId = await createConversation();
				if (!convId) return; // failed to create
			}

			// Build user message
			const userMsg: ChatMessage = {
				id: `user_${Date.now()}`,
				conversationId: convId,
				role: "user",
				blocks: [{ type: "markdown", content: text }],
				createdAt: new Date(),
			};
			setMessages((prev) => [...prev, userMsg]);

			// Build history for LLM
			const allMessages = [...messages, userMsg];
			const history = allMessages.slice(-50).map((m) => ({
				role: m.role,
				content: serializeBlocksToText(m.blocks),
				timestamp: m.createdAt.getTime(),
			}));

			// Send via SSE
			sendMessage(
				text,
				selectedModel,
				convId,
				history,
				undefined, // no files in copilot
				allMessages.length,
			);
		},
		[
			conversationId,
			messages,
			selectedModel,
			isStreaming,
			sendMessage,
			createConversation,
			usage,
		],
	);

	// ── Actions ──

	const open = useCallback(
		(context?: { finding?: FindingProjection; prompt?: string }) => {
			setIsOpen(true);
			setIsMinimized(false);

			if (context?.finding) {
				setContextItems([
					{
						kind: "finding",
						id: context.finding.id,
						title: context.finding.title,
					},
				]);
				// Auto-send a contextualized prompt
				if (context.prompt) {
					// Defer send to next tick so panel is visible
					setTimeout(() => send(context.prompt!), 100);
				}
			}
		},
		[send],
	);

	const close = useCallback(() => {
		setIsOpen(false);
		setIsMinimized(false);
	}, []);

	const minimize = useCallback(() => {
		setIsMinimized(true);
		setIsOpen(false);
	}, []);

	const restore = useCallback(() => {
		setIsMinimized(false);
		setIsOpen(true);
	}, []);

	const newConversation = useCallback(() => {
		setConversationId(null);
		setMessages([]);
		setContextItems([]);
		localStorage.removeItem(STORAGE_KEY);
	}, []);

	// ── Usage ──

	const fetchUsage = useCallback(async () => {
		try {
			const res = await fetch("/api/usage");
			if (!res.ok) return;
			const data = await res.json();
			setUsage({
				remaining: data.mcp_remaining ?? 0,
				limit: data.limits?.daily_mcp_budget ?? 0,
				plan: data.plan ?? "vestigio",
			});
		} catch {
			// silently fail
		}
	}, []);

	useEffect(() => {
		fetchUsage();
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// ── Context value ──

	const value = useMemo<CopilotContextValue>(
		() => ({
			isOpen,
			isMinimized,
			conversationId,
			messages,
			contextItems,
			pageContext,
			usage,
			isStreaming,
			streamingMessage,
			selectedModel,
			open,
			close,
			minimize,
			restore,
			send,
			newConversation,
			setModel: setSelectedModel,
			abort,
			refreshUsage: fetchUsage,
		}),
		[
			isOpen,
			isMinimized,
			conversationId,
			messages,
			contextItems,
			pageContext,
			usage,
			isStreaming,
			streamingMessage,
			selectedModel,
			open,
			close,
			minimize,
			restore,
			send,
			newConversation,
			abort,
			fetchUsage,
		],
	);

	return (
		<CopilotContext.Provider value={value}>
			{children}
		</CopilotContext.Provider>
	);
}

export function useCopilot(): CopilotContextValue {
	const ctx = useContext(CopilotContext);
	if (!ctx) {
		// Fallback for components outside provider (e.g., admin pages)
		return {
			isOpen: false,
			isMinimized: false,
			conversationId: null,
			messages: [],
			contextItems: [],
			pageContext: { type: "other" },
			usage: null,
			isStreaming: false,
			streamingMessage: null,
			selectedModel: "sonnet_4_6",
			open: () => {},
			close: () => {},
			minimize: () => {},
			restore: () => {},
			send: () => {},
			newConversation: () => {},
			setModel: () => {},
			abort: () => {},
			refreshUsage: () => {},
		};
	}
	return ctx;
}
