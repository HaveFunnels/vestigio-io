import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

/**
 * Resolved org context for layouts and API routes.
 * In production: reads from session + DB (membership + organization).
 * In dev without DB: falls back to a safe demo context.
 */
export interface OrgContext {
	orgId: string;
	orgName: string;
	envId: string;
	domain: string;
	plan: string;
	isAdmin: boolean;
}

const DEMO_CONTEXT: OrgContext = {
	orgId: "demo",
	orgName: "Demo Org",
	envId: "env_1",
	domain: "shop.com",
	plan: "vestigio",
	isAdmin: false,
};

/**
 * Resolve the current user's organization context from session + DB.
 * Falls back to demo context when DB is unavailable or user has no membership.
 */
export async function resolveOrgContext(): Promise<OrgContext> {
	try {
		const session = await getServerSession(authOptions);
		if (!session?.user) return DEMO_CONTEXT;

		const userId = (session.user as any).id;
		if (!userId) return DEMO_CONTEXT;

		const isAdmin = (session.user as any).role === "ADMIN";

		// Dynamically import prisma to avoid hard dep in all paths
		const { prisma } = await import("@/libs/prismaDb");

		const membership = await prisma.membership.findFirst({
			where: { userId },
			include: {
				organization: {
					include: {
						environments: {
							where: { isProduction: true },
							take: 1,
						},
					},
				},
			},
			orderBy: { createdAt: "desc" },
		});

		if (!membership?.organization) {
			return { ...DEMO_CONTEXT, isAdmin };
		}

		const org = membership.organization;
		const env = org.environments[0];

		return {
			orgId: org.id,
			orgName: org.name,
			envId: env?.id || "default",
			domain: env?.domain || "unknown",
			plan: org.plan || "vestigio",
			isAdmin,
		};
	} catch {
		// DB not available (dev without postgres, build phase, etc.)
		return DEMO_CONTEXT;
	}
}
