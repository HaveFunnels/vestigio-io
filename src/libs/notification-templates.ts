import { renderBrandedEmail, escapeHtml } from "@/libs/notifications";

// ─────────────────���────────────────────────────
// Notification Templates — locale-aware
//
// Centralized copy for all notification channels.
// Each event defines templates for email + SMS per locale.
// SMS is always short (<=160 chars ideal, <=320 max).
//
// Variables use {name} syntax, replaced at render time.
//
// Supported locales: pt-BR (primary), en, es, de
// Fallback chain: requested locale -> en -> pt-BR
// ────────────────���─────────────────────────────

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

type LocalizedTemplates = {
	[locale: string]: NotificationTemplate;
};

const FALLBACK_CHAIN = ["en", "pt-BR"];

// ────��─────────────────────────────────────────
// Locale-aware template map
// ──────────────────────────────────────────────

const TEMPLATES: Record<string, LocalizedTemplates> = {
	incident: {
		"pt-BR": {
			sms: {
				body: "{count} problema(s) critico(s) em {domain}: {headline}. Veja em app.vestigio.io",
			},
			email: {
				subject: "Incidente: {headline}",
				headline: "Incidente detectado",
				intro: "<strong>{headline}</strong>{rootCauseSuffix}.<br/><br/>A Vestigio acabou de analisar <strong>{domain}</strong> e identificou {count} problema(s) que precisam de atenção.",
				ctaLabel: "Ver na Vestigio",
				ctaPath: "/app/findings",
				footerNote: "Disparado pela auditoria de {domain}.",
			},
		},
		en: {
			sms: {
				body: "{count} critical issue(s) on {domain}: {headline}. View at app.vestigio.io",
			},
			email: {
				subject: "Incident: {headline}",
				headline: "Incident detected",
				intro: "<strong>{headline}</strong>{rootCauseSuffix}.<br/><br/>Vestigio just analyzed <strong>{domain}</strong> and found {count} issue(s) that need attention.",
				ctaLabel: "View in Vestigio",
				ctaPath: "/app/findings",
				footerNote: "Triggered by the audit of {domain}.",
			},
		},
		// TODO: Translate properly — currently stub copies of English
		es: {
			sms: {
				body: "{count} problema(s) critico(s) en {domain}: {headline}. Ver en app.vestigio.io",
			},
			email: {
				subject: "Incidente: {headline}",
				headline: "Incidente detectado",
				intro: "<strong>{headline}</strong>{rootCauseSuffix}.<br/><br/>Vestigio acaba de analizar <strong>{domain}</strong> y encontro {count} problema(s) que necesitan atencion.",
				ctaLabel: "Ver en Vestigio",
				ctaPath: "/app/findings",
				footerNote: "Activado por la auditoria de {domain}.",
			},
		},
		// TODO: Translate properly — currently stub copy of English
		de: {
			sms: {
				body: "{count} kritische(s) Problem(e) auf {domain}: {headline}. Ansehen auf app.vestigio.io",
			},
			email: {
				subject: "Vorfall: {headline}",
				headline: "Vorfall erkannt",
				intro: "<strong>{headline}</strong>{rootCauseSuffix}.<br/><br/>Vestigio hat gerade <strong>{domain}</strong> analysiert und {count} Problem(e) gefunden, die Aufmerksamkeit erfordern.",
				ctaLabel: "In Vestigio ansehen",
				ctaPath: "/app/findings",
				footerNote: "Ausgeloest durch das Audit von {domain}.",
			},
		},
	},

	regression: {
		"pt-BR": {
			sms: {
				body: "Regressão em {domain}: {headline}. {count} finding(s) pioraram. Veja em app.vestigio.io",
			},
			email: {
				subject: "Regressão: {headline}",
				headline: "Regressão detectada",
				intro: "<strong>{headline}</strong> piorou desde a última auditoria.{rootCauseSuffix}<br/><br/>Total de regressões neste ciclo: <strong>{count}</strong>.",
				ctaLabel: "Ver change report",
				ctaPath: "/app/findings",
				footerNote: "Comparado com a auditoria anterior de {domain}.",
			},
		},
		en: {
			sms: {
				body: "Regression on {domain}: {headline}. {count} finding(s) worsened. View at app.vestigio.io",
			},
			email: {
				subject: "Regression: {headline}",
				headline: "Regression detected",
				intro: "<strong>{headline}</strong> worsened since the last audit.{rootCauseSuffix}<br/><br/>Total regressions this cycle: <strong>{count}</strong>.",
				ctaLabel: "View change report",
				ctaPath: "/app/findings",
				footerNote: "Compared with the previous audit of {domain}.",
			},
		},
		// TODO: Translate properly — currently stub copy of English
		es: {
			sms: {
				body: "Regresion en {domain}: {headline}. {count} hallazgo(s) empeoraron. Ver en app.vestigio.io",
			},
			email: {
				subject: "Regresion: {headline}",
				headline: "Regresion detectada",
				intro: "<strong>{headline}</strong> empeoro desde la ultima auditoria.{rootCauseSuffix}<br/><br/>Total de regresiones en este ciclo: <strong>{count}</strong>.",
				ctaLabel: "Ver informe de cambios",
				ctaPath: "/app/findings",
				footerNote: "Comparado con la auditoria anterior de {domain}.",
			},
		},
		// TODO: Translate properly — currently stub copy of English
		de: {
			sms: {
				body: "Regression auf {domain}: {headline}. {count} Ergebnis(se) verschlechtert. Ansehen auf app.vestigio.io",
			},
			email: {
				subject: "Regression: {headline}",
				headline: "Regression erkannt",
				intro: "<strong>{headline}</strong> hat sich seit dem letzten Audit verschlechtert.{rootCauseSuffix}<br/><br/>Gesamte Regressionen in diesem Zyklus: <strong>{count}</strong>.",
				ctaLabel: "Aenderungsbericht ansehen",
				ctaPath: "/app/findings",
				footerNote: "Verglichen mit dem vorherigen Audit von {domain}.",
			},
		},
	},

	improvement: {
		"pt-BR": {
			sms: {
				body: "Melhoria em {domain}: {headline} foi resolvido. Veja em app.vestigio.io",
			},
			email: {
				subject: "Melhoria: {headline}",
				headline: "Melhoria confirmada",
				intro: "<strong>{headline}</strong> melhorou desde o último ciclo em <strong>{domain}</strong>.",
				ctaLabel: "Ver resultados",
				ctaPath: "/app/findings",
				footerNote: "Comparado com a auditoria anterior de {domain}.",
			},
		},
		en: {
			sms: {
				body: "Improvement on {domain}: {headline} was resolved. View at app.vestigio.io",
			},
			email: {
				subject: "Improvement: {headline}",
				headline: "Improvement confirmed",
				intro: "<strong>{headline}</strong> improved since the last cycle on <strong>{domain}</strong>.",
				ctaLabel: "View results",
				ctaPath: "/app/findings",
				footerNote: "Compared with the previous audit of {domain}.",
			},
		},
		// TODO: Translate properly — currently stub copy of English
		es: {
			sms: {
				body: "Mejora en {domain}: {headline} fue resuelto. Ver en app.vestigio.io",
			},
			email: {
				subject: "Mejora: {headline}",
				headline: "Mejora confirmada",
				intro: "<strong>{headline}</strong> mejoro desde el ultimo ciclo en <strong>{domain}</strong>.",
				ctaLabel: "Ver resultados",
				ctaPath: "/app/findings",
				footerNote: "Comparado con la auditoria anterior de {domain}.",
			},
		},
		// TODO: Translate properly — currently stub copy of English
		de: {
			sms: {
				body: "Verbesserung auf {domain}: {headline} wurde behoben. Ansehen auf app.vestigio.io",
			},
			email: {
				subject: "Verbesserung: {headline}",
				headline: "Verbesserung bestaetigt",
				intro: "<strong>{headline}</strong> hat sich seit dem letzten Zyklus auf <strong>{domain}</strong> verbessert.",
				ctaLabel: "Ergebnisse ansehen",
				ctaPath: "/app/findings",
				footerNote: "Verglichen mit dem vorherigen Audit von {domain}.",
			},
		},
	},

	page_down: {
		"pt-BR": {
			sms: {
				body: "Pagina fora do ar: {pageUrl}{statusSuffix}. Verifique agora.",
			},
			email: {
				subject: "Pagina fora do ar: {pageUrl}",
				headline: "Uma página do seu site está fora do ar",
				intro: "A Vestigio detectou que <strong>{pageUrl}</strong> está inacessível.{statusDetail}{errorDetail}",
				ctaLabel: "Ver incidente",
				ctaPath: "/app/findings",
				footerNote: "Notificaremos novamente quando a página voltar.",
			},
		},
		en: {
			sms: {
				body: "Page down: {pageUrl}{statusSuffix}. Check now.",
			},
			email: {
				subject: "Page down: {pageUrl}",
				headline: "One of your pages is down",
				intro: "Vestigio detected that <strong>{pageUrl}</strong> is unreachable.{statusDetail}{errorDetail}",
				ctaLabel: "View incident",
				ctaPath: "/app/findings",
				footerNote: "We will notify you again when the page is back.",
			},
		},
		// TODO: Translate properly — currently stub copy of English
		es: {
			sms: {
				body: "Pagina caida: {pageUrl}{statusSuffix}. Verifique ahora.",
			},
			email: {
				subject: "Pagina caida: {pageUrl}",
				headline: "Una de tus paginas esta caida",
				intro: "Vestigio detecto que <strong>{pageUrl}</strong> esta inaccesible.{statusDetail}{errorDetail}",
				ctaLabel: "Ver incidente",
				ctaPath: "/app/findings",
				footerNote: "Te notificaremos nuevamente cuando la pagina vuelva.",
			},
		},
		// TODO: Translate properly — currently stub copy of English
		de: {
			sms: {
				body: "Seite nicht erreichbar: {pageUrl}{statusSuffix}. Jetzt pruefen.",
			},
			email: {
				subject: "Seite nicht erreichbar: {pageUrl}",
				headline: "Eine Ihrer Seiten ist nicht erreichbar",
				intro: "Vestigio hat erkannt, dass <strong>{pageUrl}</strong> nicht erreichbar ist.{statusDetail}{errorDetail}",
				ctaLabel: "Vorfall ansehen",
				ctaPath: "/app/findings",
				footerNote: "Wir benachrichtigen Sie erneut, wenn die Seite wieder erreichbar ist.",
			},
		},
	},

	magic_link: {
		"pt-BR": {
			sms: {
				body: "Seu link de acesso: {link} — expira em 10 minutos.",
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
		en: {
			sms: {
				body: "Your access link: {link} — expires in 10 minutes.",
			},
			email: {
				subject: "Sign in to Vestigio",
				headline: "Sign in to Vestigio",
				intro: "Click the button below to sign in. This link expires in 10 minutes.",
				ctaLabel: "Sign in",
				ctaPath: "{link}",
				footerNote: "If you didn't request this, you can safely ignore this email.",
			},
		},
		// TODO: Translate properly — currently stub copy of English
		es: {
			sms: {
				body: "Tu enlace de acceso: {link} — expira en 10 minutos.",
			},
			email: {
				subject: "Ingresar a Vestigio",
				headline: "Ingresar a Vestigio",
				intro: "Haz clic en el boton de abajo para ingresar. Este enlace expira en 10 minutos.",
				ctaLabel: "Ingresar",
				ctaPath: "{link}",
				footerNote: "Si no solicitaste este acceso, ignora este correo.",
			},
		},
		// TODO: Translate properly — currently stub copy of English
		de: {
			sms: {
				body: "Ihr Zugangslink: {link} — laeuft in 10 Minuten ab.",
			},
			email: {
				subject: "Bei Vestigio anmelden",
				headline: "Bei Vestigio anmelden",
				intro: "Klicken Sie auf den Button unten, um sich anzumelden. Dieser Link laeuft in 10 Minuten ab.",
				ctaLabel: "Anmelden",
				ctaPath: "{link}",
				footerNote: "Wenn Sie dies nicht angefordert haben, koennen Sie diese E-Mail ignorieren.",
			},
		},
	},

	activation_link: {
		"pt-BR": {
			sms: {
				body: "Seu diagnóstico de {domain} está pronto. Ative sua conta: {link}",
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
		en: {
			sms: {
				body: "Your {domain} diagnosis is ready. Activate your account: {link}",
			},
			email: {
				subject: "Your {domain} diagnosis is ready — activate your account",
				headline: "Your full diagnosis is ready",
				intro: "Welcome to Vestigio. We activated your account for <strong>{domain}</strong> and your full diagnosis is waiting in your dashboard. Click below to choose how you want to sign in.",
				ctaLabel: "Activate my account",
				ctaPath: "{link}",
				footerNote: "This link expires in 24 hours and can only be used once. If you didn't make this purchase, reply to this email and we'll cancel it.",
			},
		},
		// TODO: Translate properly ��� currently stub copy of English
		es: {
			sms: {
				body: "Tu diagnostico de {domain} esta listo. Activa tu cuenta: {link}",
			},
			email: {
				subject: "Tu diagnostico de {domain} esta listo — activa tu cuenta",
				headline: "Tu diagnostico completo esta listo",
				intro: "Bienvenido a Vestigio. Activamos tu cuenta para <strong>{domain}</strong> y tu diagnostico completo esta esperando en tu panel. Haz clic abajo para elegir como quieres iniciar sesion.",
				ctaLabel: "Activar mi cuenta",
				ctaPath: "{link}",
				footerNote: "Este enlace expira en 24 horas y solo puede usarse una vez. Si no realizaste esta compra, responde este correo para cancelarlo.",
			},
		},
		// TODO: Translate properly — currently stub copy of English
		de: {
			sms: {
				body: "Ihre Diagnose fuer {domain} ist bereit. Aktivieren Sie Ihr Konto: {link}",
			},
			email: {
				subject: "Ihre Diagnose fuer {domain} ist bereit — aktivieren Sie Ihr Konto",
				headline: "Ihre vollstaendige Diagnose ist bereit",
				intro: "Willkommen bei Vestigio. Wir haben Ihr Konto fuer <strong>{domain}</strong> aktiviert und Ihre vollstaendige Diagnose wartet in Ihrem Dashboard. Klicken Sie unten, um Ihre Anmeldemethode zu waehlen.",
				ctaLabel: "Mein Konto aktivieren",
				ctaPath: "{link}",
				footerNote: "Dieser Link laeuft in 24 Stunden ab und kann nur einmal verwendet werden. Falls Sie diesen Kauf nicht getaetigt haben, antworten Sie auf diese E-Mail.",
			},
		},
	},

	password_reset: {
		"pt-BR": {
			sms: {
				body: "Redefinição de senha: {link} — expira em 1 hora.",
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
		en: {
			sms: {
				body: "Password reset: {link} — expires in 1 hour.",
			},
			email: {
				subject: "Reset your Vestigio password",
				headline: "Reset your password",
				intro: "Click the button below to choose a new password. This link expires in 1 hour.",
				ctaLabel: "Reset password",
				ctaPath: "{link}",
				footerNote: "If you didn't request this reset, you can safely ignore this email.",
			},
		},
		// TODO: Translate properly — currently stub copy of English
		es: {
			sms: {
				body: "Restablecer contrasena: {link} — expira en 1 hora.",
			},
			email: {
				subject: "Restablecer contrasena de Vestigio",
				headline: "Restablecer tu contrasena",
				intro: "Haz clic en el boton de abajo para elegir una nueva contrasena. Este enlace expira en 1 hora.",
				ctaLabel: "Restablecer contrasena",
				ctaPath: "{link}",
				footerNote: "Si no solicitaste este restablecimiento, ignora este correo.",
			},
		},
		// TODO: Translate properly — currently stub copy of English
		de: {
			sms: {
				body: "Passwort zuruecksetzen: {link} — laeuft in 1 Stunde ab.",
			},
			email: {
				subject: "Vestigio-Passwort zuruecksetzen",
				headline: "Passwort zuruecksetzen",
				intro: "Klicken Sie auf den Button unten, um ein neues Passwort zu waehlen. Dieser Link laeuft in 1 Stunde ab.",
				ctaLabel: "Passwort zuruecksetzen",
				ctaPath: "{link}",
				footerNote: "Wenn Sie dies nicht angefordert haben, koennen Sie diese E-Mail ignorieren.",
			},
		},
	},

	verified_resolved: {
		"pt-BR": {
			sms: {
				body: "{headline} foi resolvido em {domain}. Impacto recuperado: {impact}. Veja em app.vestigio.io",
			},
			email: {
				subject: "Resolvido: {headline}",
				headline: "Problema resolvido e verificado",
				intro: "<strong>{headline}</strong> em <strong>{domain}</strong> foi confirmado como resolvido pela auditoria mais recente.{impactDetail}",
				ctaLabel: "Ver detalhes",
				ctaPath: "/app/actions",
				footerNote: "Parabéns! Esse impacto positivo será refletido no seu próximo relatório.",
			},
		},
		en: {
			sms: {
				body: "{headline} resolved on {domain}. Recovered impact: {impact}. View at app.vestigio.io",
			},
			email: {
				subject: "Resolved: {headline}",
				headline: "Issue resolved and verified",
				intro: "<strong>{headline}</strong> on <strong>{domain}</strong> has been confirmed as resolved by the latest audit.{impactDetail}",
				ctaLabel: "View details",
				ctaPath: "/app/actions",
				footerNote: "Congratulations! This positive impact will be reflected in your next report.",
			},
		},
		// TODO: Translate properly — currently stub copy of English
		es: {
			sms: {
				body: "{headline} resuelto en {domain}. Impacto recuperado: {impact}. Ver en app.vestigio.io",
			},
			email: {
				subject: "Resuelto: {headline}",
				headline: "Problema resuelto y verificado",
				intro: "<strong>{headline}</strong> en <strong>{domain}</strong> ha sido confirmado como resuelto por la ultima auditoria.{impactDetail}",
				ctaLabel: "Ver detalles",
				ctaPath: "/app/actions",
				footerNote: "Felicidades! Este impacto positivo se reflejara en tu proximo informe.",
			},
		},
		// TODO: Translate properly — currently stub copy of English
		de: {
			sms: {
				body: "{headline} behoben auf {domain}. Wiederhergestellte Auswirkung: {impact}. Ansehen auf app.vestigio.io",
			},
			email: {
				subject: "Behoben: {headline}",
				headline: "Problem behoben und verifiziert",
				intro: "<strong>{headline}</strong> auf <strong>{domain}</strong> wurde durch das letzte Audit als behoben bestaetigt.{impactDetail}",
				ctaLabel: "Details ansehen",
				ctaPath: "/app/actions",
				footerNote: "Glueckwunsch! Diese positive Auswirkung wird in Ihrem naechsten Bericht sichtbar sein.",
			},
		},
	},

	mini_audit_complete: {
		"pt-BR": {
			sms: {
				body: "Diagnóstico de {domain}: {count} vazamentos, {impact}/mês em risco. Veja: {resultUrl}",
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
		en: {
			sms: {
				body: "Diagnosis for {domain}: {count} leaks, {impact}/mo at risk. View: {resultUrl}",
			},
			email: {
				subject: "Diagnosis for {domain}: {count} leaks — {impact}/mo at risk",
				headline: "Your diagnosis is ready",
				intro: "{findingsHtml}<p style=\"margin:16px 0 0 0;font-size:13px;color:#a1a1aa;\">⏱ This link expires in 30 minutes.</p>",
				ctaLabel: "View my full diagnosis",
				ctaPath: "{resultUrl}",
				footerNote: "You received this email because you requested a free diagnosis from Vestigio.",
			},
		},
		// TODO: Translate properly — currently stub copy of English
		es: {
			sms: {
				body: "Diagnostico de {domain}: {count} fugas, {impact}/mes en riesgo. Ver: {resultUrl}",
			},
			email: {
				subject: "Diagnostico de {domain}: {count} fugas — {impact}/mes en riesgo",
				headline: "Tu diagnostico esta listo",
				intro: "{findingsHtml}<p style=\"margin:16px 0 0 0;font-size:13px;color:#a1a1aa;\">⏱ Este enlace expira en 30 minutos.</p>",
				ctaLabel: "Ver mi diagnostico completo",
				ctaPath: "{resultUrl}",
				footerNote: "Recibiste este correo porque solicitaste un diagnostico gratuito en Vestigio.",
			},
		},
		// TODO: Translate properly — currently stub copy of English
		de: {
			sms: {
				body: "Diagnose fuer {domain}: {count} Lecks, {impact}/Monat gefaehrdet. Ansehen: {resultUrl}",
			},
			email: {
				subject: "Diagnose fuer {domain}: {count} Lecks — {impact}/Monat gefaehrdet",
				headline: "Ihre Diagnose ist bereit",
				intro: "{findingsHtml}<p style=\"margin:16px 0 0 0;font-size:13px;color:#a1a1aa;\">⏱ Dieser Link laeuft in 30 Minuten ab.</p>",
				ctaLabel: "Meine vollstaendige Diagnose ansehen",
				ctaPath: "{resultUrl}",
				footerNote: "Sie haben diese E-Mail erhalten, weil Sie eine kostenlose Diagnose bei Vestigio angefordert haben.",
			},
		},
	},

	// Wave 22.8 #10 Move 2 — followup email 24h pos mini-audit. Disparado
	// por cron quando lead status=audit_complete + createdAt > 24h ago +
	// nao converteu + nao recebeu followup ainda.
	mini_audit_followup_24h: {
		"pt-BR": {
			sms: {
				body: "Faltam {count} vazamentos em {domain} para você ver — {impact}/mês. Continue: {resultUrl}",
			},
			email: {
				subject: "Você viu {visibleCount} vazamentos em {domain}. Faltam {hiddenCount}.",
				headline: "Vimos R$ {impact} saindo do seu site",
				intro: "Você analisou <strong>{domain}</strong> ontem e descobriu <strong>{visibleCount} vazamentos</strong> custando até <strong>{impact}/mês</strong>. Ainda há <strong>{hiddenCount} vazamentos extras</strong> que ficaram bloqueados — eles aparecem na sua conta Vestigio, junto com o plano mensal de correção priorizada por impacto financeiro. <p style=\"margin:16px 0 0 0;font-size:13px;color:#a1a1aa;\">O link abaixo abre o diagnóstico de novo com seu email já preenchido. Você só seta a senha.</p>",
				ctaLabel: "Ver os {hiddenCount} vazamentos escondidos",
				ctaPath: "{resultUrl}",
				footerNote: "Você recebeu este email porque solicitou um diagnóstico gratuito na Vestigio.",
			},
		},
		en: {
			sms: {
				body: "{count} more leaks for {domain} to see — {impact}/mo. Continue: {resultUrl}",
			},
			email: {
				subject: "You saw {visibleCount} leaks in {domain}. {hiddenCount} more remain.",
				headline: "We saw {impact} leaving your site",
				intro: "You analyzed <strong>{domain}</strong> yesterday and found <strong>{visibleCount} leaks</strong> costing up to <strong>{impact}/mo</strong>. There are still <strong>{hiddenCount} additional leaks</strong> that stayed locked — they appear in your Vestigio account, alongside a monthly fix plan prioritized by financial impact. <p style=\"margin:16px 0 0 0;font-size:13px;color:#a1a1aa;\">The link below reopens the diagnosis with your email pre-filled. Just set a password.</p>",
				ctaLabel: "See the {hiddenCount} hidden leaks",
				ctaPath: "{resultUrl}",
				footerNote: "You received this email because you requested a free diagnosis from Vestigio.",
			},
		},
		es: {
			sms: {
				body: "{count} fugas mas en {domain} para ver — {impact}/mes. Continua: {resultUrl}",
			},
			email: {
				subject: "Viste {visibleCount} fugas en {domain}. Faltan {hiddenCount}.",
				headline: "Vimos {impact} saliendo de tu sitio",
				intro: "Ayer analizaste <strong>{domain}</strong> y encontraste <strong>{visibleCount} fugas</strong> costando hasta <strong>{impact}/mes</strong>. Quedan <strong>{hiddenCount} fugas adicionales</strong> bloqueadas — aparecen en tu cuenta Vestigio junto al plan mensual de correccion priorizado por impacto financiero.",
				ctaLabel: "Ver las {hiddenCount} fugas ocultas",
				ctaPath: "{resultUrl}",
				footerNote: "Recibiste este correo porque solicitaste un diagnostico gratuito en Vestigio.",
			},
		},
		de: {
			sms: {
				body: "{count} weitere Lecks fuer {domain} — {impact}/Monat. Weiter: {resultUrl}",
			},
			email: {
				subject: "Sie sahen {visibleCount} Lecks in {domain}. Es bleiben noch {hiddenCount}.",
				headline: "Wir sahen {impact}, die Ihr Website verlassen",
				intro: "Sie haben gestern <strong>{domain}</strong> analysiert und <strong>{visibleCount} Lecks</strong> gefunden, die bis zu <strong>{impact}/Monat</strong> kosten. Es bleiben noch <strong>{hiddenCount} weitere Lecks</strong>, die in Ihrem Vestigio-Konto erscheinen.",
				ctaLabel: "Die {hiddenCount} versteckten Lecks ansehen",
				ctaPath: "{resultUrl}",
				footerNote: "Sie haben diese E-Mail erhalten, weil Sie eine kostenlose Diagnose bei Vestigio angefordert haben.",
			},
		},
	},

	// Wave 22.8 reta-final — pre-expiry warning (D+10 de createdAt).
	// Mini-audit lead expira em D+14 (LEAD_TTL_DAYS); este email vai a
	// D+10, criando urgencia REAL ("expira em 4 dias"). Nao oferece
	// regeneracao gratis — o customer paga ou perde. Spam-fatigue baixo
	// porque eh apenas o segundo touch (24h + D+10), e o gatilho eh
	// timing real, nao manufacturing.
	mini_audit_pre_expiry: {
		"pt-BR": {
			sms: {
				body: "Seu diagnostico de {domain} expira em 4 dias — {hiddenCount} vazamentos ainda escondidos: {resultUrl}",
			},
			email: {
				subject: "Seu diagnostico de {domain} expira em 4 dias",
				headline: "Seu diagnostico expira em 4 dias",
				intro: "Você analisou <strong>{domain}</strong> dias atrás e descobriu <strong>{visibleCount} vazamentos</strong> custando até <strong>{impact}/mês</strong>. <p style=\"margin:14px 0 0 0;\">Em <strong>4 dias</strong> esse diagnóstico expira e sai do nosso sistema. <strong>{hiddenCount} vazamentos extras</strong> ficaram bloqueados ao público — eles estão prontos para você na sua conta Vestigio, junto com o plano mensal de correção.</p>",
				ctaLabel: "Ver os {hiddenCount} vazamentos escondidos",
				ctaPath: "{resultUrl}",
				footerNote: "Apos a expiracao, voce precisa reiniciar a analise do zero. Sem regerar automatico.",
			},
		},
		en: {
			sms: {
				body: "Your {domain} diagnosis expires in 4 days — {hiddenCount} leaks still hidden: {resultUrl}",
			},
			email: {
				subject: "Your {domain} diagnosis expires in 4 days",
				headline: "Your diagnosis expires in 4 days",
				intro: "You analyzed <strong>{domain}</strong> days ago and found <strong>{visibleCount} leaks</strong> costing up to <strong>{impact}/mo</strong>. <p style=\"margin:14px 0 0 0;\">In <strong>4 days</strong> this diagnosis expires and leaves our system. <strong>{hiddenCount} additional leaks</strong> stayed locked from public view — they're ready for you inside your Vestigio account, along with the monthly fix plan.</p>",
				ctaLabel: "See the {hiddenCount} hidden leaks",
				ctaPath: "{resultUrl}",
				footerNote: "After expiry, you'll need to restart the analysis from scratch. No automatic re-generation.",
			},
		},
		es: {
			sms: {
				body: "Tu diagnostico de {domain} expira en 4 dias — {hiddenCount} fugas aun ocultas: {resultUrl}",
			},
			email: {
				subject: "Tu diagnostico de {domain} expira en 4 dias",
				headline: "Tu diagnostico expira en 4 dias",
				intro: "Analizaste <strong>{domain}</strong> hace dias y encontraste <strong>{visibleCount} fugas</strong> costando hasta <strong>{impact}/mes</strong>. <p style=\"margin:14px 0 0 0;\">En <strong>4 dias</strong> este diagnostico expira y sale de nuestro sistema. <strong>{hiddenCount} fugas adicionales</strong> quedaron bloqueadas — estan listas para ti en tu cuenta Vestigio.</p>",
				ctaLabel: "Ver las {hiddenCount} fugas ocultas",
				ctaPath: "{resultUrl}",
				footerNote: "Despues de la expiracion, debes reiniciar el analisis desde cero.",
			},
		},
		de: {
			sms: {
				body: "Ihre {domain}-Diagnose lauft in 4 Tagen ab — {hiddenCount} versteckte Lecks: {resultUrl}",
			},
			email: {
				subject: "Ihre {domain}-Diagnose laeuft in 4 Tagen ab",
				headline: "Ihre Diagnose laeuft in 4 Tagen ab",
				intro: "Sie haben <strong>{domain}</strong> vor Tagen analysiert und <strong>{visibleCount} Lecks</strong> gefunden, die bis zu <strong>{impact}/Monat</strong> kosten. <p style=\"margin:14px 0 0 0;\">In <strong>4 Tagen</strong> laeuft diese Diagnose ab. <strong>{hiddenCount} weitere Lecks</strong> bleiben in Ihrem Vestigio-Konto bereit.</p>",
				ctaLabel: "Die {hiddenCount} versteckten Lecks ansehen",
				ctaPath: "{resultUrl}",
				footerNote: "Nach Ablauf muessen Sie die Analyse von vorne starten.",
			},
		},
	},

	inactivity_pause: {
		"pt-BR": {
			sms: {
				body: "Suas auditorias de {domain} foram pausadas por inatividade. Acesse app.vestigio.io para retomar.",
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
		en: {
			sms: {
				body: "Your {domain} audits have been paused due to inactivity. Visit app.vestigio.io to resume.",
			},
			email: {
				subject: "Audits paused for {domain}",
				headline: "Your continuous audits are paused",
				intro: "We haven't detected any activity on <strong>{domain}</strong> in the last 14 days, so continuous audits were paused automatically. No data has been deleted.",
				ctaLabel: "Resume audits",
				ctaPath: "/app",
				footerNote: "Audits resume automatically when you sign in. You can also change inactivity settings in your account preferences.",
			},
		},
		// TODO: Translate properly ��� currently stub copy of English
		es: {
			sms: {
				body: "Tus auditorias de {domain} fueron pausadas por inactividad. Visita app.vestigio.io para retomarlas.",
			},
			email: {
				subject: "Auditorias pausadas para {domain}",
				headline: "Tus auditorias continuas estan pausadas",
				intro: "No detectamos actividad en <strong>{domain}</strong> en los ultimos 14 dias, por lo que las auditorias continuas fueron pausadas automaticamente. Ningun dato fue eliminado.",
				ctaLabel: "Retomar auditorias",
				ctaPath: "/app",
				footerNote: "Las auditorias se reanudan automaticamente al iniciar sesion. Tambien puedes cambiar la configuracion de inactividad en las preferencias de tu cuenta.",
			},
		},
		// TODO: Translate properly — currently stub copy of English
		de: {
			sms: {
				body: "Ihre {domain}-Audits wurden wegen Inaktivitaet pausiert. Besuchen Sie app.vestigio.io zum Fortsetzen.",
			},
			email: {
				subject: "Audits pausiert fuer {domain}",
				headline: "Ihre kontinuierlichen Audits sind pausiert",
				intro: "Wir haben in den letzten 14 Tagen keine Aktivitaet auf <strong>{domain}</strong> festgestellt, daher wurden die kontinuierlichen Audits automatisch pausiert. Keine Daten wurden geloescht.",
				ctaLabel: "Audits fortsetzen",
				ctaPath: "/app",
				footerNote: "Audits werden automatisch fortgesetzt, wenn Sie sich anmelden. Sie koennen die Inaktivitaetseinstellungen auch in Ihren Kontoeinstellungen aendern.",
			},
		},
	},

	// ──────────────────────────────────────────────
	// PIX dunning templates (pt-BR only — MP is BR-only today).
	// Variables: planLabel, amount, dueDate, copyPasteCode, qrUrl
	// ──────────────────────────────────────────────

	pix_reminder_5d: {
		"pt-BR": {
			sms: {
				body: "Sua assinatura Vestigio {planLabel} vence em 5 dias. Pague o PIX em app.vestigio.io/app/billing",
			},
			email: {
				subject: "Sua renovação Vestigio vence em 5 dias",
				headline: "Renovação Vestigio em 5 dias",
				intro: "Sua assinatura <strong>{planLabel}</strong> vence em <strong>{dueDate}</strong>. Total: <strong>{amount}</strong>.<br/><br/>Pague o PIX já gerado na sua página de billing. Sem pagamento, a conta fica suspensa em 14 dias após o vencimento (seus dados ficam preservados).",
				ctaLabel: "Pagar agora",
				ctaPath: "/app/billing#pix-renewal",
				footerNote: "Você está recebendo este email porque tem uma assinatura ativa via PIX na Vestigio.",
			},
		},
	},

	pix_reminder_2d: {
		"pt-BR": {
			sms: {
				body: "ATENÇÃO: assinatura Vestigio {planLabel} vence em 2 dias. Pague o PIX em app.vestigio.io/app/billing",
			},
			email: {
				subject: "ATENÇÃO: sua renovação vence em 2 dias",
				headline: "Renovação Vestigio em 2 dias",
				intro: "Sua assinatura <strong>{planLabel}</strong> vence em <strong>{dueDate}</strong>. Total: <strong>{amount}</strong>.<br/><br/>Faltam apenas <strong>2 dias</strong>. Pague o PIX para evitar suspensão.",
				ctaLabel: "Pagar PIX",
				ctaPath: "/app/billing#pix-renewal",
				footerNote: "Sem pagamento, sua conta é suspensa 14 dias após o vencimento. Dados são preservados durante esse período.",
			},
		},
	},

	pix_reminder_today: {
		"pt-BR": {
			sms: {
				body: "URGENTE: assinatura Vestigio {planLabel} vence HOJE. Pague em app.vestigio.io/app/billing",
			},
			email: {
				subject: "URGENTE: sua renovação vence hoje",
				headline: "Renovação Vestigio vence hoje",
				intro: "Sua assinatura <strong>{planLabel}</strong> vence <strong>hoje</strong>. Total: <strong>{amount}</strong>.<br/><br/>Pague o PIX agora para manter sua conta ativa. Após 14 dias sem pagamento a conta fica suspensa.",
				ctaLabel: "Pagar PIX agora",
				ctaPath: "/app/billing#pix-renewal",
				footerNote: "Esta é a última lembrança automática antes do vencimento.",
			},
		},
	},

	pix_confirmed: {
		"pt-BR": {
			sms: {
				body: "PIX confirmado! Sua assinatura Vestigio {planLabel} foi renovada por mais 30 dias.",
			},
			email: {
				subject: "Pagamento confirmado — Vestigio {planLabel}",
				headline: "Pagamento confirmado",
				intro: "Recebemos seu PIX de <strong>{amount}</strong>. Sua assinatura <strong>{planLabel}</strong> foi renovada e segue ativa.<br/><br/>Próxima renovação: <strong>{nextDueDate}</strong>.",
				ctaLabel: "Ver detalhes da assinatura",
				ctaPath: "/app/billing",
				footerNote: "Obrigado por continuar com a Vestigio.",
			},
		},
	},

	value_caught_monthly: {
		"pt-BR": {
			sms: {
				body: "Vestigio: este mês detectamos R$ {amount} em problemas resolvidos. Veja o relatório completo no dashboard.",
			},
			email: {
				subject: "Vestigio capturou R$ {amount} este mês",
				headline: "Vestigio capturou R$ {amount} este mês",
				// Wave 20.6 — retention sentence inserts via {retentionBlock}.
				// The cron pre-builds the full HTML fragment (or "" for zero)
				// so we don't try to do mustache-style conditionals inside the
				// single-brace interpolator (which only handles {name} subs).
				intro: "Em {monthLabel}, <strong>{resolvedCount} problemas</strong> que poderiam estar custando ao seu negócio foram detectados e resolvidos.<br/><br/>Estimativa do valor capturado: <strong>R$ {amount}/mês</strong> (faixa: R$ {amountMin} a R$ {amountMax}).{retentionBlock}<br/><br/>O relatório completo mostra cada problema, o impacto estimado, e em qual ciclo foi resolvido.",
				ctaLabel: "Ver relatório completo",
				ctaPath: "/app/findings?status=resolved",
				footerNote: "Esta é uma estimativa baseada em benchmarks de conversão por categoria de problema. Você pode pausar este relatório nas configurações do ambiente.",
			},
		},
		en: {
			sms: {
				body: "Vestigio: this month we detected ${amount} worth of problems resolved. See the full report in your dashboard.",
			},
			email: {
				subject: "Vestigio caught ${amount} this month",
				headline: "Vestigio caught ${amount} this month",
				intro: "In {monthLabel}, <strong>{resolvedCount} problems</strong> that could have been costing your business were detected and resolved.<br/><br/>Estimated captured value: <strong>${amount}/month</strong> (range: ${amountMin} to ${amountMax}).{retentionBlock}<br/><br/>The full report shows each issue, its estimated impact, and which cycle it was resolved in.",
				ctaLabel: "View full report",
				ctaPath: "/app/findings?status=resolved",
				footerNote: "This is an estimate based on conversion benchmarks per problem category. You can pause this report in environment settings.",
			},
		},
	},

	// Wave 22.6 Step 7 — Monthly Strategy Plan ready notification.
	// Two narrative variants packed via {firstPlanLine} substitution:
	//   - First-ever plan for the env: "Sua primeira análise terminou..."
	//   - Recurring monthly: "Seu Plano de [mês] está pronto."
	// The trigger passes the appropriate string via vars.firstPlanLine.
	strategy_plan_ready: {
		"pt-BR": {
			sms: {
				body: "Vestigio: Seu Plano de Estratégia de {monthLabel} está pronto. Acesse o relatório completo no dashboard.",
			},
			email: {
				subject: "Seu Plano de Estratégia de {monthLabel} está pronto.",
				headline: "Plano de Estratégia · {monthLabel}",
				intro: "{firstPlanLine}<br/><br/>Esse mês: <strong>R$ {retainedAmount}/mo retidos</strong> · <strong>R$ {capturedAmount}/mo capturados</strong> · <strong>{criticalCount} findings críticos abertos</strong>.<br/><br/>O Plano condensa o mês em uma narrativa do que aconteceu, decompõe findings por time (copy, engenharia, liderança) e prioriza os próximos passos com reasoning + procedure.",
				ctaLabel: "Abrir Plano",
				ctaPath: "/app/library/strategy/{planMonth}",
				footerNote: "Cada Plano é gerado uma vez por mês. Você pode pausar esses emails nas preferências do ambiente.",
			},
		},
		en: {
			sms: {
				body: "Vestigio: Your {monthLabel} Strategy Plan is ready. View the full report in your dashboard.",
			},
			email: {
				subject: "Your {monthLabel} Strategy Plan is ready.",
				headline: "Strategy Plan · {monthLabel}",
				intro: "{firstPlanLine}<br/><br/>This month: <strong>${retainedAmount}/mo retained</strong> · <strong>${capturedAmount}/mo captured</strong> · <strong>{criticalCount} open critical findings</strong>.<br/><br/>The Plan condenses the month into a narrative of what happened, decomposes findings by team (copy, engineering, leadership), and prioritizes next steps with reasoning + procedure.",
				ctaLabel: "Open Plan",
				ctaPath: "/app/library/strategy/{planMonth}",
				footerNote: "Each Plan is generated once per month. You can pause these emails in environment settings.",
			},
		},
		es: {
			sms: {
				body: "Vestigio: Tu Plan de Estrategia de {monthLabel} está listo. Consulta el informe completo en tu dashboard.",
			},
			email: {
				subject: "Tu Plan de Estrategia de {monthLabel} está listo.",
				headline: "Plan de Estrategia · {monthLabel}",
				intro: "{firstPlanLine}<br/><br/>Este mes: <strong>${retainedAmount}/mes retenidos</strong> · <strong>${capturedAmount}/mes capturados</strong> · <strong>{criticalCount} hallazgos críticos abiertos</strong>.<br/><br/>El Plan condensa el mes en una narrativa de lo que sucedió, descompone los hallazgos por equipo y prioriza los próximos pasos.",
				ctaLabel: "Abrir Plan",
				ctaPath: "/app/library/strategy/{planMonth}",
				footerNote: "Cada Plan se genera una vez al mes. Puedes pausar estos correos en la configuración del entorno.",
			},
		},
		de: {
			sms: {
				body: "Vestigio: Dein Strategieplan für {monthLabel} ist fertig. Vollständiger Bericht im Dashboard.",
			},
			email: {
				subject: "Dein Strategieplan für {monthLabel} ist fertig.",
				headline: "Strategieplan · {monthLabel}",
				intro: "{firstPlanLine}<br/><br/>Diesen Monat: <strong>{retainedAmount} EUR/Monat gesichert</strong> · <strong>{capturedAmount} EUR/Monat zurückgewonnen</strong> · <strong>{criticalCount} offene kritische Befunde</strong>.<br/><br/>Der Plan fasst den Monat in einer Erzählung zusammen, gliedert die Befunde nach Team und priorisiert die nächsten Schritte.",
				ctaLabel: "Plan öffnen",
				ctaPath: "/app/library/strategy/{planMonth}",
				footerNote: "Jeder Plan wird einmal pro Monat erstellt. Sie können diese E-Mails in den Umgebungseinstellungen deaktivieren.",
			},
		},
	},

	welcome: {
		"pt-BR": {
			sms: {
				body: "Vestigio: bem-vinda(o). Sua primeira auditoria de {domain} começou. Te avisamos quando os primeiros findings caírem.",
			},
			email: {
				subject: "Bem-vinda(o) à Vestigio — sua primeira auditoria começou",
				headline: "Sua auditoria de {domain} já está rodando",
				intro: "Em ~60 segundos o primeiro relatório fica pronto. Cada finding traz um intervalo em reais e uma cadeia de evidências — não 'severity high' genérico.<br/><br/>Quando você abrir o Pulse, veremos juntos qual é o maior vazamento e o que fazer com ele.",
				ctaLabel: "Abrir Pulse",
				ctaPath: "/app/pulse",
				footerNote: "Se algo travar, responda este email e a gente olha.",
			},
		},
		en: {
			sms: {
				body: "Vestigio: welcome. Your first audit of {domain} just started. We'll ping you when the first findings land.",
			},
			email: {
				subject: "Welcome to Vestigio — your first audit just started",
				headline: "Your audit of {domain} is running",
				intro: "In ~60 seconds the first report lands. Every finding carries a dollar range and an evidence chain — not a generic 'high severity'.<br/><br/>When you open the Pulse, we'll show you the biggest leak and what to do about it.",
				ctaLabel: "Open Pulse",
				ctaPath: "/app/pulse",
				footerNote: "If anything stalls, reply to this email and we'll dig in.",
			},
		},
		es: {
			sms: {
				body: "Vestigio: bienvenido. Tu primera auditoría de {domain} ya empezó. Te avisamos cuando lleguen los primeros findings.",
			},
			email: {
				subject: "Bienvenido a Vestigio — tu primera auditoría empezó",
				headline: "Tu auditoría de {domain} está en marcha",
				intro: "En ~60 segundos llega el primer informe. Cada finding trae un rango en dinero y una cadena de evidencia — no un 'high severity' genérico.<br/><br/>Cuando abras el Pulse, te mostramos la mayor fuga y qué hacer con ella.",
				ctaLabel: "Abrir Pulse",
				ctaPath: "/app/pulse",
				footerNote: "Si algo se traba, responde a este correo y lo revisamos.",
			},
		},
		de: {
			sms: {
				body: "Vestigio: willkommen. Ihr erstes Audit von {domain} läuft. Wir melden uns, sobald die ersten Findings da sind.",
			},
			email: {
				subject: "Willkommen bei Vestigio — Ihr erstes Audit läuft",
				headline: "Ihr Audit von {domain} läuft",
				intro: "In ~60 Sekunden landet der erste Bericht. Jeder Finding bringt eine Geldspanne und eine Beweiskette — keine generische 'High Severity'.<br/><br/>Im Pulse zeigen wir Ihnen das größte Leck und was Sie tun sollten.",
				ctaLabel: "Pulse öffnen",
				ctaPath: "/app/pulse",
				footerNote: "Wenn etwas hängt, antworten Sie auf diese Mail und wir prüfen es.",
			},
		},
	},

	activation_celebrated: {
		"pt-BR": {
			sms: {
				body: "Vestigio: primeira ação marcada. ~{impactAmount}/mês em jogo — acompanhe o ciclo seguinte pra confirmar a recuperação.",
			},
			email: {
				subject: "Você acabou de marcar sua primeira ação",
				headline: "Primeira ação em progresso",
				intro: "Você marcou <strong>{actionTitle}</strong> como em progresso. Esse finding tem impacto estimado de <strong>~R$ {impactAmount}/mês</strong>.<br/><br/>Quando o próximo ciclo rodar, a gente confirma se o problema desapareceu e marca como capturado. Esse é o ciclo que prova ROI.",
				ctaLabel: "Ver fila de ações",
				ctaPath: "/app/actions",
				footerNote: "Próximo passo natural: convide alguém do time pra dividir a fila.",
			},
		},
		en: {
			sms: {
				body: "Vestigio: first action marked. ~{impactAmount}/mo at stake — watch the next cycle to confirm recovery.",
			},
			email: {
				subject: "You just marked your first action",
				headline: "First action in progress",
				intro: "You marked <strong>{actionTitle}</strong> as in progress. That finding has an estimated impact of <strong>~${impactAmount}/mo</strong>.<br/><br/>When the next cycle runs, we'll confirm whether the problem disappeared and mark it as captured. That's the cycle that proves ROI.",
				ctaLabel: "View action queue",
				ctaPath: "/app/actions",
				footerNote: "Natural next step: invite a teammate to share the queue.",
			},
		},
		es: {
			sms: {
				body: "Vestigio: primera acción marcada. ~{impactAmount}/mes en juego — sigue el próximo ciclo para confirmar la recuperación.",
			},
			email: {
				subject: "Marcaste tu primera acción",
				headline: "Primera acción en progreso",
				intro: "Marcaste <strong>{actionTitle}</strong> como en progreso. Ese finding tiene impacto estimado de <strong>~${impactAmount}/mes</strong>.<br/><br/>Cuando se ejecute el próximo ciclo, confirmamos si el problema desapareció y lo marcamos como capturado. Ese es el ciclo que prueba el ROI.",
				ctaLabel: "Ver cola de acciones",
				ctaPath: "/app/actions",
				footerNote: "Siguiente paso natural: invita a alguien del equipo a compartir la cola.",
			},
		},
		de: {
			sms: {
				body: "Vestigio: erste Aktion markiert. ~{impactAmount}/Mo im Spiel — beobachten Sie den nächsten Zyklus zur Bestätigung.",
			},
			email: {
				subject: "Sie haben Ihre erste Aktion markiert",
				headline: "Erste Aktion in Arbeit",
				intro: "Sie haben <strong>{actionTitle}</strong> als in Arbeit markiert. Dieser Finding hat einen geschätzten Impact von <strong>~{impactAmount} EUR/Monat</strong>.<br/><br/>Beim nächsten Zyklus prüfen wir, ob das Problem verschwunden ist und markieren es als erfasst. Genau der Zyklus, der ROI beweist.",
				ctaLabel: "Aktionsliste öffnen",
				ctaPath: "/app/actions",
				footerNote: "Nächster natürlicher Schritt: Laden Sie eine Kollegin ein, die Liste zu teilen.",
			},
		},
	},

	pix_suspended: {
		"pt-BR": {
			sms: {
				body: "Conta Vestigio suspensa por falta de pagamento. Reative em app.vestigio.io/app/billing — dados preservados.",
			},
			email: {
				subject: "Conta Vestigio suspensa — reative pagando o PIX",
				headline: "Sua conta foi suspensa",
				intro: "A renovação venceu há 14 dias sem confirmação de pagamento, então sua conta foi <strong>suspensa</strong> automaticamente.<br/><br/>Seus dados estão preservados. Para reativar, basta pagar o PIX da renovação.",
				ctaLabel: "Reativar conta",
				ctaPath: "/app/billing",
				footerNote: "Dados ficam preservados pelos próximos 60 dias. Após esse prazo, podem ser removidos definitivamente.",
			},
		},
	},

	// Post-paywall activation. Sent once when the MP webhook materializes
	// the buyer's org+membership after an approved Pix or card charge.
	paywall_activated: {
		"pt-BR": {
			sms: {
				body: "Vestigio: sua conta está ativa. Entre em app.vestigio.io",
			},
			email: {
				subject: "Sua conta Vestigio está ativa",
				headline: "Bem-vindo, {name}",
				intro:
					"Seu pagamento foi confirmado e sua conta Vestigio está pronta.<br/><br/>{auditClause}A primeira cobrança cobre o ciclo <strong>{cycleLabel}</strong>. Você pode cancelar a qualquer momento na página de cobrança.",
				ctaLabel: "Entrar no Vestigio",
				ctaPath: "/app",
				footerNote:
					"Garantia 4x — recupere 4× o valor pago em 90 dias ou devolvemos. Falamos com você se algo travar.",
			},
		},
		en: {
			sms: {
				body: "Vestigio: your account is active. Sign in at app.vestigio.io",
			},
			email: {
				subject: "Your Vestigio account is active",
				headline: "Welcome, {name}",
				intro:
					"Your payment cleared and your Vestigio account is ready.<br/><br/>{auditClause}Your first invoice covers the <strong>{cycleLabel}</strong> cycle. Cancel anytime from the billing page.",
				ctaLabel: "Sign in to Vestigio",
				ctaPath: "/app",
				footerNote:
					"4× guarantee — recover at least 4× what you paid in 90 days or we refund. We are here if anything sticks.",
			},
		},
		es: {
			sms: {
				body: "Vestigio: tu cuenta esta activa. Entra en app.vestigio.io",
			},
			email: {
				subject: "Tu cuenta Vestigio esta activa",
				headline: "Bienvenido, {name}",
				intro:
					"Tu pago se confirmo y tu cuenta Vestigio esta lista.<br/><br/>{auditClause}Tu primera factura cubre el ciclo <strong>{cycleLabel}</strong>. Puedes cancelar cuando quieras desde la pagina de facturacion.",
				ctaLabel: "Entrar en Vestigio",
				ctaPath: "/app",
				footerNote:
					"Garantia 4x — recupera 4x lo pagado en 90 dias o te lo devolvemos. Avisanos si algo no funciona.",
			},
		},
		de: {
			sms: {
				body: "Vestigio: dein Konto ist aktiv. Anmelden auf app.vestigio.io",
			},
			email: {
				subject: "Dein Vestigio-Konto ist aktiv",
				headline: "Willkommen, {name}",
				intro:
					"Deine Zahlung wurde bestaetigt und dein Vestigio-Konto ist bereit.<br/><br/>{auditClause}Die erste Rechnung deckt den Zyklus <strong>{cycleLabel}</strong>. Du kannst jederzeit ueber die Abrechnungsseite kuendigen.",
				ctaLabel: "In Vestigio anmelden",
				ctaPath: "/app",
				footerNote:
					"4x-Garantie — hol mindestens 4x deines Einsatzes in 90 Tagen zurueck oder wir erstatten. Melde dich, wenn etwas hakt.",
			},
		},
	},
};

// ──────────────────────────────────────────────
// Locale resolution helper
// ────────────────────────────��─────────────────

/**
 * Resolve the localized template for an event.
 * Fallback chain: requested locale -> en -> pt-BR
 */
function resolveTemplate(event: string, locale?: string | null): NotificationTemplate | null {
	const eventTemplates = TEMPLATES[event];
	if (!eventTemplates) return null;

	if (locale && eventTemplates[locale]) {
		return eventTemplates[locale];
	}

	// Try fallback chain
	for (const fallback of FALLBACK_CHAIN) {
		if (eventTemplates[fallback]) {
			return eventTemplates[fallback];
		}
	}

	// Last resort: return any available locale
	const keys = Object.keys(eventTemplates);
	return keys.length > 0 ? eventTemplates[keys[0]] : null;
}

// ───────────��──────────────────────────────────
// Public API
// ──────────────────────���───────────────────────

function interpolate(template: string, vars: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

// ──────────────────────────────────────────────
// Email template var types
//
// Two var shapes coexist in the same `vars` map:
//   - plain string: the value is treated as text and HTML-escaped
//     before being substituted into the email's intro / headline /
//     footer. This is the safe default for anything that ultimately
//     came from a database row, a user input, or an LLM output.
//   - rawHtml({ html: "<strong>...</strong>" }): the caller has
//     deliberately built an HTML fragment and wants it injected
//     unchanged. The wrapper is explicit so a future developer
//     can't forget to mark a value as "this is raw HTML" — every
//     non-wrapped value gets escaped, no exceptions.
//
// Previously this was a naming heuristic (keys ending in `Block` or
// `Html` were treated as raw). The heuristic was silent and fragile:
// adding a new var with `Block` in its name by accident would skip
// escaping, and forgetting the suffix on a var that SHOULD be raw
// would double-escape its HTML. The explicit wrapper trades a tiny
// bit of caller boilerplate for a type-system-enforceable contract.
// ──────────────────────────────────────────────

export interface RawHtmlValue {
	__rawHtml: true;
	html: string;
}

/** Wrap a string so it bypasses HTML escape during email interpolation. */
export function rawHtml(html: string): RawHtmlValue {
	return { __rawHtml: true, html };
}

function isRawHtmlValue(value: unknown): value is RawHtmlValue {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as RawHtmlValue).__rawHtml === true &&
		typeof (value as RawHtmlValue).html === "string"
	);
}

export type EmailVar = string | RawHtmlValue;
export type EmailVars = Record<string, EmailVar>;

// Build the interpolation vars to use for the email body — every
// plain-string var is HTML-escaped so a malicious value can't break
// out of the surrounding markup. RawHtmlValue wrappers pass through
// as their `html` payload because the caller has chosen the HTML
// deliberately.
function buildEmailEscapedVars(vars: EmailVars): Record<string, string> {
	const escaped: Record<string, string> = {};
	for (const [key, value] of Object.entries(vars)) {
		escaped[key] = isRawHtmlValue(value) ? value.html : escapeHtml(value);
	}
	return escaped;
}

// Subject + plain-text channels see the unwrapped raw value for HTML
// payloads (they aren't rendered as HTML downstream, so the tags would
// just be visible noise). The simpler "give me the raw text" view.
function unwrapVars(vars: EmailVars): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(vars)) {
		out[key] = isRawHtmlValue(value) ? value.html : value;
	}
	return out;
}

// Plain-text body builder: takes the rendered intro + subject and
// produces a readable plain-text fallback that preserves paragraph
// breaks (instead of joining everything into one wall of text). The
// previous version replaced every tag with empty string, losing the
// <br/><br/> paragraph separators.
function buildPlainText(headline: string, intro: string, ctaUrl: string): string {
	const body = intro
		// Paragraph-break tags become double newlines so the plain-text
		// body still reads as paragraphs.
		.replace(/<br\s*\/?>\s*<br\s*\/?>/gi, "\n\n")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
		.replace(/<\/?(p|div|h[1-6])[^>]*>/gi, "")
		// Strip everything else (strong, em, etc.).
		.replace(/<[^>]*>/g, "")
		// Normalize entities the escape pass introduced.
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ")
		.replace(/[ \t]+/g, " ")
		.replace(/\n[ \t]+/g, "\n")
		.trim();
	return `${headline}\n\n${body}\n\n${ctaUrl}`;
}

export function renderSmsFromTemplate(
	event: string,
	vars: EmailVars,
	locale?: string | null,
): string | null {
	const t = resolveTemplate(event, locale);
	if (!t) return null;
	// SMS is plain text — interpolate with unwrapped values (no HTML
	// escape, no raw-html marker visible).
	return interpolate(t.sms.body, unwrapVars(vars));
}

export function renderEmailFromTemplate(
	event: string,
	vars: EmailVars,
	baseUrl: string,
	locale?: string | null,
): { subject: string; html: string; text: string } | null {
	const t = resolveTemplate(event, locale);
	if (!t) return null;

	// Subjects + ctaPath are plain text (no HTML rendering involved),
	// so we want the un-escaped values in the email subject line.
	const plainVars = unwrapVars(vars);
	const subject = interpolate(t.email.subject, plainVars);
	const ctaPath = interpolate(t.email.ctaPath, plainVars);
	const ctaUrl = ctaPath.startsWith("http") ? ctaPath : `${baseUrl}${ctaPath}`;

	// Intro, headline, and footer ARE rendered inside HTML, so vars
	// have to be HTML-escaped before substitution. The exception is
	// rawHtml() wrappers, which pass their .html payload through
	// unchanged because the caller built it deliberately.
	const htmlVars = buildEmailEscapedVars(vars);
	const intro = interpolate(t.email.intro, htmlVars);
	const headline = interpolate(t.email.headline, htmlVars);
	const footerNote = interpolate(t.email.footerNote, htmlVars);

	// ctaLabel is interpolated too so templates can use {count}/{hiddenCount}
	// for action-rich buttons ("Ver os 10 vazamentos escondidos"). Plain text
	// (unescaped) because the button copy is rendered as plain text inside
	// the rendered HTML, not as nested HTML.
	const ctaLabel = interpolate(t.email.ctaLabel, plainVars);
	const html = renderBrandedEmail({
		headline,
		intro,
		ctaLabel,
		ctaUrl,
		footerNote,
		locale,
	});

	const text = buildPlainText(headline, intro, ctaUrl);

	return { subject, html, text };
}

export function getTemplate(event: string, locale?: string | null): NotificationTemplate | null {
	return resolveTemplate(event, locale);
}
