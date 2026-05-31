"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import type { PendingPlanEdit } from "./types";

/*
 * Inline banner above a plan section when an MCP (or user) edit
 * proposal is pending admin review. Admins see Aprovar / Recusar
 * controls; members see a read-only "Vestigio sugere mudança" hint.
 *
 * Implementation per spec §6: "MCP sugere mudar isso pra X. Aceitar?"
 * — a clearly differentiated affordance, not a "ghost" inline diff
 * (the operator should always know what the canonical content is
 * and what the proposed change would do).
 *
 * Approve calls POST /api/library/strategy/[month]/edits/[editId]/
 * approve which atomically applies the change + snapshots a
 * PlanVersion. router.refresh() re-fetches the route's data so the
 * banner disappears + the underlying section shows the new content.
 */

interface Props {
	edit: PendingPlanEdit;
	month: string;
	envId: string;
	canApprove: boolean;
}

export default function PlanEditBanner({ edit, month, envId, canApprove }: Props) {
	const router = useRouter();
	const [busy, setBusy] = useState<null | "approve" | "reject">(null);
	const [error, setError] = useState<string | null>(null);

	const handleDecision = async (decision: "approve" | "reject") => {
		setBusy(decision);
		setError(null);
		try {
			const res = await fetch(
				`/api/library/strategy/${month}/edits/${edit.id}/${decision}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ envId }),
				},
			);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError(data?.message ?? `Falhou (HTTP ${res.status})`);
				return;
			}
			router.refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Erro de rede");
		} finally {
			setBusy(null);
		}
	};

	const proposedAt = new Date(edit.proposedAt);
	const ago = relativeTime(proposedAt);

	return (
		<motion.div
			initial={{ opacity: 0, y: -8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.3 }}
			className="mb-4 overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/[0.05]"
		>
			<div className="flex items-start gap-3 px-4 py-3">
				<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
						<path
							d="M7 1v6M7 9.5v0.5M1 12.5h12L7 1.5L1 12.5z"
							stroke="currentColor"
							strokeWidth="1.4"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</div>
				<div className="min-w-0 flex-1">
					<div className="mb-0.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200/80">
						<span>{edit.editorKind === "mcp" ? "Vestigio sugere" : edit.editorName + " sugere"}</span>
						<span className="text-amber-200/40">·</span>
						<span>{ago}</span>
					</div>
					{edit.reason && (
						<div className="mb-2 font-serif text-[13px] leading-snug text-content-secondary">
							{edit.reason}
						</div>
					)}
					<details className="text-[12px] text-content-muted">
						<summary className="cursor-pointer select-none text-content-secondary hover:text-content">
							Ver mudança proposta
						</summary>
						<div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
							<div className="rounded-md border border-edge bg-surface-card p-2">
								<div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-content-faint">
									Antes
								</div>
								<div className="whitespace-pre-wrap text-[12px] text-content-muted">
									{edit.beforeText || "(vazio)"}
								</div>
							</div>
							<div className="rounded-md border border-amber-500/30 bg-amber-500/[0.04] p-2">
								<div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-200/70">
									Depois
								</div>
								<div className="whitespace-pre-wrap text-[12px] text-content">
									{edit.afterText}
								</div>
							</div>
						</div>
					</details>
				</div>
				{canApprove && (
					<div className="flex shrink-0 flex-col gap-1.5">
						<button
							type="button"
							onClick={() => handleDecision("approve")}
							disabled={busy !== null}
							className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-medium text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
						>
							{busy === "approve" ? "Aprovando…" : "Aprovar"}
						</button>
						<button
							type="button"
							onClick={() => handleDecision("reject")}
							disabled={busy !== null}
							className="rounded-md border border-edge bg-surface-card px-3 py-1.5 text-[12px] font-medium text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content disabled:opacity-50"
						>
							{busy === "reject" ? "Recusando…" : "Recusar"}
						</button>
					</div>
				)}
			</div>
			{error && (
				<div className="border-t border-amber-500/20 bg-rose-500/5 px-4 py-2 text-[12px] text-rose-200/90">
					{error}
				</div>
			)}
		</motion.div>
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
