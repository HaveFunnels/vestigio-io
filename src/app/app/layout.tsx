import AppSidebarLayout from "@/components/app/AppSidebarLayout";
import { resolveOrgContext } from "@/libs/resolve-org";
import { AppProviders } from "./providers";

export const metadata = {
	title: "Vestigio",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
	const orgCtx = await resolveOrgContext();
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
