"use client";

import { useState } from "react";

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
  const [envId] = useState("ENV_" + Math.random().toString(36).slice(2, 8));
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const snippetCode = `<script async src="https://app.vestigio.io/snippet/vestigio.js" data-env="${envId}"></script>`;

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(snippetCode);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const statusBadge = (status: IntegrationCard["status"]) => {
    switch (status) {
      case "connected": return <span className="text-xs text-green-400 bg-green-900/20 px-2 py-0.5 rounded">Connected</span>;
      case "error": return <span className="text-xs text-red-400 bg-red-900/20 px-2 py-0.5 rounded">Error</span>;
      default: return <span className="text-xs text-content-muted bg-surface-inset px-2 py-0.5 rounded">Not connected</span>;
    }
  };

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold text-content">Data Sources</h1>
        <p className="text-sm text-content-muted mt-1">Connect behavioral intelligence and commerce data</p>
      </div>

      {/* Behavioral Snippet Section */}
      <section>
        <h2 className="text-lg font-medium text-content-secondary mb-4">Behavioral Snippet</h2>
        <div className="bg-surface-card border border-edge rounded-lg p-4 mb-4">
          <p className="text-sm text-content-muted mb-3">Your snippet code:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-content-secondary bg-surface px-3 py-2 rounded font-mono overflow-x-auto">
              {snippetCode}
            </code>
            <button
              onClick={() => handleCopy("snippet")}
              className="px-3 py-2 text-xs bg-surface-inset hover:bg-surface-card-hover text-content-secondary rounded transition-colors"
            >
              {copiedId === "snippet" ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SNIPPET_PLATFORMS.map((card) => (
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
                {copiedId === card.id ? "Copied!" : "Copy snippet"}
              </button>
              {card.lastEvent && (
                <p className="text-[10px] text-content-faint mt-2">Last event: {card.lastEvent}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Commerce Integrations Section */}
      <section>
        <h2 className="text-lg font-medium text-content-secondary mb-4">Commerce Platforms</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {COMMERCE_INTEGRATIONS.map((card) => (
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
                Connect
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
