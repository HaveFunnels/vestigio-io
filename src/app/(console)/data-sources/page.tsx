"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

// ──────────────────────────────────────────────
// Data Sources — Integration Cards
//
// Snippet installation + platform integrations.
// Each card shows: status, instructions, validation.
// ──────────────────────────────────────────────

interface IntegrationCard {
  id: string;
  name: string;
  category: "snippet" | "commerce";
  icon: string;
  status: "connected" | "not_connected" | "error";
  description: string;
  lastEvent: string | null;
}

const SNIPPET_PLATFORMS: IntegrationCard[] = [
  { id: "shopify-pixel", name: "Shopify Runtime Pixel", category: "snippet", icon: "S", status: "not_connected", description: "Add to Shopify via Online Store > Preferences > Additional Scripts", lastEvent: null },
  { id: "wordpress-pixel", name: "WordPress Runtime Pixel", category: "snippet", icon: "W", status: "not_connected", description: "Add to WordPress via Appearance > Theme Editor > header.php", lastEvent: null },
  { id: "wix-pixel", name: "Wix Runtime Pixel", category: "snippet", icon: "X", status: "not_connected", description: "Add to Wix via Settings > Custom Code > Head", lastEvent: null },
  { id: "framer-pixel", name: "Framer Runtime Pixel", category: "snippet", icon: "F", status: "not_connected", description: "Add to Framer via Site Settings > Custom Code > Head", lastEvent: null },
  { id: "webflow-pixel", name: "Webflow Runtime Pixel", category: "snippet", icon: "W", status: "not_connected", description: "Add to Webflow via Project Settings > Custom Code > Head Code", lastEvent: null },
  { id: "vibecoding-pixel", name: "Vibecoding Runtime Pixel", category: "snippet", icon: "V", status: "not_connected", description: "Add the snippet to your HTML head tag", lastEvent: null },
  { id: "other-pixel", name: "Other Platform", category: "snippet", icon: "?", status: "not_connected", description: "Copy the snippet code and add it to your site's <head> tag", lastEvent: null },
];

const COMMERCE_INTEGRATIONS: IntegrationCard[] = [
  { id: "shopify-api", name: "Shopify", category: "commerce", icon: "S", status: "not_connected", description: "Connect your Shopify store for real revenue and order data", lastEvent: null },
];

export default function DataSourcesPage() {
  const t = useTranslations("console.data_sources");
  const [envId] = useState("ENV_" + Math.random().toString(36).slice(2, 8));
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const snippetPlatforms = useMemo<IntegrationCard[]>(() => [
    { id: "shopify-pixel", name: t("integrations.shopify.name"), category: "snippet", icon: "S", status: "not_connected", description: t("integrations.shopify.description"), lastEvent: null },
    { id: "wordpress-pixel", name: t("integrations.wordpress.name"), category: "snippet", icon: "W", status: "not_connected", description: t("integrations.wordpress.description"), lastEvent: null },
    { id: "wix-pixel", name: t("integrations.wix.name"), category: "snippet", icon: "X", status: "not_connected", description: t("integrations.wix.description"), lastEvent: null },
    { id: "framer-pixel", name: t("integrations.framer.name"), category: "snippet", icon: "F", status: "not_connected", description: t("integrations.framer.description"), lastEvent: null },
    { id: "webflow-pixel", name: t("integrations.webflow.name"), category: "snippet", icon: "W", status: "not_connected", description: t("integrations.webflow.description"), lastEvent: null },
    { id: "vibecoding-pixel", name: t("integrations.vibecoding.name"), category: "snippet", icon: "V", status: "not_connected", description: t("integrations.vibecoding.description"), lastEvent: null },
    { id: "other-pixel", name: t("integrations.other.name"), category: "snippet", icon: "?", status: "not_connected", description: t("integrations.other.description"), lastEvent: null },
  ], [t]);

  const commerceIntegrations = useMemo<IntegrationCard[]>(() => [
    { id: "shopify-api", name: t("integrations.shopify_commerce.name"), category: "commerce", icon: "S", status: "not_connected", description: t("integrations.shopify_commerce.description"), lastEvent: null },
  ], [t]);

  const snippetCode = `<script async src="https://app.vestigio.io/snippet/vestigio.js" data-env="${envId}"></script>`;

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(snippetCode);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const statusBadge = (status: IntegrationCard["status"]) => {
    switch (status) {
      case "connected": return <span className="text-xs text-green-400 bg-green-900/20 px-2 py-0.5 rounded">{t("status.connected")}</span>;
      case "error": return <span className="text-xs text-red-400 bg-red-900/20 px-2 py-0.5 rounded">{t("status.error")}</span>;
      default: return <span className="text-xs text-content-muted bg-surface-inset px-2 py-0.5 rounded">{t("status.not_connected")}</span>;
    }
  };

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold text-content">{t("title")}</h1>
        <p className="mt-1 text-sm text-content-muted">{t("subtitle")}</p>
      </div>

      {/* Behavioral Snippet Section */}
      <section>
        <h2 className="mb-4 text-lg font-medium text-content-secondary">{t("snippet_section")}</h2>
        <div className="bg-surface-card border border-edge rounded-lg p-4 mb-4">
          <p className="mb-3 text-sm text-content-muted">{t("snippet_label")}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-content-secondary bg-surface px-3 py-2 rounded font-mono overflow-x-auto">
              {snippetCode}
            </code>
            <button
              onClick={() => handleCopy("snippet")}
              className="px-3 py-2 text-xs bg-surface-inset hover:bg-surface-card-hover text-content-secondary rounded transition-colors"
            >
              {copiedId === "snippet" ? t("copied") : t("copy")}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {snippetPlatforms.map((card) => (
            <div key={card.id} className="bg-surface-card border border-edge rounded-lg p-4 hover:border-edge transition-colors">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-surface-inset flex items-center justify-center text-xs font-bold text-content-muted">
                    {card.icon}
                  </div>
                  <span className="text-sm font-medium text-content-secondary">{card.name}</span>
                </div>
                {statusBadge(card.status)}
              </div>
              <p className="text-xs text-content-muted mb-3">{card.description}</p>
              <button
                onClick={() => handleCopy(card.id)}
                className="w-full text-xs text-center py-1.5 bg-surface-inset hover:bg-surface-card-hover text-content-muted rounded transition-colors"
              >
                {copiedId === card.id ? t("copied") : t("copy_snippet")}
              </button>
              {card.lastEvent && (
                <p className="mt-2 text-[10px] text-content-faint">{t("last_event")}{card.lastEvent}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Commerce Integrations Section */}
      <section>
        <h2 className="mb-4 text-lg font-medium text-content-secondary">{t("commerce_section")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {commerceIntegrations.map((card) => (
            <div key={card.id} className="bg-surface-card border border-edge rounded-lg p-4 hover:border-edge transition-colors">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-surface-inset flex items-center justify-center text-xs font-bold text-content-muted">
                    {card.icon}
                  </div>
                  <span className="text-sm font-medium text-content-secondary">{card.name}</span>
                </div>
                {statusBadge(card.status)}
              </div>
              <p className="text-xs text-content-muted mb-3">{card.description}</p>
              <button className="w-full text-xs text-center py-1.5 bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 rounded transition-colors">
                {t("connect")}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
