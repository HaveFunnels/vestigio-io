import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { prisma } from "@/libs/prismaDb";

type EmailPayload = {
	to: string;
	subject: string;
	html: string;
};

// ──────────────────────────────────────────────
// SMTP Config Resolution
//
// Reads smtp_config from PlatformConfig (admin-configurable).
// Falls back to env vars when no DB config exists.
// ──────────────────────────────────────────────

interface SmtpConfig {
	host: string;
	port: number;
	user: string;
	password: string;
	from_address: string;
}

let cachedSmtp: SmtpConfig | null = null;
let smtpCacheTime = 0;
const SMTP_CACHE_TTL = 60_000; // 1 minute

async function getSmtpConfig(): Promise<SmtpConfig> {
	if (cachedSmtp && Date.now() - smtpCacheTime < SMTP_CACHE_TTL) {
		return cachedSmtp;
	}

	try {
		const row = await prisma.platformConfig.findUnique({
			where: { configKey: "smtp_config" },
		});
		if (row) {
			const parsed = JSON.parse(row.value) as Partial<SmtpConfig>;
			if (parsed.host && parsed.user && parsed.password) {
				cachedSmtp = {
					host: parsed.host,
					port: parsed.port ?? 587,
					user: parsed.user,
					password: parsed.password,
					from_address: parsed.from_address ?? `noreply@${parsed.host}`,
				};
				smtpCacheTime = Date.now();
				return cachedSmtp;
			}
		}
	} catch {
		// DB unavailable — fall through to env vars
	}

	// Fallback to environment variables
	const port = parseInt(process.env.EMAIL_SERVER_PORT || "587");
	return {
		host: process.env.EMAIL_SERVER_HOST ?? "",
		port,
		user: process.env.EMAIL_SERVER_USER ?? "",
		password: process.env.EMAIL_SERVER_PASSWORD ?? "",
		from_address: process.env.EMAIL_FROM ?? "",
	};
}

/**
 * Returns a nodemailer transport configured from DB (smtp_config) or env vars.
 */
export async function getSmtpTransport() {
	const cfg = await getSmtpConfig();
	const opts: SMTPTransport.Options = {
		host: cfg.host,
		port: cfg.port,
		secure: cfg.port === 465,
		auth: {
			user: cfg.user,
			pass: cfg.password,
		},
	};
	return { transporter: nodemailer.createTransport(opts), from: cfg.from_address };
}

/** Invalidate cached SMTP config (call after admin saves) */
export function invalidateSmtpCache() {
	cachedSmtp = null;
	smtpCacheTime = 0;
}

export const sendEmail = async (data: EmailPayload) => {
	const { transporter, from } = await getSmtpTransport();

	return await transporter.sendMail({
		from,
		...data,
	});
};

export const formatEmail = (email: string) => {
	return email.replace(/\s+/g, "").toLowerCase().trim();
};
