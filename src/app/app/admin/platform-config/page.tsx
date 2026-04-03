"use client";

import { useState, useEffect, useCallback } from "react";

// ──────────────────────────────────────────────
// Platform Config — manage integrations, feature
// flags, SMTP, social login, and notifications
// without redeploying.
// ──────────────────────────────────────────────

/* ---------- Types ---------- */

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
  smtp_config: SmtpConfig;
  social_login_config: SocialLoginConfig;
  notification_config: NotificationConfig;
  integrations_config: IntegrationsConfig;
  feature_flags: FeatureFlags;
}

type SectionKey = keyof AllConfig;

/* ---------- Defaults ---------- */

const DEFAULTS: AllConfig = {
  smtp_config: { host: "", port: 587, user: "", password: "", from_address: "" },
  social_login_config: {
    google_client_id: "",
    google_client_secret: "",
    google_enabled: false,
    github_client_id: "",
    github_client_secret: "",
    github_enabled: false,
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
  type: "text" | "password" | "number" | "toggle";
  placeholder?: string;
  group?: string;
}

const SECTION_META: Record<
  SectionKey,
  { title: string; description: string; icon: React.ReactNode; fields: FieldDef[] }
> = {
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
  const meta = SECTION_META[sectionKey];
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<"saved" | "error" | null>(null);
  const [local, setLocal] = useState<Record<string, unknown>>(data ?? {});

  // Guard: if meta is missing, skip rendering
  if (!meta) return null;

  // Sync when parent data changes (e.g. after initial load)
  useEffect(() => {
    setLocal(data);
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

  // Group fields by their group property
  const groups: { name: string | null; fields: FieldDef[] }[] = [];
  let currentGroup: string | null = null;
  for (const field of meta.fields) {
    const g = field.group ?? null;
    if (g !== currentGroup) {
      groups.push({ name: g, fields: [field] });
      currentGroup = g;
    } else {
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
            {meta.icon}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-content">{meta.title}</h2>
            <p className="text-xs text-content-faint">{meta.description}</p>
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
                <div className="grid gap-4 sm:grid-cols-2">
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

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-content">Platform Config</h1>
        <p className="mt-1 text-sm text-content-muted">
          Manage integrations, credentials, and feature flags. Changes take effect immediately.
        </p>
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
        ? Array.from({ length: 5 }).map((_, i) => <SectionSkeleton key={i} />)
        : SECTION_ORDER.map((key) => (
            <SectionCard
              key={key}
              sectionKey={key}
              data={(config[key] ?? DEFAULTS[key]) as Record<string, unknown>}
              onUpdate={handleUpdate}
            />
          ))}
    </div>
  );
}
