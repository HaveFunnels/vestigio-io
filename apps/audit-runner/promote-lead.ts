import { prisma } from "@/libs/prismaDb";
import { sendMagicLink } from "@/libs/notification-triggers";
import { randomBytes, createHash } from "node:crypto";

// ──────────────────────────────────────────────
// Lead → Customer Promotion
//
// Called from the Paddle webhook (handleOnboardingActivation) when
// custom_data.leadId is present on a transaction.completed or
// subscription.created event. Converts an AnonymousLead row into a
// real authenticated customer:
//
//   1. Look up the lead → must be in audit_complete or checkout_started
//   2. Resolve / create the User (reuse if email already exists)
//   3. Create the Organization (status='active', plan from price)
//   4. Create the Membership (User as owner)
//   5. Create the Environment from lead.domain
//   6. Create the BusinessProfile from lead fields
//   7. Mint a magic-link token + send via Brevo so the visitor can
//      log in without setting a password
//   8. Create an AuditCycle and fire-and-forget runAuditCycle for
//      a real (full mode) audit on the new env
//   9. Mark lead status='converted' + record promotedToUserId/OrgId
//
// Idempotency: if called twice for the same lead (Paddle retries),
// the second call short-circuits because lead.status === 'converted'.
//
// Email collision policy (decided 2026-04-07): reuse existing User.
// If the email is already in our system (from a previous signup or
// a previous /lp purchase), the new Org gets attached to the same
// User and the magic link goes to the same address. Multi-org support
// is already in the schema (User → Membership[] → Organization[]).
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

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function generateMagicLinkToken(): { token: string; hashed: string } {
	const token = randomBytes(32).toString("hex");
	// NextAuth's email provider hashes the token with sha256(token + secret)
	// before storing in VerificationToken. We mirror that exactly so the
	// /api/auth/callback/email handler can verify the token we minted.
	// Source: node_modules/next-auth/src/core/lib/utils.ts:hashToken()
	// Vestigio's auth.ts uses process.env.SECRET (see src/libs/auth.ts:58)
	const secret = process.env.SECRET || "";
	const hashed = createHash("sha256")
		.update(`${token}${secret}`)
		.digest("hex");
	return { token, hashed };
}

function buildMagicLinkUrl(email: string, token: string): string {
	const base =
		process.env.NEXTAUTH_URL ||
		process.env.NEXT_PUBLIC_APP_URL ||
		"https://vestigio.io";
	const params = new URLSearchParams({
		callbackUrl: `${base}/app/inventory`,
		token,
		email,
	});
	return `${base}/api/auth/callback/email?${params.toString()}`;
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

	if (!user) {
		user = await prisma.user.create({
			data: {
				email,
				name: orgName,
				password: "", // empty — magic link is the only way in
				customerId: input.stripeCustomerId || null,
			},
		});
		console.log(`[promote-lead] created new user ${user.id} (${email})`);
	} else {
		// Update customer id if it's not set yet (e.g. existing free
		// user converting via /lp)
		if (input.stripeCustomerId && !user.customerId) {
			await prisma.user.update({
				where: { id: user.id },
				data: { customerId: input.stripeCustomerId },
			});
		}
		console.log(`[promote-lead] reusing existing user ${user.id} (${email})`);
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

	// 8. Mint magic link + send email. Brevo path is preferred (uses
	//    no-reply@vestigio.io sender). Failure to send is non-fatal —
	//    user can still log in via /auth/signin if they know the email.
	try {
		const { token, hashed } = generateMagicLinkToken();
		const expires = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

		await prisma.verificationToken.create({
			data: {
				identifier: email,
				token: hashed,
				expires,
			},
		});

		const magicUrl = buildMagicLinkUrl(email, token);
		await sendMagicLink(email, magicUrl);
		console.log(`[promote-lead] magic link sent to ${email}`);
	} catch (err) {
		console.error(`[promote-lead] magic link send failed:`, err);
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
