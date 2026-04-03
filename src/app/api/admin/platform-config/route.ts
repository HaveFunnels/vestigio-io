import { authOptions } from "@/libs/auth";
import { logAuditEvent } from "@/libs/audit-log";
import { getIp } from "@/libs/get-ip";
import { prisma } from "@/libs/prismaDb";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

// ──────────────────────────────────────────────
// Admin Platform Config API
//
// GET  → read all config sections (masked secrets)
// POST → save a single section  { section, data }
// ──────────────────────────────────────────────

const CONFIG_KEYS = [
  "theme_config",
  "branding_config",
  "smtp_config",
  "social_login_config",
  "notification_config",
  "integrations_config",
  "feature_flags",
] as const;

type ConfigKey = (typeof CONFIG_KEYS)[number];

// ── Defaults ─────────────────────────────────

const DEFAULTS: Record<ConfigKey, Record<string, unknown>> = {
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
  smtp_config: {
    host: "",
    port: 587,
    user: "",
    password: "",
    from_address: "",
  },
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

// ── Secret fields that must be masked on GET ──

const SECRET_FIELDS: Record<string, Set<string>> = {
  smtp_config: new Set(["password"]),
  social_login_config: new Set(["google_client_secret", "github_client_secret", "apple_client_secret"]),
  notification_config: new Set(["whatsapp_api_key"]),
  integrations_config: new Set([
    "paddle_api_key",
    "paddle_client_token",
    "paddle_webhook_secret",
    "mailchimp_api_key",
  ]),
};

const MASK = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"; // ••••••••

function maskSecrets(
  key: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const secrets = SECRET_FIELDS[key];
  if (!secrets) return data;

  const masked = { ...data };
  for (const field of secrets) {
    const val = masked[field];
    if (typeof val === "string" && val.length > 0) {
      masked[field] = MASK;
    }
  }
  return masked;
}

// ── Auth helper ──────────────────────────────

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return null;
  }
  return session.user;
}

// ── GET ──────────────────────────────────────

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const keys: string[] = CONFIG_KEYS.slice();
    const rows = await prisma.platformConfig.findMany({
      where: { configKey: { in: keys } },
    });

    const rowMap = new Map(rows.map((r: any) => [r.configKey, r.value]));

    const config: Record<string, Record<string, unknown>> = {};

    for (const key of CONFIG_KEYS) {
      const raw = rowMap.get(key);
      let parsed: Record<string, unknown> = {};
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = {};
        }
      }
      const merged = { ...DEFAULTS[key], ...parsed };

      // Merge env var fallbacks for integrations so admin sees what's configured
      if (key === "integrations_config") {
        if (!merged.paddle_api_key && process.env.PADDLE_API_KEY) merged.paddle_api_key = process.env.PADDLE_API_KEY;
        if (!merged.paddle_client_token && process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) merged.paddle_client_token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
        if (!merged.paddle_webhook_secret && process.env.PADDLE_WEBHOOK_SECRET) merged.paddle_webhook_secret = process.env.PADDLE_WEBHOOK_SECRET;
        if (!merged.sanity_project_id && process.env.NEXT_PUBLIC_SANITY_PROJECT_ID) merged.sanity_project_id = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
        if (!merged.sanity_dataset) merged.sanity_dataset = "production";
        if (!merged.mailchimp_api_key && process.env.MAILCHIMP_API_KEY) merged.mailchimp_api_key = process.env.MAILCHIMP_API_KEY;
        if (!merged.mailchimp_server && process.env.MAILCHIMP_API_SERVER) merged.mailchimp_server = process.env.MAILCHIMP_API_SERVER;
        if (!merged.mailchimp_audience_id && process.env.MAILCHIMP_AUDIENCE_ID) merged.mailchimp_audience_id = process.env.MAILCHIMP_AUDIENCE_ID;
      }
      if (key === "social_login_config") {
        if (!merged.google_client_id && process.env.GOOGLE_CLIENT_ID) merged.google_client_id = process.env.GOOGLE_CLIENT_ID;
        if (!merged.google_client_secret && process.env.GOOGLE_CLIENT_SECRET) merged.google_client_secret = process.env.GOOGLE_CLIENT_SECRET;
        if (!merged.github_client_id && process.env.GITHUB_CLIENT_ID) merged.github_client_id = process.env.GITHUB_CLIENT_ID;
        if (!merged.github_client_secret && process.env.GITHUB_CLIENT_SECRET) merged.github_client_secret = process.env.GITHUB_CLIENT_SECRET;
        if (!merged.apple_client_id && process.env.APPLE_CLIENT_ID) merged.apple_client_id = process.env.APPLE_CLIENT_ID;
        if (!merged.apple_client_secret && process.env.APPLE_CLIENT_SECRET) merged.apple_client_secret = process.env.APPLE_CLIENT_SECRET;
      }
      if (key === "smtp_config") {
        if (!merged.host && process.env.EMAIL_SERVER_HOST) merged.host = process.env.EMAIL_SERVER_HOST;
        if (!merged.port && process.env.EMAIL_SERVER_PORT) merged.port = Number(process.env.EMAIL_SERVER_PORT);
        if (!merged.user && process.env.EMAIL_SERVER_USER) merged.user = process.env.EMAIL_SERVER_USER;
        if (!merged.password && process.env.EMAIL_SERVER_PASSWORD) merged.password = process.env.EMAIL_SERVER_PASSWORD;
        if (!merged.from_address && process.env.EMAIL_FROM) merged.from_address = process.env.EMAIL_FROM;
      }

      config[key] = maskSecrets(key, merged);
    }

    return NextResponse.json({ config });
  } catch (err: any) {
    console.error("[platform-config GET]", err);
    return NextResponse.json(
      { message: err?.message || "Internal error" },
      { status: 500 },
    );
  }
}

// ── POST ─────────────────────────────────────

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { section, data } = body as {
      section: string;
      data: Record<string, unknown>;
    };

    if (!section || !data || typeof data !== "object") {
      return NextResponse.json(
        { message: "Invalid payload: need { section, data }" },
        { status: 400 },
      );
    }

    if (!CONFIG_KEYS.includes(section as ConfigKey)) {
      return NextResponse.json(
        { message: `Unknown section: ${section}` },
        { status: 400 },
      );
    }

    // If any secret field is still masked, preserve the old stored value
    const secrets = SECRET_FIELDS[section];
    if (secrets) {
      const existingRow = await prisma.platformConfig.findUnique({
        where: { configKey: section },
      });
      let existing: Record<string, unknown> = {};
      if (existingRow) {
        try {
          existing = JSON.parse(existingRow.value);
        } catch {
          existing = {};
        }
      }

      for (const field of secrets) {
        if (data[field] === MASK) {
          data[field] = existing[field] ?? "";
        }
      }
    }

    await prisma.platformConfig.upsert({
      where: { configKey: section },
      create: { configKey: section, value: JSON.stringify(data) },
      update: { value: JSON.stringify(data) },
    });

    // Audit log
    const ip = await getIp();
    logAuditEvent({
      actorId: (admin as any).id,
      actorEmail: (admin as any).email ?? "unknown",
      action: "config.update",
      targetType: "config",
      targetName: section,
      metadata: { section },
      ipAddress: ip ?? undefined,
    });

    return NextResponse.json({ message: "Saved", section });
  } catch (err: any) {
    console.error("[platform-config POST]", err);
    return NextResponse.json(
      { message: err?.message || "Internal error" },
      { status: 500 },
    );
  }
}
