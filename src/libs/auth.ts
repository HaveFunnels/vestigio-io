import { prisma } from "@/libs/prismaDb";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { User } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
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

// ──────────────────────────────────────────────
// Restore-admin token helpers
//
// The exit-impersonation endpoint mints a short-lived HMAC token bound
// to the admin's email + an expiry. The restore-admin Credentials
// provider verifies it. Server-side only — never exposed to the client
// outside of the one-shot exit flow.
// ──────────────────────────────────────────────

const RESTORE_TOKEN_TTL_MS = 60 * 1000; // 60 seconds is plenty for a redirect.

function getRestoreSecret(): string {
	const secret = process.env.NEXTAUTH_SECRET;
	if (!secret) throw new Error("NEXTAUTH_SECRET is required to mint restore tokens");
	return secret;
}

export function signRestoreToken(adminEmail: string): string {
	const expiresAt = Date.now() + RESTORE_TOKEN_TTL_MS;
	const payload = `${adminEmail.toLowerCase()}.${expiresAt}`;
	const sig = crypto
		.createHmac("sha256", getRestoreSecret())
		.update(payload)
		.digest("hex");
	// Token format: <expiresAt>.<sig>. AdminEmail is passed alongside as
	// a separate credential so the verify side can re-derive the payload.
	return `${expiresAt}.${sig}`;
}

export function verifyRestoreToken(token: string, adminEmail: string): boolean {
	const parts = token.split(".");
	if (parts.length !== 2) return false;
	const expiresAt = parseInt(parts[0], 10);
	if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
	const expectedSig = crypto
		.createHmac("sha256", getRestoreSecret())
		.update(`${adminEmail.toLowerCase()}.${expiresAt}`)
		.digest("hex");
	try {
		return crypto.timingSafeEqual(
			Buffer.from(parts[1], "hex"),
			Buffer.from(expectedSig, "hex"),
		);
	} catch {
		return false;
	}
}

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
	// Cookie lifetime is the upper bound: 30 days. The actual session
	// expiry is per-login — when the user checks "Remember me" we honor
	// the full 30 days; when they don't, we enforce a 12h hard cap via
	// `token.expiresAt` in the JWT callback (see below). This is how
	// NextAuth's JWT strategy lets us do per-session lifetimes without
	// fighting the static cookie config.
	session: {
		strategy: "jwt",
		maxAge: 30 * 24 * 60 * 60, // 30 days
	},
	jwt: {
		maxAge: 30 * 24 * 60 * 60, // 30 days
	},

	providers: [
		CredentialsProvider({
			name: "credentials",
			id: "credentials",
			credentials: {
				email: { label: "Email", type: "text" },
				password: { label: "Password", type: "password" },
				remember: { label: "Remember me", type: "text" },
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
				// Carry the "remember me" choice onto the user object so the
				// JWT callback can set the right per-session expiry. The
				// `_remember` key is local to this hand-off and is not
				// persisted in the database; the JWT callback reads it and
				// then drops it.
				return { ...user, _remember: credentials.remember === "true" } as any;
			},
		}),

		CredentialsProvider({
			name: "impersonate",
			id: "impersonate",
			credentials: {
				adminEmail: { label: "Admin Email", type: "text" },
				userEmail: { label: "User Email", type: "text" },
			},

			async authorize(credentials) {
				if (!credentials?.adminEmail || !credentials?.userEmail) {
					throw new Error("Admin email and target user email are required");
				}

				// Verify the caller is actually an admin — this is the
				// security gate. The admin session was already authenticated
				// via their normal login, and the /api/admin/impersonate
				// endpoint also checks ADMIN role + logs to audit trail.
				const admin = await prisma.user.findUnique({
					where: { email: credentials.adminEmail.toLowerCase() },
				});

				if (!admin || admin.role !== "ADMIN") {
					throw new Error("Access denied");
				}

				const user = await prisma.user.findUnique({
					where: { email: credentials.userEmail.toLowerCase() },
				});

				if (!user) {
					throw new Error("Target user not found");
				}

				// Carry the admin's identity onto the user we return so the
				// JWT callback can persist it. That way "exit impersonation"
				// can restore the admin's session without a full sign-out +
				// re-login (which kicks the admin out of the platform).
				return {
					...user,
					originalAdminId: admin.id,
					originalAdminEmail: admin.email,
				} as any;
			},
		}),

		// "Exit impersonation" — restores the admin session without making
		// the admin sign in again. The endpoint /api/admin/exit-impersonation
		// mints a short-lived signed token from the current impersonation
		// JWT (after verifying isImpersonating === true). This provider
		// validates that signature, so the credential cannot be forged from
		// the outside without NEXTAUTH_SECRET.
		CredentialsProvider({
			name: "restore-admin",
			id: "restore-admin",
			credentials: {
				adminEmail: { label: "Admin Email", type: "text" },
				token: { label: "Restore Token", type: "text" },
			},

			async authorize(credentials) {
				if (!credentials?.adminEmail || !credentials?.token) {
					throw new Error("Restore token required");
				}

				const adminEmail = credentials.adminEmail.toLowerCase();
				const valid = verifyRestoreToken(credentials.token, adminEmail);
				if (!valid) {
					throw new Error("Invalid or expired restore token");
				}

				const admin = await prisma.user.findUnique({
					where: { email: adminEmail },
				});
				if (!admin || admin.role !== "ADMIN") {
					throw new Error("Admin no longer has ADMIN role");
				}
				return admin;
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
			// All magic-link emails go through Brevo via the notification service.
			sendVerificationRequest: async ({ identifier, url }) => {
				await sendMagicLink(identifier, url);
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
				const isRestoreAdmin = account?.provider === "restore-admin";
				const anyUser = user as any;

				// Per-login session lifetime. Default to 12h; if the user
				// checked "Remember me" on the password form, extend to 30
				// days (matches the cookie ceiling). OAuth, magic link, and
				// impersonate logins keep the 12h default — they have no
				// way to opt into the longer lifetime, which is conservative.
				const remember = anyUser._remember === true;
				const sessionTtlMs = remember
					? 30 * 24 * 60 * 60 * 1000 // 30d
					: 12 * 60 * 60 * 1000; // 12h
				const expiresAt = Date.now() + sessionTtlMs;

				return {
					...token,
					uid: user.id,
					hasOrganization: signals.hasOrganization,
					hasActivatedEnv: signals.hasActivatedEnv,
					isImpersonating,
					impersonationStartedAt: isImpersonating ? Date.now() : undefined,
					// Carry the admin identity through the impersonation JWT so
					// the exit endpoint can mint a restore token without asking
					// the admin to type their email. Cleared when restoring back.
					originalAdminId: isImpersonating ? anyUser.originalAdminId ?? null : isRestoreAdmin ? undefined : token.originalAdminId,
					originalAdminEmail: isImpersonating ? anyUser.originalAdminEmail ?? null : isRestoreAdmin ? undefined : token.originalAdminEmail,
					// Per-login expiry: the session callback rejects tokens
					// past this timestamp regardless of cookie lifetime.
					sessionExpiresAt: expiresAt,
					rememberMe: remember,
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
				// Per-login expiry enforcement. Cookie persists up to 30
				// days, but `sessionExpiresAt` on the JWT defines the real
				// cutoff for THIS login. If we're past it, return a session
				// with an `expires` in the past so middleware and
				// useSession treat the user as logged out. Existing
				// tokens without sessionExpiresAt (legacy or
				// magic-link/oauth login that didn't set it) fall back to
				// the cookie max-age implicitly.
				const expiresAt = (token as any).sessionExpiresAt as number | undefined;
				if (typeof expiresAt === "number" && Date.now() > expiresAt) {
					return {
						...session,
						expires: new Date(0).toISOString(),
						user: {} as any,
					};
				}

				const sessionExpiresIso = typeof expiresAt === "number"
					? new Date(expiresAt).toISOString()
					: session.expires;

				return {
					...session,
					expires: sessionExpiresIso,
					user: {
						...session.user,
						id: token.sub,
						hasOrganization: token.hasOrganization ?? true,
						hasActivatedEnv: token.hasActivatedEnv ?? false,
						isImpersonating: token.isImpersonating ?? false,
						// Surface originalAdminEmail to the client only while
						// impersonating, so the exit button can address the
						// right admin. Stripped out once the admin restores.
						originalAdminEmail: token.isImpersonating ? (token.originalAdminEmail ?? null) : null,
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
