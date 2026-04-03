"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import AppSidebar from "./AppSidebar";
import OrgSelector from "@/components/console/OrgSelector";
import CommandPalette from "./CommandPalette";

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

// ── Top progress bar ──
function TopProgressBar() {
	const pathname = usePathname();
	const [progress, setProgress] = useState(0);
	const [visible, setVisible] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		// Start progress on route change
		setVisible(true);
		setProgress(30);

		const t1 = setTimeout(() => setProgress(60), 100);
		const t2 = setTimeout(() => setProgress(85), 300);
		const t3 = setTimeout(() => setProgress(100), 500);
		const t4 = setTimeout(() => {
			setVisible(false);
			setProgress(0);
		}, 700);

		return () => {
			clearTimeout(t1);
			clearTimeout(t2);
			clearTimeout(t3);
			clearTimeout(t4);
		};
	}, [pathname]);

	if (!visible && progress === 0) return null;

	return (
		<div className="fixed left-0 top-0 z-50 h-[2px] w-full">
			<div
				className="h-full bg-gradient-to-r from-emerald-400 via-white to-emerald-400 shadow-[0_0_8px_rgba(255,255,255,0.4)] transition-all duration-300 ease-out"
				style={{
					width: `${progress}%`,
					opacity: visible ? 1 : 0,
				}}
			/>
		</div>
	);
}

// ── Theme toggle ──
function ThemeToggle() {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	if (!mounted) return <div className="h-7 w-7" />;

	const isDark = theme === "dark";

	return (
		<button
			onClick={() => setTheme(isDark ? "light" : "dark")}
			className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70"
			aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
		>
			{isDark ? (
				/* Sun icon */
				<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
				</svg>
			) : (
				/* Moon icon */
				<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
				</svg>
			)}
		</button>
	);
}

// ── Page fade wrapper ──
function PageFade({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();
	const [fade, setFade] = useState(false);
	const [content, setContent] = useState(children);

	useEffect(() => {
		setFade(true);
		const t = setTimeout(() => {
			setContent(children);
			setFade(false);
		}, 150);
		return () => clearTimeout(t);
	}, [pathname]);

	// Always update content immediately on children change
	useEffect(() => {
		setContent(children);
	}, [children]);

	return (
		<div
			className="flex-1 overflow-y-auto transition-opacity duration-200 ease-out"
			style={{ opacity: fade ? 0.6 : 1 }}
		>
			{content}
		</div>
	);
}

export default function AppSidebarLayout({
	isAdmin,
	orgCtx,
	plan,
	children,
}: AppSidebarLayoutProps) {
	const [mobileOpen, setMobileOpen] = useState(false);

	return (
		<div className="flex h-screen bg-[#090911] text-white">
			<TopProgressBar />
			<CommandPalette />
			<AppSidebar
				isAdmin={isAdmin}
				mobileOpen={mobileOpen}
				setMobileOpen={setMobileOpen}
			/>
			<div className="flex flex-1 flex-col overflow-hidden">
				<header className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
					<div className="flex items-center gap-3">
						{/* Mobile hamburger */}
						<button
							onClick={() => setMobileOpen(true)}
							className="rounded p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white/70 md:hidden"
							aria-label="Open menu"
						>
							<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
							</svg>
						</button>
						<OrgSelector current={orgCtx} />
					</div>
					<div className="flex items-center gap-3">
						{/* Cmd+K search hint */}
						<button
							onClick={() => {
								window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
							}}
							className="hidden items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-xs text-white/25 transition-colors hover:border-white/10 hover:text-white/40 sm:flex"
						>
							<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
							</svg>
							Search...
							<kbd className="rounded border border-white/10 px-1 py-0.5 text-[10px] font-medium">
								&#8984;K
							</kbd>
						</button>
						<ThemeToggle />
						<span className="rounded border border-white/10 px-2 py-0.5 text-[10px] font-medium uppercase text-white/40">
							{plan}
						</span>
					</div>
				</header>
				<PageFade>
					{children}
				</PageFade>
			</div>
		</div>
	);
}
