"use client";

import { useBranding, useFeatureFlags } from "@/components/BrandingProvider";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/libs/utils";
import {
	productNav,
	bottomNav,
	adminNav,
	type NavItem,
} from "./sidebar-nav-data";

// ──────────────────────────────────────────────
// AppSidebar
//
// Desktop: collapsed by default, expands on hover
// Mobile: overlay with backdrop, opened via hamburger
// Supports expandable parent items (e.g. Analysis)
// ──────────────────────────────────────────────

interface AppSidebarProps {
	isAdmin?: boolean;
	mobileOpen: boolean;
	setMobileOpen: (open: boolean) => void;
}

export default function AppSidebar({
	isAdmin = false,
	mobileOpen,
	setMobileOpen,
}: AppSidebarProps) {
	const pathname = usePathname();
	const branding = useBranding();
	const flags = useFeatureFlags();
	const t = useTranslations("console.navigation");
	const [hovered, setHovered] = useState(false);
	const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Expandable submenus — auto-open groups containing the active route
	const [expandedMenus, setExpandedMenus] = useState<Set<string>>(() => {
		const initial = new Set<string>();
		const allNavs = [...productNav, ...adminNav];
		for (const item of allNavs) {
			if (item.children?.some((c) => c.href && (pathname === c.href || pathname.startsWith(c.href + "/")))) {
				initial.add(item.id);
			}
		}
		return initial;
	});

	const isExpanded = hovered || mobileOpen;

	// Close mobile sidebar on navigation
	useEffect(() => {
		setMobileOpen(false);
	}, [pathname, setMobileOpen]);

	const handleMouseEnter = useCallback(() => {
		if (leaveTimer.current) {
			clearTimeout(leaveTimer.current);
			leaveTimer.current = null;
		}
		setHovered(true);
	}, []);

	const handleMouseLeave = useCallback(() => {
		leaveTimer.current = setTimeout(() => setHovered(false), 120);
	}, []);

	const toggleMenu = (id: string) => {
		setExpandedMenus((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const isItemActive = (item: NavItem): boolean => {
		if (item.href) {
			return pathname === item.href || pathname.startsWith(item.href + "/");
		}
		if (item.children) {
			return item.children.some((c) => c.href && (pathname === c.href || pathname.startsWith(c.href + "/")));
		}
		return false;
	};

	// ── Render a single nav item ──

	const renderNavItem = (item: NavItem) => {
		const active = isItemActive(item);
		const hasChildren = !!item.children;
		const isMenuOpen = expandedMenus.has(item.id);

		const itemClasses = cn(
			"flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200",
			active
				? "bg-sidebar-active-bg text-sidebar-active-text"
				: "text-content-muted hover:bg-surface-card-hover hover:text-content-secondary"
		);

		if (hasChildren) {
			return (
				<div key={item.id}>
					<button
						onClick={() => {
							if (!isExpanded) setHovered(true);
							toggleMenu(item.id);
						}}
						className={cn(itemClasses, "w-full")}
					>
						<svg className="h-[18px] w-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
							<path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
						</svg>
						<span className={cn(
							"flex-1 whitespace-nowrap text-left transition-all duration-300",
							isExpanded ? "w-auto opacity-100" : "w-0 opacity-0"
						)}>
							{t(item.labelKey)}
						</span>
						{isExpanded && (
							<svg
								className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", isMenuOpen && "rotate-90")}
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={2}
							>
								<path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
							</svg>
						)}
					</button>

					{/* Expandable children */}
					<div
						className={cn(
							"grid transition-[grid-template-rows] duration-300 ease-out",
							isMenuOpen && isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
						)}
					>
						<div className="overflow-hidden">
							{item.children!.map((child) => {
								const childActive = child.href
									? pathname === child.href || pathname.startsWith(child.href + "/")
									: false;
								return (
									<Link
										key={child.id}
										href={child.href!}
										className={cn(
											"flex items-center gap-3 rounded-lg py-1.5 pl-10 pr-3 text-[13px] font-medium transition-all duration-200",
											childActive
												? "text-accent-text"
												: "text-content-faint hover:text-content-muted"
										)}
									>
										<svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
											<path strokeLinecap="round" strokeLinejoin="round" d={child.icon} />
										</svg>
										<span>{t(child.labelKey)}</span>
									</Link>
								);
							})}
						</div>
					</div>
				</div>
			);
		}

		// Leaf item
		return (
			<Link key={item.id} href={item.href!} className={itemClasses}>
				<svg className="h-[18px] w-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
					<path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
				</svg>
				<span className={cn(
					"whitespace-nowrap transition-all duration-300",
					isExpanded ? "w-auto opacity-100" : "w-0 opacity-0"
				)}>
					{t(item.labelKey)}
				</span>
			</Link>
		);
	};

	// ── Render a section (items only — no visible title when collapsed) ──

	const renderSection = (title: string, items: NavItem[]) => (
		<div className="mb-1">
			<div
				className={cn(
					"overflow-hidden transition-all duration-300",
					isExpanded ? "mb-1 h-5 px-3 pt-3 opacity-60" : "mb-0 h-0 opacity-0"
				)}
			>
				<span className="text-[10px] font-semibold uppercase tracking-widest text-content-faint">
					{title}
				</span>
			</div>
			<div className="flex flex-col gap-0.5">
				{items.map(renderNavItem)}
			</div>
		</div>
	);

	// ── Sidebar content ──

	const sidebarContent = (
		<>
			{/* Logo */}
			<div className={cn(
				"flex h-14 shrink-0 items-center px-3 transition-all duration-300",
				isExpanded ? "justify-start gap-2.5 px-4" : "justify-center"
			)}>
				{isExpanded ? (
					/* Expanded: show full logo with light/dark variants */
					branding.logo_light?.dataUrl || branding.logo_dark?.dataUrl ? (
						<>
							{branding.logo_light?.dataUrl && (
								<img src={branding.logo_light.dataUrl} alt="Vestigio" className="h-6 w-auto shrink-0 object-contain dark:hidden" />
							)}
							{branding.logo_dark?.dataUrl && (
								<img src={branding.logo_dark.dataUrl} alt="Vestigio" className={cn("h-6 w-auto shrink-0 object-contain", branding.logo_light?.dataUrl ? "hidden dark:block" : "")} />
							)}
						</>
					) : (
						<>
							<Image src="/images/logo/logo.png" alt="Vestigio" width={140} height={28} className="block shrink-0 dark:hidden" />
							<Image src="/images/logo/logo-light.png" alt="Vestigio" width={140} height={28} className="hidden shrink-0 dark:block" />
						</>
					)
				) : (
					/* Collapsed: always show icon */
					<>
						<Image src="/images/icon-light.svg" alt="Vestigio" width={28} height={28} className="block shrink-0 dark:hidden" />
						<Image src="/images/icon-dark.svg" alt="Vestigio" width={28} height={28} className="hidden shrink-0 dark:block" />
					</>
				)}
			</div>

			{/* Nav */}
			<nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
				{!isAdmin && renderSection("Product", productNav.filter((item) => {
					if (item.id === "chat" && !flags.ai_chat_enabled) return false;
					return true;
				}))}
				{isAdmin && renderSection("Platform Admin", adminNav)}
			</nav>

			{/* Bottom-pinned nav (Data Sources) */}
			{!isAdmin && (
				<div className="shrink-0 border-t border-edge/30 p-2">
					{bottomNav.map((item) => renderNavItem(item))}
				</div>
			)}
		</>
	);

	return (
		<>
			{/* ── Desktop sidebar ── */}
			<aside
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
				className={cn(
					"hidden flex-col md:flex",
					"bg-surface-shell",
					"transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
					isExpanded ? "w-56" : "w-14"
				)}
			>
				{sidebarContent}
			</aside>

			{/* ── Mobile sidebar ── */}
			<div
				className={cn(
					"fixed inset-0 z-40 md:hidden",
					mobileOpen ? "visible" : "invisible pointer-events-none"
				)}
			>
				<div
					className={cn(
						"absolute inset-0 bg-surface-overlay/60 backdrop-blur-sm transition-opacity duration-300",
						mobileOpen ? "opacity-100" : "opacity-0"
					)}
					onClick={() => setMobileOpen(false)}
				/>
				<aside
					className={cn(
						"absolute left-0 top-0 flex h-full w-64 flex-col",
						"bg-surface-shell",
						"transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
						mobileOpen ? "translate-x-0" : "-translate-x-full"
					)}
				>
					{sidebarContent}
				</aside>
			</div>
		</>
	);
}
