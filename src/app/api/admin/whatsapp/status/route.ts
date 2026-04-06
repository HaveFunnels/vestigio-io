import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import {
	getPhoneNumberInfo,
	isMetaWhatsAppConfigured,
	listMetaTemplates,
} from "@/libs/whatsapp-meta";

// ──────────────────────────────────────────────
// GET /api/admin/whatsapp/status
//
// Admin-only. Reports whether the Meta Cloud API integration is configured
// and live, lists registered templates and their approval status, and pulls
// the phone number's current quality rating + messaging tier.
// ──────────────────────────────────────────────

export async function GET() {
	const session = await getServerSession(authOptions);
	if (!session?.user || (session.user as any).role !== "ADMIN") {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	const configured = isMetaWhatsAppConfigured();

	// Env-var presence check (doesn't log values)
	const envStatus = {
		META_APP_ID: !!process.env.META_APP_ID,
		META_APP_SECRET: !!process.env.META_APP_SECRET,
		META_SYSTEM_USER_TOKEN: !!process.env.META_SYSTEM_USER_TOKEN,
		META_WABA_ID: !!process.env.META_WABA_ID,
		META_PHONE_NUMBER_ID: !!process.env.META_PHONE_NUMBER_ID,
		META_WEBHOOK_VERIFY_TOKEN: !!process.env.META_WEBHOOK_VERIFY_TOKEN,
	};

	if (!configured) {
		return NextResponse.json({
			configured: false,
			envStatus,
			message: "Meta WhatsApp not fully configured. Set the missing env vars and redeploy.",
		});
	}

	// Call Meta to verify credentials + fetch account state
	const [phoneRes, templatesRes] = await Promise.all([
		getPhoneNumberInfo(),
		listMetaTemplates(),
	]);

	return NextResponse.json({
		configured: true,
		envStatus,
		phoneNumber: phoneRes.ok ? phoneRes.info : null,
		phoneNumberError: phoneRes.ok ? null : phoneRes.error,
		templates: templatesRes.ok ? templatesRes.templates : null,
		templatesError: templatesRes.ok ? null : templatesRes.error,
		webhook: {
			url: `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://vestigio.io"}/api/whatsapp/webhook`,
			verify_token_set: !!process.env.META_WEBHOOK_VERIFY_TOKEN,
		},
	});
}
