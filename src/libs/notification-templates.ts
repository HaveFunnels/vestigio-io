import { renderBrandedEmail } from "@/libs/notifications";

// ──────────────────────────────────────────────
// Notification Templates
//
// Centralized copy for all notification channels.
// Each event defines templates for email + SMS.
// SMS is always short (≤160 chars ideal, ≤320 max).
//
// Variables use {name} syntax, replaced at render time.
// ──────────────────────────────────────────────

interface SmsTemplate {
	body: string;
}

interface EmailTemplate {
	subject: string;
	headline: string;
	intro: string;
	ctaLabel: string;
	ctaPath: string;
	footerNote: string;
}

interface NotificationTemplate {
	sms: SmsTemplate;
	email: EmailTemplate;
}

const TEMPLATES: Record<string, NotificationTemplate> = {
	incident: {
		sms: {
			body: "[Vestigio] {count} problema(s) critico(s) em {domain}: {headline}. Veja em app.vestigio.io",
		},
		email: {
			subject: "[Vestigio] Incidente: {headline}",
			headline: "Incidente detectado",
			intro: "<strong>{headline}</strong>{rootCauseSuffix}.<br/><br/>A Vestigio acabou de analisar <strong>{domain}</strong> e identificou {count} problema(s) que precisam de atenção.",
			ctaLabel: "Ver na Vestigio",
			ctaPath: "/app/analysis",
			footerNote: "Disparado pela auditoria de {domain}.",
		},
	},

	regression: {
		sms: {
			body: "[Vestigio] Regressão em {domain}: {headline}. {count} finding(s) pioraram. Veja em app.vestigio.io",
		},
		email: {
			subject: "[Vestigio] Regressão: {headline}",
			headline: "Regressão detectada",
			intro: "<strong>{headline}</strong> piorou desde a última auditoria.{rootCauseSuffix}<br/><br/>Total de regressões neste ciclo: <strong>{count}</strong>.",
			ctaLabel: "Ver change report",
			ctaPath: "/app/analysis",
			footerNote: "Comparado com a auditoria anterior de {domain}.",
		},
	},

	improvement: {
		sms: {
			body: "[Vestigio] Melhoria em {domain}: {headline} foi resolvido. Veja em app.vestigio.io",
		},
		email: {
			subject: "[Vestigio] Melhoria: {headline}",
			headline: "Melhoria confirmada",
			intro: "<strong>{headline}</strong> melhorou desde o último ciclo em <strong>{domain}</strong>.",
			ctaLabel: "Ver resultados",
			ctaPath: "/app/analysis",
			footerNote: "Comparado com a auditoria anterior de {domain}.",
		},
	},

	page_down: {
		sms: {
			body: "[Vestigio] Pagina fora do ar: {pageUrl}{statusSuffix}. Verifique agora.",
		},
		email: {
			subject: "[Vestigio] Pagina fora do ar: {pageUrl}",
			headline: "Uma página do seu site está fora do ar",
			intro: "A Vestigio detectou que <strong>{pageUrl}</strong> está inacessível.{statusDetail}{errorDetail}",
			ctaLabel: "Ver incidente",
			ctaPath: "/app/analysis",
			footerNote: "Notificaremos novamente quando a página voltar.",
		},
	},

	magic_link: {
		sms: {
			body: "[Vestigio] Seu link de acesso: {link} — expira em 10 minutos.",
		},
		email: {
			subject: "Entrar na Vestigio",
			headline: "Entrar na Vestigio",
			intro: "Clique no botão abaixo para entrar. Este link expira em 10 minutos.",
			ctaLabel: "Entrar",
			ctaPath: "{link}",
			footerNote: "Se você não solicitou este acesso, ignore este email.",
		},
	},

	activation_link: {
		sms: {
			body: "[Vestigio] Seu diagnóstico de {domain} está pronto. Ative sua conta: {link}",
		},
		email: {
			subject: "Seu diagnóstico de {domain} está pronto — ative sua conta",
			headline: "Seu diagnóstico completo está pronto",
			intro: "Bem-vindo à Vestigio. Ativamos sua conta para <strong>{domain}</strong> e o diagnóstico completo já está esperando no seu painel. Clique abaixo para escolher como quer fazer login.",
			ctaLabel: "Ativar minha conta",
			ctaPath: "{link}",
			footerNote: "Este link expira em 24 horas e só pode ser usado uma vez. Se não foi você que comprou, responda este email para cancelarmos.",
		},
	},

	password_reset: {
		sms: {
			body: "[Vestigio] Redefinição de senha: {link} — expira em 1 hora.",
		},
		email: {
			subject: "Redefinir senha da Vestigio",
			headline: "Redefinir sua senha",
			intro: "Clique no botão abaixo para escolher uma nova senha. Este link expira em 1 hora.",
			ctaLabel: "Redefinir senha",
			ctaPath: "{link}",
			footerNote: "Se você não solicitou esta redefinição, ignore este email.",
		},
	},

	verified_resolved: {
		sms: {
			body: "[Vestigio] {headline} foi resolvido em {domain}. Impacto recuperado: {impact}. Veja em app.vestigio.io",
		},
		email: {
			subject: "[Vestigio] Resolvido: {headline}",
			headline: "Problema resolvido e verificado",
			intro: "<strong>{headline}</strong> em <strong>{domain}</strong> foi confirmado como resolvido pela auditoria mais recente.{impactDetail}",
			ctaLabel: "Ver detalhes",
			ctaPath: "/app/actions",
			footerNote: "Parabéns! Esse impacto positivo será refletido no seu próximo relatório.",
		},
	},

	mini_audit_complete: {
		sms: {
			body: "[Vestigio] Diagnóstico de {domain}: {count} vazamentos, {impact}/mês em risco. Veja: {resultUrl}",
		},
		email: {
			subject: "Diagnóstico de {domain}: {count} vazamentos — {impact}/mês em risco",
			headline: "Seu diagnóstico está pronto",
			intro: "{findingsHtml}<p style=\"margin:16px 0 0 0;font-size:13px;color:#a1a1aa;\">⏱ Este link expira em 30 minutos.</p>",
			ctaLabel: "Ver meu diagnóstico completo",
			ctaPath: "{resultUrl}",
			footerNote: "Você recebeu este email porque solicitou um diagnóstico gratuito na Vestigio.",
		},
	},

	inactivity_pause: {
		sms: {
			body: "[Vestigio] Suas auditorias de {domain} foram pausadas por inatividade. Acesse app.vestigio.io para retomar.",
		},
		email: {
			subject: "Auditorias pausadas para {domain}",
			headline: "Suas auditorias contínuas estão pausadas",
			intro: "Não detectamos atividade em <strong>{domain}</strong> nos últimos 14 dias, então as auditorias contínuas foram pausadas automaticamente. Nenhum dado foi excluído.",
			ctaLabel: "Retomar auditorias",
			ctaPath: "/app",
			footerNote: "As auditorias são retomadas automaticamente quando você fizer login. Você também pode alterar as configurações de inatividade nas preferências da conta.",
		},
	},
};

function interpolate(template: string, vars: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

export function renderSmsFromTemplate(
	event: string,
	vars: Record<string, string>,
): string | null {
	const t = TEMPLATES[event];
	if (!t) return null;
	return interpolate(t.sms.body, vars);
}

export function renderEmailFromTemplate(
	event: string,
	vars: Record<string, string>,
	baseUrl: string,
): { subject: string; html: string; text: string } | null {
	const t = TEMPLATES[event];
	if (!t) return null;

	const subject = interpolate(t.email.subject, vars);
	const intro = interpolate(t.email.intro, vars);
	const footerNote = interpolate(t.email.footerNote, vars);
	const ctaPath = interpolate(t.email.ctaPath, vars);
	const ctaUrl = ctaPath.startsWith("http") ? ctaPath : `${baseUrl}${ctaPath}`;

	const html = renderBrandedEmail({
		headline: t.email.headline,
		intro,
		ctaLabel: t.email.ctaLabel,
		ctaUrl,
		footerNote,
	});

	const text = `${t.email.headline}: ${intro.replace(/<[^>]*>/g, "")} — ${ctaUrl}`;

	return { subject, html, text };
}

export function getTemplate(event: string): NotificationTemplate | null {
	return TEMPLATES[event] ?? null;
}
