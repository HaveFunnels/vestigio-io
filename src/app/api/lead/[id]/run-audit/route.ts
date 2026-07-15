import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import { verifyFormToken } from "@/libs/lead-defense";
import { checkRateLimit } from "@/libs/limiter";
import { verifyTurnstile } from "@/libs/turnstile";

// ──────────────────────────────────────────────
// POST /api/lead/[id]/run-audit
//
// Fires the mini-audit worker fire-and-forget. Called by the frontend
// after step 4 of the /audit form is persisted (PATCH .../step/4
// returned ok). Returns immediately so the frontend can redirect to
// the result page where polling takes over.
//
// SEC-04 fix: Requires the form session token (X-Vestigio-Form-Session
// header) to prevent unauthenticated SSRF via arbitrary lead IDs.
//
// The worker (apps/audit-runner/run-mini-audit.ts) runs the staged
// pipeline in shallow mode, persists MiniAuditResult, and updates
// the lead status from `auditing` → `audit_complete`.
//
// Pre-requisites: lead must have status='draft' AND domain set.
// Multiple POSTs to the same lead are idempotent (worker checks
// status before re-firing).
// ──────────────────────────────────────────────

export const dynamic = "force-dynamic";

export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	// Wave 22.9 · war-room quick-win (Missing #14) — anti-abuse gate
	// on the EXPENSIVE step (LLM + crawl, ~R$0.03-0.20 per scan). The
	// existing form-token check prevents replay-with-arbitrary-leadIds,
	// but a compromised/leaked token OR a legit visitor's device could
	// still fire run-audit repeatedly. Two additional layers here:
	//
	//   1. IP rate limit (per-IP, 3 audits per hour) — cheap defense
	//      against distributed abuse. Layered on top of the /lead/start
	//      5/hour limit for defense-in-depth.
	//   2. Turnstile server-verify on the `turnstileToken` in the body
	//      (optional — fails-open when TURNSTILE_SECRET_KEY is unset per
	//      the helper's design, so this doesn't break dev/staged rollout).
	//      When TURNSTILE_SECRET_KEY is set in prod, the client widget
	//      must POST a valid token or this endpoint 400s.
	const perIpLimited = await checkRateLimit(3, 60 * 60 * 1000);
	if (perIpLimited) return perIpLimited;

	// SEC-04: Verify form session token to prevent unauthenticated SSRF
	const formToken = request.headers.get("x-vestigio-form-session");
	const realIp = request.headers.get("x-real-ip");
	const forwarded = request.headers.get("x-forwarded-for");
	const clientIp = realIp?.trim() || (forwarded ? forwarded.split(",").pop()!.trim() : "0.0.0.0");
	const verification = verifyFormToken(formToken, clientIp);
	if (!verification.valid) {
		// Observability — mirror do log no /step route. Sem isso, run-audit
		// 403 vira diagnóstico cego.
		console.warn(
			`[lead-run-audit-rejected] reason=${verification.reason} ` +
				`hasToken=${!!formToken} ` +
				`ua=${request.headers.get("user-agent")?.slice(0, 80) ?? "?"}`,
		);
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	// Turnstile verify — fails-open when TURNSTILE_SECRET_KEY is unset
	// (dev + staged rollout). Client sends `turnstileToken` in body when
	// the widget is wired. Body parse is tolerant of missing body.
	const body = await request.json().catch(() => ({}));
	const turnstileToken = (body as { turnstileToken?: string })?.turnstileToken;
	const turnstile = await verifyTurnstile(turnstileToken);
	if (!turnstile.ok) {
		console.warn(
			`[lead-run-audit-rejected] turnstile=${turnstile.reason} ua=${request.headers.get("user-agent")?.slice(0, 80) ?? "?"}`,
		);
		return NextResponse.json({ message: "Captcha verification failed", reason: turnstile.reason }, { status: 400 });
	}

	const { id } = await context.params;

	const lead = await prisma.anonymousLead.findUnique({
		where: { id },
		select: { id: true, status: true, domain: true, email: true },
	});

	if (!lead) {
		return NextResponse.json({ message: "Lead not found." }, { status: 404 });
	}

	if (!lead.domain) {
		return NextResponse.json(
			{ message: "Domain missing — complete step 2 first." },
			{ status: 400 },
		);
	}

	if (!lead.email) {
		return NextResponse.json(
			{ message: "Email missing — complete step 4 first." },
			{ status: 400 },
		);
	}

	// Idempotent — worker handles its own state guard
	if (lead.status === "auditing") {
		return NextResponse.json({ status: "auditing" });
	}
	if (lead.status === "audit_complete") {
		return NextResponse.json({ status: "audit_complete" });
	}
	if (lead.status === "spam") {
		// Pretend it's running so the bot doesn't get useful info
		return NextResponse.json({ status: "auditing" });
	}

	// Fire-and-forget — worker runs in background, lead status flips
	// to `auditing` immediately so the polling knows what's happening.
	import("../../../../../../apps/audit-runner/run-mini-audit")
		.then((m) => m.runMiniAudit(id))
		.catch((err) => {
			console.error(`[lead-run-audit] dispatch failed for ${id}:`, err);
		});

	return NextResponse.json({ status: "auditing" });
}
