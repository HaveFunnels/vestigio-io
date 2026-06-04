"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import toast from "react-hot-toast";
import { PlusIcon } from "@phosphor-icons/react/dist/ssr";

// ──────────────────────────────────────────────
// InventoryAddUrl — Wave-22.6 review fix P2.3
//
// Compact icon button next to the export-CSV control. Pops a small
// inline form to submit a URL the crawler missed. POSTs to
// /api/inventory/manual which upserts a PageInventoryItem with
// discoverySource = "manual" so it persists across cycles.
// ──────────────────────────────────────────────

export default function InventoryAddUrl() {
	const locale = useLocale();
	const isPt = locale.startsWith("pt");
	const [open, setOpen] = useState(false);
	const [url, setUrl] = useState("");
	const [submitting, setSubmitting] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!url.trim() || submitting) return;
		setSubmitting(true);
		try {
			const res = await fetch("/api/inventory/manual", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: url.trim() }),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toast.error(body?.message ?? (isPt ? "Erro ao adicionar URL" : "Failed to add URL"));
				return;
			}
			toast.success(isPt ? "URL adicionada à auditoria" : "URL added to audit");
			setUrl("");
			setOpen(false);
			window.location.reload();
		} finally {
			setSubmitting(false);
		}
	}

	const label = isPt ? "Adicionar URL" : "Add URL";

	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-label={label}
				title={label}
				className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-edge bg-surface-card text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content"
			>
				<PlusIcon size={14} weight="regular" />
			</button>
			{open && (
				<form
					onSubmit={handleSubmit}
					className="absolute right-0 top-full z-50 mt-1 flex w-80 items-center gap-1.5 rounded-lg border border-edge bg-surface-card p-2 shadow-xl"
				>
					<input
						type="url"
						required
						autoFocus
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder={isPt ? "https://seusite.com/url" : "https://yoursite.com/url"}
						className="min-w-0 flex-1 rounded-md border border-edge bg-surface-inset px-2 py-1 text-[12px] text-content placeholder:text-content-faint focus:border-edge-focus focus:outline-none"
					/>
					<button
						type="submit"
						disabled={submitting}
						className="rounded-md border border-edge px-2 py-1 text-[11px] font-medium text-content-secondary transition-colors hover:bg-surface-card-hover hover:text-content disabled:opacity-50"
					>
						{submitting ? (isPt ? "…" : "…") : isPt ? "Adicionar" : "Add"}
					</button>
					<button
						type="button"
						onClick={() => { setOpen(false); setUrl(""); }}
						aria-label={isPt ? "Cancelar" : "Cancel"}
						className="px-1 text-[14px] text-content-faint hover:text-content-muted"
					>
						×
					</button>
				</form>
			)}
		</div>
	);
}
