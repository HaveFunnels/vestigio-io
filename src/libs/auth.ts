import { prisma } from "@/libs/prismaDb";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { User } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
	type NextAuthOptions,
	DefaultSession,
	getServerSession,
} from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import EmailProvider from "next-auth/providers/email";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import { sendMagicLink } from "@/libs/notification-triggers";

declare module "next-auth" {
	interface Session extends DefaultSession {
		user: User & DefaultSession["user"];
	}
}

// ── Account lockout: track failed attempts ──
const failedAttempts: Record<string, { count: number; lockedUntil: number }> = {};
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function checkLockout(email: string): boolean {
	const entry = failedAttempts[email];
	if (!entry) return false;
	if (entry.lockedUntil > Date.now()) return true;
	// Lockout expired — reset
	delete failedAttempts[email];
	return false;
}

function recordFailedAttempt(email: string): void {
	const entry = failedAttempts[email] || { count: 0, lockedUntil: 0 };
	entry.count += 1;
	if (entry.count >= MAX_FAILED_ATTEMPTS) {
		entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
	}
	failedAttempts[email] = entry;
}

function clearFailedAttempts(email: string): void {
	delete failedAttempts[email];
}

// Generic error message to prevent email enumeration
const INVALID_CREDENTIALS = "Invalid email or password";

// ──────────────────────────────────────────────
// Activation-aware adapter wrapper
//
// Standard PrismaAdapter: on OAuth signin, NextAuth calls
//   1. getUserByAccount() — check if we've seen this OAuth id before
//   2. getUserByEmail() — fallback to email match (returns null unless
//      allowDangerousEmailAccountLinking is set)
//   3. createUser() — mint a new User when nothing matched
//
// For the /lp activation flow we want the OAuth account to link to
// the PENDING user (the one we pre-created in promote-lead.ts with
// a specific activationToken), NOT a fresh User minted from the
// OAuth profile. We detect "this is an activation flow" by reading
// the `vestigio_activation_token` httpOnly cookie that /api/activate/
// oauth-prepare set before the OAuth redirect.
//
// The override is narrow: ONLY when the cookie is present AND matches
// a pending user. Normal OAuth signups (home-page freemium flow,
// future) keep stock behavior.
// ──────────────────────────────────────────────

function wrapAdapterForActivation(
	base: ReturnType<typeof PrismaAdapter>,
): ReturnType<typeof PrismaAdapter> {
	async function findPendingUserFromCookie() {
		try {
			// Imported lazily so module load doesn't fail in non-Next
			// environments (scripts, tests) that import auth.ts.
			const { cookies } = await import("next/headers");
			const jar = await cookies();
			const token = jar.get("vestigio_activation_token")?.value;
			if (!token) return null;
			return await prisma.user.findFirst({
				where: {
					activationToken: token,
					activationTokenExpiresAt: { gt: new Date() },
					activatedAt: null,
				},
			});
		} catch {
			return null;
		}
	}

	return {
		...base,
		async createUser(data: any) {
			const pending = await findPendingUserFromCookie();
			if (pending) {
				// Don't create a new User — update the pending one with the
				// OAuth profile fields and mark it activated. NextAuth will
				// then call linkAccount() which attaches the Account row to
				// this same User id (the id we return here).
				const updated = await prisma.user.update({
					where: { id: pending.id },
					data: {
						// Prefer OAuth email for login (user explicitly chose
						// this identity). billingEmail stays as the Paddle
						// email — invoices keep going there.
						email: data.email ?? pending.email,
						name: data.name ?? pending.name ?? undefined,
						image: data.image ?? pending.image ?? undefined,
						emailVerified: new Date(),
						activatedAt: new Date(),
						activationToken: null,
						activationTokenExpiresAt: null,
					},
				});
				return updated as any;
			}
			return base.createUser!(data);
		},
		async getUserByEmail(email: string) {
			const pending = await findPendingUserFromCookie();
			if (pending) {
				// Suppress email-match during activation so NextAuth falls
				// through to createUser(), where our override redirects the
				// flow to the pending user. Without this, if OAuth email
				// happened to equal billingEmail, NextAuth would short-
				// circuit here and skip createUser — and with it our
				// linkage logic.
				return null;
			}
			return base.getUserByEmail!(email);
		},
	} as ReturnType<typeof PrismaAdapter>;
}

export const authOptions: NextAuthOptions = {
	pages: {
		signIn: "/auth/signin",
	},
	adapter: wrapAdapterForActivation(PrismaAdapter(prisma)),
	secret: process.env.SECRET,
	session: {
		strategy: "jwt",
		maxAge: 12 * 60 * 60, // 12 hours
	},
	jwt: {
		maxAge: 12 * 60 * 60, // 12 hours
	},

	providers: [
		CredentialsProvider({
			name: "credentials",
			id: "credentials",
			credentials: {
				email: { label: "Email", type: "text" },
				password: { label: "Password", type: "password" },
			},

			async authorize(credentials) {
				if (!credentials?.email || !credentials?.password) {
					throw new Error(INVALID_CREDENTIALS);
				}

				const email = credentials.email.toLowerCase();

				// Check account lockout
				if (checkLockout(email)) {
					throw new Error("Account temporarily locked. Try again in 15 minutes.");
				}

				const user = await prisma.user.findUnique({
					where: { email },
				});

				// User not found — same error as wrong password (prevent enumeration)
				if (!user || !user.password) {
					recordFailedAttempt(email);
					throw new Error(INVALID_CREDENTIALS);
				}

				const passwordMatch = await bcrypt.compare(
					credentials.password,
					user.password
				);

				if (!passwordMatch) {
					recordFailedAttempt(email);
					throw new Error(INVALID_CREDENTIALS);
				}

				// Successful login — clear failed attempts
				clearFailedAttempts(email);
				return user;
			},
		}),

		CredentialsProvider({
			name: "impersonate",
			id: "impersonate",
			credentials: {
				adminEmail: { label: "Admin Email", type: "text" },
				adminPassword: { label: "Admin Password", type: "password" },
				userEmail: { label: "User Email", type: "text" },
			},

			async authorize(credentials) {
				if (!credentials?.adminEmail || !credentials?.userEmail || !credentials?.adminPassword) {
					throw new Error("Admin email, password, and target user email are required");
				}

				const admin = await prisma.user.findUnique({
					where: { email: credentials.adminEmail.toLowerCase() },
				});

				if (!admin || admin.role !== "ADMIN") {
					throw new Error("Access denied");
				}

				// Require admin to re-authenticate with password
				if (!admin.password) {
					throw new Error("Admin account has no password configured");
				}

				const passwordMatch = await bcrypt.compare(
					credentials.adminPassword,
					admin.password
				);

				if (!passwordMatch) {
					throw new Error("Invalid admin password");
				}

				const user = await prisma.user.findUnique({
					where: { email: credentials.userEmail.toLowerCase() },
				});

				if (!user) {
					throw new Error("Target user not found");
				}

				return user;
			},
		}),

		// fetchSession provider REMOVED — was a security vulnerability
		// (authenticated any user by email alone without password)

		EmailProvider({
			server: {
				host: process.env.EMAIL_SERVER_HOST,
				port: Number(process.env.EMAIL_SERVER_PORT),
				auth: {
					user: process.env.EMAIL_SERVER_USER,
					pass: process.env.EMAIL_SERVER_PASSWORD,
				},
			},
			from: process.env.EMAIL_FROM,
			// Use Brevo via the unified notification service when configured.
			// Falls back to NextAuth's built-in nodemailer transport otherwise.
			sendVerificationRequest: async ({ identifier, url }) => {
				if (process.env.BREVO_API_KEY) {
					await sendMagicLink(identifier, url);
					return;
				}
				// Default nodemailer path — re-emit using SMTP env vars
				const nodemailer = await import("nodemailer");
				const transport = nodemailer.createTransport({
					host: process.env.EMAIL_SERVER_HOST,
					port: Number(process.env.EMAIL_SERVER_PORT) || 587,
					auth: {
						user: process.env.EMAIL_SERVER_USER,
						pass: process.env.EMAIL_SERVER_PASSWORD,
					},
				});
				await transport.sendMail({
					to: identifier,
					from: process.env.EMAIL_FROM,
					subject: "Sign in to Vestigio",
					text: `Sign in to Vestigio: ${url}`,
					html: `<p>Click the link to sign in: <a href="${url}">${url}</a></p>`,
				});
			},
		}),

		...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
			? [GitHubProvider({
				clientId: process.env.GITHUB_CLIENT_ID,
				clientSecret: process.env.GITHUB_CLIENT_SECRET,
			})]
			: []),

		...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
			? [GoogleProvider({
				clientId: process.env.GOOGLE_CLIENT_ID,
				clientSecret: process.env.GOOGLE_CLIENT_SECRET,
			})]
			: []),

		...(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
			? [AppleProvider({
				clientId: process.env.APPLE_CLIENT_ID,
				clientSecret: process.env.APPLE_CLIENT_SECRET,
			})]
			: []),
	],

	callbacks: {
		redirect: async ({ url, baseUrl }) => {
			if (url.startsWith("/")) {
				if (url.startsWith("/auth/")) return `${baseUrl}/app`;
				return `${baseUrl}${url}`;
			}
			if (url.startsWith(baseUrl)) return url;
			return `${baseUrl}/app`;
		},

		jwt: async (payload: any) => {
			const { token, trigger, session, account } = payload;
			const user: User = payload.user;

			// hasActivatedEnv (Wave 5 Fase 2) — true when the user has at
			// least one Environment with activated=true. The middleware uses
			// this to route members-with-shell-orgs through onboarding before
			// letting them hit the console. Kept separate from hasOrganization
			// so admin-provisioned orgs (which have membership but no env)
			// land in onboarding instead of an empty dashboard.
			async function resolveActivationSignals(userId: string) {
				const membership = await prisma.membership.findFirst({
					where: {
						userId,
						organization: { status: "active" },
					},
					select: { organizationId: true },
				});
				if (!membership) {
					return { hasOrganization: false, hasActivatedEnv: false };
				}
				const env = await prisma.environment.findFirst({
					where: {
						organizationId: membership.organizationId,
						activated: true,
					},
					select: { id: true },
				});
				return { hasOrganization: true, hasActivatedEnv: !!env };
			}

			if (trigger === "update") {
				const signals = await resolveActivationSignals(token.sub as string);
				return {
					...token,
					...(session?.user || {}),
					hasOrganization: signals.hasOrganization,
					hasActivatedEnv: signals.hasActivatedEnv,
					picture: session?.user?.image ?? token.picture,
					image: session?.user?.image ?? token.image,
					locale: session?.user?.locale ?? token.locale,
				};
			}

			if (user) {
				const signals = await resolveActivationSignals(user.id);
				const isImpersonating = account?.provider === "impersonate";

				return {
					...token,
					uid: user.id,
					hasOrganization: signals.hasOrganization,
					hasActivatedEnv: signals.hasActivatedEnv,
					isImpersonating,
					impersonationStartedAt: isImpersonating ? Date.now() : undefined,
					role: user.role,
					picture: user.image,
					image: user.image,
					locale: user.locale || "en",
					// Sensitive billing fields stripped from JWT
					// Access via API when needed, not stored in client token
				};
			}
			return token;
		},

		session: async ({ session, token }) => {
			if (session?.user) {
				return {
					...session,
					user: {
						...session.user,
						id: token.sub,
						hasOrganization: token.hasOrganization ?? true,
						hasActivatedEnv: token.hasActivatedEnv ?? false,
						isImpersonating: token.isImpersonating ?? false,
						role: token.role,
						image: token.picture,
						locale: token.locale ?? "en",
						// Billing fields not exposed in session
					},
				};
			}
			return session;
		},
	},
};

export const getAuthSession = async () => {
	return getServerSession(authOptions);
};
