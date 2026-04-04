import Sidebar from "@/components/console/Sidebar";
import OrgSelector from "@/components/console/OrgSelector";
import McpUsageIndicator from "@/components/console/McpUsageIndicator";
import { resolveOrgContext } from "@/libs/resolve-org";
import { ensureContext } from "@/lib/console-data";
import { AppProviders } from "../app/providers";

export const metadata = {
	title: "Vestigio Console",
};

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
	const orgCtx = await resolveOrgContext();

	// Auto-bootstrap: load persisted evidence into MCP server singleton
	// so Analysis / Actions / Maps pages render data on first visit
	// (handles server restarts and returning users without re-running analysis).
	await ensureContext({
		orgId: orgCtx.orgId,
		orgName: orgCtx.orgName,
		envId: orgCtx.envId,
		domain: orgCtx.domain,
	});

	const currentOrg = {
		orgId: orgCtx.orgId,
		orgName: orgCtx.orgName,
		envId: orgCtx.envId,
		domain: orgCtx.domain,
	};

	return (
		<AppProviders>
			<div className="flex h-screen bg-surface text-content">
				<Sidebar />
				<div className="flex flex-1 flex-col overflow-hidden">
					{/* Top bar with org selector */}
					<header className="flex h-12 items-center justify-between border-b border-edge px-4">
						<OrgSelector current={currentOrg} />
						<div className="flex items-center gap-3">
							<McpUsageIndicator />
							<span className="rounded border border-edge-subtle px-2 py-0.5 text-[10px] font-medium uppercase text-content-faint">
								{orgCtx.plan}
							</span>
						</div>
					</header>
					<main className="flex-1 overflow-y-auto">
						{children}
					</main>
				</div>
			</div>
		</AppProviders>
	);
}
