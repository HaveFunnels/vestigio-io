"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";

// ──────────────────────────────────────────────
// Data Sources Settings
//
// Canonical settings surface for all integrations
// and access sources. Card-based, extensible.
//
// Wired to: /api/data-sources/saas
// ──────────────────────────────────────────────

type AuthMethod = "password" | "oauth" | "magic_link" | "unknown";
type MfaMode = "none" | "optional" | "required" | "unknown";

interface SaasFormData {
	loginUrl: string;
	email: string;
	password: string;
	authMethod: AuthMethod;
	mfaMode: MfaMode;
	hasTestAccount: boolean | null;
	hasTrial: boolean | null;
	requiresSeedData: boolean | null;
	activationGoal: string;
	primaryUpgradePath: string;
}

const defaultSaasForm: SaasFormData = {
	loginUrl: "",
	email: "",
	password: "",
	authMethod: "unknown",
	mfaMode: "unknown",
	hasTestAccount: null,
	hasTrial: null,
	requiresSeedData: null,
	activationGoal: "",
	primaryUpgradePath: "",
};

type SourceStatus = "not_configured" | "configured" | "verified" | "failed" | "awaiting_manual_mfa" | "coming_soon";

interface SaasPublicView {
	id: string;
	environment_id: string;
	login_url: string;
	email: string | null;
	has_password: boolean;
	auth_method: string;
	mfa_mode: string;
	has_trial: boolean | null;
	requires_seed_data: boolean | null;
	test_account_available: boolean | null;
	activation_goal: string | null;
	primary_upgrade_path: string | null;
	last_verified_at: string | null;
	last_failure_reason: string | null;
	status: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
	not_configured: { label: "Not configured", color: "#71717a" },
	unconfigured: { label: "Not configured", color: "#71717a" },
	configured: { label: "Configured", color: "#f59e0b" },
	verified: { label: "Verified", color: "#22c55e" },
	failed: { label: "Failed", color: "#ef4444" },
	awaiting_manual_mfa: { label: "Awaiting MFA", color: "#f59e0b" },
	expired: { label: "Expired", color: "#f59e0b" },
	coming_soon: { label: "Coming soon", color: "#6366f1" },
};

// TODO: Replace with real environment ID from context/session
function getEnvironmentId(): string {
	if (typeof window !== "undefined") {
		const params = new URLSearchParams(window.location.search);
		return params.get("env") || "default_env";
	}
	return "default_env";
}

export default function DataSourcesPage() {
	const t = useTranslations("console.data_sources_extra");
	const [expandedCard, setExpandedCard] = useState<string | null>(null);
	const [saasForm, setSaasForm] = useState<SaasFormData>(defaultSaasForm);
	const [saasStatus, setSaasStatus] = useState<SourceStatus>("not_configured");
	const [hasPassword, setHasPassword] = useState(false);
	const [lastVerified, setLastVerified] = useState<string | null>(null);
	const [lastFailure, setLastFailure] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [surfaces_audit_active] = useState(false); // Active once first audit completes

	const environmentId = getEnvironmentId();

	const fetchConfig = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/data-sources/saas?environment_id=${environmentId}`);
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				setError(body.message || "Failed to load configuration");
				return;
			}
			const { data } = await res.json() as { data: SaasPublicView | null };
			if (data) {
				setSaasForm({
					loginUrl: data.login_url || "",
					email: data.email || "",
					password: "", // NEVER pre-fill password
					authMethod: (data.auth_method as AuthMethod) || "unknown",
					mfaMode: (data.mfa_mode as MfaMode) || "unknown",
					hasTestAccount: data.test_account_available,
					hasTrial: data.has_trial,
					requiresSeedData: data.requires_seed_data,
					activationGoal: data.activation_goal || "",
					primaryUpgradePath: data.primary_upgrade_path || "",
				});
				setSaasStatus(mapStatus(data.status));
				setHasPassword(data.has_password);
				setLastVerified(data.last_verified_at);
				setLastFailure(data.last_failure_reason);
			}
		} catch {
			setError("Network error loading configuration");
		} finally {
			setLoading(false);
		}
	}, [environmentId]);

	useEffect(() => {
		fetchConfig();
	}, [fetchConfig]);

	const updateSaas = (field: keyof SaasFormData, value: any) => {
		setSaasForm((prev) => ({ ...prev, [field]: value }));
	};

	const handleSaveSaas = async () => {
		setSaving(true);
		setError(null);
		try {
			const res = await fetch("/api/data-sources/saas", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					environment_id: environmentId,
					login_url: saasForm.loginUrl,
					email: saasForm.email || null,
					password: saasForm.password || null, // only sent if changed
					auth_method: saasForm.authMethod,
					mfa_mode: saasForm.mfaMode,
					has_trial: saasForm.hasTrial,
					requires_seed_data: saasForm.requiresSeedData,
					test_account_available: saasForm.hasTestAccount,
					activation_goal: saasForm.activationGoal || null,
					primary_upgrade_path: saasForm.primaryUpgradePath || null,
				}),
			});

			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				setError(body.message || "Failed to save");
				return;
			}

			// Refetch to show persisted state
			await fetchConfig();
		} catch {
			setError("Network error saving configuration");
		} finally {
			setSaving(false);
		}
	};

	// ── Shopify state ──
	const [shopifyStatus, setShopifyStatus] = useState<SourceStatus>("not_configured");
	const [shopifyStoreUrl, setShopifyStoreUrl] = useState("");
	const [shopifyToken, setShopifyToken] = useState("");
	const [shopifySaving, setShopifySaving] = useState(false);
	const [shopifySyncing, setShopifySyncing] = useState(false);
	const [shopifyLastSync, setShopifyLastSync] = useState<string | null>(null);
	const [shopifyError, setShopifyError] = useState<string | null>(null);
	const [shopifyValueFeedback, setShopifyValueFeedback] = useState<string | null>(null);

	const fetchShopifyStatus = useCallback(async () => {
		try {
			const res = await fetch(`/api/integrations?environment_id=${environmentId}`);
			if (!res.ok) return;
			const { integrations } = await res.json();
			const shopify = integrations?.find((i: any) => i.provider === "shopify");
			if (shopify) {
				setShopifyStatus(mapStatus(shopify.status));
				setShopifyLastSync(shopify.lastSyncedAt);
				setShopifyError(shopify.syncError);
				if (shopify.valueFeedback) setShopifyValueFeedback(shopify.valueFeedback);
			}
		} catch { /* silent */ }
	}, [environmentId]);

	useEffect(() => { fetchShopifyStatus(); }, [fetchShopifyStatus]);

	const handleConnectShopify = async () => {
		if (!shopifyStoreUrl.trim() || !shopifyToken.trim()) {
			setShopifyError("Store URL and Access Token are required.");
			return;
		}
		setShopifySaving(true);
		setShopifyError(null);
		try {
			const res = await fetch("/api/integrations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					environmentId,
					provider: "shopify",
					config: { store_url: shopifyStoreUrl.trim(), access_token: shopifyToken.trim() },
				}),
			});
			const data = await res.json();
			if (!res.ok) {
				setShopifyError(data.message || "Failed to connect Shopify.");
				return;
			}
			setShopifyStatus("configured");
			setShopifyToken("");
			await fetchShopifyStatus();
		} catch {
			setShopifyError("Network error. Please try again.");
		} finally {
			setShopifySaving(false);
		}
	};

	const handleDisconnectShopify = async () => {
		if (!confirm("Disconnect Shopify? Revenue data will revert to heuristic estimates.")) return;
		try {
			await fetch("/api/integrations", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ environmentId, provider: "shopify" }),
			});
			setShopifyStatus("not_configured");
			setShopifyStoreUrl("");
			setShopifyToken("");
			setShopifyLastSync(null);
			setShopifyError(null);
			setShopifyValueFeedback(null);
		} catch { /* silent */ }
	};

	const handleSyncShopify = async () => {
		setShopifySyncing(true);
		try {
			const res = await fetch("/api/integrations/sync", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ environmentId, provider: "shopify" }),
			});
			if (res.ok) await fetchShopifyStatus();
		} catch { /* silent */ }
		finally { setShopifySyncing(false); }
	};

	// ── Nuvemshop state ──
	const [nuvemshopStatus, setNuvemshopStatus] = useState<SourceStatus>("not_configured");
	const [nuvemshopStoreId, setNuvemshopStoreId] = useState("");
	const [nuvemshopToken, setNuvemshopToken] = useState("");
	const [nuvemshopSaving, setNuvemshopSaving] = useState(false);
	const [nuvemshopSyncing, setNuvemshopSyncing] = useState(false);
	const [nuvemshopLastSync, setNuvemshopLastSync] = useState<string | null>(null);
	const [nuvemshopError, setNuvemshopError] = useState<string | null>(null);
	const [nuvemshopValueFeedback, setNuvemshopValueFeedback] = useState<string | null>(null);

	const fetchNuvemshopStatus = useCallback(async () => {
		try {
			const res = await fetch(`/api/integrations?environment_id=${environmentId}`);
			if (!res.ok) return;
			const { integrations } = await res.json();
			const nuvemshop = integrations?.find((i: any) => i.provider === "nuvemshop");
			if (nuvemshop) {
				setNuvemshopStatus(mapStatus(nuvemshop.status));
				setNuvemshopLastSync(nuvemshop.lastSyncedAt);
				setNuvemshopError(nuvemshop.syncError);
				if (nuvemshop.valueFeedback) setNuvemshopValueFeedback(nuvemshop.valueFeedback);
			}
		} catch { /* silent */ }
	}, [environmentId]);

	useEffect(() => { fetchNuvemshopStatus(); }, [fetchNuvemshopStatus]);

	const handleConnectNuvemshop = async () => {
		if (!nuvemshopStoreId.trim() || !nuvemshopToken.trim()) {
			setNuvemshopError("Store ID e Access Token são obrigatórios.");
			return;
		}
		setNuvemshopSaving(true);
		setNuvemshopError(null);
		try {
			const res = await fetch("/api/integrations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					environmentId,
					provider: "nuvemshop",
					config: { store_id: nuvemshopStoreId.trim(), access_token: nuvemshopToken.trim() },
				}),
			});
			const data = await res.json();
			if (!res.ok) {
				setNuvemshopError(data.message || "Falha ao conectar Nuvemshop.");
				return;
			}
			setNuvemshopStatus("configured");
			setNuvemshopToken("");
			await fetchNuvemshopStatus();
		} catch {
			setNuvemshopError("Erro de rede. Tente novamente.");
		} finally {
			setNuvemshopSaving(false);
		}
	};

	const handleDisconnectNuvemshop = async () => {
		if (!confirm("Desconectar Nuvemshop? Dados de faturamento voltarão a estimativas heurísticas.")) return;
		try {
			await fetch("/api/integrations", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ environmentId, provider: "nuvemshop" }),
			});
			setNuvemshopStatus("not_configured");
			setNuvemshopStoreId("");
			setNuvemshopToken("");
			setNuvemshopLastSync(null);
			setNuvemshopError(null);
			setNuvemshopValueFeedback(null);
		} catch { /* silent */ }
	};

	const handleSyncNuvemshop = async () => {
		setNuvemshopSyncing(true);
		try {
			const res = await fetch("/api/integrations/sync", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ environmentId, provider: "nuvemshop" }),
			});
			if (res.ok) await fetchNuvemshopStatus();
		} catch { /* silent */ }
		finally { setNuvemshopSyncing(false); }
	};

	const [pixelCopied, setPixelCopied] = useState(false);
	const pixelSnippet = `<script async src="https://app.vestigio.io/snippet/vestigio.js" data-env="${environmentId}"></script>`;

	const sources = [
		{
			id: "surface_audit",
			title: "Surface Audit",
			description: "Automated surface-level audit of your public pages. Runs once, stays active.",
			icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
			status: (surfaces_audit_active ? "verified" : "not_configured") as SourceStatus,
			configurable: false,
			unlocks: "Surface inventory, page health, SEO signals",
		},
		{
			id: "saas_access",
			title: "SaaS Authenticated Access",
			description: "Configure test account credentials for authenticated SaaS analysis.",
			icon: "M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z",
			status: saasStatus,
			configurable: true,
			unlocks: "SaaS Growth Pack, activation analysis, upgrade path insights",
		},
		{
			id: "pixel",
			title: "Vestigio Pixel",
			description: "Install the tracking snippet to collect real user behavior data.",
			icon: "M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5",
			status: "not_configured" as SourceStatus,
			configurable: true,
			unlocks: "Real user behavior data, conversion tracking",
		},
		{
			id: "stripe",
			title: "Stripe",
			description: "Transaction data, chargeback metrics, and revenue tracking via webhooks.",
			icon: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z",
			status: "not_configured" as SourceStatus,
			configurable: false,
			unlocks: "Revenue data, chargeback rates, transaction metrics",
		},
		{
			id: "shopify",
			title: "Shopify",
			description: "Import real revenue, orders, customers, and product data to replace heuristic estimates with data-driven insights.",
			icon: "M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z",
			status: shopifyStatus,
			configurable: true,
			unlocks: "Real revenue data, abandoned cart insights, product analytics, customer metrics",
		},
		{
			id: "nuvemshop",
			title: "Nuvemshop",
			description: "Importe dados reais de faturamento, pedidos, clientes e produtos da sua loja Nuvemshop.",
			icon: "M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z",
			status: nuvemshopStatus,
			configurable: true,
			unlocks: "Dados reais de faturamento, analytics de produtos, métricas de clientes",
		},
	];

	return (
		<div style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1rem" }}>
			<h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: 4, color: "#e4e4e7" }}>
				Data Sources
			</h1>
			<p style={{ color: "#71717a", marginBottom: 24, fontSize: 14 }}>
				Configure integrations and access sources for Vestigio analysis.
			</p>

			{error && (
				<div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, border: "1px solid #7f1d1d", backgroundColor: "#450a0a30", color: "#fca5a5", fontSize: 13 }}>
					{error}
				</div>
			)}

			{/* SaaS Setup Required Banner */}
			{saasStatus === "not_configured" && (
				<div style={{ marginBottom: 16, padding: "14px 18px", borderRadius: 10, border: "1px solid #854d0e", backgroundColor: "#422006", display: "flex", alignItems: "flex-start", gap: 12 }}>
					<svg style={{ width: 20, height: 20, color: "#fbbf24", flexShrink: 0, marginTop: 1 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
						<path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
					</svg>
					<div>
						<p style={{ color: "#fde68a", fontWeight: 600, fontSize: 14, marginBottom: 2 }}>SaaS Setup Required</p>
						<p style={{ color: "#d97706", fontSize: 13 }}>
							Configure SaaS Authenticated Access below to unlock SaaS Growth analysis. Without credentials, Vestigio cannot analyze your authenticated product experience.
						</p>
					</div>
				</div>
			)}

			{/* Verification Failed Banner */}
			{saasStatus === "failed" && lastFailure && (
				<div style={{ marginBottom: 16, padding: "14px 18px", borderRadius: 10, border: "1px solid #7f1d1d", backgroundColor: "#450a0a30", display: "flex", alignItems: "flex-start", gap: 12 }}>
					<svg style={{ width: 20, height: 20, color: "#f87171", flexShrink: 0, marginTop: 1 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
						<path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
					</svg>
					<div>
						<p style={{ color: "#fca5a5", fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Verification Failed</p>
						<p style={{ color: "#dc2626", fontSize: 13 }}>
							{lastFailure}. Please review your credentials and try again. SaaS Growth features are paused until verification succeeds.
						</p>
					</div>
				</div>
			)}

			{/* MFA Awaiting Banner */}
			{saasStatus === "awaiting_manual_mfa" && (
				<div style={{ marginBottom: 16, padding: "14px 18px", borderRadius: 10, border: "1px solid #854d0e", backgroundColor: "#422006", display: "flex", alignItems: "flex-start", gap: 12 }}>
					<svg style={{ width: 20, height: 20, color: "#fbbf24", flexShrink: 0, marginTop: 1 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
						<path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
					</svg>
					<div>
						<p style={{ color: "#fde68a", fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Manual MFA Required</p>
						<p style={{ color: "#d97706", fontSize: 13 }}>
							Your application requires multi-factor authentication that cannot be automated. Please complete MFA manually, or configure the account with MFA disabled for testing.
						</p>
					</div>
				</div>
			)}

			<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
				{sources.map((source) => (
					<div key={source.id} style={{ border: "1px solid #27272a", borderRadius: 12, backgroundColor: "#18181b", overflow: "hidden", gridColumn: expandedCard === source.id ? "1 / -1" : undefined, transition: "all 200ms ease", display: "flex", flexDirection: "column" }}>
						{/* Card */}
						<div
							style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "20px", cursor: source.configurable ? "pointer" : "default", flex: 1 }}
							onClick={() => source.configurable && setExpandedCard(expandedCard === source.id ? null : source.id)}
						>
							<div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#27272a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
								<svg style={{ width: 20, height: 20, color: "#a1a1aa" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
									<path strokeLinecap="round" strokeLinejoin="round" d={source.icon} />
								</svg>
							</div>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
									<span style={{ fontWeight: 600, color: "#e4e4e7", fontSize: 14 }}>{source.title}</span>
									<StatusBadge status={source.status} />
								</div>
								<p style={{ color: "#71717a", fontSize: 13, lineHeight: 1.5, marginBottom: 0 }}>{source.description}</p>
								{source.status !== "verified" && source.status !== "coming_soon" && (
									<p style={{ color: "#6366f1", fontSize: 11, marginTop: 6 }}>Unlocks: {source.unlocks}</p>
								)}
								{source.id === "saas_access" && lastVerified && saasStatus === "verified" && (
									<p style={{ color: "#52525b", fontSize: 11, marginTop: 4 }}>Last verified: {new Date(lastVerified).toLocaleString()}</p>
								)}
								{source.id === "saas_access" && lastFailure && saasStatus === "failed" && (
									<p style={{ color: "#ef4444", fontSize: 11, marginTop: 4 }}>Failure: {lastFailure}</p>
								)}
								{source.configurable && (
									<p style={{ fontSize: 12, color: "#52525b", marginTop: 8 }}>
										{expandedCard === source.id ? t("close") : t("configure")} &rarr;
									</p>
								)}
							</div>
						</div>

						{/* Pixel snippet */}
						{source.id === "pixel" && expandedCard === "pixel" && (
							<div style={{ padding: "0 20px 20px", borderTop: "1px solid #27272a" }}>
								<div style={{ paddingTop: 16 }}>
									<Field label="Tracking Snippet" hint="Add this before the closing </head> tag on every page">
										<div style={{ display: "flex", gap: 8 }}>
											<code style={{ flex: 1, fontSize: 12, padding: "8px 12px", borderRadius: 6, border: "1px solid #3f3f46", backgroundColor: "#09090b", color: "#a1a1aa", fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.5 }}>
												{pixelSnippet}
											</code>
											<button
												onClick={() => { navigator.clipboard.writeText(pixelSnippet); setPixelCopied(true); setTimeout(() => setPixelCopied(false), 2000); }}
												style={{ ...buttonStyle, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}
											>
												{pixelCopied ? "Copied!" : "Copy"}
											</button>
										</div>
									</Field>
								</div>
							</div>
						)}

						{/* Expanded Shopify form */}
						{source.id === "shopify" && expandedCard === "shopify" && (
							<div style={{ padding: "0 20px 20px", borderTop: "1px solid #27272a" }}>
								{shopifyStatus === "configured" || shopifyStatus === "verified" ? (
									<div style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
										<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
											<div>
												<p style={{ color: "#22c55e", fontWeight: 500, fontSize: 13 }}>Connected</p>
												{shopifyLastSync && (
													<p style={{ color: "#52525b", fontSize: 11, marginTop: 2 }}>Last sync: {new Date(shopifyLastSync).toLocaleString()}</p>
												)}
												{shopifyValueFeedback && (
													<p style={{ color: "#10b981", fontSize: 12, marginTop: 4 }}>{shopifyValueFeedback}</p>
												)}
											</div>
											<div style={{ display: "flex", gap: 8 }}>
												<button onClick={handleSyncShopify} disabled={shopifySyncing} style={{ ...buttonStyle, backgroundColor: "#27272a", color: "#e4e4e7" }}>
													{shopifySyncing ? "Syncing..." : "Sync Now"}
												</button>
												<button onClick={handleDisconnectShopify} style={{ ...buttonStyle, backgroundColor: "transparent", border: "1px solid #7f1d1d", color: "#f87171" }}>
													Disconnect
												</button>
											</div>
										</div>
										{shopifyError && (
											<div style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #7f1d1d", backgroundColor: "#450a0a30", color: "#fca5a5", fontSize: 12 }}>
												{shopifyError}
											</div>
										)}
									</div>
								) : (
									<div style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
										{/* Inline instructions */}
										<div style={{ padding: "12px 14px", borderRadius: 8, backgroundColor: "#09090b", border: "1px solid #27272a" }}>
											<p style={{ color: "#a1a1aa", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>How to get your Shopify credentials:</p>
											<ol style={{ color: "#71717a", fontSize: 12, lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
												<li>In your Shopify admin, go to <strong style={{ color: "#a1a1aa" }}>Settings &rarr; Apps and sales channels</strong></li>
												<li>Click <strong style={{ color: "#a1a1aa" }}>Develop apps</strong> &rarr; <strong style={{ color: "#a1a1aa" }}>Create an app</strong></li>
												<li>Name it &quot;Vestigio&quot; and click <strong style={{ color: "#a1a1aa" }}>Configure Admin API scopes</strong></li>
												<li>Enable: <code style={{ backgroundColor: "#27272a", padding: "1px 4px", borderRadius: 3, fontSize: 11 }}>read_orders</code>, <code style={{ backgroundColor: "#27272a", padding: "1px 4px", borderRadius: 3, fontSize: 11 }}>read_customers</code>, <code style={{ backgroundColor: "#27272a", padding: "1px 4px", borderRadius: 3, fontSize: 11 }}>read_products</code>, <code style={{ backgroundColor: "#27272a", padding: "1px 4px", borderRadius: 3, fontSize: 11 }}>read_inventory</code></li>
												<li>Click <strong style={{ color: "#a1a1aa" }}>Install app</strong> &rarr; copy the <strong style={{ color: "#a1a1aa" }}>Admin API access token</strong></li>
											</ol>
											<a href="/app/knowledge-base/shopify-integration-setup" style={{ color: "#6366f1", fontSize: 12, marginTop: 8, display: "inline-block", textDecoration: "none" }}>
												Need help? Step-by-step guide with screenshots &rarr;
											</a>
										</div>

										<Field label="Store URL" hint="Your Shopify store URL (e.g., mystore.myshopify.com)">
											<input type="text" value={shopifyStoreUrl} onChange={(e) => setShopifyStoreUrl(e.target.value)} placeholder="mystore.myshopify.com" style={inputStyle} />
										</Field>
										<Field label="Admin API Access Token" hint="Starts with shpat_...">
											<input type="password" value={shopifyToken} onChange={(e) => setShopifyToken(e.target.value)} placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" style={inputStyle} />
										</Field>

										<div style={{ padding: "8px 12px", borderRadius: 6, backgroundColor: "#09090b", border: "1px solid #27272a" }}>
											<p style={{ color: "#71717a", fontSize: 11, lineHeight: 1.5 }}>
												Vestigio only requests <strong style={{ color: "#a1a1aa" }}>read-only</strong> access. We never modify your store data. Your credentials are encrypted at rest with AES-256-GCM.
											</p>
										</div>

										{shopifyError && (
											<div style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #7f1d1d", backgroundColor: "#450a0a30", color: "#fca5a5", fontSize: 12 }}>
												{shopifyError}
											</div>
										)}

										<button onClick={handleConnectShopify} disabled={shopifySaving} style={buttonStyle}>
											{shopifySaving ? "Connecting..." : "Connect Shopify"}
										</button>
									</div>
								)}
							</div>
						)}

						{/* Expanded Nuvemshop form */}
						{source.id === "nuvemshop" && expandedCard === "nuvemshop" && (
							<div style={{ padding: "0 20px 20px", borderTop: "1px solid #27272a" }}>
								{nuvemshopStatus === "configured" || nuvemshopStatus === "verified" ? (
									<div style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
										<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
											<div>
												<p style={{ color: "#22c55e", fontWeight: 500, fontSize: 13 }}>Conectado</p>
												{nuvemshopLastSync && (
													<p style={{ color: "#52525b", fontSize: 11, marginTop: 2 }}>Último sync: {new Date(nuvemshopLastSync).toLocaleString()}</p>
												)}
												{nuvemshopValueFeedback && (
													<p style={{ color: "#10b981", fontSize: 12, marginTop: 4 }}>{nuvemshopValueFeedback}</p>
												)}
											</div>
											<div style={{ display: "flex", gap: 8 }}>
												<button onClick={handleSyncNuvemshop} disabled={nuvemshopSyncing} style={{ ...buttonStyle, backgroundColor: "#27272a", color: "#e4e4e7" }}>
													{nuvemshopSyncing ? "Sincronizando..." : "Sincronizar"}
												</button>
												<button onClick={handleDisconnectNuvemshop} style={{ ...buttonStyle, backgroundColor: "transparent", border: "1px solid #7f1d1d", color: "#f87171" }}>
													Desconectar
												</button>
											</div>
										</div>
										{nuvemshopError && (
											<div style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #7f1d1d", backgroundColor: "#450a0a30", color: "#fca5a5", fontSize: 12 }}>
												{nuvemshopError}
											</div>
										)}
									</div>
								) : (
									<div style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
										{/* Inline instructions */}
										<div style={{ padding: "12px 14px", borderRadius: 8, backgroundColor: "#09090b", border: "1px solid #27272a" }}>
											<p style={{ color: "#a1a1aa", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Como obter as credenciais Nuvemshop:</p>
											<ol style={{ color: "#71717a", fontSize: 12, lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
												<li>Acesse o link de instalação do app Vestigio na sua loja Nuvemshop</li>
												<li>Autorize o app — você será redirecionado de volta com um código de autorização</li>
												<li>O sistema troca o código por um <strong style={{ color: "#a1a1aa" }}>access_token</strong> e <strong style={{ color: "#a1a1aa" }}>store_id</strong></li>
												<li>Copie o <strong style={{ color: "#a1a1aa" }}>Store ID</strong> e o <strong style={{ color: "#a1a1aa" }}>Access Token</strong> nos campos abaixo</li>
											</ol>
											<a href="/app/knowledge-base/nuvemshop-integration-setup" style={{ color: "#6366f1", fontSize: 12, marginTop: 8, display: "inline-block", textDecoration: "none" }}>
												Precisa de ajuda? Guia passo a passo com screenshots &rarr;
											</a>
										</div>

										<Field label="Store ID" hint="ID numérico da loja (retornado como user_id na autenticação OAuth)">
											<input type="text" value={nuvemshopStoreId} onChange={(e) => setNuvemshopStoreId(e.target.value)} placeholder="1234567" style={inputStyle} />
										</Field>
										<Field label="Access Token" hint="Token OAuth da Nuvemshop">
											<input type="password" value={nuvemshopToken} onChange={(e) => setNuvemshopToken(e.target.value)} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" style={inputStyle} />
										</Field>

										<div style={{ padding: "8px 12px", borderRadius: 6, backgroundColor: "#09090b", border: "1px solid #27272a" }}>
											<p style={{ color: "#71717a", fontSize: 11, lineHeight: 1.5 }}>
												A Vestigio solicita apenas acesso <strong style={{ color: "#a1a1aa" }}>somente leitura</strong>. Nunca modificamos dados da sua loja. Suas credenciais são criptografadas em repouso com AES-256-GCM.
											</p>
										</div>

										{nuvemshopError && (
											<div style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #7f1d1d", backgroundColor: "#450a0a30", color: "#fca5a5", fontSize: 12 }}>
												{nuvemshopError}
											</div>
										)}

										<button onClick={handleConnectNuvemshop} disabled={nuvemshopSaving} style={buttonStyle}>
											{nuvemshopSaving ? "Conectando..." : "Conectar Nuvemshop"}
										</button>
									</div>
								)}
							</div>
						)}

						{/* Expanded SaaS form */}
						{source.id === "saas_access" && expandedCard === "saas_access" && (
							<div style={{ padding: "0 20px 20px", borderTop: "1px solid #27272a" }}>
								{loading ? (
									<div style={{ padding: 20, textAlign: "center", color: "#71717a", fontSize: 13 }}>Loading configuration...</div>
								) : (
									<div style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
										<Field label="Login URL" hint="Application login page">
											<input type="url" value={saasForm.loginUrl} onChange={(e) => updateSaas("loginUrl", e.target.value)} placeholder="https://app.example.com/login" style={inputStyle} />
										</Field>
										<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
											<Field label="Test Account Email">
												<input type="email" value={saasForm.email} onChange={(e) => updateSaas("email", e.target.value)} placeholder="test@example.com" style={inputStyle} />
											</Field>
											<Field label="Password">
												<input
													type="password"
													value={saasForm.password}
													onChange={(e) => updateSaas("password", e.target.value)}
													placeholder={hasPassword ? "••••••••  (leave blank to keep)" : "Enter password"}
													style={inputStyle}
												/>
											</Field>
										</div>
										<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
											<Field label="Auth Method">
												<StyledSelect value={saasForm.authMethod} onChange={(v) => updateSaas("authMethod", v)} options={[
													{ value: "unknown", label: "Not sure" },
													{ value: "password", label: "Email + Password" },
													{ value: "oauth", label: "OAuth / SSO" },
													{ value: "magic_link", label: "Magic Link" },
												]} />
											</Field>
											<Field label="MFA / 2FA">
												<StyledSelect value={saasForm.mfaMode} onChange={(v) => updateSaas("mfaMode", v)} options={[
													{ value: "unknown", label: "Not sure" },
													{ value: "none", label: "No MFA" },
													{ value: "optional", label: "Optional" },
													{ value: "required", label: "Required" },
												]} />
											</Field>
										</div>
										<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
											<Field label="Test Account Ready?">
												<BoolSelect value={saasForm.hasTestAccount} onChange={(v) => updateSaas("hasTestAccount", v)} />
											</Field>
											<Field label="Free Trial?">
												<BoolSelect value={saasForm.hasTrial} onChange={(v) => updateSaas("hasTrial", v)} />
											</Field>
											<Field label="Needs Seed Data?">
												<BoolSelect value={saasForm.requiresSeedData} onChange={(v) => updateSaas("requiresSeedData", v)} />
											</Field>
										</div>
										<Field label="Activation Goal" hint="What defines a successfully onboarded user?">
											<input type="text" value={saasForm.activationGoal} onChange={(e) => updateSaas("activationGoal", e.target.value)} placeholder="e.g., Create first project" style={inputStyle} />
										</Field>
										<Field label="Upgrade Path" hint="How do users upgrade from free to paid?">
											<input type="text" value={saasForm.primaryUpgradePath} onChange={(e) => updateSaas("primaryUpgradePath", e.target.value)} placeholder="e.g., Settings → Billing → Upgrade" style={inputStyle} />
										</Field>
										<div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
											<button onClick={handleSaveSaas} disabled={saving} style={buttonStyle}>
												{saving ? "Saving..." : "Save Configuration"}
											</button>
										</div>
									</div>
								)}
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	);
}

// ── Sub-components ───────────────────────────

function StatusBadge({ status }: { status: string }) {
	const info = STATUS_LABELS[status] || STATUS_LABELS.not_configured;
	return (
		<span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 100, backgroundColor: info.color + "20", color: info.color }}>
			{info.label}
		</span>
	);
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
	return (
		<div>
			<label style={{ display: "block", fontWeight: 500, fontSize: 13, color: "#a1a1aa", marginBottom: 4 }}>{label}</label>
			{hint && <p style={{ color: "#52525b", fontSize: 12, marginBottom: 4 }}>{hint}</p>}
			{children}
		</div>
	);
}

function StyledSelect({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!open) return;
		function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
		document.addEventListener("mousedown", h);
		return () => document.removeEventListener("mousedown", h);
	}, [open]);
	const activeLabel = options.find((o) => o.value === value)?.label ?? value;
	return (
		<div ref={ref} style={{ position: "relative" }}>
			<button type="button" onClick={() => setOpen(!open)} style={{ ...inputStyle, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", textAlign: "left" }}>
				<span>{activeLabel}</span>
				<svg style={{ width: 12, height: 12, color: "#71717a", transform: open ? "rotate(180deg)" : "", transition: "transform 150ms" }} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
			</button>
			{open && (
				<div style={{ position: "absolute", left: 0, top: "100%", zIndex: 50, marginTop: 4, minWidth: "100%", borderRadius: 8, border: "1px solid #27272a", backgroundColor: "#18181b", padding: 4, boxShadow: "0 10px 25px -5px rgba(0,0,0,0.5)" }}>
					{options.map((opt) => (
						<button key={opt.value} type="button" onClick={() => { onChange(opt.value); setOpen(false); }} style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, border: "none", background: "none", color: opt.value === value ? "#e4e4e7" : "#a1a1aa", fontSize: 13, cursor: "pointer", textAlign: "left" }}
							onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#27272a")}
							onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
						>
							{opt.value === value ? <svg style={{ width: 14, height: 14, color: "#10b981" }} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg> : <span style={{ width: 14 }} />}
							{opt.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

function BoolSelect({ value, onChange }: { value: boolean | null; onChange: (v: boolean | null) => void }) {
	return (
		<StyledSelect
			value={value === null ? "null" : String(value)}
			onChange={(v) => onChange(v === "null" ? null : v === "true")}
			options={[{ value: "null", label: "Not sure" }, { value: "true", label: "Yes" }, { value: "false", label: "No" }]}
		/>
	);
}

function mapStatus(status: string): SourceStatus {
	if (status === "unconfigured" || !status) return "not_configured";
	if (status === "connected") return "verified";
	if (status === "pending") return "configured";
	if (status === "error") return "failed";
	if (status === "disconnected") return "not_configured";
	return status as SourceStatus;
}

const inputStyle: React.CSSProperties = {
	width: "100%", padding: "7px 10px", borderRadius: 6,
	border: "1px solid #3f3f46", backgroundColor: "#09090b",
	color: "#e4e4e7", fontSize: 13, outline: "none",
};

const buttonStyle: React.CSSProperties = {
	padding: "8px 20px", borderRadius: 8, border: "none",
	backgroundColor: "#059669", color: "#fff", fontWeight: 500,
	fontSize: 13, cursor: "pointer",
};
