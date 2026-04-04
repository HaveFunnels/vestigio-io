import AppSidebarLayout from "@/components/app/AppSidebarLayout";
import { resolveOrgContext } from "@/libs/resolve-org";
import { ensureContext } from "@/lib/console-data";
import { AppProviders } from "./providers";

export const metadata = {
	title: "Vestigio",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
	const orgCtx = await resolveOrgContext();

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

	const currentOrg = {
		orgId: orgCtx.orgId,
		orgName: orgCtx.orgName,
		envId: orgCtx.envId,
		domain: orgCtx.domain,
	};

	return (
		<AppProviders>
			<AppSidebarLayout
				isAdmin={orgCtx.isAdmin}
				orgCtx={currentOrg}
				plan={orgCtx.plan}
			>
				{children}
			</AppSidebarLayout>
		</AppProviders>
	);
}
