"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { SlotText } from "slot-text/react";
import { ShinyButton } from "@/components/ui/shiny-button";
import { ChevronDown } from "lucide-react";
import "slot-text/style.css";

// ── MiniCalculator section (editorial restyle 2026-06-20, scan kept)
//
// Conversion surface for SMBs: domain + revenue + business type
// → preview of revenue leaks → signup CTA.
//
// This iteration keeps the 7-step AI scan animation (user preference —
// it's the value-demonstration moment) but drops the editorial slop
// the rest of the homepage rewrite removed:
//   - Red shimmering underline on "landing page" (replaced with
//     editorial Fraunces title)
//   - Hover-lift on the entire card, conic emerald halos, pulsing
//     emerald dot in the eyebrow
//   - Giant red "−$X-$Y/mo" total with text-shadow glow + SlotText
//     count-up — replaced with a restrained HeroMetrics-style tile
//     (mono rose-400, no glow, no count-up)
//   - Red-heavy results table (red bg + red gradient overlay + red
//     shadow + per-row CRITICAL badges) — replaced with neutral
//     border + small rose dot + impact range in mono rose
//   - Hardcoded zinc-700/zinc-900 colors — replaced with product
//     design tokens (border-edge, bg-surface-card, text-content-*)
//
// Persistence: on CTA click, stashes domain + revenue + business type
// to localStorage so the signup + onboarding flows can pre-fill.
// Domain ALSO goes via ?domain= query param. Onboarding form reads
// `vestigio_onboard_*` keys (see useOnboardingForm.ts).

type State = "input" | "loading" | "results";
type BusinessType =
	| "saas"
	| "ecommerce"
	| "services"
	| "institutional"
	| "app_download"
	| "blog";

const STATUS_KEYS = [
	"status_discovering",
	"status_checkout",
	"status_payment",
	"status_trust",
	"status_friction",
	"status_impact",
	"status_report",
] as const;

const IMPACT_PROFILES: Record<
	BusinessType,
	{ base: [number, number]; label: string }
> = {
	ecommerce: { base: [0.1, 0.28], label: "business_ecommerce" },
	saas: { base: [0.08, 0.22], label: "business_saas" },
	app_download: { base: [0.06, 0.18], label: "business_app_download" },
	services: { base: [0.05, 0.15], label: "business_services" },
	blog: { base: [0.04, 0.12], label: "business_blog" },
	institutional: { base: [0.03, 0.09], label: "business_institutional" },
};

interface FindingDef {
	key: string;
	tags: ("all" | "checkout")[];
}

const FINDINGS_LIBRARY: FindingDef[] = [
	{ key: "f_checkout_trust", tags: ["checkout"] },
	{ key: "f_chargeback_exposure", tags: ["checkout"] },
	{ key: "f_payment_redirect_chain", tags: ["checkout"] },
	{ key: "f_checkout_ssl_mismatch", tags: ["checkout"] },
	{ key: "f_cart_abandonment_signals", tags: ["checkout"] },
	{ key: "f_payment_form_friction", tags: ["checkout"] },
	{ key: "f_pricing_page_weak", tags: ["checkout"] },
	{ key: "f_subscription_churn_signals", tags: ["checkout"] },
	{ key: "f_refund_abuse_surface", tags: ["checkout"] },
	{ key: "f_discount_endpoint_exposed", tags: ["checkout"] },
	{ key: "f_analytics_blind_spot", tags: ["all"] },
	{ key: "f_scripts_blocking", tags: ["all"] },
	{ key: "f_mobile_friction", tags: ["all"] },
	{ key: "f_broken_critical_links", tags: ["all"] },
	{ key: "f_slow_page_load", tags: ["all"] },
	{ key: "f_seo_metadata_gaps", tags: ["all"] },
	{ key: "f_cookie_consent_missing", tags: ["all"] },
	{ key: "f_security_headers_missing", tags: ["all"] },
	{ key: "f_mixed_content", tags: ["all"] },
	{ key: "f_form_data_leaving_domain", tags: ["all"] },
	{ key: "f_measurement_gap", tags: ["all"] },
	{ key: "f_trust_signals_absent", tags: ["all"] },
	{ key: "f_cta_below_fold", tags: ["all"] },
	{ key: "f_third_party_dependency", tags: ["all"] },
	{ key: "f_accessibility_barriers", tags: ["all"] },
	{ key: "f_redirect_chain_long", tags: ["all"] },
	{ key: "f_session_token_exposed", tags: ["all"] },
	{ key: "f_admin_panel_exposed", tags: ["all"] },
	{ key: "f_error_pages_unbranded", tags: ["all"] },
	{ key: "f_social_proof_missing", tags: ["all"] },
];

const DISPLAY_COUNT = 5;

function extractDomain(input: string): string {
	const cleaned = input.trim().replace(/^https?:\/\//, "");
	return cleaned.split("/")[0] || input.trim();
}

function formatCurrency(val: number, sym = "$"): string {
	if (val >= 1000) return `${sym}${Math.round(val / 1000)}k`;
	return `${sym}${Math.round(val)}`;
}

function pickRandomFindings(businessType: BusinessType): FindingDef[] {
	const hasCheckout = businessType === "saas" || businessType === "ecommerce";
	const eligible = FINDINGS_LIBRARY.filter(
		(f) => f.tags.includes("all") || (hasCheckout && f.tags.includes("checkout")),
	);
	const shuffled = [...eligible].sort(() => Math.random() - 0.5);
	return shuffled.slice(0, DISPLAY_COUNT);
}

function randomFindingCount(): number {
	return Math.floor(Math.random() * (110 - 45 + 1)) + 45;
}

function easeOut(t: number): number {
	return 1 - Math.pow(1 - t, 3);
}

// Persist what the visitor typed in the calculator so the signup +
// onboarding flows can pre-fill instead of re-asking. Called from the
// CTA click handlers. The onboarding form reads these exact keys
// (`vestigio_onboard_*`) — see useOnboardingForm.
function stashForOnboarding(domain: string, revenue: number, businessType: BusinessType): void {
	try {
		if (domain) localStorage.setItem("vestigio_onboard_domain", domain);
		if (revenue) localStorage.setItem("vestigio_onboard_revenue", String(revenue));
		if (businessType) localStorage.setItem("vestigio_onboard_business_type", businessType);
	} catch {
		// Private mode / localStorage unavailable — silent degrade.
	}
}

// ── Business type select (custom dropdown) ──

function BusinessTypeSelect({
	value,
	onChange,
	t,
}: {
	value: BusinessType;
	onChange: (v: BusinessType) => void;
	t: ReturnType<typeof useTranslations>;
}) {
	const [open, setOpen] = useState(false);
	const [touched, setTouched] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	const options = Object.keys(IMPACT_PROFILES) as BusinessType[];

	return (
		<div ref={ref} className="relative w-full">
			{!touched && (
				<span className="absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5">
					<span className="absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-60" style={{ animation: "ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite" }} />
					<span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 shadow-[0_0_8px_rgba(56,189,248,0.5)]">
						<svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
						</svg>
					</span>
				</span>
			)}
			<button
				type="button"
				onClick={() => { setOpen((o) => !o); setTouched(true); }}
				className="flex w-full items-center justify-between rounded-xl border border-edge bg-surface-card px-5 py-3.5 text-left text-sm text-zinc-100 outline-none transition-all hover:border-edge-focus focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
			>
				<span>{t(IMPACT_PROFILES[value].label)}</span>
				<ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
			</button>
			{open && (
				<ul className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-edge bg-surface-card shadow-xl shadow-black/40">
					{options.map((key) => (
						<li key={key}>
							<button
								type="button"
								onClick={() => { onChange(key); setOpen(false); }}
								className={`flex w-full px-5 py-3 text-left text-sm transition-colors ${
									key === value
										? "bg-emerald-500/10 text-emerald-400"
										: "text-zinc-300 hover:bg-white/[0.04] hover:text-zinc-100"
								}`}
							>
								{t(IMPACT_PROFILES[key].label)}
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

// ── Component ──

interface MiniCalculatorProps {
	primaryCtaHref?: string;
}

const MiniCalculator = ({ primaryCtaHref = "/audit" }: MiniCalculatorProps = {}) => {
	const t = useTranslations("homepage.mini_calculator");
	const tCard = useTranslations("homepage.mini_calc_card");
	const sym = t("currency_symbol") || "$";
	const [state, setState] = useState<State>("input");
	const [url, setUrl] = useState("");
	const [revenue, setRevenue] = useState("");
	const [urlNudge, setUrlNudge] = useState(false);
	const [businessType, setBusinessType] = useState<BusinessType>("ecommerce");
	const [showExtra, setShowExtra] = useState(false);
	const [domain, setDomain] = useState("");
	const [progress, setProgress] = useState(0);
	const [statusIdx, setStatusIdx] = useState(0);
	const [statusFading, setStatusFading] = useState(false);
	const [findingCounter, setFindingCounter] = useState(0);
	const [totalFindings, setTotalFindings] = useState(0);
	const [selectedFindings, setSelectedFindings] = useState<FindingDef[]>([]);
	// SSR-safe default = true (no animation). Hydration flips it once we
	// can read the media query so the odometer-style digit roll only
	// animates for users who haven't opted out of motion.
	const [prefersReducedMotion, setPrefersReducedMotion] = useState(true);
	const revenueRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		setPrefersReducedMotion(mq.matches);
		const onChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);

	const monthlyRevenue = Math.max(parseInt(revenue) || 100000, 10000);
	const profile = IMPACT_PROFILES[businessType];

	const handleSubmit = useCallback(() => {
		if (!url.trim()) return;
		if (!showExtra) {
			setDomain(extractDomain(url));
			setShowExtra(true);
			setTimeout(() => revenueRef.current?.focus(), 300);
			return;
		}
		const count = randomFindingCount();
		setTotalFindings(count);
		setFindingCounter(0);
		setSelectedFindings(pickRandomFindings(businessType));
		setProgress(0);
		setStatusIdx(0);
		setStatusFading(false);
		setState("loading");
	}, [url, showExtra, businessType]);

	// 7-step chunked progress animation. ~12s total — the value
	// demonstration moment where the visitor sees the analysis ramping
	// through real-feeling steps before the result tile lands. Kept
	// per user preference (the AI scan IS the moment).
	useEffect(() => {
		if (state !== "loading") return;

		const CHUNKS = [15, 28, 42, 56, 70, 85, 100];
		const CHUNK_DURATION = 1714; // ~12s total (7 × 1714ms)
		let chunkIndex = 0;
		let animFrame: number;
		let startTime = performance.now();

		const tick = (now: number) => {
			if (chunkIndex >= CHUNKS.length) return;
			const elapsed = now - startTime;
			const target = CHUNKS[chunkIndex];
			const from = chunkIndex === 0 ? 0 : CHUNKS[chunkIndex - 1];
			const frac = Math.min(elapsed / CHUNK_DURATION, 1);
			const current = from + (target - from) * easeOut(frac);
			setProgress(current);
			const globalFrac = current / 100;
			setFindingCounter(Math.floor(globalFrac * totalFindings));
			if (frac >= 1) {
				chunkIndex++;
				startTime = now;
				if (chunkIndex < CHUNKS.length) {
					setStatusFading(true);
					setTimeout(() => {
						setStatusIdx(chunkIndex);
						setStatusFading(false);
					}, 250);
				}
			}
			if (chunkIndex < CHUNKS.length) {
				animFrame = requestAnimationFrame(tick);
			} else {
				setFindingCounter(totalFindings);
				setTimeout(() => setState("results"), 500);
			}
		};

		animFrame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(animFrame);
	}, [state, totalFindings]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") handleSubmit();
	};

	const isValidDomain = (v: string): boolean => {
		const trimmed = v.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
		return /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(trimmed);
	};

	const domainReady = isValidDomain(url);

	const handleReset = () => {
		setState("input");
		setUrl("");
		setRevenue("");
		setShowExtra(false);
		setDomain("");
		setProgress(0);
		setFindingCounter(0);
	};

	const findingImpacts = useMemo(() => {
		return selectedFindings.map(() => {
			const spread = profile.base[1] - profile.base[0];
			const min = profile.base[0] + Math.random() * spread * 0.3;
			const max = profile.base[0] + spread * 0.5 + Math.random() * spread * 0.5;
			return [min * monthlyRevenue, max * monthlyRevenue] as [number, number];
		});
	}, [selectedFindings, monthlyRevenue, profile]);

	const totalMin = findingImpacts.reduce((s, [min]) => s + min, 0);
	const totalMax = findingImpacts.reduce((s, [, max]) => s + max, 0);

	const inputClass =
		"w-full rounded-xl border border-edge bg-surface-card px-5 py-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-all hover:border-edge-focus focus:border-emerald-500 focus:bg-surface-card focus:ring-1 focus:ring-emerald-500/40";

	const domainInputClass =
		`shiny-input w-full rounded-xl px-5 py-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none ${
			domainReady ? "!border-emerald-500 ring-1 ring-emerald-500/40 !bg-surface-card" : ""
		}`;

	return (
		<section className="relative z-1 overflow-hidden bg-[#080812] py-12 sm:py-16 lg:py-20">
			{/* Soft ambient glow — restrained, single source, no infinite
			    animation. */}
			<div className="pointer-events-none absolute inset-0 -z-1" aria-hidden>
				<div className="absolute left-1/2 top-1/2 h-[300px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/[0.04] blur-[100px]" />
			</div>

			<div className="px-4 sm:px-8 lg:px-8 xl:px-12">
				<div className="relative overflow-hidden rounded-3xl border border-edge bg-surface-card p-6 shadow-[0_25px_80px_-20px_rgba(0,0,0,0.45)] sm:p-10 lg:p-14">
					{/* Static eyebrow chip + tagline (input state only) */}
					{state === "input" && (
						<div className="relative mb-6 flex flex-col items-center gap-3 text-center sm:mb-8">
							<span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1">
								<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
								<span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
									{tCard("eyebrow")}
								</span>
							</span>
							<p className="max-w-[420px] text-xs text-content-muted sm:text-[13px]">
								{tCard("tagline")}
							</p>
						</div>
					)}

					<div className="relative mx-auto w-full max-w-[760px]">
						{/* ───────────── INPUT STATE ───────────── */}
						{state === "input" && (
							<div className="text-center">
								<h2 className="mb-4 text-[1.75rem] font-semibold leading-[1.1] tracking-tight text-zinc-100 sm:text-3xl lg:text-4xl xl:text-5xl">
									{t("title")}
								</h2>
								<p className="mx-auto mb-8 max-w-[540px] text-sm text-content-muted sm:mb-10 sm:text-base">
									{t("subtitle")}
								</p>

								<div className="mx-auto flex max-w-[640px] flex-col items-center gap-4">
									{!showExtra && (
										<div className="w-full">
											<div
												className={`shiny-input relative flex w-full items-center gap-2 !rounded-2xl !p-0 !pl-4 sm:!pl-5 ${
													domainReady ? "!ring-1 !ring-emerald-500/40" : ""
												}`}
											>
												{domainReady && (
													<span className="absolute -right-1.5 -top-1.5 z-20 flex h-5 w-5">
														<span className="absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-60" style={{ animation: "ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite" }} />
														<span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 shadow-[0_0_8px_rgba(56,189,248,0.5)]">
															<svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
																<path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
															</svg>
														</span>
													</span>
												)}
												<input
													type="text"
													value={url}
													onChange={(e) => { setUrl(e.target.value); setUrlNudge(false); }}
													onKeyDown={handleKeyDown}
													placeholder={t("url_placeholder")}
													className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
												/>
												<ShinyButton
													onClick={() => {
														if (!domainReady) { setUrlNudge(true); return; }
														handleSubmit();
													}}
													className="!min-h-0 !w-auto shrink-0 !rounded-l-xl !rounded-r-2xl !px-3.5 !py-2.5 !text-xs sm:!px-6 sm:!text-sm"
													data-vtg-cta="minicalc-domain"
												>
													{t("cta_audit")}
												</ShinyButton>
											</div>
											{urlNudge && (
												<p className="mt-2 text-center text-xs text-amber-400/80">{t("url_nudge")}</p>
											)}
										</div>
									)}

									{showExtra && (
										<div className="w-full">
											<input
												type="text"
												value={url}
												onChange={(e) => { setUrl(e.target.value); setUrlNudge(false); }}
												onKeyDown={handleKeyDown}
												placeholder={t("url_placeholder")}
												className={domainInputClass}
											/>
											{urlNudge && (
												<p className="mt-2 text-center text-xs text-amber-400/80">{t("url_nudge")}</p>
											)}
										</div>
									)}

									{showExtra && (
										<div className="w-full space-y-3" style={{ animation: "fadeSlideRight 0.4s ease-out" }}>
											<div className="flex w-full flex-col items-center gap-3 sm:flex-row">
												<div className="relative w-full">
													<span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500">{sym}</span>
													<input
														ref={revenueRef}
														type="number"
														value={revenue}
														onChange={(e) => setRevenue(e.target.value)}
														onKeyDown={handleKeyDown}
														placeholder={t("revenue_placeholder")}
														className={`${inputClass} pl-8`}
													/>
												</div>
												<BusinessTypeSelect value={businessType} onChange={setBusinessType} t={t} />
											</div>
											<ShinyButton
												onClick={handleSubmit}
												className="w-full text-base sm:w-auto sm:text-sm"
												data-vtg-cta="minicalc-submit"
											>
												{t("cta_audit")}
											</ShinyButton>
										</div>
									)}
								</div>

								<p className="mx-auto mt-6 text-[11px] text-content-faint sm:text-xs">
									{t("trust_line")}
								</p>
							</div>
						)}

						{/* ───────────── LOADING STATE (7-step scan) ───────────── */}
						{state === "loading" && (
							<div className="text-center">
								<h2 className="mb-2 text-lg font-bold tracking-tight text-zinc-100 sm:text-2xl lg:text-3xl">
									{t("analyzing")}{" "}
									<span className="block truncate sm:inline sm:overflow-visible sm:text-clip">{domain}</span>
								</h2>
								<p className="mb-8 text-sm text-content-muted sm:mb-10">
									{t("analyzing_sub")}
								</p>

								<div className="relative mx-auto flex w-full max-w-[340px] flex-col items-center gap-1.5 sm:max-w-[380px]">
									{STATUS_KEYS.map((key, i) => {
										const isDone = i < statusIdx;
										const isActive = i === statusIdx;
										const chunkFrom = i === 0 ? 0 : [15, 28, 42, 56, 70, 85, 100][i - 1];
										const chunkTo = [15, 28, 42, 56, 70, 85, 100][i];
										const chunkFrac = isActive
											? Math.min(Math.max((progress - chunkFrom) / (chunkTo - chunkFrom), 0), 1)
											: isDone ? 1 : 0;

										return (
											<div
												key={key}
												className={`flex w-full flex-col gap-1.5 rounded-lg border px-3 py-2 transition-all duration-300 ${
													isActive
														? "scale-100 border-emerald-500/30 bg-emerald-500/[0.06] opacity-100"
														: isDone
															? "scale-[0.97] border-emerald-500/20 bg-emerald-500/[0.03] opacity-70"
															: "scale-[0.97] border-edge bg-white/[0.02] opacity-50"
												}`}
											>
												<div className="flex items-center gap-2 text-xs">
													{isDone ? (
														<span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500">
															<svg viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" className="h-2.5 w-2.5">
																<path d="M2.5 6.5l2.5 2.5L9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
															</svg>
														</span>
													) : isActive ? (
														<span className="inline-flex items-center gap-0.5 text-emerald-500">
															<span className="h-1 w-1 animate-bounce rounded-full bg-current" style={{ animationDelay: "0ms", animationDuration: "1s" }} />
															<span className="h-1 w-1 animate-bounce rounded-full bg-current" style={{ animationDelay: "150ms", animationDuration: "1s" }} />
															<span className="h-1 w-1 animate-bounce rounded-full bg-current" style={{ animationDelay: "300ms", animationDuration: "1s" }} />
														</span>
													) : (
														<span className="flex h-4 w-4 items-center justify-center rounded-full border border-edge">
															<span className="h-1.5 w-1.5 rounded-full bg-content-faint/40" />
														</span>
													)}
													<span className={`font-medium ${isDone ? "text-emerald-400" : isActive ? "text-zinc-100" : "text-content-faint"}`}>
														{t(key)}
													</span>
												</div>
												<div className="ml-6 mr-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
													<div
														className="h-full rounded-full bg-emerald-500 transition-[width] duration-100 ease-linear"
														style={{ width: `${chunkFrac * 100}%` }}
													/>
												</div>
											</div>
										);
									})}
								</div>

								<div className="mt-4 flex items-center justify-center gap-3 font-mono text-[11px] tabular-nums text-content-faint">
									<span className="inline-flex items-center gap-1">
										{prefersReducedMotion ? (
											<span>{findingCounter}</span>
										) : (
											<SlotText
												text={String(findingCounter)}
												options={{ direction: "up", stagger: 20, duration: 220, bounce: 0.3, skipUnchanged: true }}
											/>
										)}
										<span>{t("findings_found")}</span>
									</span>
									<span>·</span>
									<span>{Math.round(progress)}%</span>
								</div>
							</div>
						)}

						{/* ───────────── RESULTS STATE ───────────── */}
						{state === "results" && (
							<div>
								<div className="mb-8 text-center sm:mb-10">
									<p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-content-faint">
										{t("scan_complete")}
									</p>
									<h2 className="text-[1.5rem] font-semibold tracking-tight text-zinc-100 sm:text-[1.75rem] lg:text-3xl">
										{t("results_for")}{" "}
										<span className="break-all font-mono text-emerald-400">{domain}</span>
									</h2>
								</div>

								<div className="mb-4 overflow-hidden rounded-2xl border border-edge bg-white/[0.02]">
									<div className="hidden grid-cols-[1fr_180px] gap-4 border-b border-edge px-5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-content-faint sm:grid">
										<span>{t("col_finding")}</span>
										<span className="text-right">{t("col_impact")}</span>
									</div>

									{selectedFindings.map((finding, i) => {
										const [impMin, impMax] = findingImpacts[i] || [0, 0];
										return (
											<div
												key={finding.key}
												className={`px-4 py-3 sm:grid sm:grid-cols-[1fr_180px] sm:items-center sm:gap-4 sm:px-5 sm:py-3.5 ${
													i < selectedFindings.length - 1 ? "border-b border-edge/60" : ""
												}`}
											>
												<div className="flex items-start gap-2.5">
													<span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" aria-hidden />
													<p className="text-[13px] leading-snug text-zinc-200 sm:text-sm">
														{t(finding.key)}
													</p>
												</div>
												<p className="mt-1 pl-5 font-mono text-[12px] tabular-nums text-rose-400 sm:mt-0 sm:pl-0 sm:text-right sm:text-[13px]">
													−{formatCurrency(impMin, sym)}–{formatCurrency(impMax, sym)}/mo
												</p>
											</div>
										);
									})}
								</div>

								<p className="mb-8 text-center text-xs text-content-faint">
									{t("showing_of", { shown: DISPLAY_COUNT, total: totalFindings })}
								</p>

								{/* Total impact — restrained mono tile, mirrors
								    HeroMetrics from the authenticated Plano. No
								    giant red 6xl with glow + SlotText reveal. */}
								<div className="mb-10 rounded-2xl border border-edge bg-white/[0.02] px-5 py-6 text-center sm:mb-12 sm:px-8 sm:py-8">
									<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-content-faint">
										{t("total_impact")}
									</p>
									<p className="mt-3 font-mono text-[1.75rem] font-semibold tabular-nums text-rose-400 sm:text-[2.25rem] lg:text-[2.75rem]">
										−{formatCurrency(totalMin, sym)}–{formatCurrency(totalMax, sym)}
										<span className="ml-1 text-base font-normal text-content-faint sm:text-lg">/mo</span>
									</p>
								</div>

								<div className="text-center">
									<p className="mb-6 text-[15px] font-medium leading-relaxed text-content-secondary sm:text-base">
										{t("cta_question")}
									</p>
									<div className="mb-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4">
										<ShinyButton
											href={domain ? `${primaryCtaHref}?domain=${encodeURIComponent(domain)}` : primaryCtaHref}
											className="w-full sm:w-auto"
											data-vtg-cta="minicalc-signup"
											onClick={() => stashForOnboarding(domain, monthlyRevenue, businessType)}
										>
											{t("cta_signup")}
										</ShinyButton>
										<Link
											href="/pricing"
											className="rounded-[1rem] border border-edge bg-surface-card px-7 py-3 text-center text-sm font-semibold text-zinc-100 transition-colors hover:border-edge-focus focus-visible:ring-2 focus-visible:ring-edge-focus"
											data-vtg-cta="minicalc-pricing"
											onClick={() => stashForOnboarding(domain, monthlyRevenue, businessType)}
										>
											{t("cta_pricing")}
										</Link>
									</div>
									{/* Wave 22.9 · war-room polish #4 — price microcopy under the CTA cluster. Kills late-price-shock at /activate by anchoring commitment at the moment of peak intent. Values locale-mapped; interpunct separates price/guarantee (no em-dash per house style). */}
									<p className="mx-auto mb-4 max-w-[500px] text-[12px] font-medium text-content-muted">
										{t("cta_price_microcopy")}
									</p>
									<p className="mx-auto max-w-[500px] text-xs text-content-muted">
										{t("disclaimer")}
									</p>
									<button
										onClick={handleReset}
										className="mt-6 text-xs text-content-faint underline underline-offset-2 transition-colors hover:text-content-muted"
									>
										{t("scan_another")}
									</button>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			<style jsx>{`
				@keyframes fadeSlideRight {
					from { opacity: 0; transform: translateX(20px); }
					to   { opacity: 1; transform: translateX(0); }
				}
			`}</style>
		</section>
	);
};

export default MiniCalculator;
