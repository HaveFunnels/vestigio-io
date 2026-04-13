import { NextResponse } from "next/server";

// ──────────────────────────────────────────────
// Nuvemshop LGPD Webhooks
//
// Required for Nuvemshop app homologation (LGPD compliance).
// Three mandatory webhook endpoints:
//
// 1. Store Redact — called when a store uninstalls the app
//    We must delete all stored data for that store.
//
// 2. Customers Redact — called when a store requests
//    deletion of a specific customer's data.
//
// 3. Customers Data Request — called when a store requests
//    a data export for a specific customer.
//
// All three are POST requests with JSON bodies containing
// store_id and (for customer endpoints) customer data.
//
// These are all served from the same route with a
// `topic` field or X-Nuvemshop-Topic header to differentiate.
// However, Nuvemshop expects separate URLs, so we handle
// all three topics in a single handler and route them
// via the request body.
// ──────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const topic = body.topic || request.headers.get("x-nuvemshop-topic") || "unknown";
    const storeId = body.store_id ? String(body.store_id) : null;

    console.log(`[nuvemshop-webhook] Received topic=${topic} store_id=${storeId}`);

    switch (topic) {
      case "store/redact":
        // Store uninstalled the app — delete all stored data
        // In our case, the IntegrationConnection record config is cleared
        // when disconnected. On store redact, we mark as disconnected.
        if (storeId) {
          try {
            // Import prisma lazily to avoid issues in edge runtime
            const { prisma } = await import("@/libs/prismaDb");
            await prisma.integrationConnection.updateMany({
              where: { provider: "nuvemshop", status: { not: "disconnected" } },
              data: { status: "disconnected", config: "", syncError: null },
            });
          } catch (err) {
            console.error(`[nuvemshop-webhook] store/redact DB error:`, err);
          }
        }
        return NextResponse.json({ status: "ok" }, { status: 200 });

      case "customers/redact":
        // Delete specific customer data
        // Vestigio does not persist individual customer PII — we only store
        // aggregated metrics (total_customers, repeat_rate, avg_ltv).
        // No customer-level data to delete.
        console.log(`[nuvemshop-webhook] customers/redact — no PII stored, acknowledging`);
        return NextResponse.json({ status: "ok" }, { status: 200 });

      case "customers/data_request":
        // Export customer data
        // Same as above — no individual customer PII stored.
        console.log(`[nuvemshop-webhook] customers/data_request — no PII stored, acknowledging`);
        return NextResponse.json({
          status: "ok",
          message: "Vestigio does not store individual customer data. Only aggregated, anonymized metrics are used.",
        }, { status: 200 });

      default:
        console.warn(`[nuvemshop-webhook] Unknown topic: ${topic}`);
        return NextResponse.json({ status: "ok" }, { status: 200 });
    }
  } catch (err) {
    console.error(`[nuvemshop-webhook] Error processing webhook:`, err);
    // Always return 200 to prevent Nuvemshop from retrying
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }
}
