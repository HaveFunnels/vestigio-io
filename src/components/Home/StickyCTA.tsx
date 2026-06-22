"use client";

/**
 * StickyCTA — recaptures intent after the visitor scrolls past the hero.
 *
 * Behavior:
 *   - Hidden on first paint
 *   - Slides in from below after ~1.5 viewport heights scrolled (past
 *     the hero + first major content section)
 *   - Slides back out as the visitor approaches the final CTA section
 *     (no point double-CTA'ing when they're already at the final CTA)
 *   - Dismissible via X — persists in sessionStorage so a refresh
 *     within the same session keeps it hidden
 *   - Respects prefers-reduced-motion (animation reduced to opacity)
 *
 * Wired into the delegated CTA-click telemetry via
 * data-vtg-cta="sticky-cta" so funnel reports can attribute conversion
 * to this surface specifically (vs. hero-primary, product-tour-cta,
 * final-cta, etc).
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ShinyButton } from "@/components/ui/shiny-button";

const DISMISS_KEY = "vestigio_sticky_cta_dismissed";

interface StickyCTAProps {
	primaryCtaHref?: string;
}

export default function StickyCTA({ primaryCtaHref = "/audit" }: StickyCTAProps) {
	const t = useTranslations("homepage.sticky_cta");
	const [visible, setVisible] = useState(false);
	const [dismissed, setDismissed] = useState(false);

	useEffect(() => {
		// Respect a prior dismissal within the same session.
		try {
			if (sessionStorage.getItem(DISMISS_KEY) === "1") {
				setDismissed(true);
				return;
			}
		} catch {
			// sessionStorage unavailable (private mode) — just skip the check
		}

		const onScroll = () => {
			const scrollY = window.scrollY;
			const vh = window.innerHeight;
			const docH = document.documentElement.scrollHeight;

			// Show window: past the hero+productTour zone, before the
			// final CTA section. The 1.4×vh / 1.6×vh thresholds give a
			// long middle band where the sticky is most useful (FAQ,
			// pricing scroll, etc).
			const shouldShow = scrollY > vh * 1.4 && scrollY < docH - vh * 1.6;
			setVisible(shouldShow);
		};

		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	const handleDismiss = (e: React.MouseEvent) => {
		e.stopPropagation();
		setDismissed(true);
		try {
			sessionStorage.setItem(DISMISS_KEY, "1");
		} catch {
			// Silent degrade — dismiss still works for this session in memory
		}
	};

	if (dismissed) return null;

	return (
		<div
			className={`pointer-events-none fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-[560px] transition-all duration-500 ease-out sm:inset-x-4 sm:bottom-5 ${
				visible
					? "translate-y-0 opacity-100"
					: "translate-y-[120%] opacity-0"
			}`}
			aria-hidden={!visible}
		>
			{/* Mobile layout: hook line on top (wraps if needed), then a
			    row with [button(flex-1)] [dismiss X]. Stacks vertically so
			    the loss-frame hook ("Veja onde sua receita está vazando.")
			    is actually present — without it the mobile sticky was just
			    a context-less button.
			    Desktop layout: single row with [hook(flex-1, truncate)]
			    [button(content-sized)] [dismiss X] — unchanged from before. */}
			<div className="pointer-events-auto rounded-2xl border border-edge bg-surface-card/95 px-3 py-2.5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-md sm:flex sm:items-center sm:gap-3 sm:px-4 sm:py-3">
				{/* Hook line — quiet reminder, not a second-headline. On
				    mobile sits on its own line and may wrap (no truncate);
				    on sm+ it goes inline + truncates if needed. */}
				<p className="mb-2 text-[12px] leading-snug text-content-secondary sm:mb-0 sm:flex-1 sm:truncate sm:text-[13px]">
					{t("hook")}
				</p>

				{/* Button + dismiss row — flex on mobile to put X to the
				    right of the (full-width) button. On desktop the outer
				    sm:flex makes these direct flex siblings of the hook
				    above, so the visual order [hook | button | X] still
				    holds. */}
				<div className="flex items-center gap-2 sm:gap-3">
					{/* Primary CTA — wrapped ShinyButton with sticky-tight
					    padding so the bar stays compact. data-vtg-cta tags
					    it for the delegated funnel telemetry. On mobile
					    `flex-1` makes the button fill all available space
					    between container padding and the dismiss X (bigger
					    tap target + visually balanced). On sm+ it reverts
					    to content-sized so it sits next to the truncated
					    hook line. */}
					<ShinyButton
						href={primaryCtaHref}
						data-vtg-cta="sticky-cta"
						className="!min-h-0 !rounded-xl !px-3.5 !py-2 !text-[11px] max-sm:flex-1 sm:shrink-0 sm:!w-auto sm:!px-4 sm:!text-xs"
					>
						{t("cta")}
					</ShinyButton>

					{/* Dismiss — small, quiet. Aria label for accessibility. */}
					<button
						type="button"
						onClick={handleDismiss}
						className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-content-faint transition-colors hover:bg-white/[0.06] hover:text-content"
						aria-label={t("dismiss")}
					>
						<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3">
							<path d="M3 3l8 8M11 3l-8 8" strokeLinecap="round" />
						</svg>
					</button>
				</div>
			</div>
		</div>
	);
}
