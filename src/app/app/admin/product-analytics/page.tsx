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
	chat_dynamics?: {
		opens: number;
		sends: number;
		first_tokens: number;
		errors: number;
		ttft_p50_ms: number | null;
		ttft_p95_ms: number | null;
		error_rate_pct: number;
		top_tools: { tool: string; calls: number; avg_duration_ms: number | null }[];
		avg_message_length: number | null;
		cache_hit_ratio_pct: number | null;
		cache_read_input_tokens: number;
		cache_creation_input_tokens: number;
		uncached_input_tokens: number;
		tool_cache_hit_rate_pct: number | null;
		tool_calls_total: number;
		tool_calls_cached: number;
		slow_tool_events: number;
		still_working_events: number;
	};
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

					{/* Chat Dynamics */}
					{data.chat_dynamics && (
						<div className="space-y-4">
							<div className="flex items-baseline justify-between border-b border-edge pb-2">
								<h2 className="text-sm font-medium text-content">
									Chat Dynamics{" "}
									<span className="text-content-faint">
										(MCP copilot)
									</span>
								</h2>
								<span className="text-[10px] text-content-faint">
									{data.chat_dynamics.opens} opens ·{" "}
									{data.chat_dynamics.sends} sends ·{" "}
									{data.chat_dynamics.errors} errors ·{" "}
									<span
										className={
											data.chat_dynamics.slow_tool_events > 0
												? "text-amber-400"
												: ""
										}
									>
										{data.chat_dynamics.slow_tool_events} slow tools
									</span>{" "}
									·{" "}
									<span
										className={
											data.chat_dynamics.still_working_events > 0
												? "text-amber-400"
												: ""
										}
									>
										{data.chat_dynamics.still_working_events} still-working
									</span>
								</span>
							</div>

							{/* KPI row */}
							<div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
								<StatCard
									label="TTFT p50"
									value={data.chat_dynamics.ttft_p50_ms ?? 0}
									suffix="ms"
									icon="⚡"
								/>
								<StatCard
									label="TTFT p95"
									value={data.chat_dynamics.ttft_p95_ms ?? 0}
									suffix="ms"
									icon="⏱"
									variant={
										(data.chat_dynamics.ttft_p95_ms ?? 0) > 5000
											? "warning"
											: "default"
									}
								/>
								<StatCard
									label="Error rate"
									value={data.chat_dynamics.error_rate_pct}
									suffix="%"
									icon="⚠️"
									variant={
										data.chat_dynamics.error_rate_pct > 5
											? "warning"
											: "default"
									}
								/>
								<StatCard
									label="Avg message length"
									value={data.chat_dynamics.avg_message_length ?? 0}
									suffix="chars"
									icon="✍️"
								/>
								<StatCard
									label="Prompt cache hit"
									value={data.chat_dynamics.cache_hit_ratio_pct ?? 0}
									suffix="%"
									sublabel={
										data.chat_dynamics.cache_read_input_tokens > 0
											? `${(data.chat_dynamics.cache_read_input_tokens / 1000).toFixed(1)}k cached`
											: "no cache hits"
									}
									icon="💾"
									variant={
										(data.chat_dynamics.cache_hit_ratio_pct ?? 0) <
											30 &&
										data.chat_dynamics.uncached_input_tokens > 1000
											? "warning"
											: "default"
									}
								/>
								<StatCard
									label="Tool cache hit"
									value={data.chat_dynamics.tool_cache_hit_rate_pct ?? 0}
									suffix="%"
									sublabel={
										data.chat_dynamics.tool_calls_total > 0
											? `${data.chat_dynamics.tool_calls_cached}/${data.chat_dynamics.tool_calls_total} reused`
											: "no tool calls yet"
									}
									icon="♻️"
								/>
							</div>

							{/* Funnel + Top tools */}
							<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
								{/* Chat funnel */}
								<div className="rounded-lg border border-edge bg-surface-card p-4">
									<h3 className="mb-3 text-sm font-medium text-content">
										Chat Funnel
									</h3>
									<div className="space-y-2">
										{[
											{
												label: "Opens",
												value: data.chat_dynamics.opens,
											},
											{
												label: "Sends",
												value: data.chat_dynamics.sends,
											},
											{
												label: "First token received",
												value: data.chat_dynamics
													.first_tokens,
											},
										].map((step, i) => {
											const maxVal = Math.max(
												data.chat_dynamics!.opens,
												1,
											);
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
																<span className="ml-1 text-content-faint">
																	(
																	{Math.round(
																		(step.value /
																			maxVal) *
																			100,
																	)}
																	%)
																</span>
															</span>
														</div>
														<div className="mt-0.5 h-1.5 w-full rounded-full bg-zinc-800">
															<div
																className="h-1.5 rounded-full bg-cyan-500/70 transition-all"
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

								{/* Top tools */}
								<div className="rounded-lg border border-edge bg-surface-card p-4">
									<h3 className="mb-3 text-sm font-medium text-content">
										Top MCP Tools Called
									</h3>
									<div className="space-y-2">
										{data.chat_dynamics.top_tools.length === 0 ? (
											<p className="text-xs text-content-faint">
												No tool calls recorded yet
											</p>
										) : (
											data.chat_dynamics.top_tools.map((t) => {
												const maxCount =
													data.chat_dynamics!.top_tools[0]
														?.calls || 1;
												return (
													<div
														key={t.tool}
														className="flex items-center gap-3"
													>
														<div className="min-w-0 flex-1">
															<div className="flex items-center justify-between text-xs">
																<span className="truncate font-mono text-content">
																	{t.tool}
																</span>
																<span className="shrink-0 text-content-muted">
																	{t.calls}
																	{t.avg_duration_ms !==
																		null && (
																		<span className="ml-1 text-content-faint">
																			·{" "}
																			{t.avg_duration_ms}
																			ms avg
																		</span>
																	)}
																</span>
															</div>
															<div className="mt-0.5 h-1.5 w-full rounded-full bg-zinc-800">
																<div
																	className="h-1.5 rounded-full bg-fuchsia-500/70 transition-all"
																	style={{
																		width: `${(t.calls / maxCount) * 100}%`,
																	}}
																/>
															</div>
														</div>
													</div>
												);
											})
										)}
									</div>
								</div>
							</div>
						</div>
					)}

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
