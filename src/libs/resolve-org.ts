import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

/**
 * Resolved org context for layouts and API routes.
 * In production: reads from session + DB (membership + organization).
 * In dev without DB: falls back to a safe demo context.
 */
export interface OrgEnvironment {
	id: string;
	domain: string;
	isProduction: boolean;
}

export interface OrgContext {
	orgId: string;
	orgName: string;
	envId: string;
	domain: string;
	plan: string;
	isAdmin: boolean;
	environments: OrgEnvironment[];
	maxEnvironments: number;
}

const DEMO_CONTEXT: OrgContext = {
	orgId: "demo",
	orgName: "Demo Org",
	envId: "env_1",
	domain: "shop.com",
	plan: "vestigio",
	isAdmin: false,
	environments: [{ id: "env_1", domain: "shop.com", isProduction: true }],
	maxEnvironments: 1,
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
							orderBy: { createdAt: "asc" },
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
		const allEnvs = org.environments;
		// Default to first production env, fallback to first env
		const defaultEnv = allEnvs.find(e => e.isProduction) || allEnvs[0];

		// Resolve plan limits
		const planLimits: Record<string, number> = { vestigio: 1, pro: 3, max: 10 };
		const maxEnvs = planLimits[org.plan || "vestigio"] || 1;

		return {
			orgId: org.id,
			orgName: org.name,
			envId: defaultEnv?.id || "default",
			domain: defaultEnv?.domain || "unknown",
			plan: org.plan || "vestigio",
			isAdmin,
			environments: allEnvs.map(e => ({ id: e.id, domain: e.domain, isProduction: e.isProduction })),
			maxEnvironments: maxEnvs,
		};
	} catch {
		// DB not available (dev without postgres, build phase, etc.)
		return DEMO_CONTEXT;
	}
}
