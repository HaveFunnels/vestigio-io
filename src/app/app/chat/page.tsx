"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChatMessageRenderer } from "@/components/console/chat/ChatMessageRenderer";
import { ConversationSidebar } from "@/components/console/chat/ConversationSidebar";
import { ChatInputBar } from "@/components/console/chat/ChatInputBar";
import {
	FileUploadZone,
	type UploadedFile,
} from "@/components/console/chat/FileUploadZone";
// ChatBudgetBar removed — usage shown as radial indicator in ChatInputBar
import {
	parseBlockMarkers,
	serializeBlocksToText,
} from "@/lib/chat-block-parser";
import { useChatStream } from "@/lib/use-chat-stream";
import type {
	ChatMessage,
	ContentBlock,
	ModelId,
	Conversation,
} from "@/lib/chat-types";
import {
	buildBaseVerificationPlan,
	type VerificationStrategyKey,
} from "../../../../packages/projections/verification-plan-template";
import { toast } from "react-hot-toast";

// ──────────────────────────────────────────────
// Chat Page — Claude LLM + MCP Tools
//
// Layout: ConversationSidebar (left) + Chat (center)
// Features: SSE streaming, tool call indicators,
//   rich content blocks, conversation history,
//   model selector (Default / Ultra)
// ──────────────────────────────────────────────

interface UsageState {
	mcp_used: number;
	mcp_limit: number;
	mcp_remaining: number;
	mcp_pct: number;
	plan: string;
	domain: string | null;
	envId: string | null;
}

// Hydrated context item — what the indicator above the editor renders.
// Built by POSTing the raw {kind, id} pairs from URL params to
// /api/chat/context-items, which resolves them through the in-memory
// MCP projections so we get titles + severity + impact in one batched
// round trip. Items that don't resolve are dropped silently (the user
// just won't see them in the bar).
type ChatContextKind = "finding" | "action" | "workspace" | "surface";
interface ChatContextItem {
	kind: ChatContextKind;
	id: string;
	title: string;
	severity?: string;
	impact_mid?: number;
	pack?: string;
	// Verify flow extras — populated only for findings hydrated via
	// /api/chat/context-items. The plan island uses these to render
	// a base plan + carry the remediation steps into the "Create
	// Action" terminal CTA.
	verification_strategy?: string | null;
	verification_notes?: string | null;
	remediation_steps?: string[] | null;
	estimated_effort_hours?: number | null;
	inference_key?: string;
}

// Plan island state — driven by the verify-intent entry point.
// Reset to null when the user dismisses the island or successfully
// creates the terminal UserAction. Survives across user messages
// (sticky until action creation / dismissal).
interface VerificationPlanState {
	findingId: string;
	findingTitle: string;
	strategy: string | null;
	remediationSteps: string[] | null;
	effortHours: number | null;
	goalKey: string;
	steps: Array<{ id: string; labelKey: string }>;
	// User-message count captured when the plan was created, so we
	// can diff against live messages to compute progress without
	// counting the seed prompt.
	baselineUserMessageCount: number;
}

export default function ChatPage() {
	const router = useRouter();
	const t = useTranslations("console.chat");
	const tc = useTranslations("console.common");

	// ── State ──────────────────────────────────
	const [conversations, setConversations] = useState<Conversation[]>([]);
	// Active conversation ID is persisted to localStorage (NOT sessionStorage)
	// so it survives logout/login. The pre-Wave 2 implementation used
	// sessionStorage, which the browser clears when the auth session ends —
	// so users coming back to the app saw an empty chat page even though
	// their conversations were intact in the database. The auto-restore
	// useEffect below also picks the most recent conversation when no
	// stored ID is present, so a brand-new login lands on the user's
	// latest conversation instead of an empty state.
	const [activeConversationId, setActiveConversationId] = useState<
		string | null
	>(() => {
		if (typeof window !== "undefined") {
			return localStorage.getItem("vestigio_active_conv") || null;
		}
		return null;
	});
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [selectedModel, setSelectedModel] = useState<ModelId>("sonnet_4_6");
	const [usage, setUsage] = useState<UsageState | null>(null);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
	const [questionQueue, setQuestionQueue] = useState<string[]>([]);
	const [attachedFiles, setAttachedFiles] = useState<UploadedFile[]>([]);
	const [playbooksOpen, setPlaybooksOpen] = useState(false);
	const [contextItems, setContextItems] = useState<ChatContextItem[]>([]);
	const [verificationPlan, setVerificationPlan] =
		useState<VerificationPlanState | null>(null);
	const [creatingAction, setCreatingAction] = useState(false);
	// Smart auto-scroll: only follow the bottom when the user is
	// already near the bottom. The pre-fix behaviour was an
	// unconditional `scrollIntoView({ behavior: "smooth" })` on every
	// streaming delta, which yanked the viewport away from the user
	// every time they tried to scroll up to re-read an earlier
	// message during a long-running response. We now track whether
	// the user is "pinned" to the latest message and pause auto-scroll
	// the moment they scroll up by more than ~120px.
	const [isAtBottom, setIsAtBottom] = useState(true);

	const messagesEndRef = useRef<HTMLDivElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const searchParams = useSearchParams();

	// ── Streaming hook ─────────────────────────
	const { sendMessage, isStreaming, streamingMessage, error, abort } =
		useChatStream({
			onDone: (data) => {
				// Refresh usage after each message
				fetchUsage();
				// Process question queue
				setQuestionQueue((prev) => {
					if (prev.length > 0) {
						const [next, ...rest] = prev;
						// Schedule next question after a short delay
						setTimeout(() => handleSend(next), 500);
						return rest;
					}
					return prev;
				});
			},
		});

	// ── Fetch usage ────────────────────────────
	async function fetchUsage() {
		try {
			const res = await fetch("/api/usage");
			if (res.ok) {
				const data = await res.json();
				setUsage({
					mcp_used: data.usage?.mcp_queries || 0,
					mcp_limit: data.limits?.daily_mcp_budget || 5,
					mcp_remaining: data.mcp_remaining ?? 5,
					mcp_pct: data.mcp_pct ?? 0,
					plan: data.plan || "vestigio",
					domain: data.domain || null,
					envId: data.envId || null,
				});
			}
		} catch {
			/* continue without usage data */
		}
	}

	// ── Fetch conversations ────────────────────
	async function fetchConversations() {
		try {
			const res = await fetch("/api/conversations");
			if (res.ok) {
				const data = await res.json();
				setConversations(data.conversations || []);
			}
		} catch {
			/* continue */
		}
	}

	// ── Load conversation messages ─────────────
	// Two-phase load:
	//   Phase 1 — fetch raw messages, parse blocks (JSON fast path
	//             for new messages, marker parser for legacy ones).
	//             Render immediately so the user sees something.
	//   Phase 2 — scan for placeholder blocks (legacy messages whose
	//             cards came out as "Finding abc123" / null KB slugs)
	//             and call /api/chat/context-items to hydrate them in
	//             one batched round trip. The hydrated blocks then
	//             replace the placeholders and the renderer re-runs.
	//
	// The phase 2 step is a no-op when every message in the
	// conversation came from the post-fix server (those persist as
	// resolved JSON blocks already), so the hot path stays cheap.
	async function loadConversation(conversationId: string) {
		try {
			const res = await fetch(
				`/api/conversations/${conversationId}?message_limit=50`
			);
			if (!res.ok) return;
			const data = await res.json();
			const loaded: ChatMessage[] = (data.messages || []).map((m: any) => ({
				id: m.id,
				conversationId: m.conversationId,
				role: m.role,
				blocks: parseBlocks(m.content, m.role),
				model: m.model || undefined,
				createdAt: new Date(m.createdAt),
			}));
			setMessages(loaded);
			setActiveConversationId(conversationId);

			// Phase 2 — scan for placeholder blocks and hydrate them.
			// Errors here are non-fatal: if hydration fails, the user
			// still sees the styled cards from phase 1 (just with
			// generic titles). Better than blocking the whole load.
			hydrateLegacyPlaceholders(loaded).catch(() => {});
		} catch {
			/* continue */
		}
	}

	// Walk a freshly-loaded message list, find any blocks that look
	// like placeholders left over from the legacy `parseBlockMarkers`
	// path, batch-resolve them via /api/chat/context-items, and
	// replace the placeholders in state with the resolved versions.
	//
	// Placeholder detection invariants (these only ever come from
	// parseBlockMarkers, never from the resolved server-side blocks):
	//   - finding_card: pack === "" (real findings always carry a pack)
	//   - action_card:  title === `Action ${id}` (literal placeholder)
	//   - kb_article_card: slug === null (server resolver always sets slug)
	async function hydrateLegacyPlaceholders(messages: ChatMessage[]) {
		type HydrationItem = {
			kind: ChatContextKind | "kb_finding" | "kb_root_cause";
			id: string;
		};
		const items: HydrationItem[] = [];
		const seen = new Set<string>();

		function track(kind: HydrationItem["kind"], id: string) {
			const key = `${kind}:${id}`;
			if (seen.has(key)) return;
			seen.add(key);
			items.push({ kind, id });
		}

		for (const msg of messages) {
			if (msg.role !== "assistant") continue;
			for (const block of msg.blocks) {
				if (block.type === "finding_card" && block.finding.pack === "") {
					track("finding", block.finding.id);
				} else if (
					block.type === "action_card" &&
					block.action.title === `Action ${block.action.id}`
				) {
					track("action", block.action.id);
				} else if (block.type === "kb_article_card" && block.slug === null) {
					track(
						block.key_kind === "root_cause" ? "kb_root_cause" : "kb_finding",
						block.key
					);
				}
			}
		}

		if (items.length === 0) return;

		let resolvedById: Map<string, any>;
		try {
			const res = await fetch("/api/chat/context-items", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ items }),
			});
			if (!res.ok) return;
			const data = await res.json();
			const arr: any[] = Array.isArray(data.items) ? data.items : [];
			resolvedById = new Map(arr.map((it) => [`${it.kind}:${it.id}`, it]));
		} catch {
			return;
		}

		if (resolvedById.size === 0) return;

		// Walk every message and merge resolved data into placeholder
		// blocks. We rebuild the array immutably so React picks up the
		// change in setMessages.
		setMessages((prev) =>
			prev.map((msg) => {
				if (msg.role !== "assistant") return msg;
				let mutated = false;
				const newBlocks = msg.blocks.map((block) => {
					if (block.type === "finding_card" && block.finding.pack === "") {
						const r = resolvedById.get(`finding:${block.finding.id}`);
						if (r) {
							mutated = true;
							return {
								...block,
								finding: {
									...block.finding,
									title: r.title ?? block.finding.title,
									severity: r.severity ?? block.finding.severity,
									impact_mid: r.impact_mid ?? block.finding.impact_mid,
									pack: r.pack ?? block.finding.pack,
								},
							};
						}
					} else if (
						block.type === "action_card" &&
						block.action.title === `Action ${block.action.id}`
					) {
						const r = resolvedById.get(`action:${block.action.id}`);
						if (r) {
							mutated = true;
							return {
								...block,
								action: {
									...block.action,
									title: r.title ?? block.action.title,
									severity: r.severity ?? block.action.severity,
									impact_mid: r.impact_mid ?? block.action.impact_mid,
								},
							};
						}
					} else if (block.type === "kb_article_card" && block.slug === null) {
						const lookupKind =
							block.key_kind === "root_cause" ? "kb_root_cause" : "kb_finding";
						const r = resolvedById.get(`${lookupKind}:${block.key}`);
						if (r) {
							mutated = true;
							return {
								...block,
								title: r.title ?? null,
								slug: r.slug ?? null,
								excerpt: r.excerpt ?? null,
							};
						}
					}
					return block;
				});
				return mutated ? { ...msg, blocks: newBlocks } : msg;
			})
		);
	}

	function parseBlocks(content: string, role: string): ContentBlock[] {
		if (role === "user") {
			return [{ type: "markdown", content }];
		}
		// Modern persistence: assistant messages are stored as
		// JSON.stringify(ContentBlock[]) — fully resolved cards included.
		// This is the fast path and what every message saved after Wave 2
		// uses. JSON.parse + an Array.isArray sanity check is enough.
		try {
			const parsed = JSON.parse(content);
			if (Array.isArray(parsed)) return parsed;
		} catch {
			/* not JSON — fall through */
		}
		// Legacy fallback: messages persisted before the server-side
		// resolver shipped still have raw `$$MARKER{...}$$` text. Run the
		// marker parser on them so cards at least render with placeholder
		// titles instead of literal "$$FINDING{abc123}$$" strings. The
		// metadata won't be hydrated (we don't have findings_data /
		// actions_data on a cold restore) so cards show generic titles +
		// links — strictly better than the raw markers.
		return parseBlockMarkers(content);
	}

	// ── Persist active conversation ID ─────────
	useEffect(() => {
		if (activeConversationId) {
			localStorage.setItem("vestigio_active_conv", activeConversationId);
		} else {
			localStorage.removeItem("vestigio_active_conv");
		}
	}, [activeConversationId]);

	// ── Init ───────────────────────────────────
	// Two-step restore:
	//   1. If localStorage has a stored conversation id, try to load it.
	//      That covers normal "return to chat" flow inside the same login.
	//   2. If no id is stored (first login, or after the user explicitly
	//      cleared with handleNewChat), wait until /api/conversations
	//      resolves and auto-select the most recent non-deleted thread.
	//      This is what makes "log out, log back in" land on the user's
	//      latest conversation instead of an empty page even when the
	//      browser cleared every storage layer.
	useEffect(() => {
		fetchUsage();
		fetchConversations();
		const stored = localStorage.getItem("vestigio_active_conv");
		if (stored && messages.length === 0) {
			loadConversation(stored);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// ── Auto-restore most recent conversation ──
	// Fires once after fetchConversations() lands and only when nothing
	// else has populated the chat yet. Picks the first conversation in
	// the list (the API returns them ordered by updatedAt desc, see
	// src/app/api/conversations/route.ts) so the user reliably lands on
	// the thread they were last working on. Conditional on
	// `messages.length === 0` so it never overrides an in-progress chat.
	//
	// **Race-condition guard:** if the URL carries context params, the
	// user is intentionally starting a NEW context-aware chat — we must
	// NOT auto-restore an old one and overwrite it. The URL effect
	// above is async (it hydrates context metadata before calling
	// handleSend) so there's a window where `activeConversationId` is
	// still null and `messages` is still empty even though a new chat
	// is about to be created. We sidestep that by checking the URL
	// params directly here too.
	useEffect(() => {
		if (activeConversationId) return;
		if (messages.length > 0) return;
		if (conversations.length === 0) return;
		if (
			searchParams.get("finding") ||
			searchParams.get("findings") ||
			searchParams.get("action") ||
			searchParams.get("context") ||
			searchParams.get("surfaces")
		) {
			return;
		}
		const mostRecent = conversations[0];
		if (mostRecent?.id) {
			loadConversation(mostRecent.id);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [conversations.length]);

	// ── Read URL context params, hydrate metadata, then auto-send ──
	// Entry points across the console (Discuss, Analyze together, Use
	// as context) navigate here with raw IDs in the URL. The legacy
	// implementation passed the IDs directly to the LLM as text and
	// showed only a "1 item" counter — operators couldn't see WHICH
	// finding was attached. The new flow:
	//
	//   1. Parse all known param shapes into a {kind, id}[] list.
	//      Different entry points use different param names (`finding`,
	//      `findings`, `action`, `context`, `surfaces`, plus a
	//      `workspaces:` prefix from the workspaces page) — all are
	//      normalised here.
	//   2. POST the list to /api/chat/context-items, which hydrates
	//      title + severity + impact from the in-memory MCP projections
	//      in one batched round trip.
	//   3. Set the rich items into state so the indicator bar above
	//      the editor can render proper chips.
	//   4. Auto-send the initial prompt as before, but now the prompt
	//      can interpolate the resolved titles instead of raw IDs so
	//      the LLM has the human-friendly context too.
	//
	// The context PERSISTS across follow-up messages — clicking "×" on
	// a chip is the only way to remove an item. This matches the user
	// mental model that "discussing finding X" is a sticky property of
	// the conversation, not a one-shot lookup that vanishes after the
	// first reply.
	useEffect(() => {
		const finding = searchParams.get("finding");
		const findings = searchParams.get("findings");
		const action = searchParams.get("action");
		const context = searchParams.get("context");
		const surfaces = searchParams.get("surfaces");
		// Verify-flow entry point: FindingDrawer / VerificationPanel Verify
		// buttons navigate here with `?intent=verify&finding=<id>`. Triggers
		// the VerificationPlanIsland once the finding is hydrated and seeds
		// the chat with a verify-flavoured prompt instead of the generic
		// "Discuss" prompt.
		const intent = searchParams.get("intent");
		const isVerifyIntent = intent === "verify";

		const raw: Array<{ kind: ChatContextKind; id: string }> = [];
		if (finding) {
			raw.push({ kind: "finding", id: finding });
		}
		if (findings) {
			for (const id of findings
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)) {
				raw.push({ kind: "finding", id });
			}
		}
		if (action) {
			raw.push({ kind: "action", id: action });
		}
		if (surfaces) {
			for (const id of surfaces
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)) {
				raw.push({ kind: "surface", id });
			}
		}
		if (context) {
			// Two flavours: `?context=workspaces:id1,id2` (workspaces page)
			// and `?context=id1,id2` (inventory page, plain finding IDs).
			// The `?context=maps` literal from the maps page has no items
			// to hydrate — it just opens the chat with no specific context.
			if (context === "maps") {
				// No items, no hydration — fall through.
			} else if (context.startsWith("workspaces:")) {
				const list = context.slice("workspaces:".length);
				for (const id of list
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean)) {
					raw.push({ kind: "workspace", id });
				}
			} else {
				for (const id of context
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean)) {
					raw.push({ kind: "finding", id });
				}
			}
		}

		if (raw.length === 0) {
			// No URL context — nothing to hydrate, nothing to auto-send.
			return;
		}

		// Hydrate metadata via the batched endpoint, then set state and
		// auto-send a context-aware initial prompt. We construct the
		// prompt from the hydrated titles so the LLM sees human-readable
		// names AND the IDs (so its tools can resolve them deterministically).
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch("/api/chat/context-items", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ items: raw }),
				});
				if (!res.ok) throw new Error("hydration failed");
				const data = await res.json();
				const hydrated: ChatContextItem[] = Array.isArray(data.items)
					? data.items
					: [];
				if (cancelled) return;
				setContextItems(hydrated);

				// Build the initial prompt. If hydration came back empty (the
				// engine no longer knows about these IDs), we still send a
				// prompt referring to the raw IDs as a fallback so the user
				// gets *something* — but the indicator stays empty.
				const items =
					hydrated.length > 0
						? hydrated
						: raw.map(
								(r) =>
									({
										kind: r.kind,
										id: r.id,
										title: r.id,
									}) as ChatContextItem
							);
				const verifyTarget =
					isVerifyIntent &&
					items.find((it) => it.kind === "finding");
				if (verifyTarget) {
					initVerificationPlan(verifyTarget);
					handleSend(buildVerifyPrompt(verifyTarget, t));
				} else {
					handleSend(buildContextPrompt(items, t));
				}
			} catch {
				// Hydration unavailable — fall back to the legacy behaviour
				// so the user still gets a response. The indicator just stays
				// empty in this branch.
				if (cancelled) return;
				const placeholders: ChatContextItem[] = raw.map((r) => ({
					kind: r.kind,
					id: r.id,
					title: r.id,
				}));
				setContextItems(placeholders);
				// Verify intent without hydration → we don't know the
				// strategy, so fall back to the fallback plan and a
				// generic verify prompt. The MCP will still have the
				// finding ID to pull context.
				const verifyTarget =
					isVerifyIntent &&
					placeholders.find((it) => it.kind === "finding");
				if (verifyTarget) {
					initVerificationPlan(verifyTarget);
					handleSend(buildVerifyPrompt(verifyTarget, t));
				} else {
					handleSend(buildContextPrompt(placeholders, t));
				}
			}
		})();

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// ── Smart auto-scroll ──────────────────────
	// Auto-scroll only when the user is "pinned" to the bottom of the
	// scroll container. As soon as they scroll up by more than ~120px
	// we stop following the stream so they can read older content
	// without the viewport getting yanked. A floating "Jump to latest"
	// button (rendered below) brings them back when they're ready.
	useEffect(() => {
		if (!isAtBottom) return;
		if (messages.length > 0 || streamingMessage) {
			messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [messages, streamingMessage, isAtBottom]);

	function handleScroll() {
		const el = scrollContainerRef.current;
		if (!el) return;
		const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
		// 120px threshold gives the user a comfortable "near the bottom"
		// zone — small enough that one accidental scroll-down re-pins,
		// big enough that intentional reading detaches.
		setIsAtBottom(distanceFromBottom < 120);
	}

	function jumpToLatest() {
		setIsAtBottom(true);
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}

	// ── Create new conversation ────────────────
	async function createConversation(): Promise<string | null> {
		try {
			const res = await fetch("/api/conversations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			if (res.ok) {
				const data = await res.json();
				const conv = data.conversation;
				setConversations((prev) => [conv, ...prev]);
				setActiveConversationId(conv.id);
				return conv.id;
			}
		} catch {
			/* continue */
		}
		return null;
	}

	// ── Handle new chat ────────────────────────
	function handleNewChat() {
		setActiveConversationId(null);
		setMessages([]);
	}

	// ── Handle send message ────────────────────
	const handleSend = useCallback(
		async (text: string) => {
			if (isStreaming) {
				// Queue the question for after current stream completes
				setQuestionQueue((prev) => [...prev, text]);
				return;
			}

			// Ensure we have a conversation
			let convId = activeConversationId;
			if (!convId) {
				convId = await createConversation();
			}

			// Auto-title from first message
			if (convId && messages.length === 0) {
				const title = text.slice(0, 60) + (text.length > 60 ? "..." : "");
				fetch(`/api/conversations/${convId}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ title }),
				})
					.then(() => fetchConversations())
					.catch(() => {});
			}

			// Add user message to UI
			const userMessage: ChatMessage = {
				id: `user_${Date.now()}`,
				conversationId: convId || "ephemeral",
				role: "user",
				blocks: [{ type: "markdown", content: text }],
				createdAt: new Date(),
			};
			setMessages((prev) => [...prev, userMessage]);

			// Build conversation history for context.
			//
			// **History serialization fidelity:** earlier this filtered out
			// every block except `markdown`, which meant the LLM only saw
			// the prose portions of its previous responses and silently
			// lost track of every finding/action/KB/impact card it had
			// generated. Follow-up questions like "tell me more about that
			// finding" became impossible to answer correctly. We now use
			// `serializeBlocksToText` (the inverse of the marker parser) so
			// the LLM gets a faithful transcript of its own prior output —
			// including the exact `$$FINDING{abc123}$$` markers it can
			// reference back by id.
			const history = messages.map((m) => ({
				role: m.role,
				content: serializeBlocksToText(m.blocks),
				timestamp: m.createdAt.getTime(),
			}));

			// Send to streaming API. The `+ 1` on totalMessageCount accounts
			// for the user message we just appended to local state but that
			// hasn't been pushed into `messages` yet on this render pass.
			// Without this the server's window-truncation logic underreports
			// and the LLM thinks the conversation is shorter than it is.
			sendMessage(
				text,
				selectedModel,
				convId,
				history,
				attachedFiles.length > 0 ? attachedFiles : undefined,
				messages.length + 1
			);
		},
		[isStreaming, activeConversationId, messages, selectedModel, sendMessage]
	);

	// ── Merge streaming message into messages ──
	useEffect(() => {
		if (streamingMessage && !streamingMessage.streaming) {
			// Stream complete — add to message list
			setMessages((prev) => [
				...prev,
				{ ...streamingMessage, streaming: false },
			]);
		}
	}, [streamingMessage?.streaming]);

	// ── Handle suggested prompt click ──────────
	function handleSuggestedPrompt(prompt: string) {
		handleSend(prompt);
	}

	// ── Handle navigation from cards ───────────
	function handleNavigate(href: string) {
		router.push(href);
	}

	// ── Delete conversation ────────────────────
	async function handleDeleteConversation(id: string) {
		try {
			await fetch(`/api/conversations/${id}`, { method: "DELETE" });
			setConversations((prev) => prev.filter((c) => c.id !== id));
			if (activeConversationId === id) {
				setActiveConversationId(null);
				setMessages([]);
			}
		} catch {
			/* continue */
		}
	}

	// ── Message action handlers ────────────────

	function handleRetry() {
		// Retry = resend the last user message
		const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
		if (lastUserMsg) {
			const text = lastUserMsg.blocks
				.filter(
					(b): b is { type: "markdown"; content: string } =>
						b.type === "markdown"
				)
				.map((b) => b.content)
				.join("\n");
			// Remove the last assistant response
			setMessages((prev) => {
				const idx = prev.findLastIndex((m) => m.role === "assistant");
				return idx >= 0 ? prev.slice(0, idx) : prev;
			});
			if (text) handleSend(text);
		}
	}

	// Regenerate this specific assistant response: find the user
	// message that preceded it, drop everything from that assistant
	// message onwards, and resend the user message. Different from
	// handleRetry which always regenerates the LAST assistant message
	// — this works on any turn in the conversation, so you can
	// re-roll an answer from the middle without losing the trailing
	// history (it gets dropped because the new response will replace
	// it on the next stream).
	function handleRegenerate(assistantMessageId: string) {
		const idx = messages.findIndex((m) => m.id === assistantMessageId);
		if (idx === -1) return;
		// Walk backwards from the assistant message to find the user
		// message that triggered it. Usually it's the immediately
		// preceding turn, but multi-tool conversations might have other
		// assistant intermediates — the contract is "the last user
		// message before this assistant response".
		let userIdx = -1;
		for (let i = idx - 1; i >= 0; i--) {
			if (messages[i].role === "user") {
				userIdx = i;
				break;
			}
		}
		if (userIdx === -1) return;
		const userMsg = messages[userIdx];
		const text = userMsg.blocks
			.filter(
				(b): b is { type: "markdown"; content: string } => b.type === "markdown"
			)
			.map((b) => b.content)
			.join("\n");
		if (!text) return;
		// Truncate state to just before the user message — handleSend
		// will re-append the user message and stream a new assistant
		// response after it.
		setMessages((prev) => prev.slice(0, userIdx));
		handleSend(text);
	}

	// Fork the conversation from this message: hits POST
	// /api/conversations/[id]/fork which clones messages [0..idx]
	// into a brand new conversation, then loads the fork so the user
	// can continue along a different path. The original conversation
	// is untouched and stays in the sidebar — they can switch back
	// any time.
	async function handleFork(messageId: string) {
		if (!activeConversationId) return;
		try {
			const res = await fetch(
				`/api/conversations/${activeConversationId}/fork`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ from_message_id: messageId }),
				}
			);
			if (!res.ok) return;
			const data = await res.json();
			const fork = data.conversation;
			if (!fork?.id) return;
			// Refresh sidebar list so the fork shows up at the top, then
			// load it (which sets activeConversationId + replaces the
			// visible message list with the fork's prefix).
			await fetchConversations();
			await loadConversation(fork.id);
		} catch {
			/* network failure — silent, user retries */
		}
	}

	function handleEdit(newContent: string) {
		// Re-send with edited content, removing everything after the edited message
		handleSend(newContent);
	}

	function handleFeedback(
		messageId: string,
		rating: "positive" | "negative",
		comment?: string
	) {
		// Find the message to get preview text
		const msg = messages.find((m) => m.id === messageId);
		const preview = msg?.blocks
			.filter(
				(b): b is { type: "markdown"; content: string } => b.type === "markdown"
			)
			.map((b) => b.content)
			.join(" ")
			.slice(0, 200);

		fetch("/api/chat/feedback", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				messageId,
				rating,
				comment,
				conversationId: activeConversationId,
				messagePreview: preview,
				model: msg?.model,
			}),
		}).catch(() => {});
	}

	function handleSaveAction(action: {
		title: string;
		description: string;
		severity: string;
		estimatedImpact?: number;
	}) {
		// Save the user-discovered action — fire-and-forget
		fetch("/api/chat/actions", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ...action, conversationId: activeConversationId }),
		}).catch(() => {});
	}

	// ── Compute all messages including streaming ──
	const allMessages = streamingMessage?.streaming
		? [...messages, streamingMessage]
		: messages;

	const budgetExhausted = usage ? usage.mcp_remaining <= 0 : false;

	// Remove a single context item from the chip bar.
	function handleRemoveContextItem(id: string, kind: ChatContextKind) {
		setContextItems((prev) =>
			prev.filter((it) => !(it.id === id && it.kind === kind))
		);
	}
	function handleClearAllContext() {
		setContextItems([]);
	}

	// ── Verify flow — plan lifecycle ─────────────
	function initVerificationPlan(item: ChatContextItem) {
		if (item.kind !== "finding") return;
		const strategy = (item.verification_strategy ?? null) as VerificationStrategyKey;
		const template = buildBaseVerificationPlan(strategy);
		const currentUserMessageCount = messages.filter((m) => m.role === "user").length;
		setVerificationPlan({
			findingId: item.id,
			findingTitle: item.title,
			strategy: item.verification_strategy ?? null,
			remediationSteps: item.remediation_steps ?? null,
			effortHours: item.estimated_effort_hours ?? null,
			goalKey: template.goal_key,
			steps: template.steps.map((s) => ({ id: s.id, labelKey: s.label_key })),
			baselineUserMessageCount: currentUserMessageCount,
		});
	}

	function handleDismissVerificationPlan() {
		setVerificationPlan(null);
	}

	async function handleCreateActionFromFinding() {
		if (!verificationPlan) return;
		if (creatingAction) return;
		setCreatingAction(true);
		try {
			const res = await fetch("/api/actions/from-finding", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					finding_id: verificationPlan.findingId,
					title: verificationPlan.findingTitle,
					remediation_steps: verificationPlan.remediationSteps ?? [],
					estimated_effort_hours: verificationPlan.effortHours ?? undefined,
					verified_via_conversation_id: activeConversationId ?? undefined,
				}),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toast.error(
					body?.message ||
						t("verify.plan.create_action_failed"),
				);
				return;
			}
			toast.success(t("verify.plan.create_action_success"));
			setVerificationPlan(null);
		} catch {
			toast.error(t("verify.plan.create_action_failed"));
		} finally {
			setCreatingAction(false);
		}
	}

	return (
		<div
			className='flex overflow-hidden'
			style={{ height: "calc(100vh - 4rem)" }}
		>
			{/* Conversation Sidebar */}
			<ConversationSidebar
				conversations={conversations}
				activeId={activeConversationId}
				onSelect={loadConversation}
				onNew={handleNewChat}
				onDelete={handleDeleteConversation}
				onRename={async (id, title) => {
					try {
						await fetch(`/api/conversations/${id}`, {
							method: "PATCH",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ title }),
						});
						fetchConversations();
					} catch {
						/* continue */
					}
				}}
				collapsed={sidebarCollapsed}
				onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
			/>

			{/* Main Chat Area */}
			<FileUploadZone
				onFilesAdded={(files) =>
					setAttachedFiles((prev) => [...prev, ...files].slice(0, 3))
				}
			>
				<div className='flex min-h-0 flex-1 overflow-hidden'>
					{/* Center column: messages + input */}
					<div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
						{/* Setup banner (non-blocking) */}
						{usage && !usage.domain && (
							<div className='mx-4 mt-2 flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2 sm:mx-6'>
								<svg
									className='h-4 w-4 shrink-0 text-amber-400'
									fill='none'
									viewBox='0 0 24 24'
									strokeWidth={1.5}
									stroke='currentColor'
								>
									<path
										strokeLinecap='round'
										strokeLinejoin='round'
										d='M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z'
									/>
								</svg>
								<p className='flex-1 text-xs text-amber-400/80'>
									{t("setupBanner.prefix")}{" "}
									<button
										onClick={() => router.push("/app/onboarding")}
										className='underline hover:text-amber-300'
									>
										{t("setupBanner.setupLink")}
									</button>{" "}
									{t("setupBanner.suffix")}
								</p>
							</div>
						)}

						{/* Top bar with history toggle + title + playbooks toggle */}
						<div className='flex items-center gap-3 px-4 py-2 sm:px-6'>
							{/* History toggle (visible when sidebar is collapsed) */}
							{sidebarCollapsed && (
								<button
									onClick={() => setSidebarCollapsed(false)}
									className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-edge text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content-secondary'
									title='Show conversations'
								>
									<svg className='h-3.5 w-3.5' viewBox='0 0 16 16' fill='none'>
										<path
											d='M3 5h10M3 8h10M3 11h10'
											stroke='currentColor'
											strokeWidth='1.5'
											strokeLinecap='round'
										/>
									</svg>
								</button>
							)}

							<div className='flex items-center gap-1.5'>
								<h1 className='text-sm font-semibold text-content'>
									{t("title")}
								</h1>
								<span className='group relative inline-flex'>
									<button
										type='button'
										className='flex h-3.5 w-3.5 items-center justify-center rounded-full border border-edge/60 text-[8px] font-semibold text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-muted'
										aria-label='Page info'
									>
										?
									</button>
									<div className='pointer-events-none absolute left-6 top-0 z-50 w-56 rounded-lg border border-edge bg-surface-card px-3 py-2 text-[11px] leading-relaxed text-content-secondary opacity-0 shadow-xl transition-opacity group-hover:opacity-100'>
										{tc("page_tooltips.chat")}
									</div>
								</span>
							</div>

							<div className='flex-1' />
							<button
								onClick={() => setPlaybooksOpen(!playbooksOpen)}
								className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
									playbooksOpen
										? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 shadow-sm dark:text-emerald-400"
										: "border-edge bg-surface-card text-content-secondary hover:border-emerald-500/30 hover:bg-emerald-500/5 hover:text-emerald-600 dark:hover:text-emerald-400"
								}`}
							>
								<svg
									className='h-4 w-4'
									fill='none'
									viewBox='0 0 24 24'
									strokeWidth={1.5}
									stroke='currentColor'
								>
									<path
										strokeLinecap='round'
										strokeLinejoin='round'
										d='M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25'
									/>
								</svg>
								{t("playbooks.label")}
							</button>
						</div>

						{/* Top-of-chat island. Two mutually exclusive shapes:
						    - VerificationPlanIsland when the user arrived via
						      the Verify button (intent=verify). Shows a
						      goal-oriented checklist + progress + "Create
						      Action" terminal CTA.
						    - ContextIsland otherwise — generic scope indicator
						      for discuss / use-as-context flows. */}
						{verificationPlan ? (
							<VerificationPlanIsland
								plan={verificationPlan}
								userMessageCount={messages.filter((m) => m.role === "user").length}
								creating={creatingAction}
								onCreateAction={handleCreateActionFromFinding}
								onDismiss={handleDismissVerificationPlan}
							/>
						) : contextItems.length > 0 ? (
							<ContextIsland
								items={contextItems}
								onRemove={handleRemoveContextItem}
								onClearAll={handleClearAllContext}
							/>
						) : null}

						{/* Messages */}
						<div className='relative min-h-0 flex-1'>
							<div
								ref={scrollContainerRef}
								onScroll={handleScroll}
								className='absolute inset-0 overflow-y-auto px-4 py-4 sm:px-6'
							>
								<div className='mx-auto max-w-3xl space-y-4'>
									{allMessages.length === 0 && !isStreaming && (
										<EmptyState onSuggest={handleSend} />
									)}

									{allMessages.map((msg) => (
										<ChatMessageRenderer
											key={msg.id}
											message={msg}
											onSuggestedPrompt={handleSuggestedPrompt}
											onNavigate={handleNavigate}
											onRetry={handleRetry}
											onEdit={handleEdit}
											onFeedback={handleFeedback}
											onSaveAction={handleSaveAction}
											onRegenerate={handleRegenerate}
											onFork={handleFork}
										/>
									))}

									{/* Error display */}
									{error && !isStreaming && (
										<div className='rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3'>
											<p className='text-sm text-red-400'>{error}</p>
										</div>
									)}

									{/* Question queue indicator */}
									{questionQueue.length > 0 && (
										<div className='text-center'>
											<span className='text-[10px] text-content-faint'>
												{t("queue.followUps", { count: questionQueue.length })}
											</span>
										</div>
									)}

									<div ref={messagesEndRef} />
								</div>
							</div>

							{/* Jump-to-latest pill — only visible when the user has
                scrolled up away from the latest message. Floats above
                the scroll container at the bottom-center so it never
                competes with the chat island below. */}
							{!isAtBottom && allMessages.length > 0 && (
								<button
									onClick={jumpToLatest}
									className='absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-edge bg-surface-card px-3 py-1.5 text-[11px] font-medium text-content-secondary shadow-lg backdrop-blur transition-all hover:border-emerald-600/50 hover:text-emerald-400'
									aria-label={t("jump_to_latest")}
								>
									{t("jump_to_latest")}
									<svg className='h-3 w-3' viewBox='0 0 16 16' fill='none'>
										<path
											d='M4 6l4 4 4-4'
											stroke='currentColor'
											strokeWidth='1.5'
											strokeLinecap='round'
											strokeLinejoin='round'
										/>
									</svg>
								</button>
							)}
						</div>

						{/* Context indicator — rich chip bar attached to the editor */}
						{contextItems.length > 0 && (
							<ContextIndicator
								items={contextItems}
								onRemove={handleRemoveContextItem}
								onClearAll={handleClearAllContext}
							/>
						)}

						{/* Input */}
						<ChatInputBar
							onSend={(text) => {
								handleSend(text);
								setAttachedFiles([]); // Clear files after send
							}}
							disabled={budgetExhausted}
							plan={usage?.plan || "vestigio"}
							selectedModel={selectedModel}
							onModelChange={setSelectedModel}
							attachedFiles={attachedFiles}
							onAttachFiles={(files) =>
								setAttachedFiles((prev) => [...prev, ...files].slice(0, 3))
							}
							onRemoveFile={(idx) =>
								setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))
							}
							mcpPct={usage?.mcp_pct ?? 0}
							mcpUsed={usage?.mcp_used ?? 0}
							mcpLimit={usage?.mcp_limit ?? 0}
							isStreaming={isStreaming}
							onStop={abort}
							stopLabel={t("stop_generating")}
							placeholder={
								budgetExhausted
									? t("input.budgetExhausted")
									: isStreaming
										? t("input.analyzing")
										: undefined
							}
						/>
					</div>

					{/* Playbooks Right Drawer */}
					<div
						className={`shrink-0 overflow-hidden border-l border-edge bg-surface-inset transition-all duration-300 ${
							playbooksOpen ? "w-80" : "w-0 border-l-0"
						}`}
					>
						<div className='flex h-full w-80 flex-col'>
							{/* Drawer header */}
							<div className='flex items-center justify-between border-b border-edge px-4 py-2.5'>
								<span className='text-[11px] font-semibold uppercase tracking-wider text-content-muted'>
									{t("playbooks.label")}
								</span>
								<button
									onClick={() => setPlaybooksOpen(false)}
									className='rounded p-1 text-content-muted hover:bg-surface-card-hover hover:text-content-secondary'
									title={t("playbooks.close")}
								>
									<svg className='h-3.5 w-3.5' viewBox='0 0 16 16' fill='none'>
										<path
											d='M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5'
											stroke='currentColor'
											strokeWidth='1.5'
											strokeLinecap='round'
										/>
									</svg>
								</button>
							</div>

							{/* Drawer content — playbook strings (title, description,
                category) all come from translations now. The long-form
                prompt was already i18n'd via `playbook_prompts.<id>`. */}
							<div className='flex-1 space-y-2 overflow-y-auto p-3'>
								{FEATURED_PLAYBOOKS.map((pb) => (
									<button
										key={pb.id}
										onClick={() => {
											handleSend(t(`playbook_prompts.${pb.id}`));
											setPlaybooksOpen(false);
										}}
										className={`group flex w-full flex-col rounded-lg border bg-surface-card/30 p-3.5 text-left transition-all ${FEATURED_COLORS[pb.color] || FEATURED_COLORS.emerald}`}
									>
										<div className='flex items-center gap-2'>
											<span
												className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${FEATURED_BADGE_COLORS[pb.color] || FEATURED_BADGE_COLORS.emerald}`}
											>
												{t(`featured_playbooks.${pb.id}.category`)}
											</span>
											<span className='text-[10px] text-content-faint'>
												{t("playbooks.queries", { count: pb.queries })}
											</span>
										</div>
										<h3 className='mt-1.5 text-sm font-medium text-content-secondary group-hover:text-content'>
											{t(`featured_playbooks.${pb.id}.title`)}
										</h3>
										<p className='mt-0.5 line-clamp-2 text-xs leading-relaxed text-content-muted'>
											{t(`featured_playbooks.${pb.id}.description`)}
										</p>
										<div className='mt-auto flex items-center justify-end pt-2'>
											<span className='text-[10px] text-content-faint transition-colors group-hover:text-emerald-500'>
												{t("playbooks.usePrompt")} &rarr;
											</span>
										</div>
									</button>
								))}
							</div>
						</div>
					</div>
				</div>
			</FileUploadZone>
		</div>
	);
}

// ── Empty State ──────────────────────────────
//
// Quick-question presets and featured playbooks used to be hardcoded
// English literals, which meant operators on pt-BR / es accounts saw
// English buttons in the empty state and English playbook titles in
// the right drawer despite using a fully translated chat. Now both
// lists are id-only — the human-readable strings come from
// `console.chat.quick_presets.<id>.{text,label}` and
// `console.chat.featured_playbooks.<id>.{title,description,category}`
// in the dictionary, with the long-form prompts already living under
// `console.chat.playbook_prompts.<id>` (that namespace pre-existed).

const QUICK_PRESET_IDS = [
	"losing_money",
	"scale_traffic",
	"fix_first",
	"chargeback_risk",
	"recent_changes",
	"regressions",
] as const;

interface FeaturedPlaybook {
	id: string;
	color: string;
	queries: number;
}

// Visual metadata only — text comes from translations.
const FEATURED_PLAYBOOKS: FeaturedPlaybook[] = [
	{ id: "revenue_leak_full_audit", color: "red", queries: 2 },
	{ id: "conversion_bottleneck", color: "emerald", queries: 3 },
	{ id: "trust_signal_audit", color: "violet", queries: 2 },
	{ id: "executive_summary", color: "amber", queries: 3 },
	{ id: "cross_pack_correlation", color: "cyan", queries: 3 },
];

const FEATURED_COLORS: Record<string, string> = {
	red: "border-red-500/30 hover:border-red-500/60 hover:bg-red-500/5",
	emerald:
		"border-emerald-500/30 hover:border-emerald-500/60 hover:bg-emerald-500/5",
	violet:
		"border-violet-500/30 hover:border-violet-500/60 hover:bg-violet-500/5",
	amber: "border-amber-500/30 hover:border-amber-500/60 hover:bg-amber-500/5",
	cyan: "border-cyan-500/30 hover:border-cyan-500/60 hover:bg-cyan-500/5",
};

const FEATURED_BADGE_COLORS: Record<string, string> = {
	red: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
	emerald:
		"bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
	violet:
		"bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30",
	amber:
		"bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
	cyan: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
};

// ── Context Indicator (chip bar above the editor) ──────────
//
// Renders one chip per attached context item, anchored to the top
// edge of the chat input island so the user always sees what the
// next message will be discussed against. Each chip carries a
// kind-coloured icon, the resolved title (truncated), and a per-item
// remove button. When more than one item is attached, a "clear all"
// affordance appears at the right edge of the bar.
//
// The visual language matches Vestigio's existing chip pattern (used
// for attached files in ChatInputBar) so the bar feels native to the
// island below it instead of a separate banner.

const CONTEXT_KIND_STYLES: Record<
	ChatContextKind,
	{ chip: string; icon: string }
> = {
	finding: {
		chip: "border-red-500/40 bg-red-500/10 text-red-700 hover:border-red-500/70 dark:text-red-300",
		icon: "text-red-600 dark:text-red-400",
	},
	action: {
		chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:border-emerald-500/70 dark:text-emerald-300",
		icon: "text-emerald-600 dark:text-emerald-400",
	},
	workspace: {
		chip: "border-violet-500/40 bg-violet-500/10 text-violet-700 hover:border-violet-500/70 dark:text-violet-300",
		icon: "text-violet-600 dark:text-violet-400",
	},
	surface: {
		chip: "border-cyan-500/40 bg-cyan-500/10 text-cyan-700 hover:border-cyan-500/70 dark:text-cyan-300",
		icon: "text-cyan-600 dark:text-cyan-400",
	},
};

function ContextKindIcon({
	kind,
	className,
}: {
	kind: ChatContextKind;
	className?: string;
}) {
	if (kind === "finding") {
		return (
			<svg
				className={className}
				fill='none'
				viewBox='0 0 24 24'
				strokeWidth={2}
				stroke='currentColor'
			>
				<path
					strokeLinecap='round'
					strokeLinejoin='round'
					d='M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z'
				/>
			</svg>
		);
	}
	if (kind === "action") {
		return (
			<svg
				className={className}
				fill='none'
				viewBox='0 0 24 24'
				strokeWidth={2}
				stroke='currentColor'
			>
				<path
					strokeLinecap='round'
					strokeLinejoin='round'
					d='M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z'
				/>
			</svg>
		);
	}
	if (kind === "workspace") {
		return (
			<svg
				className={className}
				fill='none'
				viewBox='0 0 24 24'
				strokeWidth={2}
				stroke='currentColor'
			>
				<path
					strokeLinecap='round'
					strokeLinejoin='round'
					d='M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z'
				/>
			</svg>
		);
	}
	return (
		<svg
			className={className}
			fill='none'
			viewBox='0 0 24 24'
			strokeWidth={2}
			stroke='currentColor'
		>
			<path
				strokeLinecap='round'
				strokeLinejoin='round'
				d='M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418'
			/>
		</svg>
	);
}

// ContextIsland — prominent top-of-chat scope indicator.
//
// Renders when one or more findings/actions/workspaces/surfaces are
// hydrated into the conversation via URL params (discuss / use as
// context flows). Collapsed by default showing just count + headline
// impact — expand to see the full chip list with per-item remove.
//
// Distinct from ContextIndicator (which sits above the input as an
// editor-attached chip bar). The island makes the conversation scope
// visible throughout the chat scroll, not just when the user is about
// to type.
function ContextIsland({
	items,
	onRemove,
	onClearAll,
}: {
	items: ChatContextItem[];
	onRemove: (id: string, kind: ChatContextKind) => void;
	onClearAll: () => void;
}) {
	const t = useTranslations("console.chat.context");
	const [expanded, setExpanded] = useState(false);

	const kindLabels: Record<ChatContextKind, string> = {
		finding: t("kinds.finding"),
		action: t("kinds.action"),
		workspace: t("kinds.workspace"),
		surface: t("kinds.surface"),
	};

	// Aggregate monthly impact across items that carry it — findings +
	// actions typically do, workspaces/surfaces don't. Displayed as a
	// single value next to the scope headline.
	const totalImpactMid = items.reduce(
		(sum, item) => sum + (item.impact_mid || 0),
		0,
	);
	const showImpact = totalImpactMid > 0;

	// Headline copy: "focused on 1 finding" vs "focused on 3 items"
	// (keep it multi-kind aware when ≥2 items).
	const headline =
		items.length === 1
			? t("island.scoped_to_one", { kind: kindLabels[items[0].kind] })
			: t("island.scoped_to_many", { count: items.length });

	// Primary accent color picks the first item's kind — consistent
	// visual identity when user deep-links a single finding / action.
	const primaryKind = items[0].kind;
	const accentClass = CONTEXT_KIND_STYLES[primaryKind].icon;

	return (
		<div className='border-b border-edge bg-gradient-to-r from-emerald-500/5 via-surface-card to-surface-card px-4 py-2.5 sm:px-6'>
			<div className='flex items-center gap-3'>
				{/* Accent indicator + headline */}
				<div className='flex min-w-0 flex-1 items-center gap-2.5'>
					<span className={`flex h-2 w-2 shrink-0 rounded-full ${accentClass.replace('text-', 'bg-')}`} />
					<ContextKindIcon
						kind={primaryKind}
						className={`h-4 w-4 shrink-0 ${accentClass}`}
					/>
					<span className='truncate text-sm font-medium text-content'>
						{headline}
					</span>
					{showImpact && (
						<span className='hidden shrink-0 rounded-md border border-edge bg-surface-inset px-2 py-0.5 font-mono text-[11px] text-content-secondary sm:inline-flex'>
							{t("island.total_impact", {
								amount: `$${Math.round(totalImpactMid).toLocaleString()}`,
							})}
						</span>
					)}
				</div>

				{/* Expand / collapse toggle */}
				<button
					type='button'
					onClick={() => setExpanded((x) => !x)}
					className='flex shrink-0 items-center gap-1 rounded-md border border-edge bg-surface-card px-2 py-1 text-[11px] font-medium text-content-secondary transition-colors hover:border-edge-strong hover:bg-surface-card-hover'
				>
					{expanded ? t("island.hide") : t("island.show")}
					<svg
						className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
						fill='none'
						viewBox='0 0 16 16'
					>
						<path
							d='M4 6l4 4 4-4'
							stroke='currentColor'
							strokeWidth='1.5'
							strokeLinecap='round'
							strokeLinejoin='round'
						/>
					</svg>
				</button>

				{items.length > 1 && (
					<button
						type='button'
						onClick={onClearAll}
						className='shrink-0 rounded-md px-2 py-1 text-[11px] text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-secondary'
					>
						{t("clear_all")}
					</button>
				)}
			</div>

			{/* Expanded chip list — same styling family as the bottom
			    ContextIndicator so users recognize it as the same concept
			    (scoped context), just at a different scroll position. */}
			{expanded && (
				<div className='mt-2.5 flex flex-wrap gap-1.5'>
					{items.map((item) => {
						const styles = CONTEXT_KIND_STYLES[item.kind];
						const label = kindLabels[item.kind];
						return (
							<div
								key={`island:${item.kind}:${item.id}`}
								className={`group flex max-w-[320px] items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors ${styles.chip}`}
								title={`${label}: ${item.title}`}
							>
								<ContextKindIcon
									kind={item.kind}
									className={`h-3 w-3 shrink-0 ${styles.icon}`}
								/>
								<span className='truncate font-medium'>{item.title}</span>
								{item.impact_mid != null && item.impact_mid > 0 && (
									<span className='shrink-0 rounded bg-surface-card/60 px-1 font-mono text-[10px] text-content-muted'>
										${Math.round(item.impact_mid / 1000)}k
									</span>
								)}
								<button
									type='button'
									onClick={() => onRemove(item.id, item.kind)}
									className='-mr-0.5 ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-current opacity-60 transition-opacity hover:opacity-100'
									aria-label={t("remove_aria_label", {
										kind: label.toLowerCase(),
									})}
								>
									<svg className='h-2.5 w-2.5' viewBox='0 0 16 16' fill='none'>
										<path
											d='M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5'
											stroke='currentColor'
											strokeWidth='1.75'
											strokeLinecap='round'
										/>
									</svg>
								</button>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

// VerificationPlanIsland — verify-flow variant of ContextIsland.
//
// Renders at the top of the messages area when the user arrived via
// a Verify button (`?intent=verify&finding=<id>`). Shows goal +
// numbered checklist + progress + "Up next" teaser + terminal
// "Create Action" CTA. Progress auto-advances with each user
// message (baseline = count at plan creation, subtracted off).
function VerificationPlanIsland({
	plan,
	userMessageCount,
	creating,
	onCreateAction,
	onDismiss,
}: {
	plan: VerificationPlanState;
	userMessageCount: number;
	creating: boolean;
	onCreateAction: () => void;
	onDismiss: () => void;
}) {
	const t = useTranslations();

	const rawProgress = Math.max(
		0,
		userMessageCount - plan.baselineUserMessageCount - 1,
	);
	const currentIndex = Math.min(rawProgress, plan.steps.length - 1);
	const isTerminal = currentIndex >= plan.steps.length - 1;
	const percentDone = Math.round(
		(currentIndex / Math.max(1, plan.steps.length - 1)) * 100,
	);
	const nextStep = !isTerminal ? plan.steps[currentIndex + 1] : null;

	return (
		<div className='border-b border-edge bg-gradient-to-r from-amber-500/5 via-surface-card to-surface-card px-4 py-3 sm:px-6'>
			<div className='flex items-start gap-3'>
				<span className='mt-1.5 flex h-2 w-2 shrink-0 rounded-full bg-amber-400' />
				<div className='min-w-0 flex-1'>
					<div className='flex items-baseline gap-2'>
						<span className='font-mono text-[11px] uppercase tracking-wider text-amber-500/80'>
							{t("console.chat.verify.plan.title")}
						</span>
						<span className='truncate text-[11px] text-content-muted'>
							{plan.findingTitle}
						</span>
					</div>
					<h3 className='mt-0.5 truncate text-sm font-semibold text-content'>
						{t(plan.goalKey)}
					</h3>

					<div className='mt-2 h-[3px] w-full overflow-hidden rounded-full bg-surface-inset'>
						<div
							className='h-full rounded-full bg-amber-400 transition-all duration-300'
							style={{ width: `${percentDone}%` }}
						/>
					</div>

					<ol className='mt-2.5 space-y-1.5'>
						{plan.steps.map((step, idx) => {
							const done = idx < currentIndex;
							const active = idx === currentIndex;
							return (
								<li
									key={step.id}
									className={`flex items-start gap-2 text-[12px] leading-snug transition-colors ${
										done
											? "text-content-muted"
											: active
												? "text-content"
												: "text-content-faint"
									}`}
								>
									<span
										className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold ${
											done
												? "border-amber-400/50 bg-amber-400/20 text-amber-400"
												: active
													? "border-amber-400 bg-amber-400/10 text-amber-400"
													: "border-edge text-content-faint"
										}`}
									>
										{done ? "✓" : idx + 1}
									</span>
									<span className={done ? "line-through" : ""}>
										{t(step.labelKey)}
									</span>
								</li>
							);
						})}
					</ol>

					{nextStep && (
						<div className='mt-2.5 flex items-center gap-2 border-t border-edge/50 pt-2 text-[11px]'>
							<span className='text-content-faint'>
								{t("console.chat.verify.plan.up_next")}
							</span>
							<span className='truncate text-content-secondary'>
								{t(nextStep.labelKey)}
							</span>
						</div>
					)}

					{isTerminal && (
						<div className='mt-3'>
							<button
								type='button'
								onClick={onCreateAction}
								disabled={creating}
								className='w-full rounded-md border border-amber-400/50 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-500 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60'
							>
								{creating
									? t("console.chat.verify.plan.creating_action")
									: t("console.chat.verify.plan.create_action_cta")}
							</button>
						</div>
					)}
				</div>

				<button
					type='button'
					onClick={onDismiss}
					aria-label={t("console.chat.verify.plan.dismiss_aria")}
					className='shrink-0 rounded p-1 text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-secondary'
				>
					<svg className='h-3.5 w-3.5' viewBox='0 0 16 16' fill='none'>
						<path
							d='M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5'
							stroke='currentColor'
							strokeWidth='1.75'
							strokeLinecap='round'
						/>
					</svg>
				</button>
			</div>
		</div>
	);
}

function ContextIndicator({
	items,
	onRemove,
	onClearAll,
}: {
	items: ChatContextItem[];
	onRemove: (id: string, kind: ChatContextKind) => void;
	onClearAll: () => void;
}) {
	const t = useTranslations("console.chat.context");
	const labels: Record<ChatContextKind, string> = {
		finding: t("kinds.finding"),
		action: t("kinds.action"),
		workspace: t("kinds.workspace"),
		surface: t("kinds.surface"),
	};

	return (
		<div className='flex items-start gap-2 border-t border-edge bg-surface-card/40 px-4 py-2 sm:px-6'>
			<div className='flex shrink-0 items-center gap-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-content-muted'>
				<svg
					className='h-3 w-3 text-emerald-500'
					fill='none'
					viewBox='0 0 24 24'
					strokeWidth={2.5}
					stroke='currentColor'
				>
					<path
						strokeLinecap='round'
						strokeLinejoin='round'
						d='M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244'
					/>
				</svg>
				{t("title") /* legacy label */}
			</div>
			<div className='flex min-w-0 flex-1 flex-wrap gap-1.5'>
				{items.map((item) => {
					const styles = CONTEXT_KIND_STYLES[item.kind];
					const label = labels[item.kind];
					return (
						<div
							key={`${item.kind}:${item.id}`}
							className={`group flex max-w-[260px] items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors ${styles.chip}`}
							title={`${label}: ${item.title}`}
						>
							<ContextKindIcon
								kind={item.kind}
								className={`h-3 w-3 shrink-0 ${styles.icon}`}
							/>
							<span className='truncate font-medium'>{item.title}</span>
							<button
								type='button'
								onClick={() => onRemove(item.id, item.kind)}
								className='-mr-0.5 ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-current opacity-60 transition-opacity hover:opacity-100'
								aria-label={t("remove_aria_label", {
									kind: label.toLowerCase(),
								})}
							>
								<svg className='h-2.5 w-2.5' viewBox='0 0 16 16' fill='none'>
									<path
										d='M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5'
										stroke='currentColor'
										strokeWidth='1.75'
										strokeLinecap='round'
									/>
								</svg>
							</button>
						</div>
					);
				})}
			</div>
			{items.length > 1 && (
				<button
					type='button'
					onClick={onClearAll}
					className='shrink-0 self-start rounded px-1.5 py-1 text-[10px] text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-secondary'
				>
					{t("clear_all")}
				</button>
			)}
		</div>
	);
}

// Build the auto-send prompt that pre-populates the chat when the
// user lands here from a "Discuss" / "Use as context" CTA. The
// resolved titles are interpolated so the LLM sees human-readable
// names; the IDs come along too so internal tools can resolve them
// deterministically. The prompt shape mirrors the legacy phrasings
// so the LLM playbooks that key off "discuss finding" / "analyze
// these N findings" / "use these items as context" still trigger.
function buildContextPrompt(items: ChatContextItem[], t: any): string {
	const prompt = (key: string, values?: Record<string, string | number>) =>
		t(`context.prompts.${key}`, values);

	if (items.length === 0) {
		return prompt("empty");
	}
	if (items.length === 1) {
		const it = items[0];
		if (it.kind === "finding") {
			return prompt("single_finding", { title: it.title, id: it.id });
		}
		if (it.kind === "action") {
			return prompt("single_action", { title: it.title, id: it.id });
		}
		if (it.kind === "workspace") {
			return prompt("single_workspace", { title: it.title, id: it.id });
		}
		return prompt("single_surface", { title: it.title, id: it.id });
	}

	const findings = items.filter((i) => i.kind === "finding");
	const actions = items.filter((i) => i.kind === "action");
	const workspaces = items.filter((i) => i.kind === "workspace");
	const surfaces = items.filter((i) => i.kind === "surface");

	const parts: string[] = [];
	if (findings.length > 0) {
		parts.push(
			prompt("group_findings", {
				count: findings.length,
				titles: findings.map((f) => `"${f.title}"`).join(", "),
			})
		);
	}
	if (actions.length > 0) {
		parts.push(
			prompt("group_actions", {
				count: actions.length,
				titles: actions.map((a) => `"${a.title}"`).join(", "),
			})
		);
	}
	if (workspaces.length > 0) {
		parts.push(
			prompt("group_workspaces", {
				count: workspaces.length,
				titles: workspaces.map((w) => `"${w.title}"`).join(", "),
			})
		);
	}
	if (surfaces.length > 0) {
		parts.push(
			prompt("group_surfaces", {
				count: surfaces.length,
				titles: surfaces.map((s) => s.title).join(", "),
			})
		);
	}

	return prompt("combined", { parts: parts.join(", ") });
}

// Verify-flavoured seed prompt. Kicks the MCP into "walk the user
// through verifying this finding and produce an Action" mode. The
// strategy hint gives the LLM a playbook anchor; the remediation
// steps give it authored remediation to narrate rather than
// inventing new guidance. The final "When the user is ready..." line
// nudges the LLM to direct them toward the terminal Create Action
// CTA in the island instead of trailing off.
function buildVerifyPrompt(item: ChatContextItem, t: any): string {
	const strategy = item.verification_strategy || "unclassified";
	const steps = Array.isArray(item.remediation_steps) && item.remediation_steps.length > 0
		? item.remediation_steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n")
		: "  (none authored yet — propose remediation from first principles)";
	return t("verify.prompts.seed", {
		title: item.title,
		id: item.id,
		strategy,
		steps,
	});
}

// Preset visual metadata — color accent per question topic
const PRESET_STYLE: Record<string, { accent: string; gradient: string }> = {
	losing_money: { accent: "text-red-400", gradient: "from-red-500/[0.04]" },
	scale_traffic: { accent: "text-amber-400", gradient: "from-amber-500/[0.04]" },
	fix_first: { accent: "text-emerald-400", gradient: "from-emerald-500/[0.04]" },
	chargeback_risk: { accent: "text-red-400", gradient: "from-red-500/[0.04]" },
	recent_changes: { accent: "text-sky-400", gradient: "from-sky-500/[0.04]" },
	regressions: { accent: "text-violet-400", gradient: "from-violet-500/[0.04]" },
};

function EmptyState({ onSuggest }: { onSuggest: (text: string) => void }) {
	const t = useTranslations("console.chat");
	const [tipsOpen, setTipsOpen] = useState(false);
	return (
		<div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-12">
			{/* Logo mark */}
			<div className="relative mb-5 flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-edge bg-surface-card shadow-lg">
				<div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/[0.06] via-transparent to-transparent" />
				<svg className="relative h-6 w-6 text-emerald-400" viewBox="0 0 24 24" fill="none">
					<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			</div>

			<h2 className="text-lg font-semibold text-content">
				{t("emptyState.title")}
			</h2>
			<p className="mt-1 max-w-md text-center text-[13px] leading-relaxed text-content-muted">
				{t("emptyState.description")}
			</p>

			{/* Quick questions — 3x2 grid styled as dashboard widget cards */}
			<div className="mt-6 grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
				{QUICK_PRESET_IDS.map((id) => {
					const style = PRESET_STYLE[id] || PRESET_STYLE.losing_money;
					return (
						<button
							key={id}
							onClick={() => onSuggest(t(`quick_presets.${id}.text`))}
							className="group relative overflow-hidden rounded-2xl border border-edge bg-surface-card px-4 py-3 text-left shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:border-content-faint hover:shadow-xl"
						>
							<div className={`pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br ${style.gradient} via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100`} />
							<span className={`relative block font-mono text-[11px] font-medium tabular-nums ${style.accent} mb-1 opacity-60`}>
								{String(QUICK_PRESET_IDS.indexOf(id) + 1).padStart(2, "0")}
							</span>
							<span className="relative block text-[12px] font-medium leading-snug text-content-secondary group-hover:text-content">
								{t(`quick_presets.${id}.label`)}
							</span>
						</button>
					);
				})}
			</div>

			<p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
				{t("emptyState.playbooksHint")}
			</p>

			{/* Onboarding tips */}
			<button
				onClick={() => setTipsOpen(!tipsOpen)}
				className="mt-5 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] text-content-muted transition-colors hover:text-content-secondary"
			>
				<svg className="h-3 w-3" viewBox="0 0 16 16" fill="none">
					<path d="M8 1.5a4.5 4.5 0 00-2.5 8.25V11h5V9.75A4.5 4.5 0 008 1.5zM6 13h4M7 14.5h2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
				{t("emptyState.tips_toggle")}
				<svg className={`h-2.5 w-2.5 transition-transform ${tipsOpen ? "rotate-180" : ""}`} viewBox="0 0 16 16" fill="none">
					<path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			</button>
			{tipsOpen && (
				<div className="mt-3 w-full max-w-md overflow-hidden rounded-2xl border border-edge bg-surface-card p-4 shadow-lg">
					<ul className="space-y-2 text-[11px] text-content-muted">
						{(["natural", "context", "playbooks", "files", "voice"] as const).map((key) => (
							<li key={key} className="flex gap-2">
								<span className="mt-[1px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/50" />
								<span>{t(`emptyState.tips.${key}`)}</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
