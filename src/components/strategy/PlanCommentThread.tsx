"use client";

import { useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import type { PlanComment } from "./types";

/*
 * Inline collapsible thread under a plan section. Per user choice:
 * inline (NOT a side drawer) so the comment context stays glued to
 * the section being discussed.
 *
 * MCP-authored comments carry a distinct avatar + label; user
 * comments show authorName. The composer at the bottom POSTs to
 * /api/library/strategy/[month]/comments with sectionId.
 *
 * Open/closed state is local-only — the parent (NextSteps card or
 * any section) renders this with `defaultOpen` if the comments list
 * is non-empty so threads are visible on first paint.
 */

interface Props {
	comments: PlanComment[];
	sectionId: string;
	envId: string;
	month: string;
	planId: string;
	/** When true the thread is expanded on first paint. Typically
	    true when comments.length > 0, false when empty. */
	defaultOpen?: boolean;
}

export default function PlanCommentThread({
	comments,
	sectionId,
	envId,
	month,
	defaultOpen = false,
}: Props) {
	const router = useRouter();
	const [open, setOpen] = useState(defaultOpen);
	const [draft, setDraft] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submit = async () => {
		const body = draft.trim();
		if (!body) return;
		setBusy(true);
		setError(null);
		try {
			const res = await fetch(`/api/library/strategy/${month}/comments`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ envId, sectionId, body }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError(data?.message ?? `Falhou (HTTP ${res.status})`);
				return;
			}
			setDraft("");
			router.refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Erro de rede");
		} finally {
			setBusy(false);
		}
	};

	const count = comments.length;

	return (
		<Collapsible.Root open={open} onOpenChange={setOpen} className="mt-3 border-t border-edge/60 pt-3">
			<Collapsible.Trigger asChild>
				<button
					type="button"
					className="group inline-flex items-center gap-1.5 text-[12px] text-content-muted transition-colors hover:text-content"
				>
					<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
						<path
							d="M1.5 2.5h10v6.5h-5L4 11V9h-2.5z"
							stroke="currentColor"
							strokeWidth="1.1"
							strokeLinejoin="round"
						/>
					</svg>
					{count === 0
						? "Comentar"
						: `${count} ${count === 1 ? "comentário" : "comentários"}`}
					<span className="ml-1 text-content-faint transition-transform group-data-[state=open]:rotate-180">
						▾
					</span>
				</button>
			</Collapsible.Trigger>
			<Collapsible.Content>
				<AnimatePresence>
					{open && (
						<motion.div
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: "auto" }}
							exit={{ opacity: 0, height: 0 }}
							transition={{ duration: 0.25 }}
							className="overflow-hidden"
						>
							<ul className="mt-3 space-y-3">
								{comments.length === 0 && (
									<li className="text-[12px] italic text-content-faint">
										Nenhum comentário ainda. Seja o primeiro a comentar nesta seção.
									</li>
								)}
								{comments.map((c) => (
									<CommentRow key={c.id} comment={c} />
								))}
							</ul>
							<div className="mt-3 flex flex-col gap-2 rounded-md border border-edge bg-surface-card p-2">
								<textarea
									value={draft}
									onChange={(e) => setDraft(e.target.value)}
									placeholder="Escreva um comentário. Use @vestigio para chamar a IA na thread."
									className="min-h-[60px] resize-y rounded-md border border-edge bg-surface px-2 py-1.5 text-[13px] text-content placeholder:text-content-faint focus:border-edge-focus focus:outline-none"
									maxLength={4000}
								/>
								{error && (
									<div className="text-[11px] text-rose-300/90">{error}</div>
								)}
								<div className="flex items-center justify-between gap-3">
									<span className="text-[10px] text-content-faint">
										{draft.length}/4000 · markdown leve suportado
									</span>
									<button
										type="button"
										onClick={submit}
										disabled={busy || draft.trim().length === 0}
										className="rounded-md border border-edge bg-surface-card-hover px-3 py-1 text-[12px] font-medium text-content transition-colors hover:bg-surface-inset disabled:opacity-50"
									>
										{busy ? "Enviando…" : "Comentar"}
									</button>
								</div>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</Collapsible.Content>
		</Collapsible.Root>
	);
}

function CommentRow({ comment }: { comment: PlanComment }) {
	const isMcp = comment.authorKind === "mcp";
	const date = new Date(comment.createdAt);
	const ago = relativeTime(date);
	return (
		<li className="flex gap-3">
			<div
				className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
					isMcp
						? "border-accent-text/40 bg-accent-subtle-bg text-accent-text"
						: "border-edge bg-surface-card text-content-secondary"
				}`}
				title={isMcp ? "Vestigio (MCP)" : comment.authorName}
			>
				{isMcp ? "V" : comment.authorName.charAt(0).toUpperCase()}
			</div>
			<div className="min-w-0 flex-1">
				<div className="mb-0.5 flex items-baseline gap-2 text-[11px]">
					<span
						className={`font-semibold ${
							isMcp ? "text-accent-text" : "text-content-secondary"
						}`}
					>
						{isMcp ? "Vestigio" : comment.authorName}
					</span>
					<span className="text-content-faint">{ago}</span>
				</div>
				<div className="whitespace-pre-wrap text-[13px] leading-snug text-content">
					{comment.body}
				</div>
			</div>
		</li>
	);
}

function relativeTime(date: Date): string {
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
	if (seconds < 60) return "agora";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `há ${minutes}min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `há ${hours}h`;
	const days = Math.floor(hours / 24);
	return `há ${days}d`;
}
