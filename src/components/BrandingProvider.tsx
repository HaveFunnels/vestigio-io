"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface ImageValue {
  dataUrl: string;
  filename: string;
  size: number;
}

interface BrandingData {
  logo_light: ImageValue | null;
  logo_dark: ImageValue | null;
  favicon: ImageValue | null;
  og_image: ImageValue | null;
}

interface FeatureFlags {
  blog_enabled: boolean;
  newsletter_enabled: boolean;
  i18n_enabled: boolean;
  ai_chat_enabled: boolean;
}

interface PlatformConfig {
  branding: BrandingData;
  flags: FeatureFlags;
}

const DEFAULT_BRANDING: BrandingData = {
  logo_light: null,
  logo_dark: null,
  favicon: null,
  og_image: null,
};

const DEFAULT_FLAGS: FeatureFlags = {
  blog_enabled: true,
  newsletter_enabled: true,
  i18n_enabled: false,
  ai_chat_enabled: true,
};

const DEFAULT: PlatformConfig = {
  branding: DEFAULT_BRANDING,
  flags: DEFAULT_FLAGS,
};

const BrandingContext = createContext<PlatformConfig>(DEFAULT);

export function useBranding() {
  return useContext(BrandingContext).branding;
}

export function useFeatureFlags() {
  return useContext(BrandingContext).flags;
}

// Convert hex color (#16161a) to space-separated RGB (22 22 26) for CSS variables
function hexToRgb(hex: string): string | null {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return null;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return `${r} ${g} ${b}`;
}

// Map theme_config keys to CSS variable names
const THEME_TO_CSS: Record<string, string> = {
  bg_page: "--bg-page",
  bg_shell: "--bg-shell",
  bg_card: "--bg-card",
  bg_card_hover: "--bg-card-hover",
  bg_inset: "--bg-inset",
  border_default: "--border-default",
  border_subtle: "--border-subtle",
  text_primary: "--text-primary",
  text_secondary: "--text-secondary",
  text_muted: "--text-muted",
  text_faint: "--text-faint",
  accent: "--accent",
  accent_text: "--accent-text",
  accent_cta: "--accent-cta",
  accent_cta_hover: "--accent-cta-hover",
  sidebar_bg: "--sidebar-bg",
  sidebar_active_bg: "--sidebar-active-bg",
  sidebar_active_text: "--sidebar-active-text",
};

function applyTheme(theme: Record<string, unknown>) {
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(THEME_TO_CSS)) {
    const val = theme[key];
    if (typeof val === "string" && val.startsWith("#")) {
      const rgb = hexToRgb(val);
      if (rgb) root.style.setProperty(cssVar, rgb);
    }
  }
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PlatformConfig>(DEFAULT);

  useEffect(() => {
    fetch("/api/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json) return;
        const branding = json.branding
          ? { ...DEFAULT_BRANDING, ...json.branding }
          : DEFAULT_BRANDING;
        const flags = json.flags
          ? { ...DEFAULT_FLAGS, ...json.flags }
          : DEFAULT_FLAGS;
        setConfig({ branding, flags });

        // Apply theme colors to CSS custom properties
        if (json.theme && typeof json.theme === "object") {
          applyTheme(json.theme);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <BrandingContext.Provider value={config}>
      {children}
    </BrandingContext.Provider>
  );
}
