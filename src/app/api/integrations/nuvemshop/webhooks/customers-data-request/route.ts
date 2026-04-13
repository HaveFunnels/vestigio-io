import { NextResponse } from "next/server";
import { verifyNuvemshopWebhook } from "../verify";

// Nuvemshop LGPD: Customers Data Request
// Called when a store requests a data export for a specific customer.
// Vestigio does not store individual customer PII — only aggregated metrics.

export async function POST(request: Request) {
  const { valid, body, error } = await verifyNuvemshopWebhook(request);

  if (!valid) {
    console.warn(`[nuvemshop-webhook] customers/data_request rejected: ${error}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`[nuvemshop-webhook] customers/data_request store_id=${body.store_id} customer=${body.customer?.id}`);

  return NextResponse.json({
    status: "ok",
    message: "Vestigio does not store individual customer data. Only aggregated, anonymized metrics are used for analysis.",
  }, { status: 200 });
}
