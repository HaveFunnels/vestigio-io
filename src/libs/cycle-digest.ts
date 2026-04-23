// ─────────────────────────────────────���────────
// Cycle Digest — Daily narrative email
//
// Computes a narrative summary for each active environment and
// sends it to org owners/admins via Brevo. Runs as a daily cron.
//
// Content: cross-signal highlights (hero), health score + delta,
// top 3 changes (regressions first), money recovered, streak.
// ──────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { notifyOrganization } from "./notifications";

const prisma = new PrismaClient();

interface DigestData {
	domain: string;
	healthScore: number;
	healthDelta: number;
	regressions: Array<{ title: string; severity: string; impact: number }>;
	improvements: Array<{ title: string; impact: number }>;
	resolved: Array<{ title: string; impact: number }>;
	crossSignalCount: number;
	crossSignalTopSurface: string | null;
	moneyRecoveredCents: number;
	totalExposureCents: number;
}

function formatDollars(cents: number): string {
	const d = cents / 100;
	if (d >= 1000) return `$${(d / 1000).toFixed(1)}k`;
	return `$${d.toFixed(0)}`;
}

function buildDigestHtml(data: DigestData): string {
	const lines: string[] = [];

	lines.push(`<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#e2e8f0;">`);
	lines.push(`<h2 style="color:#34d399;margin-bottom:4px;">Vestigio Daily Briefing</h2>`);
	lines.push(`<p style="color:#94a3b8;font-size:13px;margin-top:0;">${data.domain}</p>`);

	// Cross-signal hero
	if (data.crossSignalCount > 0) {
		lines.push(`<div style="background:#064e3b20;border:1px solid #065f4630;border-radius:8px;padding:12px 16px;margin:16px 0;">`);
		lines.push(`<strong style="color:#34d399;">Cross-Domain Insights</strong>`);
		lines.push(`<p style="color:#d1d5db;font-size:13px;margin:4px 0 0;">${data.crossSignalCount} pattern${data.crossSignalCount > 1 ? "s" : ""} detected where findings from different perspectives affect the same page${data.crossSignalTopSurface ? ` — most critical: ${data.crossSignalTopSurface}` : ""}.</p>`);
		lines.push(`</div>`);
	}

	// Health score
	const deltaSign = data.healthDelta >= 0 ? "+" : "";
	const deltaColor = data.healthDelta >= 0 ? "#34d399" : "#f87171";
	lines.push(`<div style="margin:16px 0;">`);
	lines.push(`<span style="font-size:28px;font-weight:bold;color:#f1f5f9;">${data.healthScore}</span>`);
	lines.push(`<span style="font-size:13px;color:#94a3b8;"> /100 health score </span>`);
	if (data.healthDelta !== 0) {
		lines.push(`<span style="font-size:13px;color:${deltaColor};">(${deltaSign}${data.healthDelta})</span>`);
	}
	lines.push(`</div>`);

	// Top changes
	const topChanges = [
		...data.regressions.slice(0, 2).map((r) => `<span style="color:#f87171;">Regression:</span> ${r.title} (${formatDollars(r.impact * 100)}/mo)`),
		...data.improvements.slice(0, 1).map((r) => `<span style="color:#34d399;">Improved:</span> ${r.title}`),
		...data.resolved.slice(0, 1).map((r) => `<span style="color:#60a5fa;">Resolved:</span> ${r.title} (${formatDollars(r.impact * 100)}/mo recovered)`),
	];

	if (topChanges.length > 0) {
		lines.push(`<div style="margin:16px 0;">`);
		lines.push(`<strong style="color:#e2e8f0;font-size:13px;">What changed</strong>`);
		lines.push(`<ul style="padding-left:16px;margin:8px 0;">`);
		for (const change of topChanges.slice(0, 3)) {
			lines.push(`<li style="color:#d1d5db;font-size:13px;margin:4px 0;">${change}</li>`);
		}
		lines.push(`</ul>`);
		lines.push(`</div>`);
	}

	// Money recovered + exposure
	if (data.moneyRecoveredCents > 0 || data.totalExposureCents > 0) {
		lines.push(`<div style="display:flex;gap:24px;margin:16px 0;">`);
		if (data.moneyRecoveredCents > 0) {
			lines.push(`<div><span style="font-size:18px;font-weight:bold;color:#34d399;">${formatDollars(data.moneyRecoveredCents)}</span><br><span style="font-size:11px;color:#94a3b8;">recovered</span></div>`);
		}
		if (data.totalExposureCents > 0) {
			lines.push(`<div><span style="font-size:18px;font-weight:bold;color:#f87171;">${formatDollars(data.totalExposureCents)}</span><br><span style="font-size:11px;color:#94a3b8;">monthly exposure</span></div>`);
		}
		lines.push(`</div>`);
	}

	// CTA
	lines.push(`<div style="margin:24px 0;">`);
	lines.push(`<a href="https://app.vestigio.io/app/dashboard" style="display:inline-block;background:#059669;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">Open Dashboard</a>`);
	lines.push(`</div>`);

	lines.push(`<p style="color:#64748b;font-size:11px;margin-top:24px;">You're receiving this because you have email notifications enabled on Vestigio. <a href="https://app.vestigio.io/app/settings" style="color:#64748b;">Manage preferences</a></p>`);
	lines.push(`</div>`);

	return lines.join("\n");
}

function buildDigestText(data: DigestData): string {
	const lines: string[] = [];
	lines.push(`Vestigio Daily Briefing — ${data.domain}`);
	lines.push("");
	lines.push(`Health Score: ${data.healthScore}/100 (${data.healthDelta >= 0 ? "+" : ""}${data.healthDelta})`);
	if (data.crossSignalCount > 0) {
		lines.push(`Cross-Domain: ${data.crossSignalCount} pattern(s) detected`);
	}
	if (data.regressions.length > 0) {
		lines.push(`Regressions: ${data.regressions.map((r) => r.title).join(", ")}`);
	}
	if (data.moneyRecoveredCents > 0) {
		lines.push(`Recovered: ${formatDollars(data.moneyRecoveredCents)}`);
	}
	lines.push("");
	lines.push("Open Dashboard: https://app.vestigio.io/app/dashboard");
	return lines.join("\n");
}

/**
 * Send digest emails for all active environments.
 * Called by the daily cron in instrumentation-node.ts.
 */
export async function sendDailyDigests(): Promise<{ sent: number; skipped: number }> {
	let sent = 0;
	let skipped = 0;

	try {
		// Get all active, non-demo environments with recent cycles
		const environments = await prisma.environment.findMany({
			where: {
				activated: true,
				continuousPaused: false,
				organization: {
					plan: { not: "demo" },
				},
			},
			include: {
				organization: { select: { id: true } },
			},
			take: 100,
		});

		for (const env of environments) {
			try {
				// Get latest findings for this environment
				const findings = await prisma.finding.findMany({
					where: { environmentId: env.id },
					select: {
						severity: true,
						polarity: true,
						changeClass: true,
						impactMidpoint: true,
						pack: true,
						surface: true,
						projection: true,
					},
					orderBy: { createdAt: "desc" },
					take: 200,
				});

				if (findings.length === 0) {
					skipped++;
					continue;
				}

				// Compute digest data
				const regressions = findings
					.filter((f) => f.changeClass === "regression")
					.map((f) => {
						let title = "Untitled";
						try { title = JSON.parse(f.projection || "{}").title || title; } catch {}
						return { title, severity: f.severity, impact: f.impactMidpoint || 0 };
					})
					.sort((a, b) => b.impact - a.impact);

				const improvements = findings
					.filter((f) => f.changeClass === "improvement")
					.map((f) => {
						let title = "Untitled";
						try { title = JSON.parse(f.projection || "{}").title || title; } catch {}
						return { title, impact: f.impactMidpoint || 0 };
					});

				const resolved = findings
					.filter((f) => f.changeClass === "resolved")
					.map((f) => {
						let title = "Untitled";
						try { title = JSON.parse(f.projection || "{}").title || title; } catch {}
						return { title, impact: f.impactMidpoint || 0 };
					});

				// Cross-signal: count surfaces with 2+ packs
				const bySurface = new Map<string, Set<string>>();
				for (const f of findings) {
					if (!f.surface || f.polarity === "positive" || f.changeClass === "resolved") continue;
					const packs = bySurface.get(f.surface) || new Set();
					if (f.pack) packs.add(f.pack);
					bySurface.set(f.surface, packs);
				}
				const crossSignalSurfaces = [...bySurface.entries()].filter(([, packs]) => packs.size >= 2);

				// Health score (simplified: 100 - weighted severity count)
				const openNeg = findings.filter((f) => f.polarity !== "positive" && f.changeClass !== "resolved");
				const severityWeight: Record<string, number> = { critical: 10, high: 5, medium: 2, low: 1 };
				const penaltySum = openNeg.reduce((sum, f) => sum + (severityWeight[f.severity] || 1), 0);
				const healthScore = Math.max(0, Math.min(100, 100 - penaltySum));

				const totalExposure = openNeg.reduce((sum, f) => sum + (f.impactMidpoint || 0), 0);
				const moneyRecovered = resolved.reduce((sum, r) => sum + r.impact, 0);

				const data: DigestData = {
					domain: env.domain || "your site",
					healthScore,
					healthDelta: improvements.length - regressions.length,
					regressions,
					improvements,
					resolved,
					crossSignalCount: crossSignalSurfaces.length,
					crossSignalTopSurface: crossSignalSurfaces[0]?.[0] || null,
					moneyRecoveredCents: Math.round(moneyRecovered * 100),
					totalExposureCents: Math.round(totalExposure * 100),
				};

				// Skip if nothing interesting happened (no changes)
				if (regressions.length === 0 && improvements.length === 0 && resolved.length === 0) {
					skipped++;
					continue;
				}

				const html = buildDigestHtml(data);
				const text = buildDigestText(data);

				await notifyOrganization(env.organization.id, {
					event: "digest",
					subject: `Vestigio Briefing — ${data.domain}: ${regressions.length > 0 ? `${regressions.length} regression${regressions.length > 1 ? "s" : ""}` : `${improvements.length} improvement${improvements.length > 1 ? "s" : ""}`}`,
					bodyHtml: html,
					bodyText: text,
					tag: "daily-digest",
				});

				sent++;
			} catch (err) {
				console.error(`[cycle-digest] env ${env.id} failed:`, err);
				skipped++;
			}
		}
	} catch (err) {
		console.error("[cycle-digest] top-level failure:", err);
	}

	return { sent, skipped };
}
