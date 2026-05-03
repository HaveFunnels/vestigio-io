import { renderBrandedEmail } from "@/libs/notifications";

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
				body: "[Vestigio] {count} problema(s) critico(s) em {domain}: {headline}. Veja em app.vestigio.io",
			},
			email: {
				subject: "[Vestigio] Incidente: {headline}",
				headline: "Incidente detectado",
				intro: "<strong>{headline}</strong>{rootCauseSuffix}.<br/><br/>A Vestigio acabou de analisar <strong>{domain}</strong> e identificou {count} problema(s) que precisam de atenção.",
				ctaLabel: "Ver na Vestigio",
				ctaPath: "/app/findings",
				footerNote: "Disparado pela auditoria de {domain}.",
			},
		},
		en: {
			sms: {
				body: "[Vestigio] {count} critical issue(s) on {domain}: {headline}. View at app.vestigio.io",
			},
			email: {
				subject: "[Vestigio] Incident: {headline}",
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
				body: "[Vestigio] {count} problema(s) critico(s) en {domain}: {headline}. Ver en app.vestigio.io",
			},
			email: {
				subject: "[Vestigio] Incidente: {headline}",
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
				body: "[Vestigio] {count} kritische(s) Problem(e) auf {domain}: {headline}. Ansehen auf app.vestigio.io",
			},
			email: {
				subject: "[Vestigio] Vorfall: {headline}",
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
				body: "[Vestigio] Regressão em {domain}: {headline}. {count} finding(s) pioraram. Veja em app.vestigio.io",
			},
			email: {
				subject: "[Vestigio] Regressão: {headline}",
				headline: "Regressão detectada",
				intro: "<strong>{headline}</strong> piorou desde a última auditoria.{rootCauseSuffix}<br/><br/>Total de regressões neste ciclo: <strong>{count}</strong>.",
				ctaLabel: "Ver change report",
				ctaPath: "/app/findings",
				footerNote: "Comparado com a auditoria anterior de {domain}.",
			},
		},
		en: {
			sms: {
				body: "[Vestigio] Regression on {domain}: {headline}. {count} finding(s) worsened. View at app.vestigio.io",
			},
			email: {
				subject: "[Vestigio] Regression: {headline}",
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
				body: "[Vestigio] Regresion en {domain}: {headline}. {count} hallazgo(s) empeoraron. Ver en app.vestigio.io",
			},
			email: {
				subject: "[Vestigio] Regresion: {headline}",
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
				body: "[Vestigio] Regression auf {domain}: {headline}. {count} Ergebnis(se) verschlechtert. Ansehen auf app.vestigio.io",
			},
			email: {
				subject: "[Vestigio] Regression: {headline}",
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
				body: "[Vestigio] Melhoria em {domain}: {headline} foi resolvido. Veja em app.vestigio.io",
			},
			email: {
				subject: "[Vestigio] Melhoria: {headline}",
				headline: "Melhoria confirmada",
				intro: "<strong>{headline}</strong> melhorou desde o último ciclo em <strong>{domain}</strong>.",
				ctaLabel: "Ver resultados",
				ctaPath: "/app/findings",
				footerNote: "Comparado com a auditoria anterior de {domain}.",
			},
		},
		en: {
			sms: {
				body: "[Vestigio] Improvement on {domain}: {headline} was resolved. View at app.vestigio.io",
			},
			email: {
				subject: "[Vestigio] Improvement: {headline}",
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
				body: "[Vestigio] Mejora en {domain}: {headline} fue resuelto. Ver en app.vestigio.io",
			},
			email: {
				subject: "[Vestigio] Mejora: {headline}",
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
				body: "[Vestigio] Verbesserung auf {domain}: {headline} wurde behoben. Ansehen auf app.vestigio.io",
			},
			email: {
				subject: "[Vestigio] Verbesserung: {headline}",
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
				body: "[Vestigio] Pagina fora do ar: {pageUrl}{statusSuffix}. Verifique agora.",
			},
			email: {
				subject: "[Vestigio] Pagina fora do ar: {pageUrl}",
				headline: "Uma página do seu site está fora do ar",
				intro: "A Vestigio detectou que <strong>{pageUrl}</strong> está inacessível.{statusDetail}{errorDetail}",
				ctaLabel: "Ver incidente",
				ctaPath: "/app/findings",
				footerNote: "Notificaremos novamente quando a página voltar.",
			},
		},
		en: {
			sms: {
				body: "[Vestigio] Page down: {pageUrl}{statusSuffix}. Check now.",
			},
			email: {
				subject: "[Vestigio] Page down: {pageUrl}",
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
				body: "[Vestigio] Pagina caida: {pageUrl}{statusSuffix}. Verifique ahora.",
			},
			email: {
				subject: "[Vestigio] Pagina caida: {pageUrl}",
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
				body: "[Vestigio] Seite nicht erreichbar: {pageUrl}{statusSuffix}. Jetzt pruefen.",
			},
			email: {
				subject: "[Vestigio] Seite nicht erreichbar: {pageUrl}",
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
		en: {
			sms: {
				body: "[Vestigio] Your access link: {link} — expires in 10 minutes.",
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
				body: "[Vestigio] Tu enlace de acceso: {link} — expira en 10 minutos.",
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
				body: "[Vestigio] Ihr Zugangslink: {link} — laeuft in 10 Minuten ab.",
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
		en: {
			sms: {
				body: "[Vestigio] Your {domain} diagnosis is ready. Activate your account: {link}",
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
				body: "[Vestigio] Tu diagnostico de {domain} esta listo. Activa tu cuenta: {link}",
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
				body: "[Vestigio] Ihre Diagnose fuer {domain} ist bereit. Aktivieren Sie Ihr Konto: {link}",
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
		en: {
			sms: {
				body: "[Vestigio] Password reset: {link} — expires in 1 hour.",
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
				body: "[Vestigio] Restablecer contrasena: {link} — expira en 1 hora.",
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
				body: "[Vestigio] Passwort zuruecksetzen: {link} — laeuft in 1 Stunde ab.",
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
		en: {
			sms: {
				body: "[Vestigio] {headline} resolved on {domain}. Recovered impact: {impact}. View at app.vestigio.io",
			},
			email: {
				subject: "[Vestigio] Resolved: {headline}",
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
				body: "[Vestigio] {headline} resuelto en {domain}. Impacto recuperado: {impact}. Ver en app.vestigio.io",
			},
			email: {
				subject: "[Vestigio] Resuelto: {headline}",
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
				body: "[Vestigio] {headline} behoben auf {domain}. Wiederhergestellte Auswirkung: {impact}. Ansehen auf app.vestigio.io",
			},
			email: {
				subject: "[Vestigio] Behoben: {headline}",
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
		en: {
			sms: {
				body: "[Vestigio] Diagnosis for {domain}: {count} leaks, {impact}/mo at risk. View: {resultUrl}",
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
				body: "[Vestigio] Diagnostico de {domain}: {count} fugas, {impact}/mes en riesgo. Ver: {resultUrl}",
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
				body: "[Vestigio] Diagnose fuer {domain}: {count} Lecks, {impact}/Monat gefaehrdet. Ansehen: {resultUrl}",
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

	inactivity_pause: {
		"pt-BR": {
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
		en: {
			sms: {
				body: "[Vestigio] Your {domain} audits have been paused due to inactivity. Visit app.vestigio.io to resume.",
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
				body: "[Vestigio] Tus auditorias de {domain} fueron pausadas por inactividad. Visita app.vestigio.io para retomarlas.",
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
				body: "[Vestigio] Ihre {domain}-Audits wurden wegen Inaktivitaet pausiert. Besuchen Sie app.vestigio.io zum Fortsetzen.",
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

export function renderSmsFromTemplate(
	event: string,
	vars: Record<string, string>,
	locale?: string | null,
): string | null {
	const t = resolveTemplate(event, locale);
	if (!t) return null;
	return interpolate(t.sms.body, vars);
}

export function renderEmailFromTemplate(
	event: string,
	vars: Record<string, string>,
	baseUrl: string,
	locale?: string | null,
): { subject: string; html: string; text: string } | null {
	const t = resolveTemplate(event, locale);
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

export function getTemplate(event: string, locale?: string | null): NotificationTemplate | null {
	return resolveTemplate(event, locale);
}
