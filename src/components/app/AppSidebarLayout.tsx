"use client";

import { useState } from "react";
import AppSidebar from "./AppSidebar";
import OrgSelector from "@/components/console/OrgSelector";

interface OrgCtx {
	orgId: string;
	orgName: string;
	envId: string;
	domain: string;
}

interface AppSidebarLayoutProps {
	isAdmin: boolean;
	orgCtx: OrgCtx;
	plan: string;
	children: React.ReactNode;
}

export default function AppSidebarLayout({
	isAdmin,
	orgCtx,
	plan,
	children,
}: AppSidebarLayoutProps) {
	const [mobileOpen, setMobileOpen] = useState(false);

	return (
		<div className="flex h-screen bg-surface text-content">
			<AppSidebar
				isAdmin={isAdmin}
				mobileOpen={mobileOpen}
				setMobileOpen={setMobileOpen}
			/>
			<div className="flex flex-1 flex-col overflow-hidden">
				<header className="flex h-12 items-center justify-between border-b border-edge px-4">
					<div className="flex items-center gap-3">
						{/* Mobile hamburger */}
						<button
							onClick={() => setMobileOpen(true)}
							className="rounded p-1.5 text-content-muted hover:bg-surface-card-hover hover:text-content-secondary md:hidden"
							aria-label="Open menu"
						>
							<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
							</svg>
						</button>
						<OrgSelector current={orgCtx} />
					</div>
					<div className="flex items-center gap-3">
						<span className="rounded border border-edge-subtle px-2 py-0.5 text-[10px] font-medium uppercase text-content-faint">
							{plan}
						</span>
					</div>
				</header>
				<main className="flex-1 overflow-y-auto">
					{children}
				</main>
			</div>
		</div>
	);
}
