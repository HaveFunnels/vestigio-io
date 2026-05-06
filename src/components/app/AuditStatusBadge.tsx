"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

// ──────────────────────────────────────────────
// AuditStatusBadge — lightweight header indicator
//
// Shows "Analyzing..." with a pulsing dot when a cycle is running,
// or "Last: <relative time>" when the most recent cycle completed.
// Polls on mount only (no interval — header remounts on navigation).
// ──────────────────────────────────────────────

interface CycleInfo {
	id: string;
	status: string;
	completedAt: string | null;
	createdAt: string;
}

function relativeTime(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return "agora";
	if (mins < 60) return `${mins}min`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	return `${days}d`;
}

export function AuditStatusBadge() {
	const t = useTranslations("console.audit_status");
	const [cycle, setCycle] = useState<CycleInfo | null>(null);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			// First check for running/pending
			try {
				const res = await fetch("/api/cycles/latest?status=running,pending");
				if (res.ok) {
					const data = await res.json();
					if (data?.id && !cancelled) {
						setCycle(data);
						setLoaded(true);
						return;
					}
				}
			} catch { /* ignore */ }

			// Then check last completed
			try {
				const res = await fetch("/api/cycles/latest?status=complete");
				if (res.ok) {
					const data = await res.json();
					if (data?.id && !cancelled) {
						setCycle(data);
						setLoaded(true);
						return;
					}
				}
			} catch { /* ignore */ }

			if (!cancelled) setLoaded(true);
		}

		load();
		return () => { cancelled = true; };
	}, []);

	if (!loaded || !cycle) return null;

	const isRunning = cycle.status === "running" || cycle.status === "pending";

	if (isRunning) {
		return (
			<span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-xs text-emerald-400 sm:inline-flex">
				<span className="relative flex h-2 w-2">
					<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
					<span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
				</span>
				{t("analyzing")}
			</span>
		);
	}

	// Completed
	const when = cycle.completedAt || cycle.createdAt;
	return (
		<span className="hidden items-center gap-1.5 text-xs text-content-faint sm:inline-flex" title={t("last_audit_tooltip", { time: new Date(when).toLocaleString() })}>
			<span className="h-1.5 w-1.5 rounded-full bg-content-faint/50" />
			{t("last_audit", { time: relativeTime(when) })}
		</span>
	);
}
