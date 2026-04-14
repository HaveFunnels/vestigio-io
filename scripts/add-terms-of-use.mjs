// One-off script that injects the terms_of_use namespace into each
// locale dictionary. Preserves tab indentation.
// Run: node scripts/add-terms-of-use.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dictDir = resolve(here, "..", "dictionary");

// ── PT-BR (canonical) ─────────────────────────

const ptBR = {
	meta_title: "Termos de Uso — Vestigio",
	meta_description:
		"Termos de Uso da Vestigio. Leia as regras e condições que regem o uso da plataforma.",
	heading: "Termos de Uso",
	last_updated: "Última atualização: 14 de abril de 2026",
	intro_1:
		"Estes Termos de Uso (“Termos”) regem o acesso e uso dos Serviços oferecidos pela VESTIGIO TECNOLOGIA LTDA, inscrita no CNPJ sob o nº 65.445.297/0001-44, nome fantasia VESTIGIO TECNOLOGIA, com sede na Av. Prefeito Osmar Cunha, 416, Sala 1108, Centro, Florianópolis/SC, CEP 88.015-100 (“Vestigio”, “nós”, “nosso” ou “nossa”).",
	intro_2:
		"Ao acessar ou utilizar a Vestigio, você concorda com estes Termos. Se não concordar, não utilize os Serviços.",

	s1_title: "1. Definições",
	s1_body: "Para fins destes Termos:",
	s1_definitions: [
		{
			term: "Serviços",
			body: "a plataforma Vestigio, seus painéis, interfaces, APIs, pixels, snippets, integrações, análises, relatórios, findings, outputs, recursos de IA, planos, créditos e funcionalidades relacionadas;",
		},
		{
			term: "Conta",
			body: "cadastro individual ou corporativo utilizado para acessar os Serviços;",
		},
		{
			term: "Cliente",
			body: "pessoa física ou jurídica que contrata ou utiliza a Vestigio;",
		},
		{
			term: "Free Trial",
			body: "acesso temporário, promocional, condicional ou gratuito ao Serviço;",
		},
		{
			term: "Créditos de IA",
			body: "créditos pagos ou disponibilizados para uso em funcionalidades de inteligência artificial dentro da plataforma;",
		},
		{
			term: "Ativos Analisados",
			body: "domínios, subdomínios, URLs, páginas, lojas, apps, contas, integrações, pixels, snippets e demais ativos cadastrados ou conectados pelo Cliente.",
		},
	],

	s2_title: "2. Elegibilidade e conta",
	s2_body_1:
		"Você declara que possui capacidade legal para contratar e utilizar os Serviços.",
	s2_body_2: "Você concorda em:",
	s2_items: [
		"fornecer informações verdadeiras, precisas e atualizadas;",
		"manter a confidencialidade de suas credenciais;",
		"responder por toda atividade realizada em sua Conta;",
		"notificar a Vestigio em caso de uso não autorizado, incidente de segurança ou suspeita de comprometimento de acesso.",
	],
	s2_body_3:
		"A Vestigio poderá recusar cadastro, limitar acesso, exigir verificação adicional ou suspender contas quando houver indícios de fraude, abuso, risco operacional, inconsistência cadastral ou violação destes Termos.",

	s3_title: "3. Escopo dos Serviços",
	s3_body_1:
		"A Vestigio é uma plataforma de inteligência, observabilidade, análise digital, automação e suporte à decisão sobre ambientes digitais.",
	s3_body_2: "A Vestigio poderá, entre outras atividades:",
	s3_items_1: [
		"analisar ativos públicos na internet;",
		"observar estruturas visíveis via DOM, browser, DevTools, metadados e elementos públicos;",
		"executar interações automatizadas equivalentes às de um cliente ou usuário comum;",
		"processar dados provenientes de pixel, snippet ou integrações autorizadas;",
		"gerar outputs, insights, relatórios, findings, estimativas, respostas e recomendações com apoio de automação e inteligência artificial.",
	],
	s3_body_3: "A Vestigio não se qualifica, por si só, como:",
	s3_items_2: [
		"consultoria jurídica;",
		"consultoria contábil;",
		"auditoria legal independente;",
		"pentest formal contratado sob escopo específico;",
		"certificação regulatória;",
		"garantia de conformidade ou segurança absoluta;",
		"garantia de aprovação por plataformas terceiras, incluindo Meta, processadores de pagamento, marketplaces ou redes de anúncios.",
	],

	s4_title: "4. Responsabilidade do Cliente sobre ativos e integrações",
	s4_body_1: "Você é o único responsável por:",
	s4_items: [
		"cadastrar apenas Ativos Analisados para os quais possua autorização legítima;",
		"instalar pixels, snippets e integrações apenas em ambientes sob seu controle ou devidamente autorizados;",
		"garantir a licitude do uso da plataforma em sua operação;",
		"revisar os outputs gerados antes de tomar decisões críticas, comerciais, jurídicas, operacionais ou financeiras.",
	],
	s4_body_2:
		"A Vestigio não se responsabiliza por atos praticados por você fora da plataforma, nem por uso indevido dos Serviços em ativos de terceiros sem autorização.",

	s5_title: "5. Free Trial, planos e créditos de IA",
	s5_body_1: "A Vestigio poderá oferecer:",
	s5_items: [
		"free trial;",
		"planos mensais;",
		"planos anuais;",
		"créditos de IA;",
		"outros modelos comerciais que venha a disponibilizar futuramente.",
	],
	s5_body_2:
		"O free trial poderá ser disponibilizado apenas para usuários selecionados, por período limitado, sob critérios promocionais, comerciais ou estratégicos definidos exclusivamente pela Vestigio.",
	s5_body_3:
		"Créditos de IA poderão ser disponibilizados apenas a clientes com plano ativo, salvo se a Vestigio indicar expressamente o contrário.",
	s5_body_4:
		"Os preços, limites, franquias, políticas de consumo, validade, renovação, cobrança, upgrade e downgrade poderão constar em páginas comerciais, painéis, checkout, propostas, ordens de compra, emails ou documentação complementar.",

	s6_title: "6. Pagamentos",
	s6_body_1:
		"Os Serviços pagos são cobrados de forma antecipada, conforme o plano, ciclo, preço e condições vigentes no momento da contratação ou renovação.",
	s6_body_2:
		"A cobrança poderá ser processada pela Paddle e por parceiros ou processadores relacionados ao fluxo de pagamento.",
	s6_body_3:
		"Você autoriza a Vestigio e seus processadores de pagamento a realizar as cobranças devidas, inclusive recorrentes, quando houver renovação automática aplicável.",
	s6_body_4:
		"Tributos, encargos, tarifas bancárias, taxas cambiais e demais custos incidentes sobre a contratação e uso dos Serviços poderão ser cobrados de acordo com a legislação e regras do meio de pagamento utilizado.",

	s7_title: "7. Renovação, upgrade, downgrade e cancelamento",
	s7_body_1:
		"Salvo informação expressa em contrário, assinaturas poderão ser renovadas automaticamente ao final de cada ciclo de cobrança.",
	s7_body_2:
		"O cancelamento impede renovações futuras, mas não desfaz cobranças já realizadas, nem gera automaticamente reembolso de valores relativos a períodos já iniciados ou efetivamente usufruídos.",
	s7_body_3:
		"Eventuais regras de upgrade, downgrade, migração entre planos, créditos e ajustes de ciclo poderão ser definidas em documentação complementar ou nas telas do produto.",

	s8_title: "8. Uso permitido",
	s8_body:
		"Você concorda em utilizar os Serviços apenas para fins legítimos, autorizados e compatíveis com estes Termos.",

	s9_title: "9. Usos proibidos",
	s9_body: "É proibido:",
	s9_items: [
		"utilizar a Vestigio para fins ilegais, abusivos, fraudulentos ou não autorizados;",
		"cadastrar, analisar, conectar ou monitorar ativos sem autorização adequada;",
		"usar a plataforma para invadir, derrubar, explorar ou prejudicar terceiros;",
		"tentar contornar limites técnicos, de plano, de segurança ou de cobrança;",
		"realizar scraping abusivo contra a própria Vestigio;",
		"introduzir malware, código malicioso, automações hostis ou tráfego abusivo;",
		"fazer engenharia reversa, desmontagem, descompilação ou tentativa de extração do código, lógica interna, modelos, sistema ou infraestrutura da Vestigio, salvo quando a lei o permitir de forma inderrogável;",
		"copiar, revender, sublicenciar, distribuir, reproduzir ou explorar comercialmente a Vestigio sem autorização expressa por escrito;",
		"usar outputs, relatórios ou recomendações da plataforma para atividades ilegais ou que violem direitos de terceiros.",
	],

	s10_title: "10. Dados públicos, automação e IA",
	s10_body_1:
		"A Vestigio pode se basear em dados públicos, dados observáveis, automação, integrações, sinais probabilísticos e inteligência artificial para gerar outputs.",
	s10_body_2: "Você reconhece que:",
	s10_items: [
		"outputs podem conter erros, imprecisões, inferências, aproximações, falsos positivos, falsos negativos e variações de interpretação;",
		"a plataforma não substitui validação humana quando a decisão envolver risco relevante;",
		"nenhum output constitui aconselhamento jurídico, contábil, regulatório ou promessa de resultado.",
	],

	s11_title: "11. Suspensão e encerramento",
	s11_body:
		"A Vestigio poderá suspender, restringir ou encerrar contas, acessos, trials, créditos, integrações, pixels ou funcionalidades, com ou sem aviso prévio, quando houver:",
	s11_items: [
		"violação destes Termos;",
		"suspeita de fraude ou abuso;",
		"risco de segurança;",
		"inadimplência;",
		"determinação legal ou regulatória;",
		"uso incompatível com a estabilidade ou integridade da plataforma;",
		"tentativa de burlar limites, regras ou políticas da Vestigio;",
		"análise ou conexão de ativos de terceiros sem autorização adequada.",
	],

	s12_title: "12. Propriedade intelectual",
	s12_body_1:
		"Todos os direitos relativos à Vestigio, incluindo software, código, design, layout, marca, nome, logotipos, interfaces, documentação, metodologias, fluxos, estrutura de dados, outputs internos, know-how e elementos visuais pertencem à Vestigio ou a seus licenciadores.",
	s12_body_2:
		"O uso dos Serviços não transfere a você qualquer direito de propriedade intelectual, salvo o direito limitado, revogável, não exclusivo e intransferível de uso conforme estes Termos.",

	s13_title: "13. Confidencialidade e proteção operacional",
	s13_body:
		"Na medida aplicável, a Vestigio adotará salvaguardas razoáveis para proteger dados, credenciais, integrações e informações operacionais tratadas em seus Serviços. Você também deve adotar medidas razoáveis de proteção em sua operação, inclusive na gestão de acessos, instalação de pixels, configuração de integrações e uso dos outputs.",

	s14_title: "14. Isenções",
	s14_body:
		"Na máxima extensão permitida pela lei aplicável, os Serviços são fornecidos no estado em que se encontram e conforme disponibilidade. A Vestigio não garante:",
	s14_items: [
		"funcionamento ininterrupto;",
		"ausência de falhas ou incompatibilidades;",
		"ausência de erros em outputs;",
		"disponibilidade permanente de integrações ou terceiros;",
		"resultado comercial, financeiro, regulatório ou operacional específico;",
		"aprovação por terceiros;",
		"segurança absoluta;",
		"adequação do Serviço a qualquer finalidade particular não expressamente contratada.",
	],

	s15_title: "15. Limitação de responsabilidade",
	s15_body: "Na máxima extensão permitida pela legislação aplicável:",
	s15_items: [
		"a Vestigio não responderá por danos indiretos, incidentais, especiais, consequenciais, lucros cessantes, perda de receita, perda de oportunidade, perda de dados, danos reputacionais ou interrupção de negócios;",
		"a Vestigio não responderá por falhas, indisponibilidades, limitações ou decisões de terceiros, incluindo plataformas, integrações, redes, navegadores, hosts, processadores de pagamento, APIs e fornecedores;",
		"a Vestigio não responderá por atos praticados fora da plataforma, nem por decisões tomadas exclusivamente com base em outputs sem validação adequada do Cliente;",
		"a responsabilidade total e agregada da Vestigio, se reconhecida, ficará limitada ao valor efetivamente pago pelo Cliente à Vestigio nos 12 (doze) meses anteriores ao fato que originou a reclamação.",
	],

	s16_title: "16. Indenização",
	s16_body:
		"Você concorda em indenizar, defender e manter a Vestigio indene em relação a reclamações, perdas, custos, danos, despesas e responsabilidades decorrentes de:",
	s16_items: [
		"uso indevido dos Serviços;",
		"cadastro ou análise de ativos sem autorização;",
		"violação destes Termos;",
		"violação de direitos de terceiros;",
		"uso ilegal, fraudulento ou abusivo da plataforma.",
	],

	s17_title: "17. Alterações dos Serviços e destes Termos",
	s17_body_1:
		"A Vestigio poderá alterar, suspender, remover, evoluir ou descontinuar funcionalidades, integrações, planos, trials, créditos e demais elementos dos Serviços a qualquer tempo.",
	s17_body_2:
		"A Vestigio também poderá atualizar estes Termos. A versão mais recente será sempre a vigente a partir de sua publicação.",

	s18_title: "18. Lei aplicável e foro",
	s18_body_1: "Estes Termos serão regidos pelas leis da República Federativa do Brasil.",
	s18_body_2:
		"Fica eleito o foro da comarca de Florianópolis/SC, com exclusão de qualquer outro, por mais privilegiado que seja, ressalvadas as hipóteses de competência legal obrigatória.",

	s19_title: "19. Contato",
	s19_company: "VESTIGIO TECNOLOGIA LTDA",
	s19_cnpj: "CNPJ: 65.445.297/0001-44",
	s19_address:
		"Endereço: Av. Prefeito Osmar Cunha, 416, Sala 1108, Centro, Florianópolis/SC, CEP 88.015-100",
	s19_email: "support@vestigio.io",
};

// ── EN ────────────────────────────────────────

const en = {
	meta_title: "Terms of Use — Vestigio",
	meta_description:
		"Vestigio Terms of Use. Read the rules and conditions governing the use of the platform.",
	heading: "Terms of Use",
	last_updated: "Last updated: April 14, 2026",
	translation_disclaimer:
		"This is a courtesy English translation of our Portuguese Terms of Use. In the event of any conflict or inconsistency between versions, the Portuguese version prevails.",
	intro_1:
		"These Terms of Use (“Terms”) govern access to and use of the Services offered by VESTIGIO TECNOLOGIA LTDA, registered under CNPJ No. 65,445,297/0001-44, trading as VESTIGIO TECNOLOGIA, with headquarters at Av. Prefeito Osmar Cunha, 416, Sala 1108, Centro, Florianópolis/SC, ZIP 88015-100, Brazil (“Vestigio”, “we”, “our”, or “us”).",
	intro_2:
		"By accessing or using Vestigio, you agree to these Terms. If you do not agree, do not use the Services.",

	s1_title: "1. Definitions",
	s1_body: "For the purposes of these Terms:",
	s1_definitions: [
		{
			term: "Services",
			body: "the Vestigio platform, its dashboards, interfaces, APIs, pixels, snippets, integrations, analyses, reports, findings, outputs, AI features, plans, credits, and related functionalities;",
		},
		{
			term: "Account",
			body: "individual or corporate registration used to access the Services;",
		},
		{
			term: "Customer",
			body: "individual or legal entity that contracts or uses Vestigio;",
		},
		{
			term: "Free Trial",
			body: "temporary, promotional, conditional, or free access to the Service;",
		},
		{
			term: "AI Credits",
			body: "credits paid or made available for use in artificial intelligence features within the platform;",
		},
		{
			term: "Analyzed Assets",
			body: "domains, subdomains, URLs, pages, stores, apps, accounts, integrations, pixels, snippets, and other assets registered or connected by the Customer.",
		},
	],

	s2_title: "2. Eligibility and account",
	s2_body_1:
		"You represent that you have legal capacity to contract and use the Services.",
	s2_body_2: "You agree to:",
	s2_items: [
		"provide truthful, accurate, and up-to-date information;",
		"keep your credentials confidential;",
		"be responsible for all activity performed in your Account;",
		"notify Vestigio in the event of unauthorized use, security incident, or suspected access compromise.",
	],
	s2_body_3:
		"Vestigio may refuse registration, limit access, require additional verification, or suspend accounts when there is evidence of fraud, abuse, operational risk, registration inconsistency, or violation of these Terms.",

	s3_title: "3. Scope of Services",
	s3_body_1:
		"Vestigio is a platform for intelligence, observability, digital analysis, automation, and decision support regarding digital environments.",
	s3_body_2: "Vestigio may, among other activities:",
	s3_items_1: [
		"analyze publicly accessible assets on the internet;",
		"observe visible structures via DOM, browser, DevTools, metadata, and public elements;",
		"execute automated interactions equivalent to those of a regular customer or user;",
		"process data from pixel, snippet, or authorized integrations;",
		"generate outputs, insights, reports, findings, estimates, answers, and recommendations supported by automation and artificial intelligence.",
	],
	s3_body_3: "Vestigio does not qualify, by itself, as:",
	s3_items_2: [
		"legal consulting;",
		"accounting consulting;",
		"independent legal audit;",
		"formal penetration testing contracted under specific scope;",
		"regulatory certification;",
		"a guarantee of compliance or absolute security;",
		"a guarantee of approval by third-party platforms, including Meta, payment processors, marketplaces, or ad networks.",
	],

	s4_title: "4. Customer responsibility regarding assets and integrations",
	s4_body_1: "You are solely responsible for:",
	s4_items: [
		"registering only Analyzed Assets for which you hold legitimate authorization;",
		"installing pixels, snippets, and integrations only in environments under your control or duly authorized;",
		"ensuring the lawfulness of platform use in your operation;",
		"reviewing generated outputs before making critical, commercial, legal, operational, or financial decisions.",
	],
	s4_body_2:
		"Vestigio is not liable for acts performed by you outside the platform, nor for improper use of the Services on third-party assets without authorization.",

	s5_title: "5. Free Trial, plans, and AI credits",
	s5_body_1: "Vestigio may offer:",
	s5_items: [
		"free trial;",
		"monthly plans;",
		"annual plans;",
		"AI credits;",
		"other commercial models that may be offered in the future.",
	],
	s5_body_2:
		"Free trials may be offered only to selected users, for a limited period, under promotional, commercial, or strategic criteria defined exclusively by Vestigio.",
	s5_body_3:
		"AI credits may be made available only to customers with an active plan, unless Vestigio expressly indicates otherwise.",
	s5_body_4:
		"Prices, limits, allowances, consumption policies, validity, renewal, billing, upgrade, and downgrade rules may be set out in commercial pages, dashboards, checkout, proposals, purchase orders, emails, or supporting documentation.",

	s6_title: "6. Payments",
	s6_body_1:
		"Paid Services are charged in advance according to the plan, cycle, price, and conditions in force at the time of contracting or renewal.",
	s6_body_2:
		"Billing may be processed by Paddle and by partners or processors involved in the payment flow.",
	s6_body_3:
		"You authorize Vestigio and its payment processors to charge amounts due, including recurring charges when automatic renewal applies.",
	s6_body_4:
		"Taxes, charges, bank fees, foreign exchange fees, and other costs incident to the contracting and use of the Services may be charged in accordance with applicable law and the rules of the payment method used.",

	s7_title: "7. Renewal, upgrade, downgrade, and cancellation",
	s7_body_1:
		"Unless expressly stated otherwise, subscriptions may be automatically renewed at the end of each billing cycle.",
	s7_body_2:
		"Cancellation prevents future renewals but does not undo charges already made, nor does it automatically generate refunds for amounts relating to periods already started or effectively used.",
	s7_body_3:
		"Any rules on upgrade, downgrade, plan migration, credits, and cycle adjustments may be defined in supporting documentation or product screens.",

	s8_title: "8. Permitted use",
	s8_body:
		"You agree to use the Services only for lawful, authorized purposes compatible with these Terms.",

	s9_title: "9. Prohibited uses",
	s9_body: "It is prohibited to:",
	s9_items: [
		"use Vestigio for illegal, abusive, fraudulent, or unauthorized purposes;",
		"register, analyze, connect, or monitor assets without adequate authorization;",
		"use the platform to intrude, disrupt, exploit, or harm third parties;",
		"attempt to circumvent technical, plan, security, or billing limits;",
		"engage in abusive scraping against Vestigio itself;",
		"introduce malware, malicious code, hostile automation, or abusive traffic;",
		"reverse engineer, disassemble, decompile, or attempt to extract code, internal logic, models, system, or infrastructure of Vestigio, except where law mandatorily permits;",
		"copy, resell, sublicense, distribute, reproduce, or commercially exploit Vestigio without express written authorization;",
		"use outputs, reports, or recommendations from the platform for illegal activities or activities that violate third-party rights.",
	],

	s10_title: "10. Public data, automation, and AI",
	s10_body_1:
		"Vestigio may rely on public data, observable data, automation, integrations, probabilistic signals, and artificial intelligence to generate outputs.",
	s10_body_2: "You acknowledge that:",
	s10_items: [
		"outputs may contain errors, inaccuracies, inferences, approximations, false positives, false negatives, and variations in interpretation;",
		"the platform does not replace human validation when decisions involve significant risk;",
		"no output constitutes legal, accounting, or regulatory advice, nor a promise of results.",
	],

	s11_title: "11. Suspension and termination",
	s11_body:
		"Vestigio may suspend, restrict, or terminate accounts, access, trials, credits, integrations, pixels, or functionalities, with or without prior notice, when there is:",
	s11_items: [
		"violation of these Terms;",
		"suspicion of fraud or abuse;",
		"security risk;",
		"default on payment;",
		"legal or regulatory determination;",
		"use incompatible with the stability or integrity of the platform;",
		"attempt to circumvent limits, rules, or policies of Vestigio;",
		"analysis or connection of third-party assets without adequate authorization.",
	],

	s12_title: "12. Intellectual property",
	s12_body_1:
		"All rights related to Vestigio, including software, code, design, layout, brand, name, logos, interfaces, documentation, methodologies, flows, data structure, internal outputs, know-how, and visual elements belong to Vestigio or its licensors.",
	s12_body_2:
		"Use of the Services does not transfer to you any intellectual property rights, except the limited, revocable, non-exclusive, and non-transferable right to use in accordance with these Terms.",

	s13_title: "13. Confidentiality and operational protection",
	s13_body:
		"To the extent applicable, Vestigio will adopt reasonable safeguards to protect data, credentials, integrations, and operational information processed in its Services. You must also adopt reasonable protection measures in your operation, including access management, pixel installation, integration configuration, and use of outputs.",

	s14_title: "14. Disclaimers",
	s14_body:
		"To the maximum extent permitted by applicable law, the Services are provided as-is and as-available. Vestigio does not guarantee:",
	s14_items: [
		"uninterrupted operation;",
		"absence of failures or incompatibilities;",
		"absence of errors in outputs;",
		"permanent availability of integrations or third parties;",
		"specific commercial, financial, regulatory, or operational results;",
		"approval by third parties;",
		"absolute security;",
		"suitability of the Service for any particular purpose not expressly contracted.",
	],

	s15_title: "15. Limitation of liability",
	s15_body: "To the maximum extent permitted by applicable law:",
	s15_items: [
		"Vestigio will not be liable for indirect, incidental, special, consequential damages, lost profits, loss of revenue, loss of opportunity, loss of data, reputational damages, or business interruption;",
		"Vestigio will not be liable for failures, unavailability, limitations, or decisions of third parties, including platforms, integrations, networks, browsers, hosts, payment processors, APIs, and suppliers;",
		"Vestigio will not be liable for acts performed outside the platform, nor for decisions made solely based on outputs without adequate Customer validation;",
		"Vestigio's total aggregate liability, if recognized, will be limited to the amount effectively paid by the Customer to Vestigio in the 12 (twelve) months preceding the event that gave rise to the claim.",
	],

	s16_title: "16. Indemnification",
	s16_body:
		"You agree to indemnify, defend, and hold Vestigio harmless from claims, losses, costs, damages, expenses, and liabilities arising from:",
	s16_items: [
		"improper use of the Services;",
		"registration or analysis of assets without authorization;",
		"violation of these Terms;",
		"violation of third-party rights;",
		"illegal, fraudulent, or abusive use of the platform.",
	],

	s17_title: "17. Changes to the Services and these Terms",
	s17_body_1:
		"Vestigio may change, suspend, remove, evolve, or discontinue functionalities, integrations, plans, trials, credits, and other elements of the Services at any time.",
	s17_body_2:
		"Vestigio may also update these Terms. The most recent version will always be the one in force from the moment of its publication.",

	s18_title: "18. Governing law and venue",
	s18_body_1:
		"These Terms will be governed by the laws of the Federative Republic of Brazil.",
	s18_body_2:
		"The forum of the judicial district of Florianópolis/SC is elected as the exclusive venue, waiving any other however privileged, except for cases of mandatory legal jurisdiction.",

	s19_title: "19. Contact",
	s19_company: "VESTIGIO TECNOLOGIA LTDA",
	s19_cnpj: "CNPJ: 65.445.297/0001-44",
	s19_address:
		"Address: Av. Prefeito Osmar Cunha, 416, Sala 1108, Centro, Florianópolis/SC, ZIP 88015-100, Brazil",
	s19_email: "support@vestigio.io",
};

// ── ES ────────────────────────────────────────

const es = {
	meta_title: "Términos de Uso — Vestigio",
	meta_description:
		"Términos de Uso de Vestigio. Lea las reglas y condiciones que rigen el uso de la plataforma.",
	heading: "Términos de Uso",
	last_updated: "Última actualización: 14 de abril de 2026",
	translation_disclaimer:
		"Esta es una traducción de cortesía de nuestros Términos de Uso en portugués. En caso de conflicto o inconsistencia entre versiones, prevalece la versión en portugués.",
	intro_1:
		"Estos Términos de Uso (“Términos”) rigen el acceso y uso de los Servicios ofrecidos por VESTIGIO TECNOLOGIA LTDA, inscrita en el CNPJ con el nº 65.445.297/0001-44, nombre comercial VESTIGIO TECNOLOGIA, con sede en Av. Prefeito Osmar Cunha, 416, Sala 1108, Centro, Florianópolis/SC, CEP 88.015-100, Brasil (“Vestigio”, “nosotros”, “nuestro” o “nuestra”).",
	intro_2:
		"Al acceder o utilizar Vestigio, usted acepta estos Términos. Si no está de acuerdo, no utilice los Servicios.",

	s1_title: "1. Definiciones",
	s1_body: "A los efectos de estos Términos:",
	s1_definitions: [
		{
			term: "Servicios",
			body: "la plataforma Vestigio, sus paneles, interfaces, APIs, píxeles, snippets, integraciones, análisis, informes, findings, outputs, recursos de IA, planes, créditos y funcionalidades relacionadas;",
		},
		{
			term: "Cuenta",
			body: "registro individual o corporativo utilizado para acceder a los Servicios;",
		},
		{
			term: "Cliente",
			body: "persona física o jurídica que contrata o utiliza Vestigio;",
		},
		{
			term: "Free Trial",
			body: "acceso temporal, promocional, condicional o gratuito al Servicio;",
		},
		{
			term: "Créditos de IA",
			body: "créditos pagados o puestos a disposición para su uso en funcionalidades de inteligencia artificial dentro de la plataforma;",
		},
		{
			term: "Activos Analizados",
			body: "dominios, subdominios, URLs, páginas, tiendas, apps, cuentas, integraciones, píxeles, snippets y demás activos registrados o conectados por el Cliente.",
		},
	],

	s2_title: "2. Elegibilidad y cuenta",
	s2_body_1:
		"Usted declara que posee capacidad legal para contratar y utilizar los Servicios.",
	s2_body_2: "Usted se compromete a:",
	s2_items: [
		"proporcionar información veraz, precisa y actualizada;",
		"mantener la confidencialidad de sus credenciales;",
		"responder por toda actividad realizada en su Cuenta;",
		"notificar a Vestigio en caso de uso no autorizado, incidente de seguridad o sospecha de compromiso de acceso.",
	],
	s2_body_3:
		"Vestigio podrá rechazar registros, limitar el acceso, exigir verificación adicional o suspender cuentas cuando haya indicios de fraude, abuso, riesgo operativo, inconsistencia de registro o violación de estos Términos.",

	s3_title: "3. Alcance de los Servicios",
	s3_body_1:
		"Vestigio es una plataforma de inteligencia, observabilidad, análisis digital, automatización y apoyo a la decisión sobre entornos digitales.",
	s3_body_2: "Vestigio podrá, entre otras actividades:",
	s3_items_1: [
		"analizar activos públicos en internet;",
		"observar estructuras visibles a través de DOM, navegador, DevTools, metadatos y elementos públicos;",
		"ejecutar interacciones automatizadas equivalentes a las de un cliente o usuario común;",
		"procesar datos provenientes de píxel, snippet o integraciones autorizadas;",
		"generar outputs, insights, informes, findings, estimaciones, respuestas y recomendaciones con apoyo de automatización e inteligencia artificial.",
	],
	s3_body_3: "Vestigio no se califica, por sí sola, como:",
	s3_items_2: [
		"consultoría jurídica;",
		"consultoría contable;",
		"auditoría legal independiente;",
		"pentest formal contratado con alcance específico;",
		"certificación regulatoria;",
		"garantía de conformidad o seguridad absoluta;",
		"garantía de aprobación por plataformas de terceros, incluyendo Meta, procesadores de pago, marketplaces o redes de anuncios.",
	],

	s4_title: "4. Responsabilidad del Cliente sobre activos e integraciones",
	s4_body_1: "Usted es el único responsable de:",
	s4_items: [
		"registrar únicamente Activos Analizados para los cuales posea autorización legítima;",
		"instalar píxeles, snippets e integraciones únicamente en entornos bajo su control o debidamente autorizados;",
		"garantizar la licitud del uso de la plataforma en su operación;",
		"revisar los outputs generados antes de tomar decisiones críticas, comerciales, jurídicas, operativas o financieras.",
	],
	s4_body_2:
		"Vestigio no se responsabiliza por actos practicados por usted fuera de la plataforma, ni por el uso indebido de los Servicios en activos de terceros sin autorización.",

	s5_title: "5. Free Trial, planes y créditos de IA",
	s5_body_1: "Vestigio podrá ofrecer:",
	s5_items: [
		"free trial;",
		"planes mensuales;",
		"planes anuales;",
		"créditos de IA;",
		"otros modelos comerciales que ponga a disposición en el futuro.",
	],
	s5_body_2:
		"El free trial podrá ponerse a disposición únicamente para usuarios seleccionados, por un período limitado, bajo criterios promocionales, comerciales o estratégicos definidos exclusivamente por Vestigio.",
	s5_body_3:
		"Los créditos de IA podrán estar disponibles únicamente para clientes con plan activo, salvo que Vestigio indique expresamente lo contrario.",
	s5_body_4:
		"Los precios, límites, franquicias, políticas de consumo, validez, renovación, facturación, upgrade y downgrade podrán figurar en páginas comerciales, paneles, checkout, propuestas, órdenes de compra, correos electrónicos o documentación complementaria.",

	s6_title: "6. Pagos",
	s6_body_1:
		"Los Servicios pagos se cobran de forma anticipada, conforme al plan, ciclo, precio y condiciones vigentes en el momento de la contratación o renovación.",
	s6_body_2:
		"La facturación podrá ser procesada por Paddle y por socios o procesadores relacionados con el flujo de pago.",
	s6_body_3:
		"Usted autoriza a Vestigio y a sus procesadores de pago a realizar los cobros correspondientes, incluidos los recurrentes, cuando aplique la renovación automática.",
	s6_body_4:
		"Impuestos, cargos, tarifas bancarias, tasas cambiarias y demás costos incidentes sobre la contratación y el uso de los Servicios podrán cobrarse de acuerdo con la legislación y reglas del medio de pago utilizado.",

	s7_title: "7. Renovación, upgrade, downgrade y cancelación",
	s7_body_1:
		"Salvo indicación expresa en contrario, las suscripciones podrán renovarse automáticamente al final de cada ciclo de facturación.",
	s7_body_2:
		"La cancelación impide renovaciones futuras, pero no deshace cobros ya realizados, ni genera automáticamente reembolso de valores relativos a períodos ya iniciados o efectivamente disfrutados.",
	s7_body_3:
		"Eventuales reglas de upgrade, downgrade, migración entre planes, créditos y ajustes de ciclo podrán definirse en documentación complementaria o en las pantallas del producto.",

	s8_title: "8. Uso permitido",
	s8_body:
		"Usted se compromete a utilizar los Servicios únicamente para fines legítimos, autorizados y compatibles con estos Términos.",

	s9_title: "9. Usos prohibidos",
	s9_body: "Está prohibido:",
	s9_items: [
		"utilizar Vestigio para fines ilegales, abusivos, fraudulentos o no autorizados;",
		"registrar, analizar, conectar o monitorear activos sin la debida autorización;",
		"usar la plataforma para invadir, derribar, explotar o perjudicar a terceros;",
		"intentar eludir límites técnicos, de plan, de seguridad o de facturación;",
		"realizar scraping abusivo contra la propia Vestigio;",
		"introducir malware, código malicioso, automatizaciones hostiles o tráfico abusivo;",
		"realizar ingeniería inversa, desmontaje, descompilación o intento de extracción del código, lógica interna, modelos, sistema o infraestructura de Vestigio, salvo cuando la ley lo permita de forma inderogable;",
		"copiar, revender, sublicenciar, distribuir, reproducir o explotar comercialmente Vestigio sin autorización expresa por escrito;",
		"usar outputs, informes o recomendaciones de la plataforma para actividades ilegales o que violen derechos de terceros.",
	],

	s10_title: "10. Datos públicos, automatización e IA",
	s10_body_1:
		"Vestigio puede basarse en datos públicos, datos observables, automatización, integraciones, señales probabilísticas e inteligencia artificial para generar outputs.",
	s10_body_2: "Usted reconoce que:",
	s10_items: [
		"los outputs pueden contener errores, imprecisiones, inferencias, aproximaciones, falsos positivos, falsos negativos y variaciones de interpretación;",
		"la plataforma no sustituye la validación humana cuando la decisión implique un riesgo relevante;",
		"ningún output constituye asesoramiento jurídico, contable, regulatorio ni promesa de resultado.",
	],

	s11_title: "11. Suspensión y terminación",
	s11_body:
		"Vestigio podrá suspender, restringir o terminar cuentas, accesos, trials, créditos, integraciones, píxeles o funcionalidades, con o sin aviso previo, cuando haya:",
	s11_items: [
		"violación de estos Términos;",
		"sospecha de fraude o abuso;",
		"riesgo de seguridad;",
		"impago;",
		"determinación legal o regulatoria;",
		"uso incompatible con la estabilidad o integridad de la plataforma;",
		"intento de eludir límites, reglas o políticas de Vestigio;",
		"análisis o conexión de activos de terceros sin la debida autorización.",
	],

	s12_title: "12. Propiedad intelectual",
	s12_body_1:
		"Todos los derechos relativos a Vestigio, incluyendo software, código, diseño, layout, marca, nombre, logotipos, interfaces, documentación, metodologías, flujos, estructura de datos, outputs internos, know-how y elementos visuales pertenecen a Vestigio o a sus licenciadores.",
	s12_body_2:
		"El uso de los Servicios no le transfiere ningún derecho de propiedad intelectual, salvo el derecho limitado, revocable, no exclusivo e intransferible de uso conforme a estos Términos.",

	s13_title: "13. Confidencialidad y protección operativa",
	s13_body:
		"En la medida aplicable, Vestigio adoptará salvaguardas razonables para proteger datos, credenciales, integraciones e información operativa tratada en sus Servicios. Usted también debe adoptar medidas razonables de protección en su operación, incluso en la gestión de accesos, instalación de píxeles, configuración de integraciones y uso de los outputs.",

	s14_title: "14. Exenciones",
	s14_body:
		"En la máxima medida permitida por la ley aplicable, los Servicios se prestan tal cual y según disponibilidad. Vestigio no garantiza:",
	s14_items: [
		"funcionamiento ininterrumpido;",
		"ausencia de fallas o incompatibilidades;",
		"ausencia de errores en los outputs;",
		"disponibilidad permanente de integraciones o terceros;",
		"resultado comercial, financiero, regulatorio u operativo específico;",
		"aprobación por parte de terceros;",
		"seguridad absoluta;",
		"adecuación del Servicio a cualquier finalidad particular no expresamente contratada.",
	],

	s15_title: "15. Limitación de responsabilidad",
	s15_body: "En la máxima medida permitida por la legislación aplicable:",
	s15_items: [
		"Vestigio no responderá por daños indirectos, incidentales, especiales, consecuenciales, lucro cesante, pérdida de ingresos, pérdida de oportunidad, pérdida de datos, daños reputacionales o interrupción de negocios;",
		"Vestigio no responderá por fallas, indisponibilidades, limitaciones o decisiones de terceros, incluyendo plataformas, integraciones, redes, navegadores, hosts, procesadores de pago, APIs y proveedores;",
		"Vestigio no responderá por actos practicados fuera de la plataforma, ni por decisiones tomadas exclusivamente con base en outputs sin la debida validación del Cliente;",
		"la responsabilidad total y agregada de Vestigio, si fuere reconocida, quedará limitada al valor efectivamente pagado por el Cliente a Vestigio en los 12 (doce) meses anteriores al hecho que originó la reclamación.",
	],

	s16_title: "16. Indemnización",
	s16_body:
		"Usted acepta indemnizar, defender y mantener indemne a Vestigio frente a reclamaciones, pérdidas, costos, daños, gastos y responsabilidades derivados de:",
	s16_items: [
		"uso indebido de los Servicios;",
		"registro o análisis de activos sin autorización;",
		"violación de estos Términos;",
		"violación de derechos de terceros;",
		"uso ilegal, fraudulento o abusivo de la plataforma.",
	],

	s17_title: "17. Cambios en los Servicios y en estos Términos",
	s17_body_1:
		"Vestigio podrá alterar, suspender, remover, evolucionar o descontinuar funcionalidades, integraciones, planes, trials, créditos y demás elementos de los Servicios en cualquier momento.",
	s17_body_2:
		"Vestigio también podrá actualizar estos Términos. La versión más reciente será siempre la vigente a partir de su publicación.",

	s18_title: "18. Ley aplicable y foro",
	s18_body_1: "Estos Términos se regirán por las leyes de la República Federativa del Brasil.",
	s18_body_2:
		"Queda elegido el foro de la comarca de Florianópolis/SC, con exclusión de cualquier otro, por más privilegiado que sea, salvo los casos de competencia legal obligatoria.",

	s19_title: "19. Contacto",
	s19_company: "VESTIGIO TECNOLOGIA LTDA",
	s19_cnpj: "CNPJ: 65.445.297/0001-44",
	s19_address:
		"Dirección: Av. Prefeito Osmar Cunha, 416, Sala 1108, Centro, Florianópolis/SC, CEP 88.015-100, Brasil",
	s19_email: "support@vestigio.io",
};

// ── DE ────────────────────────────────────────

const de = {
	meta_title: "Nutzungsbedingungen — Vestigio",
	meta_description:
		"Nutzungsbedingungen von Vestigio. Lesen Sie die Regeln und Bedingungen für die Nutzung der Plattform.",
	heading: "Nutzungsbedingungen",
	last_updated: "Zuletzt aktualisiert: 14. April 2026",
	translation_disclaimer:
		"Dies ist eine unverbindliche deutsche Übersetzung unserer portugiesischen Nutzungsbedingungen. Bei Widersprüchen oder Abweichungen zwischen den Fassungen ist die portugiesische Fassung maßgeblich.",
	intro_1:
		"Diese Nutzungsbedingungen („Bedingungen“) regeln den Zugang zu und die Nutzung der Dienste, die von VESTIGIO TECNOLOGIA LTDA angeboten werden, eingetragen unter CNPJ Nr. 65.445.297/0001-44, Handelsname VESTIGIO TECNOLOGIA, mit Sitz in Av. Prefeito Osmar Cunha, 416, Sala 1108, Centro, Florianópolis/SC, PLZ 88.015-100, Brasilien („Vestigio“, „wir“, „unser“ oder „uns“).",
	intro_2:
		"Durch den Zugriff auf oder die Nutzung von Vestigio stimmen Sie diesen Bedingungen zu. Wenn Sie nicht einverstanden sind, nutzen Sie die Dienste nicht.",

	s1_title: "1. Definitionen",
	s1_body: "Für die Zwecke dieser Bedingungen:",
	s1_definitions: [
		{
			term: "Dienste",
			body: "die Vestigio-Plattform, ihre Dashboards, Schnittstellen, APIs, Pixel, Snippets, Integrationen, Analysen, Berichte, Findings, Outputs, KI-Funktionen, Tarife, Credits und zugehörige Funktionalitäten;",
		},
		{
			term: "Konto",
			body: "individuelle oder unternehmensbezogene Registrierung, die für den Zugriff auf die Dienste verwendet wird;",
		},
		{
			term: "Kunde",
			body: "natürliche oder juristische Person, die Vestigio bucht oder nutzt;",
		},
		{
			term: "Free Trial",
			body: "temporärer, aktionsbedingter, konditionaler oder kostenloser Zugang zum Dienst;",
		},
		{
			term: "KI-Credits",
			body: "bezahlte oder bereitgestellte Credits zur Nutzung von Funktionen der künstlichen Intelligenz innerhalb der Plattform;",
		},
		{
			term: "Analysierte Assets",
			body: "Domains, Subdomains, URLs, Seiten, Shops, Apps, Konten, Integrationen, Pixel, Snippets und sonstige vom Kunden registrierte oder verbundene Assets.",
		},
	],

	s2_title: "2. Berechtigung und Konto",
	s2_body_1:
		"Sie erklären, die Rechtsfähigkeit zu besitzen, um die Dienste zu buchen und zu nutzen.",
	s2_body_2: "Sie verpflichten sich,",
	s2_items: [
		"wahrheitsgemäße, genaue und aktuelle Informationen bereitzustellen;",
		"die Vertraulichkeit Ihrer Zugangsdaten zu wahren;",
		"für alle Aktivitäten in Ihrem Konto verantwortlich zu sein;",
		"Vestigio bei unbefugter Nutzung, Sicherheitsvorfällen oder Verdacht auf kompromittierten Zugang zu benachrichtigen.",
	],
	s2_body_3:
		"Vestigio kann Registrierungen ablehnen, den Zugang beschränken, zusätzliche Verifizierung verlangen oder Konten sperren, wenn Hinweise auf Betrug, Missbrauch, operatives Risiko, Inkonsistenzen in der Registrierung oder Verstöße gegen diese Bedingungen vorliegen.",

	s3_title: "3. Umfang der Dienste",
	s3_body_1:
		"Vestigio ist eine Plattform für Intelligence, Observability, digitale Analyse, Automatisierung und Entscheidungsunterstützung in Bezug auf digitale Umgebungen.",
	s3_body_2: "Vestigio kann, unter anderem,",
	s3_items_1: [
		"öffentlich zugängliche Assets im Internet analysieren;",
		"sichtbare Strukturen über DOM, Browser, DevTools, Metadaten und öffentliche Elemente beobachten;",
		"automatisierte Interaktionen ausführen, die denen eines regulären Kunden oder Nutzers entsprechen;",
		"Daten aus Pixel, Snippet oder autorisierten Integrationen verarbeiten;",
		"Outputs, Insights, Berichte, Findings, Schätzungen, Antworten und Empfehlungen mit Unterstützung von Automatisierung und künstlicher Intelligenz generieren.",
	],
	s3_body_3: "Vestigio gilt für sich genommen nicht als:",
	s3_items_2: [
		"Rechtsberatung;",
		"Buchhaltungsberatung;",
		"unabhängige Rechtsprüfung (Legal Audit);",
		"formelles, mit spezifischem Umfang beauftragtes Penetration Testing;",
		"regulatorische Zertifizierung;",
		"Garantie für Compliance oder absolute Sicherheit;",
		"Garantie für die Genehmigung durch Drittplattformen, einschließlich Meta, Zahlungsabwickler, Marktplätze oder Werbenetzwerke.",
	],

	s4_title: "4. Verantwortung des Kunden für Assets und Integrationen",
	s4_body_1: "Sie sind allein verantwortlich für:",
	s4_items: [
		"die Registrierung nur solcher Analysierten Assets, für die Sie eine rechtmäßige Autorisierung besitzen;",
		"die Installation von Pixeln, Snippets und Integrationen nur in Umgebungen, die unter Ihrer Kontrolle stehen oder ordnungsgemäß autorisiert sind;",
		"die Rechtmäßigkeit der Nutzung der Plattform in Ihrem Betrieb;",
		"die Überprüfung der generierten Outputs vor kritischen, kommerziellen, rechtlichen, operativen oder finanziellen Entscheidungen.",
	],
	s4_body_2:
		"Vestigio haftet nicht für Handlungen, die Sie außerhalb der Plattform vornehmen, noch für die unsachgemäße Nutzung der Dienste an Assets Dritter ohne Autorisierung.",

	s5_title: "5. Free Trial, Tarife und KI-Credits",
	s5_body_1: "Vestigio kann anbieten:",
	s5_items: [
		"Free Trial;",
		"Monatstarife;",
		"Jahrestarife;",
		"KI-Credits;",
		"weitere kommerzielle Modelle, die künftig bereitgestellt werden.",
	],
	s5_body_2:
		"Der Free Trial kann nur ausgewählten Nutzern für einen begrenzten Zeitraum nach von Vestigio ausschließlich festgelegten werblichen, kommerziellen oder strategischen Kriterien bereitgestellt werden.",
	s5_body_3:
		"KI-Credits können nur Kunden mit aktivem Tarif bereitgestellt werden, sofern Vestigio nicht ausdrücklich anders angibt.",
	s5_body_4:
		"Preise, Limits, Freikontingente, Verbrauchsrichtlinien, Gültigkeit, Verlängerung, Abrechnung, Upgrade und Downgrade können auf kommerziellen Seiten, Dashboards, Checkout, Angeboten, Bestellungen, E-Mails oder ergänzenden Unterlagen angegeben werden.",

	s6_title: "6. Zahlungen",
	s6_body_1:
		"Kostenpflichtige Dienste werden im Voraus gemäß Tarif, Zyklus, Preis und zum Zeitpunkt der Beauftragung oder Verlängerung gültigen Bedingungen abgerechnet.",
	s6_body_2:
		"Die Abrechnung kann durch Paddle und durch am Zahlungsprozess beteiligte Partner oder Abwickler erfolgen.",
	s6_body_3:
		"Sie ermächtigen Vestigio und seine Zahlungsabwickler, die fälligen Beträge einzuziehen, einschließlich wiederkehrender Einzüge bei zutreffender automatischer Verlängerung.",
	s6_body_4:
		"Steuern, Abgaben, Bankgebühren, Wechselkursgebühren und sonstige auf die Beauftragung und Nutzung der Dienste anfallende Kosten können gemäß geltender Gesetzgebung und den Regeln der verwendeten Zahlungsmethode erhoben werden.",

	s7_title: "7. Verlängerung, Upgrade, Downgrade und Kündigung",
	s7_body_1:
		"Soweit nicht ausdrücklich anders angegeben, können Abonnements am Ende jedes Abrechnungszyklus automatisch verlängert werden.",
	s7_body_2:
		"Eine Kündigung verhindert künftige Verlängerungen, macht jedoch bereits erfolgte Abrechnungen nicht rückgängig und erzeugt nicht automatisch eine Rückerstattung für bereits begonnene oder effektiv genutzte Zeiträume.",
	s7_body_3:
		"Eventuelle Regeln zu Upgrade, Downgrade, Tarifwechsel, Credits und Zyklusanpassungen können in ergänzenden Unterlagen oder in Produktbildschirmen festgelegt sein.",

	s8_title: "8. Erlaubte Nutzung",
	s8_body:
		"Sie verpflichten sich, die Dienste ausschließlich zu rechtmäßigen, autorisierten und mit diesen Bedingungen vereinbaren Zwecken zu nutzen.",

	s9_title: "9. Verbotene Nutzungen",
	s9_body: "Es ist untersagt,",
	s9_items: [
		"Vestigio für rechtswidrige, missbräuchliche, betrügerische oder nicht autorisierte Zwecke zu nutzen;",
		"Assets ohne angemessene Autorisierung zu registrieren, zu analysieren, zu verbinden oder zu überwachen;",
		"die Plattform zu nutzen, um Dritte einzudringen, lahmzulegen, auszunutzen oder zu schädigen;",
		"zu versuchen, technische, Tarif-, Sicherheits- oder Abrechnungsgrenzen zu umgehen;",
		"missbräuchliches Scraping gegen Vestigio selbst durchzuführen;",
		"Malware, schädlichen Code, feindliche Automatisierungen oder missbräuchlichen Traffic einzuschleusen;",
		"Reverse Engineering, Disassemblierung, Dekompilierung oder Versuche zur Extraktion von Code, interner Logik, Modellen, System oder Infrastruktur von Vestigio durchzuführen, außer soweit das Gesetz dies zwingend gestattet;",
		"Vestigio ohne ausdrückliche schriftliche Genehmigung zu kopieren, weiterzuverkaufen, zu unterlizenzieren, zu verteilen, zu reproduzieren oder kommerziell zu verwerten;",
		"Outputs, Berichte oder Empfehlungen der Plattform für rechtswidrige Aktivitäten oder solche, die Rechte Dritter verletzen, zu nutzen.",
	],

	s10_title: "10. Öffentliche Daten, Automatisierung und KI",
	s10_body_1:
		"Vestigio kann sich auf öffentliche Daten, beobachtbare Daten, Automatisierung, Integrationen, probabilistische Signale und künstliche Intelligenz stützen, um Outputs zu erzeugen.",
	s10_body_2: "Sie erkennen an, dass:",
	s10_items: [
		"Outputs Fehler, Ungenauigkeiten, Inferenzen, Näherungen, False Positives, False Negatives und Interpretationsvariationen enthalten können;",
		"die Plattform menschliche Validierung nicht ersetzt, wenn Entscheidungen ein erhebliches Risiko beinhalten;",
		"kein Output rechtliche, buchhalterische oder regulatorische Beratung oder ein Erfolgsversprechen darstellt.",
	],

	s11_title: "11. Aussetzung und Beendigung",
	s11_body:
		"Vestigio kann Konten, Zugänge, Trials, Credits, Integrationen, Pixel oder Funktionalitäten mit oder ohne Vorankündigung aussetzen, einschränken oder beenden, wenn vorliegt:",
	s11_items: [
		"Verstoß gegen diese Bedingungen;",
		"Verdacht auf Betrug oder Missbrauch;",
		"Sicherheitsrisiko;",
		"Zahlungsverzug;",
		"gesetzliche oder regulatorische Anordnung;",
		"Nutzung, die mit der Stabilität oder Integrität der Plattform unvereinbar ist;",
		"Versuch, Grenzen, Regeln oder Richtlinien von Vestigio zu umgehen;",
		"Analyse oder Verbindung von Assets Dritter ohne angemessene Autorisierung.",
	],

	s12_title: "12. Geistiges Eigentum",
	s12_body_1:
		"Alle Rechte in Bezug auf Vestigio, einschließlich Software, Code, Design, Layout, Marke, Name, Logos, Schnittstellen, Dokumentation, Methoden, Flows, Datenstruktur, interner Outputs, Know-how und visueller Elemente, gehören Vestigio oder seinen Lizenzgebern.",
	s12_body_2:
		"Die Nutzung der Dienste überträgt Ihnen keine Rechte am geistigen Eigentum, mit Ausnahme des begrenzten, widerruflichen, nicht ausschließlichen und nicht übertragbaren Nutzungsrechts gemäß diesen Bedingungen.",

	s13_title: "13. Vertraulichkeit und operativer Schutz",
	s13_body:
		"Soweit anwendbar, ergreift Vestigio angemessene Schutzmaßnahmen, um Daten, Zugangsdaten, Integrationen und in seinen Diensten verarbeitete betriebliche Informationen zu schützen. Sie sind ebenfalls verpflichtet, angemessene Schutzmaßnahmen in Ihrem Betrieb zu ergreifen, einschließlich in der Zugriffsverwaltung, der Installation von Pixeln, der Konfiguration von Integrationen und der Nutzung der Outputs.",

	s14_title: "14. Haftungsausschlüsse",
	s14_body:
		"Im größtmöglichen nach geltendem Recht zulässigen Umfang werden die Dienste „wie besehen“ und nach Verfügbarkeit bereitgestellt. Vestigio garantiert nicht:",
	s14_items: [
		"einen unterbrechungsfreien Betrieb;",
		"die Abwesenheit von Fehlern oder Inkompatibilitäten;",
		"die Abwesenheit von Fehlern in Outputs;",
		"die dauerhafte Verfügbarkeit von Integrationen oder Dritten;",
		"ein bestimmtes kommerzielles, finanzielles, regulatorisches oder operatives Ergebnis;",
		"die Genehmigung durch Dritte;",
		"absolute Sicherheit;",
		"die Eignung des Dienstes für einen bestimmten nicht ausdrücklich vereinbarten Zweck.",
	],

	s15_title: "15. Haftungsbeschränkung",
	s15_body: "Im größtmöglichen nach geltendem Recht zulässigen Umfang:",
	s15_items: [
		"haftet Vestigio nicht für indirekte, beiläufige, besondere oder Folgeschäden, entgangenen Gewinn, Umsatzverluste, entgangene Chancen, Datenverluste, Reputationsschäden oder Betriebsunterbrechung;",
		"haftet Vestigio nicht für Ausfälle, Nichtverfügbarkeiten, Einschränkungen oder Entscheidungen Dritter, einschließlich Plattformen, Integrationen, Netzwerken, Browsern, Hosts, Zahlungsabwicklern, APIs und Anbietern;",
		"haftet Vestigio nicht für Handlungen außerhalb der Plattform, noch für Entscheidungen, die ausschließlich auf Basis von Outputs ohne angemessene Kundenvalidierung getroffen wurden;",
		"ist die gesamte aggregierte Haftung von Vestigio, sofern anerkannt, auf den Betrag beschränkt, den der Kunde tatsächlich an Vestigio in den 12 (zwölf) Monaten vor dem die Beanstandung auslösenden Ereignis gezahlt hat.",
	],

	s16_title: "16. Freistellung",
	s16_body:
		"Sie verpflichten sich, Vestigio von Ansprüchen, Verlusten, Kosten, Schäden, Aufwendungen und Haftungen freizustellen, zu verteidigen und schadlos zu halten, die sich ergeben aus:",
	s16_items: [
		"unsachgemäßer Nutzung der Dienste;",
		"Registrierung oder Analyse von Assets ohne Autorisierung;",
		"Verstoß gegen diese Bedingungen;",
		"Verletzung von Rechten Dritter;",
		"rechtswidriger, betrügerischer oder missbräuchlicher Nutzung der Plattform.",
	],

	s17_title: "17. Änderungen der Dienste und dieser Bedingungen",
	s17_body_1:
		"Vestigio kann Funktionalitäten, Integrationen, Tarife, Trials, Credits und weitere Elemente der Dienste jederzeit ändern, aussetzen, entfernen, weiterentwickeln oder einstellen.",
	s17_body_2:
		"Vestigio kann auch diese Bedingungen aktualisieren. Die jeweils aktuellste Version gilt ab dem Zeitpunkt ihrer Veröffentlichung.",

	s18_title: "18. Anwendbares Recht und Gerichtsstand",
	s18_body_1:
		"Diese Bedingungen unterliegen den Gesetzen der Föderativen Republik Brasilien.",
	s18_body_2:
		"Als ausschließlicher Gerichtsstand wird der Gerichtsbezirk Florianópolis/SC vereinbart, unter Ausschluss jedes anderen, so privilegiert er auch sein mag, ausgenommen Fälle zwingender gesetzlicher Zuständigkeit.",

	s19_title: "19. Kontakt",
	s19_company: "VESTIGIO TECNOLOGIA LTDA",
	s19_cnpj: "CNPJ: 65.445.297/0001-44",
	s19_address:
		"Adresse: Av. Prefeito Osmar Cunha, 416, Sala 1108, Centro, Florianópolis/SC, PLZ 88.015-100, Brasilien",
	s19_email: "support@vestigio.io",
};

// ── inject ────────────────────────────────────

function injectPolicy(filename, policy) {
	const path = resolve(dictDir, filename);
	const raw = readFileSync(path, "utf8");
	const dict = JSON.parse(raw);
	if (dict.terms_of_use) {
		console.log(`[${filename}] terms_of_use already present — overwriting`);
	}
	dict.terms_of_use = policy;
	const out = JSON.stringify(dict, null, "\t") + "\n";
	writeFileSync(path, out, "utf8");
	console.log(`[${filename}] updated (${Object.keys(policy).length} keys)`);
}

injectPolicy("pt-BR.json", ptBR);
injectPolicy("en.json", en);
injectPolicy("es.json", es);
injectPolicy("de.json", de);

console.log("✓ done");
