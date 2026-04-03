"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/libs/utils";
import {
	productNav,
	controlPlaneNav,
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
	const [hovered, setHovered] = useState(false);
	const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Expandable submenus
	const [expandedMenus, setExpandedMenus] = useState<Set<string>>(() => {
		// Auto-expand parents whose children match the current route
		const initial = new Set<string>();
		for (const item of productNav) {
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
		leaveTimer.current = setTimeout(() => setHovered(false), 80);
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

	// ── Render a single nav item (leaf or expandable parent) ──

	const renderNavItem = (item: NavItem) => {
		const active = isItemActive(item);
		const hasChildren = !!item.children;
		const isMenuOpen = expandedMenus.has(item.id);

		const itemClasses = cn(
			"flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
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
						<svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
							<path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
						</svg>
						<span className={cn(
							"flex-1 whitespace-nowrap text-left transition-opacity duration-150",
							isExpanded ? "opacity-100" : "w-0 opacity-0"
						)}>
							{item.label}
						</span>
						{isExpanded && (
							<svg
								className={cn("h-4 w-4 shrink-0 transition-transform duration-200", isMenuOpen && "rotate-90")}
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={2}
							>
								<path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
							</svg>
						)}
					</button>

					{/* Expandable children with grid animation */}
					<div
						className={cn(
							"grid transition-[grid-template-rows] duration-200",
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
											"flex items-center gap-3 rounded-lg py-1.5 pl-10 pr-3 text-sm font-medium transition-colors",
											childActive
												? "text-accent-text"
												: "text-content-faint hover:text-content-secondary"
										)}
									>
										<svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
											<path strokeLinecap="round" strokeLinejoin="round" d={child.icon} />
										</svg>
										<span>{child.label}</span>
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
				<svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
					<path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
				</svg>
				<span className={cn(
					"whitespace-nowrap transition-opacity duration-150",
					isExpanded ? "opacity-100" : "w-0 opacity-0"
				)}>
					{item.label}
				</span>
			</Link>
		);
	};

	// ── Render a section (title + items) ──

	const renderSection = (title: string, items: NavItem[]) => (
		<div className="mb-2">
			<div
				className={cn(
					"mb-1 px-3 pt-3 text-[10px] font-semibold uppercase tracking-widest text-content-faint transition-opacity duration-150",
					isExpanded ? "opacity-100" : "opacity-0"
				)}
			>
				{title}
			</div>
			{items.map(renderNavItem)}
		</div>
	);

	// ── Sidebar content (shared between desktop and mobile) ──

	const sidebarContent = (
		<>
			<div className={cn(
				"flex h-14 items-center border-b border-edge px-4",
				isExpanded ? "justify-between" : "justify-center"
			)}>
				<span className={cn(
					"text-sm font-semibold tracking-wider text-accent-text transition-opacity duration-150",
					isExpanded ? "opacity-100" : "w-0 opacity-0"
				)}>
					VESTIGIO
				</span>
			</div>
			<nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
				{!isAdmin && renderSection("Product", productNav)}
				{!isAdmin && renderSection("Control Plane", controlPlaneNav)}
				{isAdmin && renderSection("Platform Admin", adminNav)}
			</nav>
		</>
	);

	return (
		<>
			{/* ── Desktop sidebar (hover-expand) ── */}
			<aside
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
				className={cn(
					"hidden flex-col border-r border-edge bg-sidebar-bg transition-[width] duration-200 ease-in-out md:flex",
					isExpanded ? "w-56" : "w-14"
				)}
			>
				{sidebarContent}
			</aside>

			{/* ── Mobile sidebar (overlay) ── */}
			<div
				className={cn(
					"fixed inset-0 z-40 md:hidden",
					mobileOpen ? "visible" : "invisible pointer-events-none"
				)}
			>
				{/* Backdrop */}
				<div
					className={cn(
						"absolute inset-0 bg-surface-overlay/60 transition-opacity duration-200",
						mobileOpen ? "opacity-100" : "opacity-0"
					)}
					onClick={() => setMobileOpen(false)}
				/>
				{/* Panel */}
				<aside
					className={cn(
						"absolute left-0 top-0 flex h-full w-64 flex-col bg-sidebar-bg transition-transform duration-200",
						mobileOpen ? "translate-x-0" : "-translate-x-full"
					)}
				>
					{sidebarContent}
				</aside>
			</div>
		</>
	);
}
