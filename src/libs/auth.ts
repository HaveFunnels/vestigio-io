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

declare module "next-auth" {
	interface Session extends DefaultSession {
		user: User & DefaultSession["user"];
	}
}

export const authOptions: NextAuthOptions = {
	pages: {
		signIn: "/auth/signin",
	},
	adapter: PrismaAdapter(prisma),
	secret: process.env.SECRET,
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
				email: { label: "Email", type: "text", placeholder: "Jhondoe" },
				password: { label: "Password", type: "password" },
				username: { label: "Username", type: "text", placeholder: "Jhon Doe" },
			},

			async authorize(credentials) {
				// check to see if eamil and password is there
				if (!credentials?.email || !credentials?.password) {
					throw new Error("Please enter an email or password");
				}

				// check to see if user already exist
				const user = await prisma.user.findUnique({
					where: {
						email: credentials.email,
					},
				});

				// if user was not found
				if (!user || !user?.password) {
					throw new Error("No user found");
				}

				// check to see if passwords match
				const passwordMatch = await bcrypt.compare(
					credentials.password,
					user.password
				);

				if (!passwordMatch) {
					throw new Error("Incorrect password");
				}

				return user;
			},
		}),

		CredentialsProvider({
			name: "impersonate",
			id: "impersonate",
			credentials: {
				adminEmail: {
					label: "Admin Email",
					type: "text",
					placeholder: "Jhondoe@gmail.com",
				},
				userEmail: {
					label: "User Email",
					type: "text",
					placeholder: "Jhondoe@gmail.com",
				},
			},

			async authorize(credentials) {
				// check to see if eamil and password is there
				if (!credentials?.adminEmail || !credentials?.userEmail) {
					throw new Error("User email or Admin email is missing");
				}

				const admin = await prisma.user.findUnique({
					where: {
						email: credentials.adminEmail.toLocaleLowerCase(),
					},
				});

				const user = await prisma.user.findUnique({
					where: {
						email: credentials.userEmail.toLocaleLowerCase(),
					},
				});

				if (!admin || admin.role !== "ADMIN") {
					throw new Error("Access denied");
				}

				// if user was not found
				if (!user) {
					throw new Error("No user found");
				}
				return user;
			},
		}),
		CredentialsProvider({
			name: "fetchSession",
			id: "fetchSession",
			credentials: {
				email: {
					label: "User Email",
					type: "text",
					placeholder: "Jhondoe@gmail.com",
				},
			},

			async authorize(credentials) {
				// check to see if eamil and password is there
				if (!credentials?.email) {
					throw new Error("User email is missing");
				}

				const user = await prisma.user.findUnique({
					where: {
						email: credentials.email.toLocaleLowerCase(),
					},
				});

				// if user was not found
				if (!user) {
					throw new Error("No user found");
				}
				return user;
			},
		}),

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
	],

	callbacks: {
		redirect: async ({ url, baseUrl }) => {
			// If the url is a relative path, prefix with baseUrl
			if (url.startsWith("/")) {
				// Prevent redirect loops to auth pages after sign-in
				if (url.startsWith("/auth/")) return `${baseUrl}/app`;
				return `${baseUrl}${url}`;
			}
			// Same origin — allow
			if (url.startsWith(baseUrl)) return url;
			// Default — go to app (middleware handles onboarding gate)
			return `${baseUrl}/app`;
		},

		jwt: async (payload: any) => {
			const { token, trigger, session, account } = payload;
			const user: User = payload.user;

			if (trigger === "update") {
				// Re-check org membership from DB on session refresh
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
					priceId: session?.user?.priceId ?? token.priceId,
					currentPeriodEnd: session?.user?.currentPeriodEnd ?? token.currentPeriodEnd,
					subscriptionId: session?.user?.subscriptionId ?? token.subscriptionId,
					customerId: session?.user?.customerId ?? token.customerId,
				};
			}

			if (user) {
				// Initial sign-in — check if user has an active organization
				const membership = await prisma.membership.findFirst({
					where: {
						userId: user.id,
						organization: { status: "active" },
					},
				});

				// Mark impersonated sessions so middleware allows admin-as-user access
				const isImpersonating = account?.provider === "impersonate";

				return {
					...token,
					uid: user.id,
					hasOrganization: !!membership,
					isImpersonating,
					priceId: user.priceId,
					currentPeriodEnd: user.currentPeriodEnd,
					subscriptionId: user.subscriptionId,
					role: user.role,
					picture: user.image,
					image: user.image,
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
						priceId: token.priceId,
						currentPeriodEnd: token.currentPeriodEnd,
						subscriptionId: token.subscriptionId,
						role: token.role,
						image: token.picture,
					},
				};
			}
			return session;
		},
	},

	// debug: process.env.NODE_ENV === "developement",
};

export const getAuthSession = async () => {
	return getServerSession(authOptions);
};
