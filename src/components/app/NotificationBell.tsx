"use client";

/**
 * NotificationBell — Header notification popover.
 *
 * Bell icon with unread count badge. Opens a popover with recent
 * notifications. Fetches from /api/notifications on open.
 * Mark individual or all as read.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface AppNotification {
	id: string;
	type: "regression" | "improvement" | "resolved" | "digest" | "system" | "verified_resolved";
	title: string;
	body: string;
	timestamp: string;
	unread: boolean;
	href?: string;
}

const TYPE_STYLES: Record<string, { dot: string; label: string }> = {
	regression: { dot: "bg-red-500", label: "Regression" },
	improvement: { dot: "bg-emerald-500", label: "Improvement" },
	resolved: { dot: "bg-blue-500", label: "Resolved" },
	digest: { dot: "bg-violet-500", label: "Digest" },
	verified_resolved: { dot: "bg-emerald-500", label: "Verified" },
	system: { dot: "bg-content-faint", label: "System" },
};

export default function NotificationBell() {
	const [notifications, setNotifications] = useState<AppNotification[]>([]);
	const [loading, setLoading] = useState(false);
	const [open, setOpen] = useState(false);

	const unreadCount = notifications.filter((n) => n.unread).length;

	// Fetch notifications when popover opens
	const fetchNotifications = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch("/api/notifications");
			if (res.ok) {
				const data = await res.json();
				setNotifications(data.notifications || []);
			}
		} catch {
			// silently fail
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (open) fetchNotifications();
	}, [open, fetchNotifications]);

	// Poll for unread count every 60s
	useEffect(() => {
		const poll = async () => {
			try {
				const res = await fetch("/api/notifications/unread-count");
				if (res.ok) {
					const data = await res.json();
					// Update unread count without full refetch
					if (data.count > 0 && notifications.length === 0) {
						// Seed with count for badge display
						setNotifications((prev) => {
							const currentUnread = prev.filter((n) => n.unread).length;
							if (currentUnread !== data.count && prev.length === 0) {
								return Array.from({ length: data.count }, (_, i) => ({
									id: `placeholder-${i}`,
									type: "system" as const,
									title: "",
									body: "",
									timestamp: "",
									unread: true,
								}));
							}
							return prev;
						});
					}
				}
			} catch {
				// silently fail
			}
		};
		poll();
		const interval = setInterval(poll, 60_000);
		return () => clearInterval(interval);
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	function handleMarkAllRead() {
		setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
		// Fire and forget
		fetch("/api/notifications/mark-read", { method: "POST" }).catch(() => {});
	}

	function handleNotificationClick(id: string) {
		setNotifications((prev) =>
			prev.map((n) => (n.id === id ? { ...n, unread: false } : n)),
		);
		fetch("/api/notifications/mark-read", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id }),
		}).catch(() => {});
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					className="relative flex h-8 w-8 items-center justify-center rounded-lg text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
					aria-label="Notifications"
				>
					{/* Bell icon */}
					<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
						<path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
					</svg>
					{/* Unread badge */}
					{unreadCount > 0 && (
						<span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[9px] font-bold text-white">
							{unreadCount > 99 ? "99+" : unreadCount}
						</span>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-80 p-1">
				{/* Header */}
				<div className="flex items-baseline justify-between gap-4 px-3 py-2">
					<span className="text-sm font-semibold text-content">
						Notifications
					</span>
					{unreadCount > 0 && (
						<button
							onClick={handleMarkAllRead}
							className="text-[11px] font-medium text-content-muted hover:text-content-secondary hover:underline"
						>
							Mark all as read
						</button>
					)}
				</div>

				<div className="-mx-1 my-1 h-px bg-edge" />

				{/* Notification list */}
				{loading && notifications.length === 0 ? (
					<div className="py-6 text-center text-xs text-content-faint">
						Loading...
					</div>
				) : notifications.length === 0 ? (
					<div className="py-6 text-center text-xs text-content-faint">
						No notifications yet
					</div>
				) : (
					<div className="max-h-80 overflow-y-auto">
						{notifications
							.filter((n) => n.title) // skip placeholders
							.map((notification) => {
								const style = TYPE_STYLES[notification.type] || TYPE_STYLES.system;
								return (
									<div
										key={notification.id}
										className="rounded-lg px-3 py-2 text-sm transition-colors hover:bg-surface-card-hover"
									>
										<div className="relative flex items-start pe-4">
											<div className="min-w-0 flex-1 space-y-0.5">
												<button
													className="text-left text-content-secondary after:absolute after:inset-0"
													onClick={() => handleNotificationClick(notification.id)}
												>
													<span className="text-xs font-medium text-content">
														{notification.title}
													</span>
													{notification.body && (
														<span className="text-content-muted"> {notification.body}</span>
													)}
												</button>
												<div className="flex items-center gap-1.5">
													<span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
													<span className="text-[10px] text-content-faint">
														{notification.timestamp}
													</span>
												</div>
											</div>
											{notification.unread && (
												<div className="absolute end-0 top-1">
													<span className="flex h-2 w-2 rounded-full bg-emerald-500" />
												</div>
											)}
										</div>
									</div>
								);
							})}
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
