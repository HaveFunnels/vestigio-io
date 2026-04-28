"use client";

import React, { useState, useEffect, useCallback, useRef, Component, type ErrorInfo, type ReactNode } from "react";

/* ---------- Error Boundary ---------- */

class SectionErrorBoundary extends Component<
  { name: string; children: ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { name: string; children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[PlatformConfig:${this.props.name}]`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-5">
          <p className="text-sm text-amber-300">
            Failed to render &quot;{this.props.name}&quot; section. Error: {this.state.error}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ──────────────────────────────────────────────
// Platform Config — manage integrations, feature
// flags, SMTP, social login, and notifications
// without redeploying.
// ──────────────────────────────────────────────

/* ---------- Types ---------- */

interface ThemeConfig {
  bg_page: string;
  bg_shell: string;
  bg_card: string;
  bg_card_hover: string;
  bg_inset: string;
  border_default: string;
  border_subtle: string;
  text_primary: string;
  text_secondary: string;
  text_muted: string;
  text_faint: string;
  accent: string;
  accent_text: string;
  accent_cta: string;
  accent_cta_hover: string;
  sidebar_bg: string;
  sidebar_active_bg: string;
  sidebar_active_text: string;
}

interface ImageValue {
  dataUrl: string;
  filename: string;
  size: number;
}

interface BrandingConfig {
  logo_light: ImageValue | null;
  logo_dark: ImageValue | null;
  favicon: ImageValue | null;
  og_image: ImageValue | null;
}

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from_address: string;
}

interface SocialLoginConfig {
  google_client_id: string;
  google_client_secret: string;
  google_enabled: boolean;
  github_client_id: string;
  github_client_secret: string;
  github_enabled: boolean;
  apple_client_id: string;
  apple_client_secret: string;
  apple_enabled: boolean;
}

interface NotificationConfig {
  whatsapp_api_key: string;
  whatsapp_phone_number: string;
  email_notifications_enabled: boolean;
}

interface IntegrationsConfig {
  paddle_api_key: string;
  paddle_client_token: string;
  paddle_webhook_secret: string;
  paddle_sandbox: boolean;
  sanity_project_id: string;
  sanity_dataset: string;
  mailchimp_api_key: string;
  mailchimp_server: string;
  mailchimp_audience_id: string;
}

interface FeatureFlags {
  blog_enabled: boolean;
  newsletter_enabled: boolean;
  i18n_enabled: boolean;
  ai_chat_enabled: boolean;
}

interface AllConfig {
  theme_config: ThemeConfig;
  branding_config: BrandingConfig;
  smtp_config: SmtpConfig;
  social_login_config: SocialLoginConfig;
  notification_config: NotificationConfig;
  integrations_config: IntegrationsConfig;
  feature_flags: FeatureFlags;
}

type SectionKey = keyof AllConfig;

/* ---------- Defaults ---------- */

const DEFAULTS: AllConfig = {
  theme_config: {
    bg_page: "#16161a",
    bg_shell: "#101014",
    bg_card: "#1e1e23",
    bg_card_hover: "#26262c",
    bg_inset: "#1a1a1e",
    border_default: "#2a2a30",
    border_subtle: "#34343c",
    text_primary: "#f4f4f5",
    text_secondary: "#e4e4e7",
    text_muted: "#a1a1aa",
    text_faint: "#71717a",
    accent: "#10b981",
    accent_text: "#34d399",
    accent_cta: "#059669",
    accent_cta_hover: "#10b981",
    sidebar_bg: "#101014",
    sidebar_active_bg: "#10b981",
    sidebar_active_text: "#ffffff",
  },
  branding_config: {
    logo_light: null,
    logo_dark: null,
    favicon: null,
    og_image: null,
  },
  smtp_config: { host: "", port: 587, user: "", password: "", from_address: "" },
  social_login_config: {
    google_client_id: "",
    google_client_secret: "",
    google_enabled: false,
    github_client_id: "",
    github_client_secret: "",
    github_enabled: false,
    apple_client_id: "",
    apple_client_secret: "",
    apple_enabled: false,
  },
  notification_config: {
    whatsapp_api_key: "",
    whatsapp_phone_number: "",
    email_notifications_enabled: true,
  },
  integrations_config: {
    paddle_api_key: "",
    paddle_client_token: "",
    paddle_webhook_secret: "",
    paddle_sandbox: true,
    sanity_project_id: "",
    sanity_dataset: "",
    mailchimp_api_key: "",
    mailchimp_server: "",
    mailchimp_audience_id: "",
  },
  feature_flags: {
    blog_enabled: true,
    newsletter_enabled: true,
    i18n_enabled: false,
    ai_chat_enabled: true,
  },
};

/* ---------- Field metadata ---------- */

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "toggle" | "color" | "image";
  placeholder?: string;
  group?: string;
  description?: string;
  dimensions?: string;
  accept?: string;
}

const SECTION_META: Record<
  SectionKey,
  { title: string; description: string; icon: React.ReactNode; fields: FieldDef[] }
> = {
  theme_config: {
    title: "Theme / Colors",
    description: "Customize the platform color scheme and design system.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
      </svg>
    ),
    fields: [
      // Background Colors
      { key: "bg_page", label: "Page Background", type: "color", group: "Background Colors", description: "Main content area background" },
      { key: "bg_shell", label: "Shell Background", type: "color", group: "Background Colors", description: "Sidebar + topbar behind content" },
      { key: "bg_card", label: "Card Background", type: "color", group: "Background Colors", description: "All card containers, tables" },
      { key: "bg_card_hover", label: "Card Hover", type: "color", group: "Background Colors", description: "Table row hover, card hover states" },
      { key: "bg_inset", label: "Inset Background", type: "color", group: "Background Colors", description: "Nested elements, icon containers" },
      // Border Colors
      { key: "border_default", label: "Default Border", type: "color", group: "Border Colors", description: "Card borders, table dividers, separators" },
      { key: "border_subtle", label: "Subtle Border", type: "color", group: "Border Colors", description: "Input borders, secondary dividers" },
      // Text Colors
      { key: "text_primary", label: "Primary Text", type: "color", group: "Text Colors", description: "Headings, important values, names" },
      { key: "text_secondary", label: "Secondary Text", type: "color", group: "Text Colors", description: "Body text, descriptions" },
      { key: "text_muted", label: "Muted Text", type: "color", group: "Text Colors", description: "Labels, timestamps, secondary info" },
      { key: "text_faint", label: "Faint Text", type: "color", group: "Text Colors", description: "Placeholders, disabled text, hints" },
      // Accent Colors
      { key: "accent", label: "Accent", type: "color", group: "Accent Colors", description: "Active states, progress bars, highlights" },
      { key: "accent_text", label: "Accent Text", type: "color", group: "Accent Colors", description: "Links, active nav items, badges" },
      { key: "accent_cta", label: "CTA Button", type: "color", group: "Accent Colors", description: "Primary action buttons" },
      { key: "accent_cta_hover", label: "CTA Hover", type: "color", group: "Accent Colors", description: "Primary button hover state" },
      // Sidebar Colors
      { key: "sidebar_bg", label: "Sidebar Background", type: "color", group: "Sidebar Colors", description: "Sidebar background" },
      { key: "sidebar_active_bg", label: "Active Item Background", type: "color", group: "Sidebar Colors", description: "Active navigation item background" },
      { key: "sidebar_active_text", label: "Active Item Text", type: "color", group: "Sidebar Colors", description: "Active navigation item text color" },
    ],
  },
  branding_config: {
    title: "Images / Branding",
    description: "Upload logos, favicon, and social preview images.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
      </svg>
    ),
    fields: [
      { key: "logo_light", label: "Logo (Light Background)", type: "image", description: "PNG/SVG used in header on light mode, footer", dimensions: "Recommended: 200x60px", accept: "image/png,image/svg+xml" },
      { key: "logo_dark", label: "Logo (Dark Background)", type: "image", description: "PNG/SVG used in header on dark mode, sidebar", dimensions: "Recommended: 200x60px", accept: "image/png,image/svg+xml" },
      { key: "favicon", label: "Favicon", type: "image", description: "ICO/PNG used in browser tab", dimensions: "Recommended: 32x32px or 16x16px", accept: "image/x-icon,image/png,image/svg+xml" },
      { key: "og_image", label: "OpenGraph Image", type: "image", description: "PNG/JPG used in social media link previews", dimensions: "Recommended: 1200x630px", accept: "image/png,image/jpeg,image/jpg" },
    ],
  },
  smtp_config: {
    title: "Email / SMTP Settings",
    description: "Configure outbound email delivery.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    ),
    fields: [
      { key: "host", label: "SMTP Host", type: "text", placeholder: "smtp.example.com" },
      { key: "port", label: "SMTP Port", type: "number", placeholder: "587" },
      { key: "user", label: "SMTP User", type: "text", placeholder: "user@example.com" },
      { key: "password", label: "SMTP Password", type: "password" },
      { key: "from_address", label: "From Address", type: "text", placeholder: "noreply@vestigio.io" },
    ],
  },
  social_login_config: {
    title: "Social Login",
    description: "OAuth provider credentials and toggles.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
    fields: [
      { key: "google_client_id", label: "Google Client ID", type: "text", group: "Google" },
      { key: "google_client_secret", label: "Google Client Secret", type: "password", group: "Google" },
      { key: "google_enabled", label: "Google Login Enabled", type: "toggle", group: "Google" },
      { key: "github_client_id", label: "GitHub Client ID", type: "text", group: "GitHub" },
      { key: "github_client_secret", label: "GitHub Client Secret", type: "password", group: "GitHub" },
      { key: "github_enabled", label: "GitHub Login Enabled", type: "toggle", group: "GitHub" },
      { key: "apple_client_id", label: "Apple Client ID", type: "text", group: "Apple" },
      { key: "apple_client_secret", label: "Apple Client Secret", type: "password", group: "Apple" },
      { key: "apple_enabled", label: "Apple Login Enabled", type: "toggle", group: "Apple" },
    ],
  },
  notification_config: {
    title: "Notifications",
    description: "WhatsApp and email notification settings.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
    ),
    fields: [
      { key: "whatsapp_api_key", label: "WhatsApp API Key", type: "password" },
      { key: "whatsapp_phone_number", label: "WhatsApp Phone Number", type: "text", placeholder: "+1234567890" },
      { key: "email_notifications_enabled", label: "Email Notifications Enabled", type: "toggle" },
    ],
  },
  integrations_config: {
    title: "Integrations",
    description: "Third-party service credentials.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
    fields: [
      { key: "paddle_api_key", label: "Paddle API Key", type: "password", group: "Paddle" },
      { key: "paddle_client_token", label: "Paddle Client Token", type: "password", group: "Paddle" },
      { key: "paddle_webhook_secret", label: "Paddle Webhook Secret", type: "password", group: "Paddle" },
      { key: "paddle_sandbox", label: "Paddle Sandbox Mode", type: "toggle", group: "Paddle" },
      { key: "sanity_project_id", label: "Sanity Project ID", type: "text", group: "Sanity" },
      { key: "sanity_dataset", label: "Sanity Dataset", type: "text", placeholder: "production", group: "Sanity" },
      { key: "mailchimp_api_key", label: "Mailchimp API Key", type: "password", group: "Mailchimp" },
      { key: "mailchimp_server", label: "Mailchimp Server", type: "text", placeholder: "us1", group: "Mailchimp" },
      { key: "mailchimp_audience_id", label: "Mailchimp Audience ID", type: "text", group: "Mailchimp" },
    ],
  },
  feature_flags: {
    title: "Feature Flags",
    description: "Enable or disable platform features globally.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
      </svg>
    ),
    fields: [
      { key: "blog_enabled", label: "Blog Enabled", type: "toggle" },
      { key: "newsletter_enabled", label: "Newsletter Enabled", type: "toggle" },
      { key: "i18n_enabled", label: "Internationalization (i18n) Enabled", type: "toggle" },
      { key: "ai_chat_enabled", label: "AI Chat Enabled", type: "toggle" },
    ],
  },
};

const SECTION_ORDER: SectionKey[] = [
  "theme_config",
  "branding_config",
  "smtp_config",
  "social_login_config",
  "notification_config",
  "integrations_config",
  "feature_flags",
];

/* ---------- Helpers ---------- */

const INPUT_CLS =
  "w-full rounded-lg border border-edge bg-transparent px-3 py-1.5 text-sm text-content focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30 placeholder:text-content-faint/50";

/* ---------- Password Input ---------- */

function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        className={INPUT_CLS + " pr-10"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-content-faint hover:text-content-muted"
        tabIndex={-1}
      >
        {show ? (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )}
      </button>
    </div>
  );
}

/* ---------- Toggle ---------- */

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-accent-text" : "bg-surface-inset"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-[3px]"
          }`}
        />
      </button>
      <span className="text-sm text-content">{label}</span>
    </label>
  );
}

/* ---------- Image Upload ---------- */

function ImageUpload({
  value,
  onChange,
  label,
  description,
  dimensions,
  accept,
}: {
  value: { dataUrl: string; filename: string; size: number } | null;
  onChange: (val: { dataUrl: string; filename: string; size: number } | null) => void;
  label: string;
  description: string;
  dimensions?: string;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    // Limit to 2MB
    if (file.size > 2 * 1024 * 1024) {
      alert("File too large. Maximum size is 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange({
        dataUrl: reader.result as string,
        filename: file.name,
        size: file.size,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-2">
      <label className="mb-1.5 block text-xs font-medium text-content-muted">{label}</label>
      {value?.dataUrl ? (
        <div className="flex items-start gap-4 rounded-lg border border-edge bg-surface-inset p-4">
          <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-edge bg-surface-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.dataUrl}
              alt={label}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium text-content truncate">{value.filename}</p>
            <p className="text-xs text-content-muted">{formatSize(value.size)}</p>
            {dimensions && <p className="text-xs text-content-faint">{dimensions}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-md bg-surface-card px-2.5 py-1 text-xs font-medium text-content-muted border border-edge hover:bg-surface-card-hover transition-colors"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => onChange(null)}
                className="rounded-md px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-edge p-6 transition-colors hover:border-accent/40 hover:bg-surface-inset/50"
        >
          <svg className="h-8 w-8 text-content-faint" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-xs text-content-muted">Click or drag to upload</p>
          {dimensions && <p className="text-xs text-content-faint">{dimensions}</p>}
          <p className="text-xs text-content-faint">{description}</p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept || "image/*"}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          // Reset so the same file can be re-selected
          e.target.value = "";
        }}
      />
    </div>
  );
}

/* ---------- Color Live Preview ---------- */

function ColorLivePreview({ colors }: { colors: Record<string, unknown> }) {
  const c = (key: string) => (typeof colors[key] === "string" ? (colors[key] as string) : "#000000");

  return (
    <div className="mt-6 rounded-lg border border-edge bg-surface-inset p-5">
      <p className="mb-4 text-xs font-medium uppercase tracking-wider text-content-muted">Live Preview</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Dark Preview */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-content-muted">Dark Preview</p>
          <div
            className="overflow-hidden rounded-lg border"
            style={{ borderColor: c("border_default"), backgroundColor: c("bg_page") }}
          >
            {/* Mini sidebar */}
            <div className="flex">
              <div
                className="w-14 shrink-0 space-y-2 p-2"
                style={{ backgroundColor: c("sidebar_bg") }}
              >
                <div
                  className="rounded px-1.5 py-1 text-center text-[9px] font-medium"
                  style={{ backgroundColor: c("sidebar_active_bg"), color: c("sidebar_active_text") }}
                >
                  Nav
                </div>
                <div
                  className="rounded px-1.5 py-1 text-center text-[9px]"
                  style={{ color: c("text_muted") }}
                >
                  Item
                </div>
              </div>
              {/* Content area */}
              <div className="flex-1 p-3 space-y-2" style={{ backgroundColor: c("bg_page") }}>
                <p className="text-xs font-semibold" style={{ color: c("text_primary") }}>
                  Dashboard Title
                </p>
                <p className="text-[10px]" style={{ color: c("text_secondary") }}>
                  This is body text with secondary color.
                </p>
                {/* Card */}
                <div
                  className="rounded-md p-2.5 space-y-1.5"
                  style={{ backgroundColor: c("bg_card"), borderWidth: 1, borderStyle: "solid", borderColor: c("border_default") }}
                >
                  <p className="text-[10px] font-medium" style={{ color: c("text_primary") }}>
                    Card Heading
                  </p>
                  <p className="text-[9px]" style={{ color: c("text_muted") }}>
                    Muted label text here
                  </p>
                  <p className="text-[9px]" style={{ color: c("text_faint") }}>
                    Faint / placeholder text
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      className="rounded px-2 py-0.5 text-[9px] font-medium text-white"
                      style={{ backgroundColor: c("accent_cta") }}
                    >
                      Action
                    </button>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[8px] font-medium"
                      style={{ backgroundColor: c("accent") + "22", color: c("accent_text") }}
                    >
                      Badge
                    </span>
                  </div>
                </div>
                {/* Hover card */}
                <div
                  className="rounded-md p-2"
                  style={{ backgroundColor: c("bg_card_hover"), borderWidth: 1, borderStyle: "solid", borderColor: c("border_subtle") }}
                >
                  <p className="text-[9px]" style={{ color: c("text_secondary") }}>
                    Hovered row
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Light preview (inverted conceptual — shows the same colors since admin controls them) */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-content-muted">Color Palette</p>
          <div className="rounded-lg border border-edge bg-surface-card p-3 space-y-3">
            {/* Background swatches */}
            <div>
              <p className="text-[9px] font-medium text-content-faint mb-1.5 uppercase tracking-wider">Backgrounds</p>
              <div className="flex gap-1.5">
                {["bg_page", "bg_shell", "bg_card", "bg_card_hover", "bg_inset"].map((k) => (
                  <div key={k} className="text-center">
                    <div
                      className="h-6 w-6 rounded border border-edge"
                      style={{ backgroundColor: c(k) }}
                      title={k}
                    />
                  </div>
                ))}
              </div>
            </div>
            {/* Border swatches */}
            <div>
              <p className="text-[9px] font-medium text-content-faint mb-1.5 uppercase tracking-wider">Borders</p>
              <div className="flex gap-1.5">
                {["border_default", "border_subtle"].map((k) => (
                  <div key={k} className="text-center">
                    <div
                      className="h-6 w-6 rounded border border-edge"
                      style={{ backgroundColor: c(k) }}
                      title={k}
                    />
                  </div>
                ))}
              </div>
            </div>
            {/* Text swatches */}
            <div>
              <p className="text-[9px] font-medium text-content-faint mb-1.5 uppercase tracking-wider">Text</p>
              <div className="flex gap-1.5">
                {["text_primary", "text_secondary", "text_muted", "text_faint"].map((k) => (
                  <div key={k} className="text-center">
                    <div
                      className="h-6 w-6 rounded border border-edge"
                      style={{ backgroundColor: c(k) }}
                      title={k}
                    />
                  </div>
                ))}
              </div>
            </div>
            {/* Accent swatches */}
            <div>
              <p className="text-[9px] font-medium text-content-faint mb-1.5 uppercase tracking-wider">Accent</p>
              <div className="flex gap-1.5">
                {["accent", "accent_text", "accent_cta", "accent_cta_hover"].map((k) => (
                  <div key={k} className="text-center">
                    <div
                      className="h-6 w-6 rounded border border-edge"
                      style={{ backgroundColor: c(k) }}
                      title={k}
                    />
                  </div>
                ))}
              </div>
            </div>
            {/* Sidebar swatches */}
            <div>
              <p className="text-[9px] font-medium text-content-faint mb-1.5 uppercase tracking-wider">Sidebar</p>
              <div className="flex gap-1.5">
                {["sidebar_bg", "sidebar_active_bg", "sidebar_active_text"].map((k) => (
                  <div key={k} className="text-center">
                    <div
                      className="h-6 w-6 rounded border border-edge"
                      style={{ backgroundColor: c(k) }}
                      title={k}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Section Card ---------- */

function SectionCard({
  sectionKey,
  data,
  onUpdate,
}: {
  sectionKey: SectionKey;
  data: Record<string, unknown>;
  onUpdate: (sectionKey: SectionKey, data: Record<string, unknown>) => void;
}) {
  const meta = sectionKey ? SECTION_META[sectionKey] : null;
  const fields = (meta && Array.isArray(meta.fields)) ? meta.fields : [];

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<"saved" | "error" | null>(null);
  const [local, setLocal] = useState<Record<string, unknown>>(data ?? {});

  // Sync when parent data changes (e.g. after initial load)
  useEffect(() => {
    setLocal(data ?? {});
  }, [data]);

  const setField = useCallback(
    (key: string, value: unknown) => {
      setLocal((prev) => ({ ...prev, [key]: value }));
      setFeedback(null);
    },
    [],
  );

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/platform-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: sectionKey, data: local }),
      });
      if (!res.ok) throw new Error("Save failed");
      onUpdate(sectionKey, local);
      setFeedback("saved");
      setTimeout(() => setFeedback(null), 3000);
    } catch {
      setFeedback("error");
    } finally {
      setSaving(false);
    }
  };

  // Guard: if meta is missing, render nothing (all hooks above are safe)
  if (!meta) return null;

  // Group fields by their group property
  const groups: { name: string | null; fields: FieldDef[] }[] = [];
  let currentGroup: string | undefined = undefined; // sentinel: never matches null
  for (const field of fields) {
    const g = field.group ?? null;
    if (g !== currentGroup) {
      groups.push({ name: g, fields: [field] });
      currentGroup = g as any;
    } else if (groups.length > 0) {
      groups[groups.length - 1].fields.push(field);
    }
  }

  return (
    <div className="rounded-lg border border-edge bg-surface-card">
      {/* Header — clickable to toggle */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between border-b border-edge px-5 py-4 text-left transition-colors hover:bg-surface-card-hover"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-inset text-content-muted">
            {meta?.icon}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-content">{meta?.title ?? sectionKey}</h2>
            <p className="text-xs text-content-faint">{meta?.description ?? ""}</p>
          </div>
        </div>
        <svg
          className={`h-4 w-4 text-content-faint transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Body */}
      {open && (
        <div className="px-5 py-5">
          <div className="space-y-6">
            {groups.map((group, gi) => (
              <div key={gi}>
                {group.name && (
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                    {group.name}
                  </p>
                )}
                <div className={`grid gap-4 ${group.fields.some((f) => f.type === "image") ? "sm:grid-cols-1 lg:grid-cols-2" : "sm:grid-cols-2"}`}>
                  {group.fields.map((field) => {
                    const val = local[field.key];

                    if (field.type === "toggle") {
                      return (
                        <div key={field.key} className="flex items-center sm:col-span-2">
                          <Toggle
                            checked={val === true}
                            onChange={(v) => setField(field.key, v)}
                            label={field.label}
                          />
                        </div>
                      );
                    }

                    if (field.type === "color") {
                      const colorVal = typeof val === "string" ? val : "#000000";
                      return (
                        <div key={field.key} className="sm:col-span-2">
                          <div className="flex items-center gap-3">
                            <div
                              className="h-8 w-8 shrink-0 rounded-lg border border-edge"
                              style={{ backgroundColor: colorVal }}
                            />
                            <input
                              type="color"
                              value={colorVal}
                              onChange={(e) => setField(field.key, e.target.value)}
                              className="h-8 w-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                            />
                            <input
                              type="text"
                              value={colorVal}
                              onChange={(e) => {
                                const v = e.target.value;
                                setField(field.key, v);
                              }}
                              className={INPUT_CLS + " !w-28 font-mono text-xs"}
                              placeholder="#000000"
                            />
                            <div className="min-w-0 flex-1">
                              <span className="text-xs font-medium text-content-muted">{field.label}</span>
                              {field.description && (
                                <span className="ml-1.5 text-xs text-content-faint">{field.description}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (field.type === "image") {
                      const imgVal = val && typeof val === "object" && "dataUrl" in (val as any)
                        ? (val as { dataUrl: string; filename: string; size: number })
                        : null;
                      return (
                        <div key={field.key}>
                          <ImageUpload
                            value={imgVal}
                            onChange={(v) => setField(field.key, v)}
                            label={field.label}
                            description={field.description ?? ""}
                            dimensions={field.dimensions}
                            accept={field.accept}
                          />
                        </div>
                      );
                    }

                    return (
                      <div key={field.key}>
                        <label className="mb-1.5 block text-xs font-medium text-content-muted">
                          {field.label}
                        </label>
                        {field.type === "password" ? (
                          <PasswordInput
                            value={typeof val === "string" ? val : ""}
                            onChange={(v) => setField(field.key, v)}
                            placeholder={field.placeholder}
                          />
                        ) : field.type === "number" ? (
                          <input
                            type="number"
                            className={INPUT_CLS}
                            value={typeof val === "number" ? val : ""}
                            onChange={(e) =>
                              setField(
                                field.key,
                                e.target.value === "" ? "" : Number(e.target.value),
                              )
                            }
                            placeholder={field.placeholder}
                          />
                        ) : (
                          <input
                            type="text"
                            className={INPUT_CLS}
                            value={typeof val === "string" ? val : ""}
                            onChange={(e) => setField(field.key, e.target.value)}
                            placeholder={field.placeholder}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Live Preview for Theme */}
          {sectionKey === "theme_config" && <ColorLivePreview colors={local} />}

          {/* Footer with Save */}
          <div className="mt-6 flex items-center gap-3 border-t border-edge pt-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-accent-text px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            {feedback === "saved" && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Changes saved
              </span>
            )}
            {feedback === "error" && (
              <span className="text-xs text-red-400">
                Failed to save. Please try again.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Loading Skeleton ---------- */

function SectionSkeleton() {
  return (
    <div className="rounded-lg border border-edge bg-surface-card">
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="h-8 w-8 animate-pulse rounded-lg bg-white/[0.06]" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-3 w-48 animate-pulse rounded bg-white/[0.06]" />
        </div>
      </div>
    </div>
  );
}

/* ---------- Main Page ---------- */

export default function PlatformConfigPage() {
  const [config, setConfig] = useState<AllConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [cacheResetting, setCacheResetting] = useState(false);
  const [cacheFeedback, setCacheFeedback] = useState<"ok" | "error" | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/platform-config");
        if (!res.ok) throw new Error("Failed to load");
        const json = await res.json();
        setConfig({ ...DEFAULTS, ...json.config });
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleUpdate = useCallback(
    (section: SectionKey, data: Record<string, unknown>) => {
      setConfig((prev) => ({ ...prev, [section]: data } as AllConfig));
    },
    [],
  );

  const handleResetCache = async () => {
    setCacheResetting(true);
    setCacheFeedback(null);
    try {
      const res = await fetch("/api/admin/platform-config/reset-cache", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to reset cache");
      setCacheFeedback("ok");
      setTimeout(() => setCacheFeedback(null), 3000);
    } catch {
      setCacheFeedback("error");
      setTimeout(() => setCacheFeedback(null), 4000);
    } finally {
      setCacheResetting(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-content">Platform Config</h1>
          <p className="mt-1 text-sm text-content-muted">
            Manage theme, branding, integrations, credentials, and feature flags. Changes take effect immediately.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetCache}
            disabled={cacheResetting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-surface-card px-3 py-1.5 text-sm font-medium text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content disabled:opacity-50"
          >
            <svg
              className={`h-4 w-4 ${cacheResetting ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
              />
            </svg>
            {cacheResetting ? "Resetando..." : "Resetar cache de configura\u00e7\u00e3o"}
          </button>
          {cacheFeedback === "ok" && (
            <span className="flex items-center gap-1 text-xs text-emerald-400 whitespace-nowrap">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Cache invalidado
            </span>
          )}
          {cacheFeedback === "error" && (
            <span className="text-xs text-red-400 whitespace-nowrap">
              Falha ao resetar cache
            </span>
          )}
        </div>
      </div>

      {/* Load Error */}
      {loadError && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-5 py-3">
          <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-red-300">
            Failed to load platform configuration. You may not have admin access or the server is unavailable.
          </p>
        </div>
      )}

      {/* Section Cards */}
      {loading
        ? Array.from({ length: 7 }).map((_, i) => <SectionSkeleton key={i} />)
        : SECTION_ORDER.map((key) => (
            <SectionErrorBoundary key={key} name={key}>
              <SectionCard
                sectionKey={key}
                data={(config[key] ?? DEFAULTS[key]) as unknown as Record<string, unknown>}
                onUpdate={handleUpdate}
              />
            </SectionErrorBoundary>
          ))}
    </div>
  );
}
