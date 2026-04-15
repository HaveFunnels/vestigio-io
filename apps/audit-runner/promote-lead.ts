import { prisma } from "@/libs/prismaDb";
import { sendActivationEmail } from "@/libs/notification-triggers";
import { randomBytes } from "node:crypto";

// ──────────────────────────────────────────────
// Lead → Customer Promotion
//
// Called from the Paddle webhook (handleOnboardingActivation) when
// custom_data.leadId is present on a transaction.completed or
// subscription.created event. Converts an AnonymousLead row into a
// pending User + real Organization, and emails an activation link.
//
// Flow (post-2026-04-15 rewrite — replaces the old magic-link path):
//
//   1. Look up the lead → must be in audit_complete or checkout_started
//   2. Resolve / create a pending User. Reuse existing email matches.
//      For NEW users we mint a 32-byte activation token with 24h TTL.
//      Password + OAuth linkage both happen later at /activate/:token
//      — the User row starts with NO password and NO Account link.
//   3. Create the Organization (status='active', plan from price)
//   4. Create the Membership (User as owner)
//   5. Create the Environment from lead.domain
//   6. Create the BusinessProfile from lead fields
//   7. Create an AuditCycle and fire-and-forget runAuditCycle for
//      a real (full mode) audit on the new env
//   8. Send activation email via Brevo → link lands on /activate/:token
//      where the visitor picks Google / GitHub / password. NO magic
//      link — we want a deliberate auth-method choice.
//   9. Mark lead status='converted' + record promotedToUserId/OrgId
//
// Idempotency: if called twice for the same lead (Paddle retries),
// the second call short-circuits because lead.status === 'converted'.
//
// Email collision policy (decided 2026-04-07): reuse existing User.
// If the email is already in our system (from a previous signup or
// a previous /lp purchase), the new Org gets attached to the same
// User and the activation email goes to the same address. Existing
// users that already have a password or OAuth linked skip the
// activation step — we still send the email but the link says
// "your account is already active, sign in".
// ──────────────────────────────────────────────

export interface PromoteLeadInput {
	leadId: string;
	plan: string; // "vestigio" | "pro" | "max"
	stripeCustomerId?: string | null;
}

export interface PromoteLeadResult {
	leadId: string;
	userId: string;
	organizationId: string;
	environmentId: string;
	auditCycleId: string;
	wasNewUser: boolean;
}

const ACTIVATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function generateActivationToken(): string {
	// 32 random bytes → 64 hex chars. The token is the path segment
	// in /activate/:token so URL-safe chars only. Hex is plenty random
	// (≈128 bits after we consume it) and easier to log/debug than b64.
	return randomBytes(32).toString("hex");
}

export async function promoteLeadToOrg(
	input: PromoteLeadInput,
): Promise<PromoteLeadResult | null> {
	const lead = await prisma.anonymousLead.findUnique({
		where: { id: input.leadId },
	});

	if (!lead) {
		console.warn(`[promote-lead] lead ${input.leadId} not found`);
		return null;
	}

	if (lead.status === "converted") {
		// Already promoted — return the existing references
		console.log(`[promote-lead] lead ${input.leadId} already converted, skipping`);
		if (lead.promotedToUserId && lead.promotedToOrgId) {
			const env = await prisma.environment.findFirst({
				where: { organizationId: lead.promotedToOrgId },
				select: { id: true },
			});
			const cycle = await prisma.auditCycle.findFirst({
				where: { organizationId: lead.promotedToOrgId },
				orderBy: { createdAt: "desc" },
				select: { id: true },
			});
			return {
				leadId: input.leadId,
				userId: lead.promotedToUserId,
				organizationId: lead.promotedToOrgId,
				environmentId: env?.id || "",
				auditCycleId: cycle?.id || "",
				wasNewUser: false,
			};
		}
		return null;
	}

	if (!lead.email) {
		console.error(`[promote-lead] lead ${input.leadId} has no email`);
		return null;
	}

	if (!lead.domain) {
		console.error(`[promote-lead] lead ${input.leadId} has no domain`);
		return null;
	}

	const email = lead.email.toLowerCase();
	const orgName = lead.organizationName || lead.domain;

	// 1. Resolve or create the User. Email collision = reuse.
	let user = await prisma.user.findUnique({ where: { email } });
	const wasNewUser = !user;

	// activationToken is minted only for NEW users. Returning users
	// (existing password or OAuth linked) already have a way to sign
	// in — we reuse them and skip the activation step.
	let activationToken: string | null = null;
	let activationSkipReason: "existing_user" | null = null;

	if (!user) {
		activationToken = generateActivationToken();
		user = await prisma.user.create({
			data: {
				email,
				name: orgName,
				billingEmail: email,
				activationToken,
				activationTokenExpiresAt: new Date(
					Date.now() + ACTIVATION_TOKEN_TTL_MS,
				),
				customerId: input.stripeCustomerId || null,
				// No password, no Account — user is pending until they
				// visit /activate/:token and pick Google/GitHub/password.
			},
		});
		console.log(`[promote-lead] created pending user ${user.id} (${email})`);
	} else {
		activationSkipReason = "existing_user";
		const patch: Record<string, unknown> = {};
		if (input.stripeCustomerId && !user.customerId) {
			patch.customerId = input.stripeCustomerId;
		}
		if (!user.billingEmail) {
			patch.billingEmail = email;
		}
		if (Object.keys(patch).length > 0) {
			await prisma.user.update({
				where: { id: user.id },
				data: patch,
			});
		}
		console.log(
			`[promote-lead] reusing existing user ${user.id} (${email}) — skipping activation`,
		);
	}

	// 2. Create the Organization
	const org = await prisma.organization.create({
		data: {
			name: orgName,
			ownerId: user.id,
			plan: input.plan,
			status: "active",
		},
	});

	// 3. Membership (owner)
	await prisma.membership.upsert({
		where: {
			userId_organizationId: {
				userId: user.id,
				organizationId: org.id,
			},
		},
		create: {
			userId: user.id,
			organizationId: org.id,
			role: "owner",
		},
		update: { role: "owner" },
	});

	// 4. Environment from lead.domain
	const normalizedDomain = lead.domain
		.replace(/^https?:\/\//, "")
		.replace(/\/+$/, "");
	const landingUrl = lead.domain.startsWith("http")
		? lead.domain
		: `https://${normalizedDomain}`;
	const env = await prisma.environment.create({
		data: {
			organizationId: org.id,
			domain: normalizedDomain,
			landingUrl,
			isProduction: true,
		},
	});

	// 5. BusinessProfile from lead fields
	await prisma.businessProfile.create({
		data: {
			organizationId: org.id,
			businessModel: lead.businessModel || "ecommerce",
			monthlyRevenue: lead.monthlyRevenue || null,
			averageOrderValue: lead.averageTicket || null,
			conversionModel: lead.conversionModel || "checkout",
		},
	});

	// 6. Persist phone + notification prefs from lead
	if (lead.phone) {
		await prisma.user.update({
			where: { id: user.id },
			data: { phone: lead.phone },
		});
		await prisma.notificationPreference
			.upsert({
				where: { userId: user.id },
				create: {
					userId: user.id,
					emailEnabled: true,
					smsEnabled: false,
					whatsappEnabled: false,
				},
				update: {},
			})
			.catch((err) => {
				console.warn(
					`[promote-lead] notification prefs upsert failed for ${user!.id}:`,
					err,
				);
			});
	}

	// 7. AuditCycle for the FULL audit (not shallow this time —
	//    they paid, give them the real thing). Fire-and-forget worker.
	const cycle = await prisma.auditCycle.create({
		data: {
			organizationId: org.id,
			environmentId: env.id,
			status: "pending",
			cycleType: "full",
		},
	});

	import("./run-cycle")
		.then((m) => m.runAuditCycle(cycle.id))
		.catch((err) => {
			console.error(
				`[promote-lead] audit dispatch failed for cycle ${cycle.id}:`,
				err,
			);
		});

	// 8. Send activation email. For NEW users, the link lands on
	//    /activate/:token and offers Google/GitHub/password. For
	//    existing users (returning buyers), we skip — they already
	//    have a working auth method; they can sign in at /auth/signin
	//    using whatever they set up originally.
	//    Failure to send is non-fatal: Admin can regenerate the token
	//    manually from /app/admin/users if a lead ever reports they
	//    didn't receive anything.
	if (activationToken && !activationSkipReason) {
		try {
			await sendActivationEmail(email, activationToken, normalizedDomain);
			console.log(`[promote-lead] activation email sent to ${email}`);
		} catch (err) {
			console.error(`[promote-lead] activation email send failed:`, err);
		}
	} else {
		console.log(
			`[promote-lead] activation email skipped for ${email} — user already has auth set up`,
		);
	}

	// 9. Mark lead converted
	await prisma.anonymousLead.update({
		where: { id: input.leadId },
		data: {
			status: "converted",
			promotedToUserId: user.id,
			promotedToOrgId: org.id,
		},
	});

	console.log(
		`[promote-lead] complete — lead ${input.leadId} → user ${user.id} / org ${org.id}`,
	);

	return {
		leadId: input.leadId,
		userId: user.id,
		organizationId: org.id,
		environmentId: env.id,
		auditCycleId: cycle.id,
		wasNewUser,
	};
}
