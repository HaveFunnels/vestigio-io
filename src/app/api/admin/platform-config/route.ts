import { authOptions } from "@/libs/auth";
import { withErrorTracking } from "@/libs/error-tracker";
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
  "smtp_config",
  "social_login_config",
  "notification_config",
  "integrations_config",
  "feature_flags",
] as const;

type ConfigKey = (typeof CONFIG_KEYS)[number];

// ── Defaults ─────────────────────────────────

const DEFAULTS: Record<ConfigKey, Record<string, unknown>> = {
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
  social_login_config: new Set(["google_client_secret", "github_client_secret"]),
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

export const GET = withErrorTracking(
  async function GET() {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const rows = await prisma.platformConfig.findMany({
      where: { configKey: { in: [...CONFIG_KEYS] } },
    });

    const rowMap = new Map(rows.map((r) => [r.configKey, r.value]));

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
      // Merge with defaults so new fields appear
      const merged = { ...DEFAULTS[key], ...parsed };
      config[key] = maskSecrets(key, merged);
    }

    return NextResponse.json({ config });
  },
  { endpoint: "/api/admin/platform-config", method: "GET" },
);

// ── POST ─────────────────────────────────────

export const POST = withErrorTracking(
  async function POST(request: Request) {
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

    return NextResponse.json({ message: "Saved", section });
  },
  { endpoint: "/api/admin/platform-config", method: "POST" },
);
