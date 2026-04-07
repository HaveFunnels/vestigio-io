import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import {
  hashClientIp,
  extractClientIp,
  isKnownEnvironment,
  isWithinRateLimit,
  sanitizeEvent,
  safeUserAgent,
  MAX_BATCH_SIZE,
  type SanitizedEvent,
} from "@/libs/behavioral-ingest";

// ──────────────────────────────────────────────
// Behavioral Ingest — Wave 0.2
//
// Public endpoint that receives raw events from the first-party snippet
// (public/snippet/vestigio.js). The snippet runs on customer origins,
// so this route:
//   - serves a permissive CORS preflight
//   - accepts both Content-Type variants (sendBeacon → text/plain,
//     fetch → application/json)
//   - never requires auth (all visitors are anonymous)
//   - never returns useful error info to clients (silent 204) so bots
//     don't get a useful signal
//
// Persistence shape: one row per event in RawBehavioralEvent. The Wave
// 0.3 worker reads back by (envId, sessionId, processedAt IS NULL),
// reconstructs the batch, and feeds aggregateSession() from
// packages/behavioral.
//
// Anti-abuse layers (defense in depth, all silent):
//   1. Bounded body size (Next.js default + our own MAX_BATCH_SIZE)
//   2. Env-id existence check (cached, prevents spam to fake envs)
//   3. Per-IP rate limit on event count (in-memory, daily-rotating hash)
//   4. Per-event sanitizer (drops unknown types, skewed clocks, oversized payloads)
//
// Privacy: client IPs are hashed with a daily-rotating salt before
// hitting the table. Raw IPs never persist. The snippet itself
// promises no PII in payload.data.
// ──────────────────────────────────────────────

export const runtime = "nodejs";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/** Empty 204 used for both success and silent-drop responses, so a
 *  bot can't differentiate "rejected" from "accepted". */
function silentOk(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// ── CORS preflight ────────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// ── Body parser ───────────────────────────────────
//
// sendBeacon() forces Content-Type: text/plain;charset=UTF-8 (it
// doesn't allow header overrides), while fetch() with our snippet
// uses application/json. Both bodies contain JSON. We just call
// req.text() and JSON.parse manually so we don't depend on
// Content-Type.

async function parseBody(req: Request): Promise<unknown | null> {
  try {
    const text = await req.text();
    if (!text || text.length > 512 * 1024) return null; // 512 KB hard ceiling
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ── POST handler ──────────────────────────────────

export const POST = withErrorTracking(
  async function POST(request: Request) {
    const body = await parseBody(request);
    if (!body || typeof body !== "object") return silentOk();

    const batch = body as Record<string, unknown>;
    const envId = typeof batch.env_id === "string" ? batch.env_id : null;
    const sessionId = typeof batch.session_id === "string" ? batch.session_id : null;
    const eventsRaw = Array.isArray(batch.events) ? batch.events : null;
    const attribution = batch.attribution && typeof batch.attribution === "object" ? batch.attribution : null;

    // Drop early if shape is wrong — but stay silent so bots learn nothing
    if (!envId || !sessionId || !eventsRaw || eventsRaw.length === 0) {
      return silentOk();
    }
    if (eventsRaw.length > MAX_BATCH_SIZE) {
      // Truncate rather than reject — the snippet may legitimately send
      // a backlog after a network reconnect. We keep the first N which
      // are the oldest (snippet flushes head-first via Array.splice).
      eventsRaw.length = MAX_BATCH_SIZE;
    }

    // Env existence check (cached)
    const envOk = await isKnownEnvironment(envId);
    if (!envOk) return silentOk();

    // IP + rate limit
    const ip = extractClientIp(request.headers);
    const ipHash = hashClientIp(ip);
    if (!isWithinRateLimit(ipHash, eventsRaw.length)) {
      return silentOk();
    }

    // Per-event sanitization
    const sanitized: SanitizedEvent[] = [];
    for (const ev of eventsRaw) {
      const ok = sanitizeEvent(ev);
      if (ok) sanitized.push(ok);
    }
    if (sanitized.length === 0) return silentOk();

    // Build the row payload. Attribution is denormalized only on the
    // first row of the batch — Wave 0.3's loader prefers the
    // chronologically-first non-null attribution per session, which
    // matches first-touch semantics.
    const userAgent = safeUserAgent(request.headers.get("user-agent"));
    const attributionJson = attribution ? safeStringify(attribution) : null;

    const rows = sanitized.map((e, idx) => ({
      envId,
      sessionId,
      eventType: e.type,
      url: e.url,
      occurredAt: new Date(e.ts),
      payload: e.payload,
      attribution: idx === 0 ? attributionJson : null,
      ipHash,
      userAgent,
    }));

    try {
      await prisma.rawBehavioralEvent.createMany({
        data: rows,
        skipDuplicates: true,
      });
    } catch (err) {
      // DB write failed — log but stay silent. The snippet has a
      // .catch(() => {}) on its fetch so the user experience is unaffected.
      console.warn("[api/behavioral/ingest] write failed:", err);
    }

    return silentOk();
  },
  { endpoint: "/api/behavioral/ingest", method: "POST" },
);

// ── Helpers ───────────────────────────────────────

function safeStringify(value: unknown): string | null {
  try {
    const s = JSON.stringify(value);
    if (s.length > 4 * 1024) return null; // attribution should never be this large
    return s;
  } catch {
    return null;
  }
}
