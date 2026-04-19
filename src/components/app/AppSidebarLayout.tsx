"use client";

import { signOut, useSession } from "next-auth/react";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import Link from "next/link";
import AppSidebar from "./AppSidebar";
import CommandPalette from "./CommandPalette";
import CycleProgressBanner from "./CycleProgressBanner";
import { orgDropdownNav } from "./sidebar-nav-data";

// Routes where the in-flight audit banner should appear. Keep this list
// tight — the banner takes vertical space above the page content, so
// showing it on e.g. Settings would be distracting.
const CYCLE_BANNER_ROUTES = new Set([
	"/app/inventory",
	"/app/analysis",
	"/app/actions",
]);

function shouldShowCycleBanner(pathname: string | null): boolean {
	if (!pathname) return false;
	return CYCLE_BANNER_ROUTES.has(pathname);
}

interface OrgEnv {
	id: string;
	domain: string;
	isProduction: boolean;
	continuousPaused?: boolean;
	activated?: boolean;
}

interface OrgCtx {
	orgId: string;
	orgName: string;
	envId: string;
	domain: string;
	environments: OrgEnv[];
	maxEnvironments: number;
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

	useEffect(() => {
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
			className="flex h-7 w-7 items-center justify-center rounded-lg text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-muted"
			aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
		>
			{isDark ? (
				<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
				</svg>
			) : (
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

	useEffect(() => {
		setContent(children);
	}, [children]);

	return (
		<div
			className="relative min-h-0 flex-1 overflow-auto transition-opacity duration-200 ease-out"
			style={{ opacity: fade ? 0.6 : 1 }}
		>
			{content}
		</div>
	);
}

// ── User menu with logout ──
function UserMenu() {
	const { data: session } = useSession();
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const t = useTranslations("console.navigation");

	useEffect(() => {
		function handleClick(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, []);

	const email = session?.user?.email || "";
	const initials = (session?.user?.name || email || "U").slice(0, 2).toUpperCase();

	return (
		<div className="relative" ref={ref}>
			<button
				onClick={() => setOpen(!open)}
				className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/20 text-[11px] font-bold text-accent-text transition-colors hover:bg-accent/30"
				title={email}
			>
				{initials}
			</button>
			{open && (
				<div className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-lg border border-edge bg-surface-card p-1 shadow-xl">
					<div className="border-b border-edge px-3 py-2">
						<p className="truncate text-xs font-medium text-content">{session?.user?.name || "User"}</p>
						<p className="truncate text-[10px] text-content-faint">{email}</p>
					</div>
					<div className="py-1">
						{orgDropdownNav.map((item) => (
							<Link
								key={item.id}
								href={item.href!}
								onClick={() => setOpen(false)}
								className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-xs text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content"
							>
								<svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
								</svg>
								{t(item.labelKey)}
							</Link>
						))}
					</div>
					<div className="border-t border-edge pt-1">
						<button
							onClick={() => signOut({ callbackUrl: "/" })}
							className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-xs text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content"
						>
							<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
							</svg>
							Sign out
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

// ── Environment Switcher ──
function EnvironmentSwitcher({ orgCtx, plan }: { orgCtx: OrgCtx; plan: string }) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const t = useTranslations("console.navigation");

	const currentEnv = orgCtx.environments.find(e => e.id === orgCtx.envId);
	const atLimit = orgCtx.environments.length >= orgCtx.maxEnvironments;

	useEffect(() => {
		function handleClick(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, []);

	function handleSwitch(envId: string) {
		setOpen(false);
		// Switch environment via cookie + reload to re-bootstrap MCP context
		document.cookie = `active_env=${envId};path=/;max-age=${60 * 60 * 24 * 365}`;
		window.location.reload();
	}

	function handleAddNew() {
		setOpen(false);
		if (atLimit) {
			router.push("/app/billing");
		} else {
			router.push("/app/organization");
		}
	}

	return (
		<div ref={ref} className="relative">
			<button
				onClick={() => setOpen(!open)}
				className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-surface-card-hover"
			>
				<span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
				<span className="max-w-[150px] truncate font-medium text-content-secondary sm:max-w-none">{currentEnv?.domain || orgCtx.domain}</span>
				<svg className={`h-3 w-3 text-content-faint transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
				</svg>
			</button>

			{open && (
				<div className="absolute left-0 top-full z-50 mt-1 w-[min(288px,calc(100vw-2rem))] rounded-lg border border-edge bg-surface-card py-1 shadow-xl">
					{/* Org name header */}
					<div className="px-3 py-2 border-b border-edge">
						<span className="text-[10px] font-semibold uppercase tracking-wider text-content-faint">{orgCtx.orgName}</span>
					</div>

					{/* Environment list */}
					<div className="py-1">
						{orgCtx.environments.map((env) => (
							<button
								key={env.id}
								onClick={() => handleSwitch(env.id)}
								className={`flex w-full items-center gap-2.5 px-3 py-3 text-sm transition-colors hover:bg-surface-card-hover ${
									env.id === orgCtx.envId ? "text-accent-text" : "text-content-muted"
								}`}
							>
								<span className={`h-1.5 w-1.5 shrink-0 rounded-full ${env.id === orgCtx.envId ? "bg-emerald-500" : "bg-content-faint"}`} />
								<span className="flex-1 text-left truncate">{env.domain}</span>
								{env.id === orgCtx.envId && (
									<svg className="h-3.5 w-3.5 shrink-0 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
									</svg>
								)}
							</button>
						))}
					</div>

					{/* Add new domain */}
					<div className="border-t border-edge pt-1 pb-1">
						<button
							onClick={handleAddNew}
							className="group flex w-full items-center gap-2.5 px-3 py-3 text-sm text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content"
							title={atLimit ? t("upgrade_to_add_domains") : undefined}
						>
							<svg className="h-4 w-4 shrink-0 text-content-faint group-hover:text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
							</svg>
							<span>{t("add_new_domain")}</span>
							{atLimit && (
								<span className="ml-auto rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">upgrade</span>
							)}
						</button>
					</div>
				</div>
			)}
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
	const pathnameForBanner = usePathname();
	const showCycleBanner =
		!isAdmin && shouldShowCycleBanner(pathnameForBanner);
	const pausedBannerT = useTranslations("console.paused_banner");

	return (
		<div className="flex h-screen bg-surface-shell text-content">
			<TopProgressBar />
			<CommandPalette enabled={isAdmin} />

			{/* ── Shell layer: sidebar + topbar sit behind the content ── */}
			<AppSidebar
				isAdmin={isAdmin}
				mobileOpen={mobileOpen}
				setMobileOpen={setMobileOpen}
			/>

			<div className="flex flex-1 flex-col overflow-hidden">
				{/* ── Top bar (part of the shell) ── */}
				<header className="flex h-12 shrink-0 items-center justify-between px-4">
					<div className="flex items-center gap-3">
						{/* Mobile hamburger */}
						<button
							onClick={() => setMobileOpen(true)}
							className="rounded-lg p-2.5 text-content-faint hover:bg-surface-card-hover hover:text-content-muted md:hidden"
							aria-label="Open menu"
						>
							<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
							</svg>
						</button>
						{/* Org name + environment switcher */}
						{!isAdmin && (
							<EnvironmentSwitcher orgCtx={orgCtx} plan={plan} />
						)}
						{isAdmin && (
							<span className="text-sm font-medium text-content-secondary">
								Platform Admin
							</span>
						)}
					</div>
					<div className="flex items-center gap-2.5">
						{/* Cmd+K search — admin only (CommandPalette routes are admin pages) */}
						{isAdmin && (
							<button
								onClick={() => {
									window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
								}}
								className="flex items-center justify-center rounded-lg p-2 text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-muted sm:gap-2 sm:border sm:border-edge-subtle sm:bg-surface-card/50 sm:px-3 sm:py-1 sm:text-xs"
							>
								<svg className="h-4 w-4 sm:h-3.5 sm:w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
								</svg>
								<span className="hidden sm:inline">Search...</span>
								<kbd className="hidden rounded border border-edge px-1 py-0.5 text-[10px] font-medium sm:inline">
									&#8984;K
								</kbd>
							</button>
						)}
						<ThemeToggle />
						<Link
							href="/app/billing"
							className="rounded border border-edge px-2 py-0.5 text-[10px] font-medium uppercase text-content-faint transition-colors hover:border-emerald-600/50 hover:text-emerald-400"
						>
							{plan}
						</Link>
						<UserMenu />
					</div>
				</header>

				{/* ── Content area: floats on top of the shell ── */}
				<div className="relative mx-2 mb-2 flex min-h-0 flex-1 flex-col rounded-xl bg-surface shadow-lg ring-1 ring-edge/50">
					{/* Wave 5 Fase 2 — paused banner. The resume-on-access hook
					    in the layout server component already dispatched a
					    catch-up cycle for the CURRENT env, so we just
					    communicate what happened rather than offer a
					    "Resume audits" button.
					    Fix #13: scope to the active env only — without this,
					    a user with multiple envs where only one is paused
					    sees the banner on every env, and the copy
					    "Resuming now" was misleading because resumeIfPaused
					    only fires for orgCtx.envId. */}
					{!isAdmin && orgCtx.environments.some(
						(e) => e.id === orgCtx.envId && e.continuousPaused,
					) && (
						<div className="mx-6 mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
							<p className="font-medium">{pausedBannerT("title")}</p>
							<p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-400/80">
								{pausedBannerT("body")}
							</p>
						</div>
					)}
					{showCycleBanner && (
						<div className="px-6 pt-4">
							<CycleProgressBanner />
						</div>
					)}
					<PageFade>
						{children}
					</PageFade>
				</div>
			</div>
		</div>
	);
}
