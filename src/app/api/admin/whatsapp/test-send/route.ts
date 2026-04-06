import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { z } from "zod";
import {
	isMetaWhatsAppConfigured,
	sendWhatsAppTemplate,
	sendWhatsAppText,
} from "@/libs/whatsapp-meta";
import {
	WHATSAPP_TEMPLATES,
	type WhatsAppLanguage,
} from "@/libs/whatsapp-templates";
import { prisma } from "@/libs/prismaDb";

// ──────────────────────────────────────────────
// POST /api/admin/whatsapp/test-send
//
// Admin-only. Sends a single WhatsApp message for live testing.
//
// Two modes:
//   { to, templateName, language, bodyParams, buttonParam? }
//   { to, text }  (only works inside 24h customer service window)
//
// Response includes the Meta message id (wamid) and logs the attempt to
// NotificationLog with event="system".
// ──────────────────────────────────────────────

const schema = z.object({
	to: z.string().min(5), // E.164
	templateName: z.string().optional(),
	language: z.enum(["pt_BR", "en_US", "es_LA", "de"]).optional(),
	bodyParams: z.array(z.string()).optional(),
	buttonParam: z.string().optional(),
	text: z.string().optional(),
}).refine(
	(d) => !!d.templateName || !!d.text,
	{ message: "Provide either templateName or text" },
);

export async function POST(req: Request) {
	const session = await getServerSession(authOptions);
	if (!session?.user || (session.user as any).role !== "ADMIN") {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	if (!isMetaWhatsAppConfigured()) {
		return NextResponse.json(
			{ message: "Meta WhatsApp not configured" },
			{ status: 400 },
		);
	}

	const body = await req.json();
	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ message: "Invalid payload", errors: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const data = parsed.data;

	// Template send (out-of-session)
	if (data.templateName) {
		const language = data.language ?? "pt_BR";
		const template = WHATSAPP_TEMPLATES[language]?.[data.templateName];
		if (!template) {
			return NextResponse.json(
				{ message: `Template "${data.templateName}" not found in ${language}` },
				{ status: 400 },
			);
		}

		const res = await sendWhatsAppTemplate({
			to: data.to,
			templateName: data.templateName,
			language,
			bodyParams: data.bodyParams ?? [],
			buttonParam: data.buttonParam,
		});

		// Log attempt
		try {
			await prisma.notificationLog.create({
				data: {
					userId: (session.user as any).id,
					channel: "whatsapp",
					event: "system",
					recipient: data.to,
					subject: data.templateName,
					status: res.ok ? "sent" : "failed",
					provider: "meta_whatsapp",
					providerId: res.wamid,
					errorMsg: res.error,
				},
			});
		} catch {}

		return NextResponse.json(res, { status: res.ok ? 200 : 502 });
	}

	// Free-form text send (requires 24h window open)
	const res = await sendWhatsAppText({
		to: data.to,
		body: data.text!,
	});

	try {
		await prisma.notificationLog.create({
			data: {
				userId: (session.user as any).id,
				channel: "whatsapp",
				event: "system",
				recipient: data.to,
				subject: "(free-form text)",
				status: res.ok ? "sent" : "failed",
				provider: "meta_whatsapp",
				providerId: res.wamid,
				errorMsg: res.error,
			},
		});
	} catch {}

	return NextResponse.json(res, { status: res.ok ? 200 : 502 });
}
