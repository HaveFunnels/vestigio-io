"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";
import type { CrawlProgress } from "@/types/crawl-progress";

// ──────────────────────────────────────────────
// CrawlStatusWidget — sticky banner topo do form
//
// Aparece após o step 1 (domain submetido + early-crawl dispatched).
// Estados:
//   - fetching → shimmer skeleton + "Analisando seu site…"
//   - ready    → "X páginas mapeadas · Stack: Y, Z"
//   - error    → escondido (sem alarme; o run-audit final cobre)
//   - idle/null → escondido
//
// Posicionamento: sticky top via parent. Cabe em chrome do StepShell —
// StepShell já tem header sticky com z-10, banner fica acima dele via
// stacking order (renderizado antes no DOM, mesmo z, ordem visual).
// ──────────────────────────────────────────────

interface Props {
	progress: CrawlProgress | null;
}

export default function CrawlStatusWidget({ progress }: Props) {
	if (!progress || progress.status === "idle" || progress.status === "error") {
		return null;
	}

	const isFetching = progress.status === "fetching";
	const stackPreview = progress.stack.slice(0, 4);
	const moreCount = Math.max(0, progress.stack.length - stackPreview.length);

	return (
		<AnimatePresence>
			<motion.div
				key="crawl-status"
				initial={{ opacity: 0, y: -8 }}
				animate={{ opacity: 1, y: 0 }}
				exit={{ opacity: 0, y: -8 }}
				transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
			>
				<div className="flex items-center gap-3 rounded-xl border border-edge bg-surface-card px-3.5 py-2.5">
					{isFetching ? (
						<>
							{/* Shimmer skeleton — pulse loop, never spinner */}
							<div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-lg bg-emerald-50 dark:bg-emerald-500/15">
								<div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-emerald-200/60 to-transparent dark:via-emerald-400/20" />
							</div>
							<div className="flex-1 space-y-1.5">
								<div className="h-3 w-32 animate-pulse rounded-md bg-content-faint/20" />
								<div className="h-2.5 w-44 animate-pulse rounded-md bg-content-faint/15" />
							</div>
						</>
					) : (
						<>
							<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
								<CheckCircleIcon size={16} weight="fill" />
							</div>
							<div className="flex-1 min-w-0">
								<div className="text-[12px] font-semibold leading-tight text-content">
									{progress.pagesFound} página{progress.pagesFound === 1 ? "" : "s"} mapeada{progress.pagesFound === 1 ? "" : "s"}
								</div>
								{stackPreview.length > 0 && (
									<div className="mt-0.5 truncate text-[11px] text-content-muted">
										Stack: {stackPreview.join(" · ")}
										{moreCount > 0 ? ` · +${moreCount}` : ""}
									</div>
								)}
								{stackPreview.length === 0 && (
									<div className="mt-0.5 text-[11px] text-content-muted">
										Sinais coletados. Continue.
									</div>
								)}
							</div>
						</>
					)}
				</div>
			</motion.div>
		</AnimatePresence>
	);
}
