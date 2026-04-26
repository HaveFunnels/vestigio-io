"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePlan } from "@/hooks/usePlan";
import { useTrack } from "@/hooks/useProductTrack";

// ──────────────────────────────────────────────
// UpgradeNudge — Inline upgrade CTA for Starter users
//
// Three variants:
//   inline        — subtle text + emerald link
//   badge         — small pill (e.g., on FAB)
//   blurred-overlay — absolute-positioned over blur backdrop
//
// Design rules:
//   - Never modal, never blocking
//   - Value-framing ("Unlock daily insights"), not fear-framing
//   - Renders nothing if user is already on the gated plan
//   - Tracks impression + click via product telemetry
// ──────────────────────────────────────────────

interface UpgradeNudgeProps {
	variant: "inline" | "badge" | "blurred-overlay";
	messageKey: string;
	messageValues?: Record<string, string | number>;
	trackContext: string;
	/** Plan that should see the nudge (default: "vestigio") */
	planGate?: string;
}

export default function UpgradeNudge({
	variant,
	messageKey,
	messageValues,
	trackContext,
	planGate = "vestigio",
}: UpgradeNudgeProps) {
	const { plan } = usePlan();
	const { track } = useTrack();
	const t = useTranslations("console.upgrade_moments");
	const impressionFired = useRef(false);

	const shouldShow = plan === planGate;

	useEffect(() => {
		if (shouldShow && !impressionFired.current) {
			impressionFired.current = true;
			track("upgrade_moment_impression", { part: trackContext, plan });
		}
	}, [shouldShow, trackContext, plan, track]);

	if (!shouldShow) return null;

	const handleClick = () => {
		track("upgrade_moment_click", {
			part: trackContext,
			plan,
			destination: "/app/billing",
		});
	};

	if (variant === "badge") {
		return (
			<Link
				href="/app/billing"
				onClick={handleClick}
				className="inline-flex items-center rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-400 transition-colors hover:bg-emerald-500/20"
			>
				Pro
			</Link>
		);
	}

	if (variant === "blurred-overlay") {
		return (
			<div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-surface/60 backdrop-blur-sm">
				<div className="text-center">
					<p className="text-xs font-medium text-content-secondary">
						{t(messageKey, messageValues)}
					</p>
					<Link
						href="/app/billing"
						onClick={handleClick}
						className="mt-2 inline-block rounded-md bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20"
					>
						{t("upgrade_cta")}
					</Link>
				</div>
			</div>
		);
	}

	// variant === "inline"
	return (
		<p className="text-[10px] text-content-faint">
			{t(messageKey, messageValues)}{" "}
			<Link
				href="/app/billing"
				onClick={handleClick}
				className="text-emerald-400 transition-colors hover:text-emerald-300 hover:underline"
			>
				{t("upgrade_cta")}
			</Link>
		</p>
	);
}
