// ──────────────────────────────────────────────
// Post-cycle attribution confirmation job
//
// Fires at the end of `apps/audit-runner/run-cycle.ts` after the
// new cycle's findings are persisted and the cycle is marked
// `complete`. Scans the environment's `UserAction` rows where:
//
//   - status = 'done'
//   - verifiedResolvedAt IS NULL
//   - baselineCycleRef !== currentCycleRef  (avoid confirming
//     against the same cycle that captured the baseline — you
//     can't resolve a finding in the cycle where you just marked
//     it as done)
//
// For each candidate, we look up the source finding's
// `inferenceKey` and check whether the CURRENT cycle's findings
// show it as `changeClass='resolved'` OR whether it's simply
// absent (didn't reappear in this cycle — also a resolution
// signal under the engine's change-class model).
//
// Matches are stamped with `verifiedResolvedAt` + the cycle ref
// that did the confirming. A celebration notification is then
// fired so the user learns about the payoff in-product and by
// email.
//
// Errors are non-fatal — this job is best-effort observability +
// retention, not part of the hot path. The cycle completion is
// already committed before we run.
// ──────────────────────────────────────────────

import { prisma } from "./prismaDb";
import { notifyOrganization, renderBrandedEmail } from "./notifications";

// Inlined here so we don't have to widen notification-triggers.ts'
// export surface — these are one-liner helpers used in both files.
function getBaseUrl(): string {
	return (
		process.env.NEXT_PUBLIC_APP_URL ||
		process.env.NEXTAUTH_URL ||
		"https://vestigio.io"
	);
}
function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
function truncate(s: string, max: number): string {
	const clean = s.replace(/\s+/g, " ").trim();
	if (clean.length <= max) return clean;
	return clean.slice(0, max - 1) + "…";
}

export interface AttributionConfirmationInput {
	cycleId: string;
	environmentId: string;
	cycleRef: string;
	organizationId: string;
	domain: string;
}

export interface AttributionConfirmationResult {
	scanned: number;
	confirmed: number;
	errors: number;
}

function centsFromDollars(dollars: number): number {
	return Math.round(dollars * 100);
}

function formatUsd(cents: number): string {
	const dollars = cents / 100;
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(dollars);
}

export async function runAttributionConfirmation(
	input: AttributionConfirmationInput,
): Promise<AttributionConfirmationResult> {
	const result: AttributionConfirmationResult = {
		scanned: 0,
		confirmed: 0,
		errors: 0,
	};

	// Candidate actions: done, unverified, and not from this same cycle.
	const candidates = await prisma.userAction.findMany({
		where: {
			environmentId: input.environmentId,
			status: "done",
			verifiedResolvedAt: null,
			NOT: { baselineCycleRef: input.cycleRef },
		},
		select: {
			id: true,
			findingId: true,
			baselineImpactMidpoint: true,
			baselineCycleRef: true,
			title: true,
			createdByUserId: true,
		},
	});

	if (candidates.length === 0) return result;
	result.scanned = candidates.length;

	// Resolve each candidate's inferenceKey via the baseline finding,
	// then check whether the CURRENT cycle has that key and with what
	// changeClass. Batch both queries for efficiency.
	const baselineFindings = await prisma.finding.findMany({
		where: { id: { in: candidates.map((c) => c.findingId) } },
		select: { id: true, inferenceKey: true },
	});
	const keyByFindingId = new Map(
		baselineFindings.map((f) => [f.id, f.inferenceKey]),
	);

	const currentCycleFindings = await prisma.finding.findMany({
		where: {
			cycleId: input.cycleId,
			inferenceKey: {
				in: Array.from(
					new Set(baselineFindings.map((f) => f.inferenceKey)),
				),
			},
		},
		select: { inferenceKey: true, changeClass: true },
	});
	const currentByKey = new Map(
		currentCycleFindings.map((f) => [f.inferenceKey, f.changeClass]),
	);

	const toNotify: Array<{
		userId: string;
		actionId: string;
		title: string;
		recoveredCents: number;
	}> = [];

	for (const candidate of candidates) {
		const key = keyByFindingId.get(candidate.findingId);
		if (!key) {
			// Baseline finding was cascade-deleted or never existed. Treat
			// as confirmed — the finding is gone, same outcome as
			// explicit resolution. This also protects the user from
			// their Action being "stuck" forever if the source finding
			// was removed from the DB.
			const confirmed = await stampVerified(
				candidate.id,
				input.cycleRef,
			);
			if (confirmed) {
				result.confirmed++;
				toNotify.push({
					userId: candidate.createdByUserId,
					actionId: candidate.id,
					title: candidate.title,
					recoveredCents: centsFromDollars(
						candidate.baselineImpactMidpoint ?? 0,
					),
				});
			} else {
				result.errors++;
			}
			continue;
		}

		const currentClass = currentByKey.get(key);

		// Case 1: key didn't appear in the current cycle at all → the
		// issue no longer shows up in the engine's signals → treat as
		// resolved.
		// Case 2: key appeared with changeClass='resolved' → explicit.
		// Case 3: key appeared with any other changeClass (new_issue,
		// regression, stable_risk, improvement, null) → still present,
		// remediation didn't take. Skip.
		const shouldConfirm =
			currentClass === undefined || currentClass === "resolved";

		if (!shouldConfirm) continue;

		const confirmed = await stampVerified(candidate.id, input.cycleRef);
		if (confirmed) {
			result.confirmed++;
			toNotify.push({
				userId: candidate.createdByUserId,
				actionId: candidate.id,
				title: candidate.title,
				recoveredCents: centsFromDollars(
					candidate.baselineImpactMidpoint ?? 0,
				),
			});
		} else {
			result.errors++;
		}
	}

	// Celebration fan-out. One email per confirmed action — the
	// payoff moment is per-finding, not summarised, so the user
	// gets a concrete "this one fix recovered $X" message. Dedupe
	// happens inside notifyOrganization (via the NotificationLog
	// tag), so replaying the job is idempotent.
	for (const n of toNotify) {
		try {
			await fireCelebration({
				organizationId: input.organizationId,
				domain: input.domain,
				actionId: n.actionId,
				title: n.title,
				recoveredCents: n.recoveredCents,
			});
		} catch (err) {
			console.warn(
				`[attribution-confirmation] notify failed for action ${n.actionId}:`,
				err,
			);
			// Non-fatal — the stamp is already committed, email can
			// be retried by the dispatcher or retried next run.
		}
	}

	return result;
}

async function stampVerified(
	actionId: string,
	cycleRef: string,
): Promise<boolean> {
	try {
		await prisma.userAction.update({
			where: { id: actionId },
			data: {
				verifiedResolvedAt: new Date(),
				verificationCycleRef: cycleRef,
			},
		});
		return true;
	} catch (err) {
		console.warn(
			`[attribution-confirmation] stamp failed for ${actionId}:`,
			err,
		);
		return false;
	}
}

async function fireCelebration(args: {
	organizationId: string;
	domain: string;
	actionId: string;
	title: string;
	recoveredCents: number;
}): Promise<void> {
	const subject = `Confirmed: your fix on ${truncate(args.title, 60)} recovered ${formatUsd(args.recoveredCents)}/mo`;
	const intro = `<strong>${escapeHtml(args.title)}</strong> is confirmed resolved on <strong>${escapeHtml(args.domain)}</strong>.<br/><br/>Our latest audit no longer detects this issue — the remediation you marked as done took. Attributed recovery: <strong>${formatUsd(args.recoveredCents)}/month</strong>.`;
	const html = renderBrandedEmail({
		headline: "Recovery confirmed",
		intro,
		ctaLabel: "See it in your dashboard",
		ctaUrl: `${getBaseUrl()}/app`,
		footerNote: `Attribution based on the audit that ran just now.`,
	});

	await notifyOrganization(args.organizationId, {
		event: "verified_resolved",
		subject,
		bodyHtml: html,
		bodyText: subject,
		tag: `verified_resolved:${args.actionId}`,
	});
}
