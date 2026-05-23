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
	// Wave 5 Fase 2 — let the layout render the paused banner without a
	// second DB roundtrip. Defaults to false on environments that haven't
	// been migrated yet.
	continuousPaused?: boolean;
	activated?: boolean;
}

export interface OrgContext {
	orgId: string;
	orgName: string;
	orgType: string;
	envId: string;
	domain: string;
	plan: string;
	/** Lifecycle state: active | pending | suspended.
	 *  suspended = past D+14 without payment, or chargeback. Layout
	 *  redirects to /app/billing when suspended so the user can
	 *  re-pay; everything else in /app/* is gated. */
	status: string;
	isAdmin: boolean;
	environments: OrgEnvironment[];
	maxEnvironments: number;
	/** Platform language for the entire org (single source of truth) */
	locale: string;
	/** ISO 4217 currency code resolved from org override or org locale */
	currency: string;
}

const DEMO_CONTEXT: OrgContext = {
	orgId: "demo",
	orgName: "Demo Org",
	orgType: "demo",
	envId: "env_1",
	domain: "shop.com",
	plan: "vestigio",
	status: "active",
	isAdmin: false,
	environments: [{ id: "env_1", domain: "shop.com", isProduction: true, continuousPaused: false, activated: true }],
	maxEnvironments: 1,
	locale: "en",
	currency: "USD",
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

		// Wave 22 Fase B+ — honor the active_env cookie so the layout
		// (sidebar dropdown, MCP context, env-scoped APIs) all agree on
		// which env the user is viewing. Previously resolveOrgContext
		// ignored the cookie and always picked the first prod env, so
		// switching envs via the sidebar updated only the cookie — the
		// dropdown's highlighted state + the data loaded by the layout
		// stayed on env_1 until a hard reload.
		//
		// Fallback chain:
		//   1. active_env cookie (if it points at a valid env)
		//   2. first production env (legacy behavior)
		//   3. first env (defense — every org should have at least one)
		const { cookies } = await import("next/headers");
		const cookieStore = await cookies();
		const cookieEnvId = cookieStore.get("active_env")?.value;
		const validIds = new Set(allEnvs.map(e => e.id));
		const cookieEnv = cookieEnvId && validIds.has(cookieEnvId)
			? allEnvs.find(e => e.id === cookieEnvId)
			: null;
		const defaultEnv = cookieEnv
			|| allEnvs.find(e => e.isProduction)
			|| allEnvs[0];

		// Resolve plan limits
		const planLimits: Record<string, number> = { vestigio: 1, pro: 3, max: 10 };
		const maxEnvs = planLimits[org.plan || "vestigio"] || 1;

		// Resolve locale: org setting > owner User.locale > 'en'
		const orgLocale = (org as any).locale
			|| (session.user as any).locale
			|| 'en';

		// Resolve currency: org override > derived from org locale > USD
		let currency = "USD";
		if ((org as any).currency) {
			currency = (org as any).currency;
		} else {
			if (orgLocale?.startsWith("pt")) currency = "BRL";
			else if (orgLocale?.startsWith("de")) currency = "EUR";
		}

		return {
			orgId: org.id,
			orgName: org.name,
			orgType: org.orgType || "customer",
			envId: defaultEnv?.id || "default",
			domain: defaultEnv?.domain || "unknown",
			plan: org.plan || "vestigio",
			status: org.status || "active",
			isAdmin,
			locale: orgLocale,
			environments: allEnvs.map(e => ({
				id: e.id,
				domain: e.domain,
				isProduction: e.isProduction,
				continuousPaused: (e as any).continuousPaused ?? false,
				activated: (e as any).activated ?? false,
			})),
			maxEnvironments: maxEnvs,
			currency,
		};
	} catch {
		// DB not available (dev without postgres, build phase, etc.)
		return DEMO_CONTEXT;
	}
}
