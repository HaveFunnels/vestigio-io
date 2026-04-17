import AppSidebarLayout from "@/components/app/AppSidebarLayout";
import { McpDataProvider, type McpDataSnapshot } from "@/components/app/McpDataProvider";
import { resolveOrgContext } from "@/libs/resolve-org";
import { ensureContext, loadFindings, loadActions, loadChangeReport, loadWorkspaces, loadAllMaps } from "@/lib/console-data";
import { AppProviders } from "./providers";
import { syncUserLocale } from "@/libs/sync-locale";
import { loadEngineTranslations } from "@/lib/engine-translations";
import { startHealthCheckTimer } from "@/libs/health-checker";
import { touchEnvActivity, resumeIfPaused } from "@/libs/env-activity";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";

export const metadata = {
	title: "Vestigio",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
	// Start background health checks (idempotent — only runs once per process)
	startHealthCheckTimer();

	const orgCtx = await resolveOrgContext();

	// Sync the user's persisted locale preference from DB → cookie
	// so the i18n middleware picks it up on subsequent requests.
	await syncUserLocale();

	// Load engine translations for the user's locale (server-side only)
	const engineTranslations = await loadEngineTranslations();

	// Auto-bootstrap: load persisted evidence into MCP server singleton
	// so Analysis / Actions / Maps / Chat pages render data on first visit.
	if (!orgCtx.isAdmin) {
		await ensureContext({
			orgId: orgCtx.orgId,
			orgName: orgCtx.orgName,
			orgType: orgCtx.orgType,
			envId: orgCtx.envId,
			domain: orgCtx.domain,
			engineTranslations,
		});

		// Wave 5 Fase 2 — activity tracking + auto-resume. Non-blocking best
		// effort; if DB is unreachable the layout still renders.
		// Wave 5 Fase 2 fix (#10): skip when an admin is impersonating the
		// owner — otherwise an ops/sales session keeps resetting the
		// owner's lastAccessedAt and indefinitely defers the inactivity
		// pause for an org the customer hasn't actually opened.
		const session = await getServerSession(authOptions);
		const isImpersonating = (session?.user as any)?.isImpersonating === true;
		if (
			orgCtx.envId &&
			orgCtx.envId !== "default" &&
			orgCtx.envId !== "env_1" &&
			!isImpersonating
		) {
			await touchEnvActivity(orgCtx.envId);
			await resumeIfPaused(orgCtx.envId);
		}
	}

	// Pre-load all MCP data server-side and pass to client via context.
	// Client components ("use client") cannot access the MCP server directly
	// because it only exists in the Node.js server process.
	const mcpData: McpDataSnapshot = {
		findings: loadFindings(),
		actions: loadActions(),
		changeReport: loadChangeReport(),
		workspaces: loadWorkspaces(),
		maps: loadAllMaps(),
	};

	const currentOrg = {
		orgId: orgCtx.orgId,
		orgName: orgCtx.orgName,
		envId: orgCtx.envId,
		domain: orgCtx.domain,
		environments: orgCtx.environments,
		maxEnvironments: orgCtx.maxEnvironments,
	};

	return (
		<AppProviders>
			<McpDataProvider data={mcpData}>
				<AppSidebarLayout
					isAdmin={orgCtx.isAdmin}
					orgCtx={currentOrg}
					plan={orgCtx.plan}
				>
					{children}
				</AppSidebarLayout>
			</McpDataProvider>
		</AppProviders>
	);
}
