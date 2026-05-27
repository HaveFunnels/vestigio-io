import AppSidebarLayout from "@/components/app/AppSidebarLayout";
import { McpDataProvider, type McpDataSnapshot } from "@/components/app/McpDataProvider";
import { RenewalBanner } from "@/mp/RenewalBanner";
import { SuspendedGate } from "@/mp/SuspendedGate";
import { resolveOrgContext } from "@/libs/resolve-org";
import { ensureContext, loadFindings, loadActions, loadChangeReport, loadWorkspaces, loadAllMaps, loadProjectionsCacheForEnv, loadInventoryForEnv, hasRunningCycleForEnv, hasCompletedCycleForEnv } from "@/lib/console-data";
import { AppProviders } from "./providers";
import { syncUserLocale } from "@/libs/sync-locale";
import { loadEngineTranslations } from "@/lib/engine-translations";
import { startHealthCheckTimer } from "@/libs/health-checker";
import { touchEnvActivity, resumeIfPaused } from "@/libs/env-activity";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export const metadata = {
	title: "Vestigio",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
	// Start background health checks (idempotent — only runs once per process)
	startHealthCheckTimer();

	const orgCtx = await resolveOrgContext();

	// Wave 22 Fase B+ — inactive-env detection. When the customer
	// switched to (or the cookie points at) an env that hasn't been
	// activated yet — typical case: clicked "Continuar em [atual]"
	// after creating a new domain in the org panel — bounce them to
	// the setup wizard so the first audit can fire. Otherwise they
	// land on an empty dashboard with no obvious way to start.
	//
	// We only redirect on app routes that aren't already the
	// onboarding flow itself OR the org page (where the customer
	// might be explicitly inspecting envs without wanting to set
	// one up right now). Admin impersonation also skips this — ops
	// is debugging, not onboarding.
	if (!orgCtx.isAdmin && orgCtx.envId && orgCtx.envId !== "default") {
		const activeEnv = orgCtx.environments.find((e) => e.id === orgCtx.envId);
		const isActivated = activeEnv?.activated === true;
		if (!isActivated) {
			const hdrs = await headers();
			// Middleware sets x-pathname on every /app/* request. If the
			// header is absent (some edge runtime cases, dev hot-reload
			// boundary, or a direct asset request that slipped past the
			// matcher), we degrade to NOT redirecting — better to show
			// the empty dashboard than to risk an infinite redirect loop.
			const pathname = hdrs.get("x-pathname");
			if (pathname) {
				const onSafePath =
					pathname.startsWith("/app/onboarding") ||
					pathname.startsWith("/app/organization") ||
					pathname.startsWith("/app/billing") ||
					pathname.startsWith("/app/settings");
				if (!onSafePath) {
					redirect("/app/onboarding?new_env=true");
				}
			}
		}
	}

	// Session + impersonation state — needed by both the MCP bootstrap
	// and the layout shell (impersonation banner).
	const session = await getServerSession(authOptions);

	// Sync locale cookie: org locale > user locale > browser detection.
	const userLocale = (session?.user as any)?.locale as string | undefined;
	await syncUserLocale(orgCtx.locale, userLocale);

	// Load engine translations for the user's locale (server-side only)
	const engineTranslations = await loadEngineTranslations();
	const isImpersonating = (session?.user as any)?.isImpersonating === true;

	// Wave 16 — try the cached projections fast path FIRST. Audit-runner
	// persists the full ProjectionResult to AuditCycle.projectionsCache when
	// an audit completes. If we have a cache for this env, we can render
	// the layout WITHOUT calling ensureContext() (which would synchronously
	// load all evidence into memory + recompute the engine — the main
	// source of app-wide 502/524 since Wave 13/14 grew the evidence
	// table).
	//
	// Falls back to legacy ensureContext + MCP path when:
	//   - admin route (no orgCtx)
	//   - no cache yet (first audit hasn't finished writing under Wave 16)
	//   - cache load fails for any reason
	//
	// Once the cache is in place, page load = single JSONB read instead of
	// ~1GB evidence transfer + full recompute.
	let mcpData: McpDataSnapshot;
	let usedCacheFastPath = false;
	// Kick off inventory preload in parallel with the projection cache.
	// loadInventoryForEnv hits the same Prisma pool, so doing it
	// concurrently amortizes the connection cost. Result is grafted onto
	// mcpData below — admin routes skip it. See loadInventoryForEnv for
	// why: it lets /app/inventory render on first paint instead of
	// sitting on "Carregando inventário…" while the route compiles in
	// dev or the cold-start chain plays out.
	const inventoryPromise =
		!orgCtx.isAdmin && orgCtx.envId ? loadInventoryForEnv(orgCtx.envId) : null;

	if (!orgCtx.isAdmin) {
		const cached = orgCtx.envId ? await loadProjectionsCacheForEnv(orgCtx.envId) : null;
		if (cached) {
			usedCacheFastPath = true;
			mcpData = {
				findings: cached.findings.length === 0 ? { status: "empty" } : { status: "ready", data: cached.findings },
				actions: cached.actions.length === 0 ? { status: "empty" } : { status: "ready", data: cached.actions },
				changeReport: cached.change_report ? { status: "ready", data: cached.change_report } : { status: "empty" },
				workspaces: cached.workspaces.length === 0 ? { status: "empty" } : { status: "ready", data: cached.workspaces },
				maps: cached.maps.length === 0 ? { status: "empty" } : { status: "ready", data: cached.maps },
				currency: orgCtx.currency,
			};
		} else if (
			orgCtx.envId &&
			(await hasRunningCycleForEnv(orgCtx.envId)) &&
			!(await hasCompletedCycleForEnv(orgCtx.envId))
		) {
			// TRUE first-audit-ever: a cycle is in flight AND no completed
			// cycle has ever finished for this env. Only here do we render
			// the loading state — running ensureContext during a first
			// audit blocks for minutes (12k partial-cycle evidence rows +
			// sync engine recompute, competing with the audit-runner for
			// Prisma connections).
			//
			// When a prior completed cycle exists, we DO fall through to
			// ensureContext below — even if the cache happens to be
			// missing for that cycle. Showing slightly stale data while a
			// new audit runs is correct behavior; trapping the user behind
			// a spinner because a new cycle started is not.
			mcpData = {
				findings: { status: "loading" },
				actions: { status: "loading" },
				changeReport: { status: "loading" },
				workspaces: { status: "loading" },
				maps: { status: "loading" },
				currency: orgCtx.currency,
			};
		} else {
			// Legacy path: bootstrap MCP from evidence (slow but works for
			// envs whose latest audit predates Wave 16 — they catch up on
			// next audit completion).
			//
			// Wave 22.6 — ensureContext + engine recompute can throw when
			// the env's evidence is in an inconsistent state (e.g.
			// previous audits failed mid-flight, schema field referenced
			// by an inference is missing data, etc). Pre-Wave-22.6 the
			// audit-runner swallowed those errors and marked cycles
			// "complete" with no data; the layout's old branch then
			// returned "loading" without invoking ensureContext at all,
			// hiding the issue. Now that the audit-runner rethrows (so
			// cycles correctly land in FAILED), the layout MUST tolerate
			// ensureContext throwing — otherwise the same engine error
			// would crash the entire /app/* shell and the customer can't
			// even reach /dashboard or /settings to recover. Fall through
			// to a clean error state instead of letting the exception
			// bubble out of the RSC layout.
			try {
				await ensureContext({
					orgId: orgCtx.orgId,
					orgName: orgCtx.orgName,
					orgType: orgCtx.orgType,
					envId: orgCtx.envId,
					domain: orgCtx.domain,
					engineTranslations,
				});

				// Cross-tenant contamination guard. McpServer is a process-wide
				// singleton, so two concurrent ensureContext calls from
				// different orgs can race and the loser sees the winner's
				// data. Wave 16 cache fast-path bypasses MCP for the common
				// case, but the legacy path here still touches the singleton.
				// Verify the loaded scope matches THIS request's env before
				// serving its data. If it doesn't, render loading instead of
				// risking a data leak — the next request will retry.
				const { getMcpServer } = await import("@/lib/mcp-client");
				const loadedEnvRef = getMcpServer().getLoadedEnvironmentRef?.();
				const expectedEnvRef = `environment:${orgCtx.envId}`;
				if (loadedEnvRef && loadedEnvRef !== expectedEnvRef) {
					console.warn(
						`[layout] mcp singleton env mismatch — expected=${expectedEnvRef} loaded=${loadedEnvRef}. ` +
						`Rendering loading state instead of serving cross-tenant data.`,
					);
					mcpData = {
						findings: { status: "loading" },
						actions: { status: "loading" },
						changeReport: { status: "loading" },
						workspaces: { status: "loading" },
						maps: { status: "loading" },
						currency: orgCtx.currency,
					};
				} else {
					mcpData = {
						findings: loadFindings(),
						actions: loadActions(),
						changeReport: loadChangeReport(),
						workspaces: loadWorkspaces(),
						maps: loadAllMaps(),
						currency: orgCtx.currency,
					};
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.error(`[layout] ensureContext failed — rendering error state instead of crashing:`, msg);
				const reason = `Engine não conseguiu carregar dados deste ambiente. Equipe foi notificada. (${msg.slice(0, 120)})`;
				mcpData = {
					findings: { status: "error", message: reason },
					actions: { status: "error", message: reason },
					changeReport: { status: "error", message: reason },
					workspaces: { status: "error", message: reason },
					maps: { status: "error", message: reason },
					currency: orgCtx.currency,
				};
			}
		}

		// Wave 5 Fase 2 — activity tracking + auto-resume. Non-blocking best
		// effort; if DB is unreachable the layout still renders.
		// Wave 5 Fase 2 fix (#10): skip when an admin is impersonating the
		// owner — otherwise an ops/sales session keeps resetting the
		// owner's lastAccessedAt and indefinitely defers the inactivity
		// pause for an org the customer hasn't actually opened.
		if (
			orgCtx.envId &&
			orgCtx.envId !== "default" &&
			orgCtx.envId !== "env_1" &&
			!isImpersonating
		) {
			await touchEnvActivity(orgCtx.envId);
			await resumeIfPaused(orgCtx.envId);
		}
	} else {
		mcpData = {
			findings: { status: "not_ready", reason: "Admin route — no MCP context." },
			actions: { status: "not_ready", reason: "Admin route — no MCP context." },
			changeReport: { status: "not_ready", reason: "Admin route — no MCP context." },
			workspaces: { status: "not_ready", reason: "Admin route — no MCP context." },
			maps: { status: "not_ready", reason: "Admin route — no MCP context." },
			currency: orgCtx.currency,
		};
	}

	// Stitch the inventory preload result in once everything else is
	// settled. Awaiting here is essentially free — the query was kicked
	// off earlier and has been running while the cache + ensureContext
	// path executed.
	//
	// Wave 22.6 — wrap the await: if loadInventoryForEnv threw (e.g.
	// the new MonthlyStrategyPlan-related joins reference a column the
	// running Prisma client doesn't know about yet, or any other prod
	// data inconsistency), don't take the whole layout down. /inventory
	// degrades to a not-ready state; the rest of the app keeps working.
	if (inventoryPromise) {
		try {
			mcpData.inventory = await inventoryPromise;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[layout] inventory preload failed:`, msg);
			mcpData.inventory = {
				status: "error",
				message: `Inventário indisponível neste momento (${msg.slice(0, 100)})`,
			} as any;
		}
	}

	if (usedCacheFastPath) {
		console.log(`[layout] cache fast-path: skipped ensureContext for env=${orgCtx.envId}`);
	}

	const currentOrg = {
		orgId: orgCtx.orgId,
		orgName: orgCtx.orgName,
		envId: orgCtx.envId,
		domain: orgCtx.domain,
		environments: orgCtx.environments,
		maxEnvironments: orgCtx.maxEnvironments,
	};

	return (
		<AppProviders>
			<McpDataProvider data={mcpData}>
				<AppSidebarLayout
					isAdmin={orgCtx.isAdmin}
					orgCtx={currentOrg}
					plan={orgCtx.plan}
					isImpersonating={isImpersonating}
					impersonatingEmail={(session?.user as any)?.email}
				>
					<RenewalBanner />
					<SuspendedGate status={orgCtx.status} orgName={orgCtx.orgName}>
						{children}
					</SuspendedGate>
				</AppSidebarLayout>
			</McpDataProvider>
		</AppProviders>
	);
}
