import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";
import { decryptConfig } from "@/libs/integration-crypto";
import { verifyNuvemshopWebhook } from "../verify";

// Nuvemshop LGPD: Store Redact
// Called when a store uninstalls the app. Delete all stored data for THAT store.

export async function POST(request: Request) {
  const { valid, body, error } = await verifyNuvemshopWebhook(request);

  if (!valid) {
    console.warn(`[nuvemshop-webhook] store/redact rejected: ${error}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storeId = body.store_id ? String(body.store_id) : null;
  console.log(`[nuvemshop-webhook] store/redact store_id=${storeId}`);

  if (!storeId) {
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }

  try {
    // Find the specific integration for this store_id by decrypting configs
    const connections = await prisma.integrationConnection.findMany({
      where: { provider: "nuvemshop", status: { not: "disconnected" } },
    });

    for (const conn of connections) {
      try {
        const config = decryptConfig(conn.config);
        if (config.store_id === storeId) {
          await prisma.integrationConnection.update({
            where: { id: conn.id },
            data: { status: "disconnected", config: "", syncError: null },
          });
          console.log(`[nuvemshop-webhook] store/redact: disconnected connection ${conn.id} for store ${storeId}`);
        }
      } catch {
        // Can't decrypt — skip (may be already cleared)
      }
    }
  } catch (err) {
    console.error(`[nuvemshop-webhook] store/redact DB error:`, err);
  }

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
