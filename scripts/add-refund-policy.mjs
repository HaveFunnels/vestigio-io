// One-off script that injects the refund_policy namespace into each
// locale dictionary. Preserves tab indentation.
// Run: node scripts/add-refund-policy.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dictDir = resolve(here, "..", "dictionary");

// ── PT-BR (canonical) ─────────────────────────

const ptBR = {
	meta_title: "Política de Reembolso — Vestigio",
	meta_description:
		"Política de Reembolso da Vestigio. Entenda como são tratados pedidos de reembolso, cancelamento e contestação de cobrança.",
	heading: "Política de Reembolso",
	last_updated: "Última atualização: 14 de abril de 2026",
	intro:
		"Esta Política de Reembolso rege os pedidos de estorno, reembolso, cancelamento financeiro e tratamento de cobranças relativos aos Serviços da VESTIGIO TECNOLOGIA LTDA.",

	s1_title: "1. Regra geral",
	s1_body:
		"A Vestigio oferece serviços SaaS recorrentes, free trial, planos pagos e créditos de IA. Como regra geral:",
	s1_items: [
		"valores referentes a períodos já iniciados, utilizados, disponibilizados ou efetivamente usufruídos não são reembolsáveis;",
		"o que foi utilizado, foi utilizado;",
		"cancelamento não equivale automaticamente a reembolso;",
		"créditos de IA são tratados conforme regras específicas desta Política.",
	],

	s2_title: "2. Reembolso de planos mensais e anuais",
	s2_body_1:
		"O Cliente somente poderá ser elegível a reembolso de assinatura quando todas as condições abaixo forem cumulativamente atendidas:",
	s2_items: [
		"houver problema material, defeito relevante ou indisponibilidade imputável à própria Vestigio;",
		"o problema comprometer substancialmente o uso normal do Serviço contratado;",
		"o problema for reportado ao suporte pelo email support@vestigio.io com detalhes suficientes para análise;",
		"a Vestigio confirmar a existência do problema;",
		"a Vestigio não conseguir resolver o problema em até 72 (setenta e duas) horas a partir da validação inicial pelo suporte;",
		"o Cliente colaborar de boa-fé com a investigação, inclusive fornecendo informações, logs, prints, evidências e, quando razoavelmente necessário, meios técnicos para reprodução.",
	],
	s2_body_2:
		"Mesmo quando houver elegibilidade, o reembolso ficará limitado apenas ao período ainda não usufruído da assinatura.",
	s2_body_3:
		"Não haverá reembolso da parte do período já utilizada, disponibilizada ou efetivamente aproveitada pelo Cliente.",

	s3_title: "3. Situações em que não haverá reembolso",
	s3_body: "Não haverá reembolso quando o problema decorrer, total ou parcialmente, de:",
	s3_items: [
		"erro operacional do Cliente;",
		"má configuração;",
		"uso incompatível com a documentação;",
		"ambiente, domínio, loja, conta, integração, pixel ou snippet controlado pelo Cliente ou por terceiros;",
		"indisponibilidade, limitação, mudança ou bloqueio causado por terceiros;",
		"queda, falha ou limitação de integrações, plataformas ou APIs externas;",
		"uso abusivo, fraudulento ou não autorizado da plataforma;",
		"expectativa comercial frustrada sem defeito real do Serviço;",
		"interpretação subjetiva de outputs gerados por IA ou automação;",
		"tentativa de uso da plataforma em ativos sem autorização adequada.",
	],

	s4_title: "4. Créditos de IA",
	s4_body_1: "Os créditos de IA:",
	s4_items: [
		"são vinculados ao plano pago, salvo informação expressa em contrário;",
		"podem ser adquiridos, acumulados ou consumidos conforme regras do produto;",
		"não são reembolsáveis, inclusive quando não utilizados, salvo cobrança indevida ou exigência legal obrigatória em contrário.",
	],
	s4_body_2:
		"Uma vez disponibilizados para a conta, créditos de IA não serão devolvidos em dinheiro, estornados proporcionalmente nem convertidos em reembolso automático.",

	s5_title: "5. Free trial",
	s5_body:
		"Períodos de free trial, liberações promocionais, créditos promocionais, testes gratuitos ou acessos concedidos de forma experimental não geram direito a reembolso.",

	s6_title: "6. Cancelamento",
	s6_body:
		"O cancelamento da assinatura impede cobranças futuras relacionadas à renovação recorrente, mas não gera automaticamente reembolso de valores já cobrados.",

	s7_title: "7. Cobrança indevida ou duplicada",
	s7_body:
		"Se houver cobrança comprovadamente indevida, duplicada ou incorreta, a Vestigio poderá, a seu critério e conforme o caso:",
	s7_items: [
		"realizar estorno;",
		"conceder crédito;",
		"compensar o valor em ciclo futuro;",
		"corrigir administrativamente a cobrança.",
	],

	s8_title: "8. Procedimento para solicitação",
	s8_body:
		"Pedidos de reembolso ou contestação de cobrança devem ser enviados para support@vestigio.io com:",
	s8_items: [
		"nome da conta ou empresa;",
		"email cadastrado;",
		"comprovante ou referência da cobrança;",
		"descrição objetiva do problema;",
		"data aproximada da ocorrência;",
		"evidências razoáveis, quando aplicável.",
	],

	s9_title: "9. Forma de processamento",
	s9_body_1:
		"Quando aprovado, o reembolso poderá ser processado por meio do mesmo método de pagamento utilizado originalmente, por crédito, estorno, abatimento ou outro meio operacionalmente viável, inclusive via processador de pagamentos aplicável, como a Paddle.",
	s9_body_2:
		"Os prazos finais de liquidação podem depender de bancos, bandeiras, instituições financeiras e processadores terceiros.",

	s10_title: "10. Chargebacks e disputas",
	s10_body_1:
		"Antes de abrir chargeback, disputa bancária ou contestação junto ao processador de pagamento, o Cliente deve buscar solução administrativa com a Vestigio.",
	s10_body_2:
		"Chargebacks abusivos, indevidos ou incompatíveis com esta Política poderão resultar em suspensão da conta, encerramento do acesso e adoção das medidas cabíveis.",

	s11_title: "11. Contato",
	s11_body: "Email para suporte, reembolso e contestação de cobrança:",
	s11_email: "support@vestigio.io",
};

// ── EN ────────────────────────────────────────

const en = {
	meta_title: "Refund Policy — Vestigio",
	meta_description:
		"Vestigio Refund Policy. Understand how refund requests, cancellations, and billing disputes are handled.",
	heading: "Refund Policy",
	last_updated: "Last updated: April 14, 2026",
	translation_disclaimer:
		"This is a courtesy English translation of our Portuguese Refund Policy. In the event of any conflict or inconsistency between versions, the Portuguese version prevails.",
	intro:
		"This Refund Policy governs requests for reversal, refund, financial cancellation, and handling of charges related to the Services of VESTIGIO TECNOLOGIA LTDA.",

	s1_title: "1. General rule",
	s1_body:
		"Vestigio offers recurring SaaS services, free trial, paid plans, and AI credits. As a general rule:",
	s1_items: [
		"amounts related to periods already started, used, made available, or effectively enjoyed are not refundable;",
		"what has been used, has been used;",
		"cancellation does not automatically amount to a refund;",
		"AI credits are handled according to specific rules in this Policy.",
	],

	s2_title: "2. Refund of monthly and annual plans",
	s2_body_1:
		"The Customer may be eligible for a subscription refund only when all of the following conditions are cumulatively met:",
	s2_items: [
		"there is a material issue, relevant defect, or unavailability attributable to Vestigio itself;",
		"the issue substantially compromises normal use of the contracted Service;",
		"the issue is reported to support at support@vestigio.io with enough detail for analysis;",
		"Vestigio confirms the existence of the issue;",
		"Vestigio is unable to resolve the issue within 72 (seventy-two) hours from the initial support validation;",
		"the Customer cooperates in good faith with the investigation, including by providing information, logs, screenshots, evidence, and, when reasonably necessary, technical means for reproduction.",
	],
	s2_body_2:
		"Even when eligible, the refund will be limited only to the portion of the subscription not yet enjoyed.",
	s2_body_3:
		"There will be no refund for the portion of the period already used, made available, or effectively enjoyed by the Customer.",

	s3_title: "3. Situations in which no refund will be granted",
	s3_body:
		"No refund will be granted when the issue results, in whole or in part, from:",
	s3_items: [
		"operational error by the Customer;",
		"misconfiguration;",
		"use incompatible with the documentation;",
		"environment, domain, store, account, integration, pixel, or snippet controlled by the Customer or by third parties;",
		"unavailability, limitation, change, or blocking caused by third parties;",
		"outage, failure, or limitation of external integrations, platforms, or APIs;",
		"abusive, fraudulent, or unauthorized use of the platform;",
		"frustrated commercial expectation without an actual Service defect;",
		"subjective interpretation of outputs generated by AI or automation;",
		"attempt to use the platform on assets without adequate authorization.",
	],

	s4_title: "4. AI credits",
	s4_body_1: "AI credits:",
	s4_items: [
		"are tied to the paid plan, unless expressly stated otherwise;",
		"may be purchased, accumulated, or consumed according to product rules;",
		"are not refundable, including when unused, except for improper charges or a mandatory legal requirement to the contrary.",
	],
	s4_body_2:
		"Once made available to the account, AI credits will not be returned in cash, refunded proportionally, or converted into an automatic refund.",

	s5_title: "5. Free trial",
	s5_body:
		"Free trial periods, promotional releases, promotional credits, free tests, or experimentally granted access do not give rise to a right of refund.",

	s6_title: "6. Cancellation",
	s6_body:
		"Subscription cancellation prevents future charges related to recurring renewal but does not automatically generate a refund of amounts already charged.",

	s7_title: "7. Improper or duplicate charges",
	s7_body:
		"If there is a proven improper, duplicate, or incorrect charge, Vestigio may, at its discretion and as appropriate:",
	s7_items: [
		"perform a chargeback/reversal;",
		"grant a credit;",
		"offset the amount in a future cycle;",
		"administratively correct the charge.",
	],

	s8_title: "8. Procedure for requests",
	s8_body:
		"Refund requests or charge disputes must be sent to support@vestigio.io with:",
	s8_items: [
		"account or company name;",
		"registered email;",
		"proof or reference of the charge;",
		"objective description of the issue;",
		"approximate date of occurrence;",
		"reasonable evidence, when applicable.",
	],

	s9_title: "9. Processing method",
	s9_body_1:
		"When approved, the refund may be processed through the same payment method originally used, as credit, reversal, deduction, or any other operationally viable means, including via the applicable payment processor, such as Paddle.",
	s9_body_2:
		"Final settlement times may depend on banks, card networks, financial institutions, and third-party processors.",

	s10_title: "10. Chargebacks and disputes",
	s10_body_1:
		"Before opening a chargeback, bank dispute, or contestation with the payment processor, the Customer must seek an administrative resolution with Vestigio.",
	s10_body_2:
		"Abusive, improper, or Policy-inconsistent chargebacks may result in account suspension, termination of access, and adoption of applicable measures.",

	s11_title: "11. Contact",
	s11_body: "Email for support, refund, and charge disputes:",
	s11_email: "support@vestigio.io",
};

// ── ES ────────────────────────────────────────

const es = {
	meta_title: "Política de Reembolso — Vestigio",
	meta_description:
		"Política de Reembolso de Vestigio. Conozca cómo se tratan las solicitudes de reembolso, cancelación y disputas de facturación.",
	heading: "Política de Reembolso",
	last_updated: "Última actualización: 14 de abril de 2026",
	translation_disclaimer:
		"Esta es una traducción de cortesía de nuestra Política de Reembolso en portugués. En caso de conflicto o inconsistencia entre versiones, prevalece la versión en portugués.",
	intro:
		"Esta Política de Reembolso rige las solicitudes de reverso, reembolso, cancelación financiera y tratamiento de cobros relativos a los Servicios de VESTIGIO TECNOLOGIA LTDA.",

	s1_title: "1. Regla general",
	s1_body:
		"Vestigio ofrece servicios SaaS recurrentes, free trial, planes pagos y créditos de IA. Como regla general:",
	s1_items: [
		"los valores relativos a períodos ya iniciados, utilizados, puestos a disposición o efectivamente disfrutados no son reembolsables;",
		"lo que fue utilizado, fue utilizado;",
		"la cancelación no equivale automáticamente a reembolso;",
		"los créditos de IA se tratan según reglas específicas de esta Política.",
	],

	s2_title: "2. Reembolso de planes mensuales y anuales",
	s2_body_1:
		"El Cliente solo podrá ser elegible a reembolso de suscripción cuando todas las condiciones siguientes sean cumulativamente atendidas:",
	s2_items: [
		"haya un problema material, defecto relevante o indisponibilidad imputable a la propia Vestigio;",
		"el problema comprometa sustancialmente el uso normal del Servicio contratado;",
		"el problema sea reportado al soporte por el correo support@vestigio.io con detalles suficientes para análisis;",
		"Vestigio confirme la existencia del problema;",
		"Vestigio no logre resolver el problema en hasta 72 (setenta y dos) horas a partir de la validación inicial por el soporte;",
		"el Cliente colabore de buena fe con la investigación, incluso proporcionando información, logs, capturas, evidencias y, cuando sea razonablemente necesario, medios técnicos para reproducción.",
	],
	s2_body_2:
		"Incluso cuando haya elegibilidad, el reembolso quedará limitado únicamente al período aún no disfrutado de la suscripción.",
	s2_body_3:
		"No habrá reembolso de la parte del período ya utilizada, puesta a disposición o efectivamente aprovechada por el Cliente.",

	s3_title: "3. Situaciones en que no habrá reembolso",
	s3_body:
		"No habrá reembolso cuando el problema derive, total o parcialmente, de:",
	s3_items: [
		"error operativo del Cliente;",
		"mala configuración;",
		"uso incompatible con la documentación;",
		"entorno, dominio, tienda, cuenta, integración, píxel o snippet controlado por el Cliente o por terceros;",
		"indisponibilidad, limitación, cambio o bloqueo causado por terceros;",
		"caída, falla o limitación de integraciones, plataformas o APIs externas;",
		"uso abusivo, fraudulento o no autorizado de la plataforma;",
		"expectativa comercial frustrada sin defecto real del Servicio;",
		"interpretación subjetiva de outputs generados por IA o automatización;",
		"intento de uso de la plataforma en activos sin la debida autorización.",
	],

	s4_title: "4. Créditos de IA",
	s4_body_1: "Los créditos de IA:",
	s4_items: [
		"están vinculados al plan pago, salvo información expresa en contrario;",
		"pueden ser adquiridos, acumulados o consumidos conforme a las reglas del producto;",
		"no son reembolsables, incluso cuando no sean utilizados, salvo cobro indebido o exigencia legal obligatoria en contrario.",
	],
	s4_body_2:
		"Una vez puestos a disposición en la cuenta, los créditos de IA no serán devueltos en dinero, reintegrados proporcionalmente ni convertidos en reembolso automático.",

	s5_title: "5. Free trial",
	s5_body:
		"Períodos de free trial, liberaciones promocionales, créditos promocionales, pruebas gratuitas o accesos concedidos de forma experimental no generan derecho a reembolso.",

	s6_title: "6. Cancelación",
	s6_body:
		"La cancelación de la suscripción impide cobros futuros relacionados con la renovación recurrente, pero no genera automáticamente el reembolso de valores ya cobrados.",

	s7_title: "7. Cobro indebido o duplicado",
	s7_body:
		"Si hay un cobro comprobadamente indebido, duplicado o incorrecto, Vestigio podrá, a su criterio y según el caso:",
	s7_items: [
		"realizar reverso;",
		"conceder crédito;",
		"compensar el valor en ciclo futuro;",
		"corregir administrativamente el cobro.",
	],

	s8_title: "8. Procedimiento para solicitud",
	s8_body:
		"Las solicitudes de reembolso o disputa de cobro deben enviarse a support@vestigio.io con:",
	s8_items: [
		"nombre de la cuenta o empresa;",
		"correo electrónico registrado;",
		"comprobante o referencia del cobro;",
		"descripción objetiva del problema;",
		"fecha aproximada de la ocurrencia;",
		"evidencias razonables, cuando corresponda.",
	],

	s9_title: "9. Forma de procesamiento",
	s9_body_1:
		"Cuando sea aprobado, el reembolso podrá ser procesado por el mismo método de pago utilizado originalmente, por crédito, reverso, descuento u otro medio operativamente viable, incluso a través del procesador de pagos aplicable, como Paddle.",
	s9_body_2:
		"Los plazos finales de liquidación pueden depender de bancos, marcas, instituciones financieras y procesadores de terceros.",

	s10_title: "10. Chargebacks y disputas",
	s10_body_1:
		"Antes de abrir chargeback, disputa bancaria o contestación ante el procesador de pagos, el Cliente debe buscar solución administrativa con Vestigio.",
	s10_body_2:
		"Chargebacks abusivos, indebidos o incompatibles con esta Política podrán resultar en suspensión de la cuenta, terminación del acceso y adopción de las medidas correspondientes.",

	s11_title: "11. Contacto",
	s11_body: "Correo para soporte, reembolso y disputa de cobro:",
	s11_email: "support@vestigio.io",
};

// ── DE ────────────────────────────────────────

const de = {
	meta_title: "Rückerstattungsrichtlinie — Vestigio",
	meta_description:
		"Rückerstattungsrichtlinie von Vestigio. Erfahren Sie, wie Rückerstattungsanträge, Kündigungen und Abrechnungsstreitigkeiten behandelt werden.",
	heading: "Rückerstattungsrichtlinie",
	last_updated: "Zuletzt aktualisiert: 14. April 2026",
	translation_disclaimer:
		"Dies ist eine unverbindliche deutsche Übersetzung unserer portugiesischen Rückerstattungsrichtlinie. Bei Widersprüchen oder Abweichungen zwischen den Fassungen ist die portugiesische Fassung maßgeblich.",
	intro:
		"Diese Rückerstattungsrichtlinie regelt Anträge auf Stornierung, Rückerstattung, finanzielle Kündigung und die Behandlung von Abrechnungen im Zusammenhang mit den Diensten der VESTIGIO TECNOLOGIA LTDA.",

	s1_title: "1. Allgemeine Regel",
	s1_body:
		"Vestigio bietet wiederkehrende SaaS-Dienste, Free Trial, kostenpflichtige Tarife und KI-Credits. Als allgemeine Regel gilt:",
	s1_items: [
		"Beträge für bereits begonnene, genutzte, bereitgestellte oder effektiv in Anspruch genommene Zeiträume sind nicht erstattungsfähig;",
		"was genutzt wurde, ist genutzt;",
		"Kündigung entspricht nicht automatisch einer Rückerstattung;",
		"KI-Credits werden nach spezifischen Regeln dieser Richtlinie behandelt.",
	],

	s2_title: "2. Rückerstattung von Monats- und Jahrestarifen",
	s2_body_1:
		"Der Kunde kann nur dann Anspruch auf Rückerstattung eines Abonnements haben, wenn alle folgenden Bedingungen kumulativ erfüllt sind:",
	s2_items: [
		"es liegt ein wesentliches Problem, ein relevanter Mangel oder eine Nichtverfügbarkeit vor, die Vestigio selbst zuzurechnen ist;",
		"das Problem beeinträchtigt die normale Nutzung des beauftragten Dienstes wesentlich;",
		"das Problem wird dem Support per E-Mail an support@vestigio.io mit ausreichenden Details zur Analyse gemeldet;",
		"Vestigio bestätigt das Vorliegen des Problems;",
		"Vestigio kann das Problem nicht innerhalb von 72 (zweiundsiebzig) Stunden ab der ersten Validierung durch den Support lösen;",
		"der Kunde arbeitet in gutem Glauben bei der Untersuchung mit, einschließlich durch Bereitstellung von Informationen, Logs, Screenshots, Nachweisen und, soweit angemessen erforderlich, technischen Mitteln zur Reproduktion.",
	],
	s2_body_2:
		"Auch bei Anspruchsberechtigung ist die Rückerstattung auf den noch nicht in Anspruch genommenen Teil des Abonnements beschränkt.",
	s2_body_3:
		"Für den bereits genutzten, bereitgestellten oder vom Kunden effektiv in Anspruch genommenen Teil des Zeitraums erfolgt keine Rückerstattung.",

	s3_title: "3. Situationen, in denen keine Rückerstattung erfolgt",
	s3_body:
		"Eine Rückerstattung erfolgt nicht, wenn das Problem ganz oder teilweise auf Folgendes zurückzuführen ist:",
	s3_items: [
		"operativer Fehler des Kunden;",
		"Fehlkonfiguration;",
		"Nutzung, die mit der Dokumentation unvereinbar ist;",
		"Umgebung, Domain, Shop, Konto, Integration, Pixel oder Snippet, die vom Kunden oder von Dritten kontrolliert werden;",
		"Nichtverfügbarkeit, Einschränkung, Änderung oder Sperrung durch Dritte;",
		"Ausfall, Fehler oder Einschränkung externer Integrationen, Plattformen oder APIs;",
		"missbräuchliche, betrügerische oder unbefugte Nutzung der Plattform;",
		"enttäuschte kommerzielle Erwartung ohne tatsächlichen Mangel des Dienstes;",
		"subjektive Interpretation von Outputs, die durch KI oder Automatisierung erzeugt wurden;",
		"Versuch, die Plattform an Assets ohne angemessene Autorisierung zu nutzen.",
	],

	s4_title: "4. KI-Credits",
	s4_body_1: "KI-Credits:",
	s4_items: [
		"sind an den kostenpflichtigen Tarif gebunden, sofern nicht ausdrücklich anders angegeben;",
		"können gemäß den Produktregeln erworben, akkumuliert oder verbraucht werden;",
		"sind nicht erstattungsfähig, auch nicht, wenn sie nicht genutzt wurden, außer bei unzulässiger Abrechnung oder zwingender gesetzlicher Anforderung.",
	],
	s4_body_2:
		"Einmal dem Konto zur Verfügung gestellte KI-Credits werden weder in bar zurückerstattet noch anteilig erstattet oder automatisch in Rückerstattungen umgewandelt.",

	s5_title: "5. Free Trial",
	s5_body:
		"Free-Trial-Zeiträume, aktionsbedingte Freigaben, aktionsbedingte Credits, kostenlose Tests oder experimentell gewährte Zugänge begründen keinen Anspruch auf Rückerstattung.",

	s6_title: "6. Kündigung",
	s6_body:
		"Die Kündigung des Abonnements verhindert zukünftige Abrechnungen im Zusammenhang mit der wiederkehrenden Verlängerung, generiert jedoch nicht automatisch eine Rückerstattung bereits gezahlter Beträge.",

	s7_title: "7. Unzulässige oder doppelte Abrechnung",
	s7_body:
		"Bei einer nachweislich unzulässigen, doppelten oder fehlerhaften Abrechnung kann Vestigio nach eigenem Ermessen und je nach Fall:",
	s7_items: [
		"eine Rückbuchung vornehmen;",
		"ein Guthaben gewähren;",
		"den Betrag in einem zukünftigen Zyklus verrechnen;",
		"die Abrechnung administrativ korrigieren.",
	],

	s8_title: "8. Vorgehen bei Anträgen",
	s8_body:
		"Rückerstattungsanträge oder Abrechnungsbeanstandungen sind an support@vestigio.io zu senden, mit:",
	s8_items: [
		"Konto- oder Unternehmensname;",
		"registrierte E-Mail-Adresse;",
		"Nachweis oder Referenz der Abrechnung;",
		"sachliche Beschreibung des Problems;",
		"ungefähres Datum des Vorfalls;",
		"angemessene Nachweise, soweit zutreffend.",
	],

	s9_title: "9. Art der Abwicklung",
	s9_body_1:
		"Bei Genehmigung kann die Rückerstattung über dieselbe ursprünglich verwendete Zahlungsmethode, als Guthaben, Rückbuchung, Abzug oder auf andere betrieblich realisierbare Weise erfolgen, einschließlich über den jeweils anwendbaren Zahlungsabwickler, etwa Paddle.",
	s9_body_2:
		"Endgültige Abwicklungszeiträume können von Banken, Kreditkartenmarken, Finanzinstituten und Drittabwicklern abhängen.",

	s10_title: "10. Chargebacks und Streitfälle",
	s10_body_1:
		"Bevor ein Chargeback, eine Bankdisput oder eine Beanstandung beim Zahlungsabwickler eröffnet wird, muss der Kunde eine administrative Lösung mit Vestigio suchen.",
	s10_body_2:
		"Missbräuchliche, unzulässige oder mit dieser Richtlinie unvereinbare Chargebacks können zur Sperrung des Kontos, Beendigung des Zugangs und Ergreifung geeigneter Maßnahmen führen.",

	s11_title: "11. Kontakt",
	s11_body: "E-Mail für Support, Rückerstattung und Abrechnungsbeanstandungen:",
	s11_email: "support@vestigio.io",
};

// ── inject ────────────────────────────────────

function injectPolicy(filename, policy) {
	const path = resolve(dictDir, filename);
	const raw = readFileSync(path, "utf8");
	const dict = JSON.parse(raw);
	if (dict.refund_policy) {
		console.log(`[${filename}] refund_policy already present — overwriting`);
	}
	dict.refund_policy = policy;
	const out = JSON.stringify(dict, null, "\t") + "\n";
	writeFileSync(path, out, "utf8");
	console.log(`[${filename}] updated (${Object.keys(policy).length} keys)`);
}

injectPolicy("pt-BR.json", ptBR);
injectPolicy("en.json", en);
injectPolicy("es.json", es);
injectPolicy("de.json", de);

console.log("✓ done");
