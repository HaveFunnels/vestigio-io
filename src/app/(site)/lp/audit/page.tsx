"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
	BusinessTypeField,
	ConversionModelField,
	DomainField,
	EmailField,
	PhoneField,
	RevenueField,
	AverageTicketField,
	TextField,
	type BusinessType,
	type ConversionModel,
} from "@/components/form-fields";

// ──────────────────────────────────────────────
// /lp/audit — 4-step anonymous lead form
//
// Step 1: organization name + business type
// Step 2: domain + ownership confirmation
// Step 3: monthly revenue + average ticket + conversion model
// Step 4: email + phone (terminal — fires the mini-audit on submit)
//
// Anti-bot defenses (zero captcha, all invisible):
//   1. Honeypot field (<input name="website" hidden>)
//   2. Form session token (HMAC) issued by /api/lead/start, sent on
//      every step submit
//   3. JS-only header (X-Vestigio-Form-Session)
//   4. Behavioral score — counts mousemove/keydown/scroll/focus events
//      and reports total at submit time
//   5. Time-on-form check — backend rejects submits faster than 8s
//
// Page is noindex (set in metadata of layout) so search engines don't
// index the result pages.
// ──────────────────────────────────────────────

interface LeadState {
	organizationName: string;
	businessModel: BusinessType;
	domain: string;
	ownershipConfirmed: boolean;
	monthlyRevenue: string;
	averageTicket: string;
	conversionModel: ConversionModel;
	email: string;
	phone: string;
}

const TOTAL_STEPS = 4;

export default function LpAuditPage() {
	const router = useRouter();
	const [leadId, setLeadId] = useState<string | null>(null);
	const [formToken, setFormToken] = useState<string | null>(null);
	const [stepIndex, setStepIndex] = useState(0); // 0-based
	const [submitting, setSubmitting] = useState(false);
	const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
	const [globalError, setGlobalError] = useState<string | null>(null);
	const [domainWarning, setDomainWarning] = useState<string | null>(null);
	const [domainChecking, setDomainChecking] = useState(false);

	// Honeypot — hidden from real users, bots auto-fill it
	const [honeypot, setHoneypot] = useState("");

	// Behavioral signal counters (incremented by global event listeners)
	const eventCountRef = useRef({
		mousemove: 0,
		keydown: 0,
		focus: 0,
		scroll: 0,
	});

	const [form, setForm] = useState<LeadState>({
		organizationName: "",
		businessModel: "ecommerce",
		domain: "",
		ownershipConfirmed: false,
		monthlyRevenue: "",
		averageTicket: "",
		conversionModel: "checkout",
		email: "",
		phone: "",
	});

	// ── Initial mount: start the lead, register event listeners ──
	useEffect(() => {
		let cancelled = false;

		fetch("/api/lead/start", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		})
			.then((r) => r.json())
			.then((data) => {
				if (cancelled) return;
				if (data.leadId && data.formToken) {
					setLeadId(data.leadId);
					setFormToken(data.formToken);
				} else {
					setGlobalError(data.message || "Couldn't start the audit. Please refresh.");
				}
			})
			.catch(() => {
				if (!cancelled) setGlobalError("Network error. Please refresh.");
			});

		const onMousemove = () => {
			eventCountRef.current.mousemove++;
		};
		const onKeydown = () => {
			eventCountRef.current.keydown++;
		};
		const onFocus = () => {
			eventCountRef.current.focus++;
		};
		const onScroll = () => {
			eventCountRef.current.scroll++;
		};

		window.addEventListener("mousemove", onMousemove, { passive: true });
		window.addEventListener("keydown", onKeydown, { passive: true });
		window.addEventListener("focusin", onFocus, { passive: true });
		window.addEventListener("scroll", onScroll, { passive: true });

		return () => {
			cancelled = true;
			window.removeEventListener("mousemove", onMousemove);
			window.removeEventListener("keydown", onKeydown);
			window.removeEventListener("focusin", onFocus);
			window.removeEventListener("scroll", onScroll);
		};
	}, []);

	// ── Helpers ──
	const update = <K extends keyof LeadState>(key: K, value: LeadState[K]) => {
		setForm((f) => ({ ...f, [key]: value }));
		if (fieldError && fieldError.field === key) setFieldError(null);
	};

	function buildBehavioralPayload() {
		const c = eventCountRef.current;
		const total = c.mousemove + c.keydown + c.focus + c.scroll;
		return {
			eventCount: total,
			hasFormSessionHeader: true, // we always set the header below
			hasMouseEvents: c.mousemove > 0,
			hasKeyboardEvents: c.keydown > 0,
		};
	}

	// ── Submit current step ──
	async function submitStep() {
		if (!leadId || !formToken) {
			setGlobalError("Form not ready yet. Please wait a moment.");
			return;
		}
		setSubmitting(true);
		setFieldError(null);
		setGlobalError(null);

		const stepNumber = stepIndex + 1;
		const payload = {
			formToken,
			behavioral: buildBehavioralPayload(),
			website: honeypot, // honeypot field — server checks
			// Always send everything; server picks per-step
			organizationName: form.organizationName,
			businessModel: form.businessModel,
			domain: form.domain,
			ownershipConfirmed: form.ownershipConfirmed,
			monthlyRevenue: form.monthlyRevenue,
			averageTicket: form.averageTicket,
			conversionModel: form.conversionModel,
			email: form.email,
			phone: form.phone,
		};

		try {
			const res = await fetch(`/api/lead/${leadId}/step/${stepNumber}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					"X-Vestigio-Form-Session": formToken,
				},
				body: JSON.stringify(payload),
			});
			const data = await res.json();

			if (!res.ok) {
				if (data.field) {
					setFieldError({ field: data.field, message: data.message || "Invalid input" });
				} else {
					setGlobalError(data.message || "Submission failed.");
				}
				setSubmitting(false);
				return;
			}

			// Success — advance or fire the audit
			if (stepNumber < TOTAL_STEPS) {
				setStepIndex((s) => s + 1);
				setSubmitting(false);
				return;
			}

			// Step 4 → fire the audit and redirect to result page
			const auditRes = await fetch(`/api/lead/${leadId}/run-audit`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Vestigio-Form-Session": formToken,
				},
			});
			if (!auditRes.ok) {
				const err = await auditRes.json().catch(() => ({}));
				setGlobalError(err.message || "Couldn't start the audit. Please try again.");
				setSubmitting(false);
				return;
			}

			router.push(`/lp/audit/result/${leadId}`);
		} catch {
			setGlobalError("Network error. Please try again.");
			setSubmitting(false);
		}
	}

	function back() {
		setFieldError(null);
		setGlobalError(null);
		setStepIndex((s) => Math.max(0, s - 1));
	}

	// ── Domain DNS check (warning only, doesn't block) ──
	async function checkDomainReachability() {
		if (!form.domain) return;
		setDomainChecking(true);
		setDomainWarning(null);
		try {
			const res = await fetch(
				`/api/validate-domain?domain=${encodeURIComponent(form.domain)}`,
			);
			const data = await res.json();
			if (!data.ok) setDomainWarning(data.error || null);
		} catch {
			// Best-effort — don't block
		}
		setDomainChecking(false);
	}

	const stepNumber = stepIndex + 1;

	return (
		<div className="min-h-screen bg-[#090911]">
			{/* Top brand strip */}
			<header className="border-b border-zinc-900 px-4 py-4">
				<div className="mx-auto flex max-w-3xl items-center justify-between">
					<a href="/lp" className="text-sm font-bold tracking-wide text-white">
						VESTIGIO
					</a>
					<span className="text-xs text-zinc-500">Free site audit · ~20 sec</span>
				</div>
			</header>

			<main className="flex min-h-[calc(100vh-65px)] items-start justify-center px-4 py-12 sm:py-20">
				<div className="w-full max-w-lg">
					{/* Step indicator */}
					<div className="mb-8 text-center">
						<span className="text-xs font-medium tracking-wider text-zinc-500">
							STEP {stepNumber}/{TOTAL_STEPS}
						</span>
						<div className="mt-2 flex gap-1">
							{Array.from({ length: TOTAL_STEPS }).map((_, i) => (
								<div
									key={i}
									className={`h-1 flex-1 rounded-full transition-colors ${
										i <= stepIndex ? "bg-emerald-500" : "bg-zinc-800"
									}`}
								/>
							))}
						</div>
					</div>

					{/* Honeypot — hidden from humans, bots fill it */}
					<div
						aria-hidden="true"
						style={{
							position: "absolute",
							left: "-9999px",
							top: "-9999px",
							width: 1,
							height: 1,
							overflow: "hidden",
						}}
					>
						<label htmlFor="website">
							Website (do not fill this — leave blank)
						</label>
						<input
							id="website"
							type="text"
							name="website"
							tabIndex={-1}
							autoComplete="off"
							value={honeypot}
							onChange={(e) => setHoneypot(e.target.value)}
						/>
					</div>

					{/* Step 1: Organization name + business type */}
					{stepNumber === 1 && (
						<section className="space-y-6">
							<div>
								<h1 className="text-xl font-semibold text-zinc-100">
									Tell us about your business
								</h1>
								<p className="mt-1 text-sm text-zinc-500">
									We tailor the audit to your business model.
								</p>
							</div>
							<TextField
								id="organizationName"
								label="Organization name"
								value={form.organizationName}
								onChange={(v) => update("organizationName", v)}
								placeholder="Acme Corp"
								error={fieldError?.field === "organizationName" ? fieldError.message : null}
							/>
							<BusinessTypeField
								value={form.businessModel}
								onChange={(v) => update("businessModel", v)}
							/>
							{fieldError?.field === "businessModel" && (
								<p className="text-xs text-red-400">{fieldError.message}</p>
							)}
						</section>
					)}

					{/* Step 2: Domain + ownership */}
					{stepNumber === 2 && (
						<section className="space-y-6">
							<div>
								<h1 className="text-xl font-semibold text-zinc-100">
									What domain do you want to audit?
								</h1>
								<p className="mt-1 text-sm text-zinc-500">
									We&rsquo;ll only crawl the public landing page.
								</p>
							</div>
							<DomainField
								domain={form.domain}
								onDomainChange={(v) => {
									update("domain", v);
									setDomainWarning(null);
								}}
								ownershipConfirmed={form.ownershipConfirmed}
								onOwnershipChange={(v) => update("ownershipConfirmed", v)}
								error={fieldError?.field === "domain" ? fieldError.message : null}
								warning={domainWarning}
							/>
							{fieldError?.field === "ownershipConfirmed" && (
								<p className="text-xs text-red-400">{fieldError.message}</p>
							)}
							{domainChecking && (
								<p className="text-xs text-zinc-500">Checking domain…</p>
							)}
						</section>
					)}

					{/* Step 3: Revenue + ticket + conversion model */}
					{stepNumber === 3 && (
						<section className="space-y-6">
							<div>
								<h1 className="text-xl font-semibold text-zinc-100">
									How big is your business?
								</h1>
								<p className="mt-1 text-sm text-zinc-500">
									We use this to size the financial impact in your audit.
								</p>
							</div>
							<RevenueField
								value={form.monthlyRevenue}
								onChange={(v) => update("monthlyRevenue", v)}
								optional={false}
								error={fieldError?.field === "monthlyRevenue" ? fieldError.message : null}
							/>
							<AverageTicketField
								value={form.averageTicket}
								onChange={(v) => update("averageTicket", v)}
								error={fieldError?.field === "averageTicket" ? fieldError.message : null}
							/>
							<ConversionModelField
								value={form.conversionModel}
								onChange={(v) => update("conversionModel", v)}
							/>
							{fieldError?.field === "conversionModel" && (
								<p className="text-xs text-red-400">{fieldError.message}</p>
							)}
						</section>
					)}

					{/* Step 4: Email + phone */}
					{stepNumber === 4 && (
						<section className="space-y-6">
							<div>
								<h1 className="text-xl font-semibold text-zinc-100">
									Where should we send your results?
								</h1>
								<p className="mt-1 text-sm text-zinc-500">
									Drop your email so we can show your audit (and email you a copy of the link).
								</p>
							</div>
							<EmailField
								value={form.email}
								onChange={(v) => update("email", v)}
								error={fieldError?.field === "email" ? fieldError.message : null}
								label="Work email"
								placeholder="you@yourcompany.com"
							/>
							<PhoneField
								value={form.phone}
								onChange={(v) => update("phone", v)}
								error={fieldError?.field === "phone" ? fieldError.message : null}
							/>
						</section>
					)}

					{globalError && (
						<div className="mt-4 rounded-md border border-red-800/50 bg-red-500/10 px-4 py-2 text-sm text-red-400">
							{globalError}
						</div>
					)}

					{/* Navigation */}
					<div className="mt-8 flex items-center justify-between">
						<button
							type="button"
							onClick={back}
							disabled={stepIndex === 0 || submitting}
							className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent"
						>
							Previous
						</button>
						<button
							type="button"
							onClick={() => {
								// On step 2 we run an extra DNS warning check before submit
								if (stepNumber === 2) {
									checkDomainReachability().finally(() => submitStep());
								} else {
									submitStep();
								}
							}}
							disabled={submitting || !leadId}
							className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-30"
						>
							{submitting
								? "Working…"
								: stepNumber === TOTAL_STEPS
									? "See my results"
									: "Continue"}
						</button>
					</div>

					{/* Trust footer */}
					<p className="mt-8 text-center text-xs text-zinc-600">
						No credit card. We only crawl your public landing page.
					</p>
				</div>
			</main>
		</div>
	);
}
