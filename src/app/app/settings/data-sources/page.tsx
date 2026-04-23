"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import PageHeader from "@/components/console/PageHeader";

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

// ── Brand Logos ───────────────────────────────
const SOURCE_LOGOS: Record<string, React.ReactNode> = {
	surface_audit: (
		<svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
			<path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
		</svg>
	),
	saas_access: (
		<svg className="w-5 h-5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
			<path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
		</svg>
	),
	pixel: (
		<svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
			<path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
		</svg>
	),
	stripe: <img src="/logos/stripe.svg" alt="Stripe" className="w-full h-full object-cover" />,
	shopify: <img src="/logos/shopify.svg" alt="Shopify" className="w-full h-full object-cover" />,
	nuvemshop: <img src="/logos/nuvemshop.svg" alt="Nuvemshop" className="w-full h-full object-cover" />,
	meta_ads: <img src="/logos/meta.svg" alt="Meta" className="w-full h-full object-cover" />,
	google_ads: <img src="/logos/google-ads.svg" alt="Google Ads" className="w-full h-full object-cover" />,
};

function getEnvironmentId(): string {
	if (typeof window !== "undefined") {
		// Priority: URL param > active_env cookie > fallback
		const params = new URLSearchParams(window.location.search);
		const fromUrl = params.get("env");
		if (fromUrl) return fromUrl;
		const match = document.cookie.match(/(?:^|;\s*)active_env=([^;]*)/);
		if (match?.[1]) return match[1];
	}
	return "default_env";
}

export default function DataSourcesPage() {
	const t = useTranslations("console.data_sources_extra");
	const tc = useTranslations("console.common");
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
	const isDemo = environmentId === "env_1" || environmentId === "default_env";

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
		if (isDemo) {
			// Demo user: show mock connected integrations
			setSaasStatus("verified");
			setShopifyStatus("verified");
			setMetaAdsStatus("verified");
			setMetaAdsLastSync(new Date().toISOString());
			setGoogleAdsStatus("verified");
			setGoogleAdsLastSync(new Date().toISOString());
			setLoading(false);
			return;
		}
		fetchConfig();
	}, [fetchConfig, isDemo]);

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

	// ── Meta Ads state ──
	const [metaAdsStatus, setMetaAdsStatus] = useState<SourceStatus>("not_configured");
	const [metaAdsAccountId, setMetaAdsAccountId] = useState("");
	const [metaAdsToken, setMetaAdsToken] = useState("");
	const [metaAdsSaving, setMetaAdsSaving] = useState(false);
	const [metaAdsLastSync, setMetaAdsLastSync] = useState<string | null>(null);
	const [metaAdsError, setMetaAdsError] = useState<string | null>(null);
	const [metaAdsAdvanced, setMetaAdsAdvanced] = useState(false);

	const fetchMetaAdsStatus = useCallback(async () => {
		try {
			const res = await fetch(`/api/integrations?environment_id=${environmentId}`);
			if (!res.ok) return;
			const { integrations } = await res.json();
			const metaAds = integrations?.find((i: any) => i.provider === "meta_ads");
			if (metaAds) {
				setMetaAdsStatus(mapStatus(metaAds.status));
				setMetaAdsLastSync(metaAds.lastSyncedAt);
				setMetaAdsError(metaAds.syncError);
			}
		} catch { /* silent */ }
	}, [environmentId]);

	useEffect(() => { fetchMetaAdsStatus(); }, [fetchMetaAdsStatus]);

	const handleConnectMetaAds = async () => {
		if (!metaAdsAccountId.trim() || !metaAdsToken.trim()) {
			setMetaAdsError("Ad Account ID e Access Token são obrigatórios.");
			return;
		}
		setMetaAdsSaving(true);
		setMetaAdsError(null);
		try {
			const res = await fetch("/api/integrations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					environmentId,
					provider: "meta_ads",
					config: {
						ad_account_id: metaAdsAccountId.trim(),
						access_token: metaAdsToken.trim(),
					},
				}),
			});
			const data = await res.json();
			if (!res.ok && res.status !== 200) {
				setMetaAdsError(data.message || "Falha ao conectar Meta Ads.");
				return;
			}
			if (data.status === "error") {
				setMetaAdsError(data.message || "Credenciais inválidas.");
				return;
			}
			setMetaAdsStatus("configured");
			setMetaAdsToken("");
			await fetchMetaAdsStatus();
		} catch {
			setMetaAdsError("Erro de rede. Tente novamente.");
		} finally {
			setMetaAdsSaving(false);
		}
	};

	const handleDisconnectMetaAds = async () => {
		if (!confirm("Desconectar Meta Ads? Insights de spend e creative voltarão a ficar indisponíveis.")) return;
		try {
			await fetch("/api/integrations", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ environmentId, provider: "meta_ads" }),
			});
			setMetaAdsStatus("not_configured");
			setMetaAdsAccountId("");
			setMetaAdsToken("");
			setMetaAdsLastSync(null);
			setMetaAdsError(null);
		} catch { /* silent */ }
	};

	// ── Google Ads state ──
	const [googleAdsStatus, setGoogleAdsStatus] = useState<SourceStatus>("not_configured");
	const [googleAdsDeveloperToken, setGoogleAdsDeveloperToken] = useState("");
	const [googleAdsClientId, setGoogleAdsClientId] = useState("");
	const [googleAdsClientSecret, setGoogleAdsClientSecret] = useState("");
	const [googleAdsRefreshToken, setGoogleAdsRefreshToken] = useState("");
	const [googleAdsCustomerId, setGoogleAdsCustomerId] = useState("");
	const [googleAdsLoginCustomerId, setGoogleAdsLoginCustomerId] = useState("");
	const [googleAdsSaving, setGoogleAdsSaving] = useState(false);
	const [googleAdsLastSync, setGoogleAdsLastSync] = useState<string | null>(null);
	const [googleAdsError, setGoogleAdsError] = useState<string | null>(null);
	const [googleAdsAdvanced, setGoogleAdsAdvanced] = useState(false);

	const fetchGoogleAdsStatus = useCallback(async () => {
		try {
			const res = await fetch(`/api/integrations?environment_id=${environmentId}`);
			if (!res.ok) return;
			const { integrations } = await res.json();
			const googleAds = integrations?.find((i: any) => i.provider === "google_ads");
			if (googleAds) {
				setGoogleAdsStatus(mapStatus(googleAds.status));
				setGoogleAdsLastSync(googleAds.lastSyncedAt);
				setGoogleAdsError(googleAds.syncError);
			}
		} catch { /* silent */ }
	}, [environmentId]);

	useEffect(() => { fetchGoogleAdsStatus(); }, [fetchGoogleAdsStatus]);

	const handleConnectGoogleAds = async () => {
		const missing = [
			["developer_token", googleAdsDeveloperToken],
			["client_id", googleAdsClientId],
			["client_secret", googleAdsClientSecret],
			["refresh_token", googleAdsRefreshToken],
			["customer_id", googleAdsCustomerId],
		].filter(([, v]) => !String(v).trim());
		if (missing.length > 0) {
			setGoogleAdsError(`Campos obrigatórios: ${missing.map(m => m[0]).join(", ")}.`);
			return;
		}
		setGoogleAdsSaving(true);
		setGoogleAdsError(null);
		try {
			const res = await fetch("/api/integrations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					environmentId,
					provider: "google_ads",
					config: {
						developer_token: googleAdsDeveloperToken.trim(),
						client_id: googleAdsClientId.trim(),
						client_secret: googleAdsClientSecret.trim(),
						refresh_token: googleAdsRefreshToken.trim(),
						customer_id: googleAdsCustomerId.trim(),
						...(googleAdsLoginCustomerId.trim() && { login_customer_id: googleAdsLoginCustomerId.trim() }),
					},
				}),
			});
			const data = await res.json();
			if (!res.ok && res.status !== 200) {
				setGoogleAdsError(data.message || "Falha ao conectar Google Ads.");
				return;
			}
			if (data.status === "error") {
				setGoogleAdsError(data.message || "Credenciais inválidas.");
				return;
			}
			setGoogleAdsStatus("configured");
			setGoogleAdsClientSecret("");
			setGoogleAdsRefreshToken("");
			await fetchGoogleAdsStatus();
		} catch {
			setGoogleAdsError("Erro de rede. Tente novamente.");
		} finally {
			setGoogleAdsSaving(false);
		}
	};

	const handleDisconnectGoogleAds = async () => {
		if (!confirm("Desconectar Google Ads? Insights de campanhas e spend voltarão a ficar indisponíveis.")) return;
		try {
			await fetch("/api/integrations", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ environmentId, provider: "google_ads" }),
			});
			setGoogleAdsStatus("not_configured");
			setGoogleAdsDeveloperToken("");
			setGoogleAdsClientId("");
			setGoogleAdsClientSecret("");
			setGoogleAdsRefreshToken("");
			setGoogleAdsCustomerId("");
			setGoogleAdsLoginCustomerId("");
			setGoogleAdsLastSync(null);
			setGoogleAdsError(null);
		} catch { /* silent */ }
	};

	const [pixelCopied, setPixelCopied] = useState(false);
	const pixelSnippet = `<script async src="https://app.vestigio.io/snippet/vestigio.js" data-env="${environmentId}"></script>`;

	const sources = [
		{
			id: "surface_audit",
			title: "Surface Audit",
			description: "Automated surface-level audit of your public pages. Runs once, stays active.",
			status: (surfaces_audit_active ? "verified" : "not_configured") as SourceStatus,
			configurable: false,
			unlocks: "Surface inventory, page health, SEO signals",
		},
		{
			id: "saas_access",
			title: "SaaS Authenticated Access",
			description: "Configure test account credentials for authenticated SaaS analysis.",
			status: saasStatus,
			configurable: true,
			unlocks: "SaaS Growth Pack, activation analysis, upgrade path insights",
		},
		{
			id: "pixel",
			title: "Vestigio Pixel",
			description: "Install the tracking snippet to collect real user behavior data.",
			status: "not_configured" as SourceStatus,
			configurable: true,
			unlocks: "Real user behavior data, conversion tracking",
		},
		{
			id: "stripe",
			title: "Stripe",
			description: "Transaction data, chargeback metrics, and revenue tracking via webhooks.",
			status: "not_configured" as SourceStatus,
			configurable: false,
			unlocks: "Revenue data, chargeback rates, transaction metrics",
		},
		{
			id: "shopify",
			title: "Shopify",
			description: "Import real revenue, orders, customers, and product data to replace heuristic estimates with data-driven insights.",
			status: shopifyStatus,
			configurable: true,
			unlocks: "Real revenue data, abandoned cart insights, product analytics, customer metrics",
		},
		{
			id: "nuvemshop",
			title: "Nuvemshop",
			description: "Importe dados reais de faturamento, pedidos, clientes e produtos da sua loja Nuvemshop.",
			status: nuvemshopStatus,
			configurable: true,
			unlocks: "Dados reais de faturamento, analytics de produtos, métricas de clientes",
		},
		{
			id: "meta_ads",
			title: "Meta Ads",
			description: "Importe ad spend e criativos do Facebook / Instagram Ads pra medir ROAS real e detectar concentração de plataforma.",
			status: metaAdsStatus,
			configurable: true,
			unlocks: "Ad spend real, criativos, ROAS measurable, platform concentration risk",
		},
		{
			id: "google_ads",
			title: "Google Ads",
			description: "Importe spend, campanhas e creative text do Google Ads pra cross-reference com revenue e detectar waste.",
			status: googleAdsStatus,
			configurable: true,
			unlocks: "Ad spend real, campanhas, creative text, ROAS measurable, conversion visibility",
		},
	];

	return (
		<div className="p-4 sm:p-6">
			<PageHeader
				title={t("title")}
				tooltip={tc("page_tooltips.data_sources")}
			/>

			{error && (
				<div className="mb-4 rounded-lg border border-red-900 bg-red-950/20 px-3.5 py-2.5 text-[13px] text-red-300">
					{error}
				</div>
			)}

			{/* SaaS Setup Required Banner */}
			{saasStatus === "not_configured" && (
				<div className="mb-4 flex items-start gap-3 rounded-[10px] border border-yellow-800 bg-yellow-950 px-[18px] py-3.5">
					<svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
						<path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
					</svg>
					<div>
						<p className="mb-0.5 text-sm font-semibold text-amber-200">SaaS Setup Required</p>
						<p className="text-[13px] text-amber-600">
							Configure SaaS Authenticated Access below to unlock SaaS Growth analysis. Without credentials, Vestigio cannot analyze your authenticated product experience.
						</p>
					</div>
				</div>
			)}

			{/* Verification Failed Banner */}
			{saasStatus === "failed" && lastFailure && (
				<div className="mb-4 flex items-start gap-3 rounded-[10px] border border-red-900 bg-red-950/20 px-[18px] py-3.5">
					<svg className="mt-0.5 h-5 w-5 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
						<path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
					</svg>
					<div>
						<p className="mb-0.5 text-sm font-semibold text-red-300">Verification Failed</p>
						<p className="text-[13px] text-red-600">
							{lastFailure}. Please review your credentials and try again. SaaS Growth features are paused until verification succeeds.
						</p>
					</div>
				</div>
			)}

			{/* MFA Awaiting Banner */}
			{saasStatus === "awaiting_manual_mfa" && (
				<div className="mb-4 flex items-start gap-3 rounded-[10px] border border-yellow-800 bg-yellow-950 px-[18px] py-3.5">
					<svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
						<path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
					</svg>
					<div>
						<p className="mb-0.5 text-sm font-semibold text-amber-200">Manual MFA Required</p>
						<p className="text-[13px] text-amber-600">
							Your application requires multi-factor authentication that cannot be automated. Please complete MFA manually, or configure the account with MFA disabled for testing.
						</p>
					</div>
				</div>
			)}

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				{sources.map((source) => (
					<div
						key={source.id}
						className={`rounded-xl border border-edge bg-surface-card overflow-hidden flex flex-col transition-all ${expandedCard === source.id ? "md:col-span-2 lg:col-span-3" : ""}`}
					>
						{/* Card */}
						<div
							className={`flex items-start gap-3.5 p-5 flex-1 ${source.configurable ? "cursor-pointer" : ""}`}
							onClick={() => source.configurable && setExpandedCard(expandedCard === source.id ? null : source.id)}
						>
							<div className={`w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center shrink-0 ${["stripe", "shopify", "nuvemshop", "meta_ads", "google_ads"].includes(source.id) ? "" : "bg-surface-inset"}`}>
								{SOURCE_LOGOS[source.id]}
							</div>
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2 mb-1">
									<span className="text-sm font-semibold text-content">{source.title}</span>
									<StatusBadge status={source.status} />
								</div>
								<p className="text-xs text-content-muted leading-relaxed">{source.description}</p>
								{source.status !== "verified" && source.status !== "coming_soon" && (
									<p className="text-indigo-500 text-[11px] mt-1.5">Unlocks: {source.unlocks}</p>
								)}
								{source.id === "saas_access" && lastVerified && saasStatus === "verified" && (
									<p className="text-zinc-600 text-[11px] mt-1">Last verified: {new Date(lastVerified).toLocaleString()}</p>
								)}
								{source.id === "saas_access" && lastFailure && saasStatus === "failed" && (
									<p className="text-red-500 text-[11px] mt-1">Failure: {lastFailure}</p>
								)}
								{source.configurable && (
									<p className="text-xs text-zinc-600 mt-2">
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

						{/* Expanded Meta Ads form */}
						{source.id === "meta_ads" && expandedCard === "meta_ads" && (
							<div style={{ padding: "0 20px 20px", borderTop: "1px solid #27272a" }}>
								{metaAdsStatus === "configured" || metaAdsStatus === "verified" ? (
									<div style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
										<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
											<div>
												<p style={{ color: "#22c55e", fontWeight: 500, fontSize: 13 }}>Connected</p>
												{metaAdsLastSync && (
													<p style={{ color: "#52525b", fontSize: 11, marginTop: 2 }}>Last sync: {new Date(metaAdsLastSync).toLocaleString()}</p>
												)}
											</div>
											<button onClick={handleDisconnectMetaAds} style={{ ...buttonStyle, backgroundColor: "transparent", border: "1px solid #7f1d1d", color: "#f87171" }}>
												Disconnect
											</button>
										</div>
										{metaAdsError && (
											<div style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #7f1d1d", backgroundColor: "#450a0a30", color: "#fca5a5", fontSize: 12 }}>
												{metaAdsError}
											</div>
										)}
									</div>
								) : !metaAdsAdvanced ? (
									<div style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
										<div style={{ padding: "14px 16px", borderRadius: 8, backgroundColor: "#09090b", border: "1px solid #27272a" }}>
											<p style={{ color: "#e4e4e7", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Connect via Meta OAuth</p>
											<p style={{ color: "#71717a", fontSize: 12, lineHeight: 1.6 }}>
												Você vai ser redirecionado pro Facebook, autoriza Vestigio com escopo <strong style={{ color: "#a1a1aa" }}>ads_read</strong> + <strong style={{ color: "#a1a1aa" }}>business_management</strong> (ambos read-only) e volta aqui conectado. Sem copy-paste de token.
											</p>
											<a href="/app/knowledge-base/meta-ads-integration-setup" style={{ color: "#6366f1", fontSize: 12, marginTop: 8, display: "inline-block", textDecoration: "none" }}>
												Passo a passo com screenshots + troubleshooting →
											</a>
										</div>

										{metaAdsError && (
											<div style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #7f1d1d", backgroundColor: "#450a0a30", color: "#fca5a5", fontSize: 12 }}>
												{metaAdsError}
											</div>
										)}

										<a href={`/api/integrations/meta-ads/authorize?environment_id=${encodeURIComponent(environmentId)}`} style={{ ...buttonStyle, textAlign: "center" as const, textDecoration: "none", backgroundColor: "#1877f2", color: "#fff" }}>
											Conectar com Meta
										</a>

										<button onClick={() => setMetaAdsAdvanced(true)} style={{ background: "none", border: "none", color: "#71717a", fontSize: 11, cursor: "pointer", padding: 0, textAlign: "left" as const }}>
											Advanced: colar System User token manualmente →
										</button>
									</div>
								) : (
									<div style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
										<div style={{ padding: "12px 14px", borderRadius: 8, backgroundColor: "#09090b", border: "1px solid #27272a" }}>
											<p style={{ color: "#a1a1aa", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Manual (System User token) — for technical users:</p>
											<ol style={{ color: "#71717a", fontSize: 12, lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
												<li>Em <a href="https://business.facebook.com/settings" style={{ color: "#6366f1" }} target="_blank" rel="noreferrer">Business Settings</a> &rarr; <strong style={{ color: "#a1a1aa" }}>Users &rarr; System Users</strong>, crie um System User</li>
												<li>Assign o System User ao seu <strong style={{ color: "#a1a1aa" }}>Ad Account</strong> com permissão <code style={{ backgroundColor: "#27272a", padding: "1px 4px", borderRadius: 3, fontSize: 11 }}>ads_read</code></li>
												<li>Click <strong style={{ color: "#a1a1aa" }}>Generate New Token</strong> &rarr; selecione seu Meta App &rarr; scope <code style={{ backgroundColor: "#27272a", padding: "1px 4px", borderRadius: 3, fontSize: 11 }}>ads_read</code> &rarr; copie o token (permanente pra business assets)</li>
												<li>Pegue o Ad Account ID em <strong style={{ color: "#a1a1aa" }}>Ads Manager &rarr; Account Settings</strong> (formato <code style={{ backgroundColor: "#27272a", padding: "1px 4px", borderRadius: 3, fontSize: 11 }}>act_XXXXXXXXXXXXX</code>)</li>
											</ol>
										</div>

										<Field label="Ad Account ID" hint="act_XXXXXXXXXXXXX — o 'act_' é opcional, a gente normaliza">
											<input type="text" value={metaAdsAccountId} onChange={(e) => setMetaAdsAccountId(e.target.value)} placeholder="act_123456789012345" style={inputStyle} />
										</Field>
										<Field label="System User Access Token" hint="Permanente pra business assets (ou long-lived user token)">
											<input type="password" value={metaAdsToken} onChange={(e) => setMetaAdsToken(e.target.value)} placeholder="EAAG..." style={inputStyle} />
										</Field>

										<div style={{ padding: "8px 12px", borderRadius: 6, backgroundColor: "#09090b", border: "1px solid #27272a" }}>
											<p style={{ color: "#71717a", fontSize: 11, lineHeight: 1.5 }}>
												Apenas escopo <strong style={{ color: "#a1a1aa" }}>ads_read</strong>. Sem permissão de modificar campanhas. Credenciais criptografadas com AES-256-GCM.
											</p>
										</div>

										{metaAdsError && (
											<div style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #7f1d1d", backgroundColor: "#450a0a30", color: "#fca5a5", fontSize: 12 }}>
												{metaAdsError}
											</div>
										)}

										<div style={{ display: "flex", gap: 10 }}>
											<button onClick={handleConnectMetaAds} disabled={metaAdsSaving} style={buttonStyle}>
												{metaAdsSaving ? "Conectando..." : "Conectar Meta Ads"}
											</button>
											<button onClick={() => setMetaAdsAdvanced(false)} style={{ ...buttonStyle, backgroundColor: "transparent", color: "#a1a1aa", border: "1px solid #27272a" }}>
												Voltar pro OAuth
											</button>
										</div>
									</div>
								)}
							</div>
						)}

						{/* Expanded Google Ads form */}
						{source.id === "google_ads" && expandedCard === "google_ads" && (
							<div style={{ padding: "0 20px 20px", borderTop: "1px solid #27272a" }}>
								{googleAdsStatus === "configured" || googleAdsStatus === "verified" ? (
									<div style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
										<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
											<div>
												<p style={{ color: "#22c55e", fontWeight: 500, fontSize: 13 }}>Connected</p>
												{googleAdsLastSync && (
													<p style={{ color: "#52525b", fontSize: 11, marginTop: 2 }}>Last sync: {new Date(googleAdsLastSync).toLocaleString()}</p>
												)}
											</div>
											<button onClick={handleDisconnectGoogleAds} style={{ ...buttonStyle, backgroundColor: "transparent", border: "1px solid #7f1d1d", color: "#f87171" }}>
												Disconnect
											</button>
										</div>
										{googleAdsError && (
											<div style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #7f1d1d", backgroundColor: "#450a0a30", color: "#fca5a5", fontSize: 12 }}>
												{googleAdsError}
											</div>
										)}
									</div>
								) : !googleAdsAdvanced ? (
									<div style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
										<div style={{ padding: "14px 16px", borderRadius: 8, backgroundColor: "#09090b", border: "1px solid #27272a" }}>
											<p style={{ color: "#e4e4e7", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Connect via Google OAuth</p>
											<p style={{ color: "#71717a", fontSize: 12, lineHeight: 1.6 }}>
												Você vai ser redirecionado pra Google, autoriza Vestigio com escopo <strong style={{ color: "#a1a1aa" }}>adwords</strong> (read-only) e volta aqui conectado. O developer token é Vestigio-side, você não precisa aplicar pelo seu.
											</p>
											<a href="/app/knowledge-base/google-ads-integration-setup" style={{ color: "#6366f1", fontSize: 12, marginTop: 8, display: "inline-block", textDecoration: "none" }}>
												Passo a passo com screenshots + troubleshooting →
											</a>
										</div>

										{googleAdsError && (
											<div style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #7f1d1d", backgroundColor: "#450a0a30", color: "#fca5a5", fontSize: 12 }}>
												{googleAdsError}
											</div>
										)}

										<a href={`/api/integrations/google-ads/authorize?environment_id=${encodeURIComponent(environmentId)}`} style={{ ...buttonStyle, textAlign: "center" as const, textDecoration: "none", backgroundColor: "#4285f4", color: "#fff" }}>
											Conectar com Google
										</a>

										<button onClick={() => setGoogleAdsAdvanced(true)} style={{ background: "none", border: "none", color: "#71717a", fontSize: 11, cursor: "pointer", padding: 0, textAlign: "left" as const }}>
											Advanced: colar credenciais manualmente (próprio developer token) →
										</button>
									</div>
								) : (
									<div style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
										<div style={{ padding: "12px 14px", borderRadius: 8, backgroundColor: "#09090b", border: "1px solid #27272a" }}>
											<p style={{ color: "#a1a1aa", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Manual (own developer token) — for technical users:</p>
											<ol style={{ color: "#71717a", fontSize: 12, lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
												<li>Apply for a <strong style={{ color: "#a1a1aa" }}>Developer Token</strong> em <a href="https://ads.google.com/aw/apicenter" style={{ color: "#6366f1" }} target="_blank" rel="noreferrer">Google Ads API Center</a> (basic access serve)</li>
												<li>Em <a href="https://console.cloud.google.com/apis/credentials" style={{ color: "#6366f1" }} target="_blank" rel="noreferrer">Google Cloud Console</a> crie um <strong style={{ color: "#a1a1aa" }}>OAuth 2.0 Client ID</strong> do tipo Desktop App</li>
												<li>Gere um <strong style={{ color: "#a1a1aa" }}>Refresh Token</strong> via <a href="https://developers.google.com/oauthplayground" style={{ color: "#6366f1" }} target="_blank" rel="noreferrer">OAuth Playground</a> com scope <code style={{ backgroundColor: "#27272a", padding: "1px 4px", borderRadius: 3, fontSize: 11 }}>https://www.googleapis.com/auth/adwords</code></li>
												<li>Pegue o <strong style={{ color: "#a1a1aa" }}>Customer ID</strong> em Google Ads (formato <code style={{ backgroundColor: "#27272a", padding: "1px 4px", borderRadius: 3, fontSize: 11 }}>123-456-7890</code> — remova os hífens)</li>
												<li>Se você usa MCC, preencha também o <strong style={{ color: "#a1a1aa" }}>Login Customer ID</strong> (o id da MCC manager)</li>
											</ol>
										</div>

										<Field label="Developer Token" hint="Aprovado pelo Google Ads API Center">
											<input type="password" value={googleAdsDeveloperToken} onChange={(e) => setGoogleAdsDeveloperToken(e.target.value)} placeholder="XXXXXXXXXXXXXXXXXXXXXX" style={inputStyle} />
										</Field>
										<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
											<Field label="OAuth Client ID">
												<input type="text" value={googleAdsClientId} onChange={(e) => setGoogleAdsClientId(e.target.value)} placeholder="xxx.apps.googleusercontent.com" style={inputStyle} />
											</Field>
											<Field label="OAuth Client Secret">
												<input type="password" value={googleAdsClientSecret} onChange={(e) => setGoogleAdsClientSecret(e.target.value)} placeholder="GOCSPX-..." style={inputStyle} />
											</Field>
										</div>
										<Field label="Refresh Token" hint="Gerado via OAuth Playground com scope adwords">
											<input type="password" value={googleAdsRefreshToken} onChange={(e) => setGoogleAdsRefreshToken(e.target.value)} placeholder="1//0e..." style={inputStyle} />
										</Field>
										<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
											<Field label="Customer ID" hint="Só dígitos, sem hífens">
												<input type="text" value={googleAdsCustomerId} onChange={(e) => setGoogleAdsCustomerId(e.target.value)} placeholder="1234567890" style={inputStyle} />
											</Field>
											<Field label="Login Customer ID (opcional)" hint="Id da MCC manager se você usar">
												<input type="text" value={googleAdsLoginCustomerId} onChange={(e) => setGoogleAdsLoginCustomerId(e.target.value)} placeholder="9876543210" style={inputStyle} />
											</Field>
										</div>

										<div style={{ padding: "8px 12px", borderRadius: 6, backgroundColor: "#09090b", border: "1px solid #27272a" }}>
											<p style={{ color: "#71717a", fontSize: 11, lineHeight: 1.5 }}>
												Apenas leitura — scope <strong style={{ color: "#a1a1aa" }}>adwords</strong>. Vestigio nunca modifica campanhas. Credenciais criptografadas com AES-256-GCM.
											</p>
										</div>

										{googleAdsError && (
											<div style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #7f1d1d", backgroundColor: "#450a0a30", color: "#fca5a5", fontSize: 12 }}>
												{googleAdsError}
											</div>
										)}

										<div style={{ display: "flex", gap: 10 }}>
											<button onClick={handleConnectGoogleAds} disabled={googleAdsSaving} style={buttonStyle}>
												{googleAdsSaving ? "Conectando..." : "Conectar Google Ads"}
											</button>
											<button onClick={() => setGoogleAdsAdvanced(false)} style={{ ...buttonStyle, backgroundColor: "transparent", color: "#a1a1aa", border: "1px solid #27272a" }}>
												Voltar pro OAuth
											</button>
										</div>
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
