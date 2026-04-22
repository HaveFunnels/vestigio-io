"use client";

import { useState, useEffect, useCallback } from "react";
import ExportButton from "@/components/app/ExportButton";

// ──────────────────────────────────────────────
// Admin — Product Analytics (3.16)
// Tracks in-app engagement, feature adoption, and churn risk.
// Matches Marketing / Overview visual identity.
// ──────────────────────────────────────────────

interface ProductAnalyticsData {
	period: string;
	generated_at: string;
	dau: number;
	total_events: number;
	avg_engagement_score: number;
	feature_adoption: {
		activated: number;
		first_chat: number;
		first_action: number;
		first_verify: number;
		first_workspace_drill: number;
	};
	top_pages: { pathname: string; count: number }[];
	engagement_distribution: {
		labels: string[];
		counts: number[];
		total: number;
	};
	at_risk_environments: {
		id: string;
		domain: string;
		engagementScore: number;
		lastAccessedAt: string | null;
		organization: { name: string; plan: string };
	}[];
	events_by_type: { event: string; count: number }[];
}

type Period = "7d" | "30d" | "90d";

export default function ProductAnalyticsPage() {
	const [data, setData] = useState<ProductAnalyticsData | null>(null);
	const [loading, setLoading] = useState(true);
	const [period, setPeriod] = useState<Period>("30d");

	const fetchData = useCallback(async () => {
		try {
			const res = await fetch(
				`/api/admin/metrics/product-analytics?period=${period}`,
			);
			if (res.ok) setData(await res.json());
		} catch {
			// swallow
		} finally {
			setLoading(false);
		}
	}, [period]);

	useEffect(() => {
		setLoading(true);
		fetchData();
		const interval = setInterval(fetchData, 30_000);
		return () => clearInterval(interval);
	}, [fetchData]);

	return (
		<div className="space-y-6 p-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-xl font-semibold text-content">
						Product Analytics
					</h1>
					<p className="text-sm text-content-muted">
						In-app engagement, feature adoption, and churn risk
					</p>
				</div>
				<div className="flex items-center gap-3">
					{/* Live indicator */}
					<div className="flex items-center gap-1.5 text-xs text-content-muted">
						<span className="relative flex h-2 w-2">
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
							<span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
						</span>
						Live
					</div>
					{/* Period selector */}
					<div className="flex rounded-md border border-edge">
						{(["7d", "30d", "90d"] as Period[]).map((p) => (
							<button
								key={p}
								onClick={() => setPeriod(p)}
								className={`px-3 py-1.5 text-xs font-medium transition-colors ${
									period === p
										? "bg-surface-card text-content"
										: "text-content-muted hover:text-content"
								} ${p === "7d" ? "rounded-l-md" : p === "90d" ? "rounded-r-md" : ""}`}
							>
								{p}
							</button>
						))}
					</div>
					<ExportButton
						data={data ? [data as unknown as Record<string, any>] : []}
						filename={`product-analytics-${period}`}
					/>
				</div>
			</div>

			{loading && !data ? (
				<LoadingSkeleton />
			) : data ? (
				<>
					{/* KPI Cards */}
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<StatCard
							label="Daily Active Users"
							value={data.dau}
							icon="👤"
						/>
						<StatCard
							label="Avg Engagement Score"
							value={data.avg_engagement_score}
							suffix="/100"
							icon="📊"
						/>
						<StatCard
							label="Feature Adoption"
							value={
								data.feature_adoption.activated > 0
									? Math.round(
											(data.feature_adoption.first_chat /
												data.feature_adoption.activated) *
												100,
										)
									: 0
							}
							suffix="%"
							sublabel="users who tried chat"
							icon="🚀"
						/>
						<StatCard
							label="At-Risk Environments"
							value={data.at_risk_environments.length}
							variant={
								data.at_risk_environments.length > 0
									? "warning"
									: "default"
							}
							icon="⚠️"
						/>
					</div>

					{/* Two-column layout */}
					<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
						{/* Top Pages */}
						<div className="rounded-lg border border-edge bg-surface-card p-4">
							<h3 className="mb-3 text-sm font-medium text-content">
								Top Pages by Views
							</h3>
							<div className="space-y-2">
								{data.top_pages.slice(0, 10).map((page) => {
									const maxCount =
										data.top_pages[0]?.count || 1;
									return (
										<div
											key={page.pathname}
											className="flex items-center gap-3"
										>
											<div className="min-w-0 flex-1">
												<div className="truncate text-xs text-content">
													{page.pathname}
												</div>
												<div className="mt-0.5 h-1.5 w-full rounded-full bg-zinc-800">
													<div
														className="h-1.5 rounded-full bg-emerald-500/70 transition-all"
														style={{
															width: `${(page.count / maxCount) * 100}%`,
														}}
													/>
												</div>
											</div>
											<span className="shrink-0 text-xs font-medium text-content-muted">
												{page.count.toLocaleString()}
											</span>
										</div>
									);
								})}
								{data.top_pages.length === 0 && (
									<p className="text-xs text-content-faint">
										No page views yet
									</p>
								)}
							</div>
						</div>

						{/* Feature Adoption Funnel */}
						<div className="rounded-lg border border-edge bg-surface-card p-4">
							<h3 className="mb-3 text-sm font-medium text-content">
								Feature Adoption Funnel
							</h3>
							<div className="space-y-2">
								{[
									{
										label: "Activated",
										value: data.feature_adoption.activated,
									},
									{
										label: "First Workspace Drill",
										value: data.feature_adoption
											.first_workspace_drill,
									},
									{
										label: "First Chat",
										value: data.feature_adoption.first_chat,
									},
									{
										label: "First Action Created",
										value: data.feature_adoption
											.first_action,
									},
									{
										label: "First Verification",
										value: data.feature_adoption
											.first_verify,
									},
								].map((step, i) => {
									const maxVal =
										data.feature_adoption.activated || 1;
									return (
										<div
											key={step.label}
											className="flex items-center gap-3"
										>
											<span className="w-4 shrink-0 text-center text-xs font-medium text-content-muted">
												{i + 1}
											</span>
											<div className="min-w-0 flex-1">
												<div className="flex items-center justify-between text-xs">
													<span className="text-content">
														{step.label}
													</span>
													<span className="text-content-muted">
														{step.value}
														{maxVal > 0 && (
															<span className="ml-1 text-content-faint">
																(
																{Math.round(
																	(step.value /
																		maxVal) *
																		100,
																)}
																%)
															</span>
														)}
													</span>
												</div>
												<div className="mt-0.5 h-1.5 w-full rounded-full bg-zinc-800">
													<div
														className="h-1.5 rounded-full bg-sky-500/70 transition-all"
														style={{
															width: `${(step.value / maxVal) * 100}%`,
														}}
													/>
												</div>
											</div>
										</div>
									);
								})}
							</div>
						</div>
					</div>

					{/* Second row */}
					<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
						{/* Engagement Distribution */}
						<div className="rounded-lg border border-edge bg-surface-card p-4">
							<h3 className="mb-3 text-sm font-medium text-content">
								Engagement Score Distribution
							</h3>
							<div className="flex items-end gap-2">
								{data.engagement_distribution.labels.map(
									(label, i) => {
										const maxCount = Math.max(
											...data.engagement_distribution
												.counts,
											1,
										);
										const count =
											data.engagement_distribution
												.counts[i];
										const height = Math.max(
											4,
											(count / maxCount) * 120,
										);
										const colors = [
											"bg-red-500/70",
											"bg-amber-500/70",
											"bg-yellow-500/70",
											"bg-emerald-500/70",
											"bg-green-500/70",
										];
										return (
											<div
												key={label}
												className="flex flex-1 flex-col items-center gap-1"
											>
												<span className="text-[10px] font-medium text-content-muted">
													{count}
												</span>
												<div
													className={`w-full rounded-t ${colors[i]}`}
													style={{
														height: `${height}px`,
													}}
												/>
												<span className="text-[10px] text-content-faint">
													{label}
												</span>
											</div>
										);
									},
								)}
							</div>
							<p className="mt-2 text-center text-[10px] text-content-faint">
								{data.engagement_distribution.total} total
								environments
							</p>
						</div>

						{/* Events by Type */}
						<div className="rounded-lg border border-edge bg-surface-card p-4">
							<h3 className="mb-3 text-sm font-medium text-content">
								Events by Type ({period})
							</h3>
							<div className="space-y-2">
								{data.events_by_type.map((evt) => {
									const maxCount =
										data.events_by_type[0]?.count || 1;
									return (
										<div
											key={evt.event}
											className="flex items-center gap-3"
										>
											<div className="min-w-0 flex-1">
												<div className="flex items-center justify-between text-xs">
													<span className="font-mono text-content">
														{evt.event}
													</span>
													<span className="text-content-muted">
														{evt.count.toLocaleString()}
													</span>
												</div>
												<div className="mt-0.5 h-1.5 w-full rounded-full bg-zinc-800">
													<div
														className="h-1.5 rounded-full bg-violet-500/70 transition-all"
														style={{
															width: `${(evt.count / maxCount) * 100}%`,
														}}
													/>
												</div>
											</div>
										</div>
									);
								})}
								{data.events_by_type.length === 0 && (
									<p className="text-xs text-content-faint">
										No events recorded yet
									</p>
								)}
							</div>
						</div>
					</div>

					{/* At-Risk Table */}
					{data.at_risk_environments.length > 0 && (
						<div className="rounded-lg border border-edge bg-surface-card p-4">
							<h3 className="mb-3 text-sm font-medium text-content">
								At-Risk Environments{" "}
								<span className="text-content-faint">
									(score &lt; 20, inactive &gt; 7 days)
								</span>
							</h3>
							<div className="overflow-x-auto">
								<table className="w-full text-xs">
									<thead>
										<tr className="border-b border-edge text-left text-content-muted">
											<th className="pb-2 pr-4 font-medium">
												Organization
											</th>
											<th className="pb-2 pr-4 font-medium">
												Domain
											</th>
											<th className="pb-2 pr-4 font-medium">
												Plan
											</th>
											<th className="pb-2 pr-4 font-medium">
												Score
											</th>
											<th className="pb-2 font-medium">
												Last Accessed
											</th>
										</tr>
									</thead>
									<tbody>
										{data.at_risk_environments.map(
											(env) => (
												<tr
													key={env.id}
													className="border-b border-edge/50"
												>
													<td className="py-2 pr-4 text-content">
														{env.organization.name}
													</td>
													<td className="py-2 pr-4 font-mono text-content-muted">
														{env.domain}
													</td>
													<td className="py-2 pr-4">
														<span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-content-muted">
															{env.organization.plan}
														</span>
													</td>
													<td className="py-2 pr-4">
														<span className="font-medium text-red-400">
															{env.engagementScore}
														</span>
													</td>
													<td className="py-2 text-content-faint">
														{env.lastAccessedAt
															? new Date(
																	env.lastAccessedAt,
																).toLocaleDateString()
															: "Never"}
													</td>
												</tr>
											),
										)}
									</tbody>
								</table>
							</div>
						</div>
					)}
				</>
			) : (
				<p className="text-sm text-content-muted">
					Failed to load product analytics.
				</p>
			)}
		</div>
	);
}

/* ========== Stat Card ========== */

function StatCard({
	label,
	value,
	suffix,
	sublabel,
	icon,
	variant = "default",
}: {
	label: string;
	value: number;
	suffix?: string;
	sublabel?: string;
	icon?: string;
	variant?: "default" | "warning";
}) {
	return (
		<div
			className={`rounded-lg border p-4 ${
				variant === "warning"
					? "border-amber-500/30 bg-amber-500/5"
					: "border-edge bg-surface-card"
			}`}
		>
			<div className="flex items-center justify-between">
				<span className="text-xs text-content-muted">{label}</span>
				{icon && <span className="text-sm">{icon}</span>}
			</div>
			<div className="mt-1 flex items-baseline gap-1">
				<span className="text-2xl font-semibold text-content">
					{value.toLocaleString()}
				</span>
				{suffix && (
					<span className="text-sm text-content-muted">{suffix}</span>
				)}
			</div>
			{sublabel && (
				<span className="text-[10px] text-content-faint">
					{sublabel}
				</span>
			)}
		</div>
	);
}

/* ========== Loading Skeleton ========== */

function LoadingSkeleton() {
	return (
		<div className="space-y-6">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{[...Array(4)].map((_, i) => (
					<div
						key={i}
						className="h-24 animate-pulse rounded-lg border border-edge bg-surface-card"
					/>
				))}
			</div>
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				{[...Array(2)].map((_, i) => (
					<div
						key={i}
						className="h-64 animate-pulse rounded-lg border border-edge bg-surface-card"
					/>
				))}
			</div>
		</div>
	);
}
