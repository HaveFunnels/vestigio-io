import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { z } from "zod";
import { encryptSecret } from "../../../../../apps/platform/secret-service";
import {
  PrismaSaasAccessStore,
  type SaasAccessStoreInput,
} from "../../../../../apps/platform/saas-access-store";
import { toPublicView } from "../../../../../packages/domain/saas-access";
import { withErrorTracking } from "@/libs/error-tracker";

// ──────────────────────────────────────────────
// Data Sources — SaaS Access API
//
// POST   → create/update config (upsert)
// GET    → read config (public view only)
// DELETE → remove config
//
// Rules:
// - authentication required
// - scoped to user's organization/environment
// - never returns password_encrypted
// - validates environment belongs to user's org
// ──────────────────────────────────────────────

const store = new PrismaSaasAccessStore(prisma);

const saveSchema = z.object({
  environment_id: z.string().min(1),
  login_url: z.string().url().or(z.literal("")),
  email: z.string().email().nullable().optional(),
  password: z.string().nullable().optional(), // plaintext → encrypted on save
  auth_method: z.enum(["password", "oauth", "magic_link", "unknown"]).default("unknown"),
  mfa_mode: z.enum(["none", "optional", "required", "unknown"]).default("unknown"),
  has_trial: z.boolean().nullable().optional(),
  requires_seed_data: z.boolean().nullable().optional(),
  test_account_available: z.boolean().nullable().optional(),
  activation_goal: z.string().nullable().optional(),
  primary_upgrade_path: z.string().nullable().optional(),
});

// ── GET ──────────────────────────────────────

export const GET = withErrorTracking(async function GET(request: Request) {
  const user = await isAuthorized();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const environmentId = searchParams.get("environment_id");

  if (!environmentId) {
    return NextResponse.json({ message: "environment_id is required" }, { status: 400 });
  }

  // Verify environment belongs to user's org
  const accessCheck = await verifyEnvironmentAccess(user.id, environmentId);
  if (!accessCheck.ok) {
    return NextResponse.json({ message: accessCheck.message }, { status: 403 });
  }

  const config = await store.get(environmentId);
  if (!config) {
    return NextResponse.json({ data: null });
  }

  // NEVER return secrets
  return NextResponse.json({ data: toPublicView(config) });
}, { endpoint: "/api/data-sources/saas", method: "GET" });

// ── POST ─────────────────────────────────────

export const POST = withErrorTracking(async function POST(request: Request) {
  const user = await isAuthorized();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const parsed = saveSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Validation failed", errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Verify environment belongs to user's org
  const accessCheck = await verifyEnvironmentAccess(user.id, data.environment_id);
  if (!accessCheck.ok) {
    return NextResponse.json({ message: accessCheck.message }, { status: 403 });
  }

  // Encrypt password if provided (never store plaintext)
  let passwordEncrypted: string | null = null;
  if (data.password && data.password.length > 0) {
    passwordEncrypted = encryptSecret(data.password);
  } else {
    // Preserve existing password if not provided
    const existing = await store.get(data.environment_id);
    passwordEncrypted = existing?.password_encrypted ?? null;
  }

  const input: SaasAccessStoreInput = {
    login_url: data.login_url,
    email: data.email ?? null,
    password_encrypted: passwordEncrypted,
    auth_method: data.auth_method as any,
    mfa_mode: data.mfa_mode as any,
    has_trial: data.has_trial ?? null,
    requires_seed_data: data.requires_seed_data ?? null,
    test_account_available: data.test_account_available ?? null,
    activation_goal: data.activation_goal ?? null,
    primary_upgrade_path: data.primary_upgrade_path ?? null,
  };

  const config = await store.save(data.environment_id, input);

  // Return public view only
  return NextResponse.json({ data: toPublicView(config) });
}, { endpoint: "/api/data-sources/saas", method: "POST" });

// ── DELETE ────────────────────────────────────

export const DELETE = withErrorTracking(async function DELETE(request: Request) {
  const user = await isAuthorized();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const environmentId = searchParams.get("environment_id");

  if (!environmentId) {
    return NextResponse.json({ message: "environment_id is required" }, { status: 400 });
  }

  const accessCheck = await verifyEnvironmentAccess(user.id, environmentId);
  if (!accessCheck.ok) {
    return NextResponse.json({ message: accessCheck.message }, { status: 403 });
  }

  const deleted = await store.delete(environmentId);
  return NextResponse.json({ deleted });
}, { endpoint: "/api/data-sources/saas", method: "DELETE" });

// ── Authorization helper ─────────────────────

async function verifyEnvironmentAccess(
  userId: string,
  environmentId: string,
): Promise<{ ok: boolean; message: string; organizationId?: string }> {
  // Find the environment and verify the user has a membership in the org
  const environment = await prisma.environment.findUnique({
    where: { id: environmentId },
    select: { organizationId: true },
  });

  if (!environment) {
    return { ok: false, message: "Environment not found" };
  }

  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId: environment.organizationId,
      },
    },
  });

  if (!membership) {
    return { ok: false, message: "You do not have access to this environment" };
  }

  return { ok: true, message: "OK", organizationId: environment.organizationId };
}
