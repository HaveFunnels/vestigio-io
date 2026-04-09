"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ShinyButton } from "@/components/ui/shiny-button";

// ── MiniCalculator section
//
// This component is the most direct conversion surface on the home
// page — visitors enter a domain and immediately see a quantified
// preview of their revenue leaks. To match the importance, the
// section is now wrapped in a gradient "hero card" with hover-lift
// behavior so the calculator stops looking like "just another
// section" and starts looking like the page's center of gravity.
//
// The shell is purely presentational — gradient borders, ambient
// glow, hover lift — and lives in the outer `<section>`. The inner
// state machine (`input` → `loading` → `results`) is unchanged.
//
// CTAs:
//  - input state already uses ShinyButton for "Run Free Audit"
//  - results state now uses ShinyButton for "Create Free Account"
//    so the highest-intent click on the page is the most visually
//    emphatic.

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

// ── Impact multipliers per business type ──
// [min%, max%] of monthly revenue per finding
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

// ── Findings library (30 total) ──
// Tags: "all" = any business, "checkout" = only saas/ecommerce

interface FindingDef {
	key: string;
	tags: ("all" | "checkout")[];
}

const FINDINGS_LIBRARY: FindingDef[] = [
	// Checkout / payment specific (saas + ecommerce only)
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

	// Universal findings (all business types)
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

function formatCurrency(val: number): string {
	if (val >= 1000) return `$${Math.round(val / 1000)}k`;
	return `$${Math.round(val)}`;
}

// Negative-number rule (matches the dashboard's vocabulary): values
// that represent loss are displayed with a leading minus character
// (the typographic minus, not a hyphen) so the eye reads "this is
// money you're losing" before parsing the digits.
function formatLoss(val: number): string {
	return `−${formatCurrency(val)}`;
}

function pickRandomFindings(businessType: BusinessType): FindingDef[] {
	const hasCheckout = businessType === "saas" || businessType === "ecommerce";
	const eligible = FINDINGS_LIBRARY.filter(
		(f) =>
			f.tags.includes("all") || (hasCheckout && f.tags.includes("checkout"))
	);
	// Shuffle and pick DISPLAY_COUNT
	const shuffled = [...eligible].sort(() => Math.random() - 0.5);
	return shuffled.slice(0, DISPLAY_COUNT);
}

function randomFindingCount(): number {
	return Math.floor(Math.random() * (110 - 45 + 1)) + 45;
}

function easeOut(t: number): number {
	return 1 - Math.pow(1 - t, 3);
}

// ── Component ──

interface MiniCalculatorProps {
	// Optional CTA destination override. Default = signup flow.
	// /lp variant passes "/lp/audit" so the result-state CTA jumps
	// straight into the anonymous lead funnel.
	primaryCtaHref?: string;
}

const MiniCalculator = ({
	primaryCtaHref = "/auth/signup",
}: MiniCalculatorProps = {}) => {
	const t = useTranslations("homepage.mini_calculator");
	const tCard = useTranslations("homepage.mini_calc_card");
	const [state, setState] = useState<State>("input");
	const [url, setUrl] = useState("");
	const [revenue, setRevenue] = useState("");
	const [businessType, setBusinessType] = useState<BusinessType>("ecommerce");
	const [showExtra, setShowExtra] = useState(false);
	const [domain, setDomain] = useState("");
	const [progress, setProgress] = useState(0);
	const [statusIdx, setStatusIdx] = useState(0);
	const [statusFading, setStatusFading] = useState(false);
	const [findingCounter, setFindingCounter] = useState(0);
	const [totalFindings, setTotalFindings] = useState(0);
	const [selectedFindings, setSelectedFindings] = useState<FindingDef[]>([]);
	const revenueRef = useRef<HTMLInputElement>(null);

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

	// Progress animation with finding counter
	useEffect(() => {
		if (state !== "loading") return;

		const CHUNKS = [15, 30, 45, 60, 75, 90, 100];
		const CHUNK_DURATION = 1300;
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

			// Increment finding counter proportionally
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

	const handleReset = () => {
		setState("input");
		setUrl("");
		setRevenue("");
		setShowExtra(false);
		setDomain("");
		setProgress(0);
		setFindingCounter(0);
	};

	// Compute impact for selected findings
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
		"w-full rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3.5 text-sm text-white placeholder:text-zinc-500 outline-none transition-all hover:border-white/20 focus:border-emerald-500/60 focus:bg-white/[0.05] focus:ring-1 focus:ring-emerald-500/40";

	return (
		<section className='relative z-1 overflow-hidden border-t border-white/5 bg-[#080812] py-20 sm:py-24 lg:py-32'>
			{/* Ambient page-background halos so the gradient card sits on
			    a subtly lit canvas instead of a flat plate. */}
			<div className='pointer-events-none absolute inset-0 -z-1' aria-hidden>
				<div className='absolute left-1/2 top-1/2 h-[460px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/[0.06] blur-[140px]' />
				<div className='absolute left-1/2 top-1/2 h-[300px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/[0.05] blur-[120px]' />
			</div>

			<div className='mx-auto w-full max-w-[920px] px-4 sm:px-8 xl:px-0'>
				{/* Gradient hero card — the calculator's container.
				    Hover-lift, animated conic border on hover, soft inner
				    glow. The whole section is "one big card" so the
				    calculator stops looking like just-another-section. */}
				<div className='vcalc-card group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-b from-[#0d1d18] via-[#0b0f1c] to-[#080812] p-6 transition-all duration-500 hover:-translate-y-1 hover:border-emerald-400/25 hover:shadow-[0_30px_90px_-30px_rgba(16,185,129,0.45),0_20px_60px_-30px_rgba(99,102,241,0.35)] sm:p-10 lg:p-14'>
					{/* Soft conic gradient halo behind the card edges */}
					<div
						className='pointer-events-none absolute inset-0 -z-1 opacity-60 transition-opacity duration-500 group-hover:opacity-100'
						aria-hidden
					>
						<div className='absolute -left-20 -top-20 h-[300px] w-[300px] rounded-full bg-emerald-500/[0.10] blur-3xl' />
						<div className='absolute -bottom-20 -right-20 h-[300px] w-[300px] rounded-full bg-indigo-500/[0.12] blur-3xl' />
					</div>

					{/* Stripe accents echoing the hero shell */}
					<div className='pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent' />
					<div className='pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-indigo-400/20 to-transparent' />

					{/* Eyebrow + tagline header (only in input state — once the
					    flow is running, the existing in-card headlines take
					    over) */}
					{state === "input" && (
						<div className='relative mb-6 flex flex-col items-center gap-3 text-center sm:mb-8'>
							<span className='inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/[0.08] px-3 py-1'>
								<span className='h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400' />
								<span className='text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300'>
									{tCard("eyebrow")}
								</span>
							</span>
							<p className='max-w-[420px] text-xs text-zinc-500 sm:text-[13px]'>
								{tCard("tagline")}
							</p>
						</div>
					)}

					<div className='relative mx-auto w-full max-w-[760px]'>
						{/* ===================== INPUT ===================== */}
						{state === "input" && (
							<div className='text-center'>
								<h2 className='mb-4 text-[1.75rem] font-bold leading-[1.15] tracking-tight text-white sm:text-3xl lg:text-4xl xl:text-5xl'>
									{t("title")}
								</h2>
								<p className='mx-auto mb-8 max-w-[540px] text-sm text-gray-400 sm:mb-10 sm:text-base'>
									{t("subtitle")}
								</p>

								<div className='mx-auto flex max-w-[540px] flex-col items-center gap-4'>
									{/* Domain input */}
									<div className='flex w-full flex-col items-center gap-3 sm:flex-row'>
										<input
											type='text'
											value={url}
											onChange={(e) => setUrl(e.target.value)}
											onKeyDown={handleKeyDown}
											placeholder={t("url_placeholder")}
											className={inputClass}
										/>
										{!showExtra && (
											<ShinyButton
												onClick={handleSubmit}
												className='w-full shrink-0 sm:w-auto'
												disabled={!url.trim()}
											>
												{t("cta_audit")}
											</ShinyButton>
										)}
									</div>

									{/* Revenue + Business Type — fade in from right */}
									{showExtra && (
										<div
											className='w-full space-y-3'
											style={{ animation: "fadeSlideRight 0.4s ease-out" }}
										>
											<div className='flex w-full flex-col items-center gap-3 sm:flex-row'>
												<div className='relative w-full'>
													<span className='absolute left-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500'>
														$
													</span>
													<input
														ref={revenueRef}
														type='number'
														value={revenue}
														onChange={(e) => setRevenue(e.target.value)}
														onKeyDown={handleKeyDown}
														placeholder={t("revenue_placeholder")}
														className={`${inputClass} pl-8`}
													/>
												</div>
												<select
													value={businessType}
													onChange={(e) =>
														setBusinessType(e.target.value as BusinessType)
													}
													className={`${inputClass} cursor-pointer appearance-none`}
												>
													{(Object.keys(IMPACT_PROFILES) as BusinessType[]).map(
														(key) => (
															<option
																key={key}
																value={key}
																className='bg-zinc-900 text-white'
															>
																{t(IMPACT_PROFILES[key].label)}
															</option>
														)
													)}
												</select>
											</div>
											<ShinyButton
												onClick={handleSubmit}
												className='w-full sm:w-auto'
											>
												{t("cta_audit")}
											</ShinyButton>
										</div>
									)}
								</div>
							</div>
						)}

						{/* ===================== LOADING ===================== */}
						{state === "loading" && (
							<div className='text-center'>
								<h2 className='mb-2 text-xl font-bold tracking-tight text-white sm:text-2xl lg:text-3xl'>
									{t("analyzing")}{" "}
									<span className='block break-all sm:inline'>{domain}</span>
								</h2>
								<p className='mb-8 text-sm text-zinc-500 sm:mb-10'>
									{t("analyzing_sub")}
								</p>

								{/* Progress bar */}
								<div className='mx-auto mb-6 w-full max-w-[480px]'>
									<div className='relative h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]'>
										<div
											className='h-full rounded-full bg-emerald-500'
											style={{
												width: `${progress}%`,
												boxShadow: "0 0 12px rgba(16,185,129,0.45)",
												transition: "width 80ms linear",
											}}
										/>
									</div>
									<div className='mt-3 flex items-center justify-between font-mono text-[11px] tabular-nums text-zinc-500'>
										<span>
											{findingCounter} {t("findings_found")}
										</span>
										<span>{Math.round(progress)}%</span>
									</div>
								</div>

								{/* Status message — fade down transition */}
								<div className='relative h-6 overflow-hidden'>
									<p
										className='text-sm text-zinc-400'
										style={{
											transition: "opacity 0.25s ease, transform 0.25s ease",
											opacity: statusFading ? 0 : 1,
											transform: statusFading
												? "translateY(8px)"
												: "translateY(0)",
										}}
									>
										{t(STATUS_KEYS[statusIdx])}
									</p>
								</div>
							</div>
						)}

						{/* ===================== RESULTS ===================== */}
						{state === "results" && (
							<div>
								<div className='mb-8 text-center sm:mb-10'>
									<p className='mb-2 font-mono text-xs uppercase tracking-widest text-zinc-500'>
										{t("scan_complete")}
									</p>
									<h2 className='text-xl font-bold tracking-tight text-white sm:text-2xl lg:text-3xl'>
										{t("results_for")}{" "}
										<span className='break-all text-emerald-400'>{domain}</span>
									</h2>
								</div>

								{/* Findings — uses the dashboard's DrawerStatBox vocabulary:
                accent gradient overlay + colored shadow scaled to severity
                so the eye reads "this is a list of losses" before parsing
                any individual row. */}
								<div className='relative mb-4 overflow-hidden rounded-2xl border border-red-500/30 bg-white/[0.02] shadow-[0_8px_24px_-14px_rgba(239,68,68,0.28)]'>
									{/* Subtle red gradient highlight in the corner */}
									<div
										className='pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-red-500/[0.05] via-transparent to-transparent'
										aria-hidden
									/>

									{/* Desktop column headers */}
									<div className='relative hidden grid-cols-[100px_1fr_200px] gap-4 border-b border-white/5 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 sm:grid'>
										<span>{t("col_severity")}</span>
										<span>{t("col_finding")}</span>
										<span className='text-right'>{t("col_impact")}</span>
									</div>

									<div className='relative'>
										{selectedFindings.map((finding, i) => {
											const [impMin, impMax] = findingImpacts[i] || [0, 0];
											return (
												<div
													key={finding.key}
													className={`px-4 py-4 sm:grid sm:grid-cols-[100px_1fr_200px] sm:items-center sm:gap-4 sm:px-5 ${
														i < selectedFindings.length - 1
															? "border-b border-white/[0.04]"
															: ""
													}`}
												>
													{/* Mobile: severity badge + impact on same row */}
													<div className='mb-2 flex items-center justify-between sm:mb-0 sm:block'>
														<span className='inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-400'>
															<span
																className='h-1.5 w-1.5 rounded-full bg-red-500'
																aria-hidden
															/>
															CRITICAL
														</span>
														<span className='font-mono text-sm tabular-nums text-red-400 sm:hidden'>
															−{formatCurrency(impMin)}–{formatCurrency(impMax)}
															/mo
														</span>
													</div>
													<p className='text-sm leading-snug text-zinc-200 sm:mb-0'>
														{t(finding.key)}
													</p>
													<p className='hidden font-mono text-sm tabular-nums text-red-400 sm:block sm:text-right'>
														−{formatCurrency(impMin)}–{formatCurrency(impMax)}
														/mo
													</p>
												</div>
											);
										})}
									</div>
								</div>

								{/* Showing X of Y */}
								<p className='mb-10 text-center text-xs text-zinc-500'>
									{t("showing_of", {
										shown: DISPLAY_COUNT,
										total: totalFindings,
									})}
								</p>

								{/* Total — hero zone of the entire mini-calc flow.
                Negative-number rule applied: the value represents revenue
                you're losing every month, so it renders as `−$X-$Y/mo`
                in red with a colored drop shadow that scales the visual
                weight of the loss. JetBrains Mono + tabular-nums so the
                digits never jitter. */}
								<div className='mb-10 text-center sm:mb-12'>
									<p className='mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500'>
										{t("total_impact")}
									</p>
									<p className='font-mono text-4xl font-medium tabular-nums leading-none tracking-tight text-red-400 sm:text-5xl lg:text-6xl'>
										<span
											style={{
												textShadow:
													"0 8px 32px rgba(239,68,68,0.35), 0 2px 8px rgba(239,68,68,0.25)",
											}}
										>
											{formatLoss(totalMin)}–{formatCurrency(totalMax)}
										</span>
										<span className='ml-1 font-mono text-base font-normal text-zinc-500 sm:text-lg lg:text-xl'>
											/mo
										</span>
									</p>
								</div>

								{/* CTA */}
								<div className='text-center'>
									<p className='mb-6 text-sm text-zinc-300 sm:text-base'>
										{t("cta_question")}
									</p>
									<div className='mb-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4'>
										<Link href={primaryCtaHref} className='inline-block'>
											<ShinyButton className='w-full sm:w-auto'>
												{t("cta_signup")}
											</ShinyButton>
										</Link>
										<Link
											href='/pricing'
											className='rounded-[1rem] border border-white/20 px-7 py-3 text-center text-sm font-semibold text-white transition-colors hover:border-white/40 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-white/30'
										>
											{t("cta_pricing")}
										</Link>
									</div>
									<p className='mx-auto max-w-[500px] text-xs text-zinc-600'>
										{t("disclaimer")}
									</p>
									<button
										onClick={handleReset}
										className='mt-6 text-xs text-zinc-600 underline underline-offset-2 transition-colors hover:text-zinc-400'
									>
										{t("scan_another")}
									</button>
								</div>
							</div>
						)}
					</div>
					{/* end gradient-card inner max-width wrapper */}
				</div>
				{/* end gradient-card */}
			</div>

			<style jsx>{`
				@keyframes fadeSlideRight {
					from {
						opacity: 0;
						transform: translateX(20px);
					}
					to {
						opacity: 1;
						transform: translateX(0);
					}
				}
			`}</style>
		</section>
	);
};

export default MiniCalculator;
