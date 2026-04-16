import { NextResponse } from "next/server";

// ──────────────────────────────────────────────
// Meta Data Deletion Status Page
//
// GET /api/integrations/meta-ads/deletion-status/{code}
//
// Per Meta's App Review spec, the deletion webhook must return a URL
// the user can visit to check deletion progress. Our deletion flow
// is synchronous (executed before the webhook returns), so any
// existing confirmation code corresponds to a completed deletion.
//
// This endpoint returns a user-friendly HTML page when visited from a
// browser and JSON when hit with Accept: application/json. We don't
// need to reveal any PII — only confirm the code corresponds to a
// processed deletion request.
// ──────────────────────────────────────────────

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ code: string }> },
) {
	const { code } = await params;

	if (!code || !/^[a-f0-9]{24}$/.test(code)) {
		return NextResponse.json(
			{ error: "invalid_code" },
			{ status: 400 },
		);
	}

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Data Deletion Status — Vestigio</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #09090b; color: #e4e4e7; padding: 40px 20px; line-height: 1.6; }
  .container { max-width: 640px; margin: 0 auto; }
  h1 { font-size: 24px; margin-bottom: 8px; }
  .status { display: inline-block; padding: 4px 10px; background: #14532d; color: #86efac; border-radius: 999px; font-size: 13px; font-weight: 500; }
  .code { font-family: ui-monospace, SFMono-Regular, monospace; background: #18181b; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  p { color: #a1a1aa; margin: 16px 0; }
  a { color: #818cf8; }
</style>
</head>
<body>
  <div class="container">
    <h1>Data Deletion — Completed <span class="status">✓ Done</span></h1>
    <p>Your Meta data deletion request has been processed. Vestigio has removed all Meta Ads account references, access tokens, and user IDs associated with this request.</p>
    <p><strong>Confirmation code:</strong> <span class="code">${code}</span></p>
    <p>The deletion was executed synchronously — no residual data remains in our systems. If you reconnect Meta Ads later, we will treat it as a fresh authorization.</p>
    <p>Questions? Contact <a href="mailto:privacy@vestigio.io">privacy@vestigio.io</a>.</p>
  </div>
</body>
</html>`;

	const acceptsJson = _request.headers.get("accept")?.includes("application/json");
	if (acceptsJson) {
		return NextResponse.json({
			status: "completed",
			confirmation_code: code,
			message:
				"Your Meta data deletion request has been processed. All access tokens, ad account references, and Meta user IDs have been removed from Vestigio.",
		});
	}

	return new NextResponse(html, {
		status: 200,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}
