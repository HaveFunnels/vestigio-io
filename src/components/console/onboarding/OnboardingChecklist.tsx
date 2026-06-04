"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import {
	CheckCircleIcon,
	CircleIcon,
	CaretDownIcon,
	XIcon,
	SparkleIcon,
} from "@phosphor-icons/react/dist/ssr";

// ──────────────────────────────────────────────
// OnboardingChecklist — floating welcome guide
//
// Pairs with FirstFindingMoment. Once the activation ritual finishes,
// this widget keeps the user moving through the next 3 high-leverage
// items without trapping them in a tour. Designed to live in the
// bottom-right of the Pulse page (or a top sheet on small screens).
//
// State source of truth = /api/onboarding/progress. We refetch every
// time the widget opens so the user gets credit for actions taken in
// other tabs/sessions.
//
// Auto-dismiss when 100% complete (one-shot localStorage stamp so we
// don't re-show after the user has clearly graduated). Manual dismiss
// also writes the stamp.
// ──────────────────────────────────────────────

interface ProgressItem {
	id: string;
	completed: boolean;
}

interface ProgressResponse {
	items: ProgressItem[];
	completed: number;
	total: number;
}

const DISMISS_KEY = "vestigio.onboarding.checklistDismissed";

const ITEM_HREF: Record<string, string> = {
	audit_complete: "/app/inventory",
	first_action: "/app/actions",
	invite_teammate: "/app/members",
	alerts_configured: "/app/settings/notifications",
};

export default function OnboardingChecklist() {
	const t = useTranslations("console.onboarding.checklist");
	const locale = useLocale();
	const isPt = locale.startsWith("pt");
	const [data, setData] = useState<ProgressResponse | null>(null);
	const [open, setOpen] = useState(true);
	const [dismissed, setDismissed] = useState(false);

	useEffect(() => {
		if (typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1") {
			setDismissed(true);
			return;
		}
		(async () => {
			try {
				const res = await fetch("/api/onboarding/progress", { cache: "no-store" });
				if (!res.ok) return;
				const json = (await res.json()) as ProgressResponse;
				setData(json);
				// Don't show if everything's already done before we even
				// mount — silent graduation, no celebration noise.
				if (json.completed === json.total) {
					localStorage.setItem(DISMISS_KEY, "1");
					setDismissed(true);
				}
			} catch {
				/* ignore — non-critical */
			}
		})();
	}, []);

	function handleDismiss() {
		if (typeof window !== "undefined") {
			localStorage.setItem(DISMISS_KEY, "1");
		}
		setDismissed(true);
	}

	if (dismissed || !data) return null;
	const pct = Math.round((data.completed / data.total) * 100);
	const allDone = data.completed === data.total;

	return (
		<motion.div
			initial={{ y: 80, opacity: 0 }}
			animate={{ y: 0, opacity: 1 }}
			transition={{ type: "spring", damping: 22, stiffness: 240 }}
			// Sits above the CopilotFab (bottom-4 right-4 z-[45]) so the
			// two floating affordances don't stack. The FAB is the
			// expected entry to Vestigio AI; we don't want to compete
			// with it visually.
			className="fixed bottom-20 right-4 z-40 w-[calc(100vw-2rem)] max-w-[320px] overflow-hidden rounded-2xl border border-edge bg-surface-card shadow-2xl sm:bottom-24 sm:right-6"
		>
			<button
				onClick={() => setOpen((o) => !o)}
				className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-card-hover"
			>
				<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
					<SparkleIcon size={14} weight="fill" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="text-[12px] font-semibold text-content">
						{allDone ? t("title_done") : t("title")}
					</div>
					<div className="mt-1 flex items-center gap-2">
						<div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-inset">
							<div
								className="h-full bg-emerald-500 transition-all"
								style={{ width: `${pct}%` }}
							/>
						</div>
						<span className="font-mono text-[10px] tabular-nums text-content-faint">
							{data.completed}/{data.total}
						</span>
					</div>
				</div>
				<CaretDownIcon
					size={12}
					weight="bold"
					className={`shrink-0 text-content-faint transition-transform ${open ? "rotate-180" : ""}`}
				/>
			</button>

			<AnimatePresence initial={false}>
				{open && (
					<motion.div
						initial={{ height: 0 }}
						animate={{ height: "auto" }}
						exit={{ height: 0 }}
						className="overflow-hidden border-t border-edge"
					>
						<div className="space-y-1 p-2">
							{data.items.map((item) => {
								const href = ITEM_HREF[item.id] ?? "/app/pulse";
								return (
									<Link
										key={item.id}
										href={href}
										className={`flex items-start gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface-card-hover ${
											item.completed ? "opacity-70" : ""
										}`}
									>
										{item.completed ? (
											<CheckCircleIcon
												size={16}
												weight="fill"
												className="mt-0.5 shrink-0 text-emerald-400"
											/>
										) : (
											<CircleIcon
												size={16}
												className="mt-0.5 shrink-0 text-content-faint"
											/>
										)}
										<div className="min-w-0 flex-1">
											<div
												className={`text-[12px] font-medium leading-snug ${
													item.completed
														? "text-content-muted line-through"
														: "text-content"
												}`}
											>
												{t(`items.${item.id}.label`)}
											</div>
											{!item.completed && (
												<div className="mt-0.5 text-[11px] leading-snug text-content-faint">
													{t(`items.${item.id}.hint`)}
												</div>
											)}
										</div>
									</Link>
								);
							})}
						</div>
						<button
							onClick={handleDismiss}
							className="flex w-full items-center justify-center gap-1.5 border-t border-edge px-4 py-2 text-[11px] text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-muted"
						>
							<XIcon size={10} weight="bold" />
							{t("dismiss")}
						</button>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
}
