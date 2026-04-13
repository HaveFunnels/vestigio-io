import { NextResponse } from "next/server";
import { verifyNuvemshopWebhook } from "../verify";

// Nuvemshop LGPD: Customers Redact
// Called when a store requests deletion of a specific customer's data.
// Vestigio does not store individual customer PII — only aggregated metrics.

export async function POST(request: Request) {
  const { valid, body, error } = await verifyNuvemshopWebhook(request);

  if (!valid) {
    console.warn(`[nuvemshop-webhook] customers/redact rejected: ${error}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`[nuvemshop-webhook] customers/redact store_id=${body.store_id} customer=${body.customer?.id}`);

  // No individual customer PII stored — acknowledge immediately
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
