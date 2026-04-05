import AppSidebarLayout from "@/components/app/AppSidebarLayout";
import { McpDataProvider, type McpDataSnapshot } from "@/components/app/McpDataProvider";
import { resolveOrgContext } from "@/libs/resolve-org";
import { ensureContext, loadFindings, loadActions, loadChangeReport, loadWorkspaces, loadAllMaps } from "@/lib/console-data";
import { AppProviders } from "./providers";
import { syncUserLocale } from "@/libs/sync-locale";

export const metadata = {
	title: "Vestigio",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
	const orgCtx = await resolveOrgContext();

	// Sync the user's persisted locale preference from DB → cookie
	// so the i18n middleware picks it up on subsequent requests.
	await syncUserLocale();

	// Auto-bootstrap: load persisted evidence into MCP server singleton
	// so Analysis / Actions / Maps / Chat pages render data on first visit.
	if (!orgCtx.isAdmin) {
		await ensureContext({
			orgId: orgCtx.orgId,
			orgName: orgCtx.orgName,
			envId: orgCtx.envId,
			domain: orgCtx.domain,
		});
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
