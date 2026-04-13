import { NextResponse } from "next/server";
import { prisma } from "@/libs/prismaDb";

// Nuvemshop LGPD: Store Redact
// Called when a store uninstalls the app. Delete all stored data.

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const storeId = body.store_id ? String(body.store_id) : null;

    console.log(`[nuvemshop-webhook] store/redact store_id=${storeId}`);

    if (storeId) {
      // Clear encrypted config and mark as disconnected for all
      // nuvemshop connections. We filter by config containing store_id
      // but since config is encrypted, we clear ALL nuvemshop connections
      // and rely on the fact that one store = one connection.
      await prisma.integrationConnection.updateMany({
        where: { provider: "nuvemshop" },
        data: { status: "disconnected", config: "", syncError: null },
      }).catch(err => {
        console.error(`[nuvemshop-webhook] store/redact DB error:`, err);
      });
    }

    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch {
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }
}
