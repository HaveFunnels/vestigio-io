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
			{/* Mobile layout (per /frontend-design verdict 2026-06-22):
			    follows the iOS-banner / card-dismiss convention — body
			    holds the hook + full-width primary CTA, dismiss X floats
			    to the top-right corner of the card as meta-chrome.

			      ┌──────────────────────────── [X] ┐
			      │ Veja onde seu faturamento vaza. │  hook (left, natural read)
			      │ [    Quero saber agora      ]   │  CTA fills width, text centered
			      └─────────────────────────────────┘

			    Why X at the corner instead of inline next to the CTA:
			    (1) [button][tiny X] inline reads as a broken visual
			    rhythm (~10:1 width ratio); (2) inline X crowds the CTA
			    tap zone (accidental-dismiss risk on thumb mis-aim);
			    (3) top-right corner IS the mobile pattern for dismissible
			    cards (Twitter, iOS push banners, etc).

			    Desktop layout unchanged: sm:flex restores the single row,
			    sm:static returns the X to the inline position next to the
			    button, and !w-auto sm:shrink-0 reverts the CTA to
			    content-sized so it sits naturally beside the truncated
			    hook line. */}
			<div className="pointer-events-auto relative rounded-2xl border border-edge bg-surface-card/95 px-3 py-2.5 pr-9 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-md sm:flex sm:items-center sm:gap-3 sm:px-4 sm:py-3 sm:pr-4">
				{/* Hook line — quiet reminder, not a second-headline. On
				    mobile sits on its own line and may wrap (no truncate);
				    on sm+ it goes inline + truncates if needed.
				    Stays LEFT-aligned on mobile: centering would lose the
				    scan rhythm and read as a slogan, not a quiet reminder. */}
				<p className="mb-2 text-[12px] leading-snug text-content-secondary sm:mb-0 sm:flex-1 sm:truncate sm:text-[13px]">
					{t("hook")}
				</p>

				{/* Primary CTA — wrapped ShinyButton with sticky-tight
				    padding so the bar stays compact. data-vtg-cta tags it
				    for the delegated funnel telemetry.

				    Mobile: !w-full makes the button span the whole card
				    body (big tap target, the entire bottom row is the
				    primary action). !text-center centers the label
				    "Quero saber agora" inside it — without this override
				    .shiny-cta defaults to text-align: left, which on a
				    289px+ wide button looks like the text "fell out" of
				    the center.

				    Desktop: sm:!w-auto + sm:shrink-0 revert to
				    content-sized so the button sits next to the
				    truncated hook line in the row. */}
				{/* !block is load-bearing: .shiny-cta renders as <a> which
				    defaults to display: inline, and inline elements
				    ignore `width: 100%`. Without !block the !w-full has
				    no effect and the button falls back to content-width
				    (~100px), then sits at the left of the card. Block
				    + !w-full + !text-center gets the intended full-width
				    centered-label CTA on mobile. Desktop is unaffected
				    because sm:!w-auto reverts to content-sized inside the
				    sm:flex row. */}
				<ShinyButton
					href={primaryCtaHref}
					data-vtg-cta="sticky-cta"
					className="!block !min-h-0 !w-full !rounded-xl !px-3.5 !py-2 !text-center !text-[11px] sm:!w-auto sm:shrink-0 sm:!px-4 sm:!text-xs"
				>
					{t("cta")}
				</ShinyButton>

				{/* Dismiss X — absolute top-right corner on mobile (card
				    meta-chrome, out of the CTA tap zone), inline on
				    desktop where it sits next to the button at the end of
				    the row. The sm:static + sm:right-auto sm:top-auto
				    trio fully resets the absolute positioning at >=640px. */}
				<button
					type="button"
					onClick={handleDismiss}
					className="absolute right-2 top-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-content-faint transition-colors hover:bg-white/[0.06] hover:text-content sm:static sm:right-auto sm:top-auto"
					aria-label={t("dismiss")}
				>
					<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3">
						<path d="M3 3l8 8M11 3l-8 8" strokeLinecap="round" />
					</svg>
				</button>
			</div>
		</div>
	);
}
