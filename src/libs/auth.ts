import { prisma } from "@/libs/prismaDb";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { User } from "@prisma/client";
import bcrypt from "bcrypt";
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

export const authOptions: NextAuthOptions = {
	pages: {
		signIn: "/auth/signin",
	},
	adapter: PrismaAdapter(prisma),
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

			if (trigger === "update") {
				const membership = await prisma.membership.findFirst({
					where: {
						userId: token.sub as string,
						organization: { status: "active" },
					},
				});
				return {
					...token,
					...(session?.user || {}),
					hasOrganization: !!membership,
					picture: session?.user?.image ?? token.picture,
					image: session?.user?.image ?? token.image,
					locale: session?.user?.locale ?? token.locale,
				};
			}

			if (user) {
				const membership = await prisma.membership.findFirst({
					where: {
						userId: user.id,
						organization: { status: "active" },
					},
				});

				const isImpersonating = account?.provider === "impersonate";

				return {
					...token,
					uid: user.id,
					hasOrganization: !!membership,
					isImpersonating,
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
