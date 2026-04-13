import { NextResponse } from "next/server";

// Nuvemshop LGPD: Customers Redact
// Called when a store requests deletion of a specific customer's data.
// Vestigio does not store individual customer PII — only aggregated metrics.

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log(`[nuvemshop-webhook] customers/redact store_id=${body.store_id} customer=${body.customer?.id}`);

    // No individual customer PII stored — acknowledge immediately
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch {
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }
}
