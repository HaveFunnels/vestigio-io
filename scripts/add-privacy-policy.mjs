// One-off script that injects the privacy_policy namespace into each
// locale dictionary. Preserves tab indentation + keeps ordering.
// Run: node scripts/add-privacy-policy.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dictDir = resolve(here, "..", "dictionary");

// ── PT-BR (canonical) ─────────────────────────

const ptBR = {
	meta_title: "Política de Privacidade — Vestigio",
	meta_description:
		"Política de Privacidade da Vestigio. Saiba como coletamos, usamos e protegemos suas informações pessoais.",
	heading: "Política de Privacidade",
	last_updated: "Última atualização: 14 de abril de 2026",
	intro_1:
		"A VESTIGIO TECNOLOGIA LTDA, inscrita no CNPJ sob o nº 65.445.297/0001-44, com nome fantasia VESTIGIO TECNOLOGIA, com sede na Av. Prefeito Osmar Cunha, 416, Sala 1108, Centro, Florianópolis/SC, CEP 88.015-100, (“Vestigio”, “nós”, “nosso” ou “nossa”), respeita a sua privacidade e descreve nesta Política de Privacidade como coleta, usa, armazena, compartilha e protege dados relacionados ao uso de seu site, aplicações, painéis, APIs, pixels, integrações e demais serviços vinculados ao domínio vestigio.io, seus subdomínios e outros domínios ou ambientes que venha a operar futuramente (“Serviços”).",
	intro_2:
		"Ao acessar ou utilizar os Serviços, você declara ter lido, compreendido e concordado com esta Política.",

	s1_title: "1. Escopo desta Política",
	s1_body: "Esta Política se aplica a:",
	s1_items: [
		"vestigio.io;",
		"seus subdomínios;",
		"aplicações, painéis, APIs, pixels, snippets, integrações e outras superfícies operadas pela Vestigio;",
		"contas de teste, free trial, planos pagos, créditos de IA e demais funcionalidades disponibilizadas por nós.",
	],

	s2_title: "2. Dados que podemos coletar",
	s2_body:
		"Podemos coletar e tratar, conforme aplicável, as seguintes categorias de dados:",
	s2_1_title: "2.1. Dados de cadastro e conta",
	s2_1_body:
		"Podemos coletar dados como nome, email, telefone, empresa, cargo, domínio, URLs cadastradas, informações de login, histórico de plano, informações de suporte, preferências e demais dados fornecidos por você ao criar ou administrar sua conta.",
	s2_2_title: "2.2. Dados técnicos e operacionais",
	s2_2_body:
		"Podemos coletar endereço IP, identificadores de navegador e dispositivo, sistema operacional, logs de acesso, data e hora de uso, páginas acessadas, eventos de navegação, erros, métricas de performance, configuração de ambiente, histórico de análises, findings, snapshots, relatórios, outputs gerados, consumo de funcionalidades e consumo de créditos de IA.",
	s2_3_title: "2.3. Dados relacionados aos ativos analisados",
	s2_3_body:
		"Podemos coletar e processar URLs, domínios, subdomínios, rotas, páginas, elementos estruturais, conteúdo visível, metadados públicos, sinais técnicos, resultados de navegação automatizada, interações equivalentes às de um usuário comum, dados obtidos por meio de DevTools, DOM, browser automation e outras técnicas compatíveis com a finalidade do Serviço.",
	s2_4_title: "2.4. Dados coletados via pixel, snippet ou instrumentação",
	s2_4_body:
		"Quando você instalar o Vestigio Pixel, snippet, script ou outra tecnologia de instrumentação em ambiente sob seu controle, podemos receber dados técnicos, analíticos, comportamentais, estruturais e operacionais relacionados a esse ambiente, na medida necessária para fornecer os Serviços.",
	s2_5_title: "2.5. Dados de integrações",
	s2_5_body:
		"Quando você conectar a Vestigio a serviços de terceiros, podemos coletar e processar tudo o que for tecnicamente possível e legitimamente acessível em modo de leitura (“read”), inclusive tokens, metadados, snapshots, dados operacionais, dados de catálogo, dados de configuração, dados de campanhas, dados de eventos, dados de faturamento, dados de performance, dados de loja e demais informações necessárias para a funcionalidade contratada.",
	s2_5_items_intro:
		"No momento, integrações atuais ou previstas podem incluir, entre outras:",
	s2_5_items: [
		"Paddle;",
		"Google;",
		"GitHub;",
		"Facebook;",
		"TikTok;",
		"Shopify;",
		"Nuvemshop.",
	],

	s3_title: "3. Natureza das análises realizadas pela Vestigio",
	s3_body_1: "A Vestigio pode analisar:",
	s3_items: [
		"dados publicamente acessíveis na internet;",
		"estruturas e elementos visíveis de sites, lojas, páginas e superfícies digitais;",
		"dados observáveis por navegação comum;",
		"resultados de interações automatizadas equivalentes às de um cliente ou visitante normal;",
		"dados coletados por pixel, snippet ou integração autorizada por você.",
	],
	s3_body_2:
		"Você é o único responsável por cadastrar, conectar ou instalar a Vestigio apenas em ativos, ambientes, contas, domínios, páginas e integrações para os quais possua autorização legítima.",
	s3_body_3:
		"A Vestigio não se responsabiliza por atos praticados por você fora da plataforma, nem pelo uso indevido dos Serviços em ativos de terceiros sem autorização adequada.",

	s4_title: "4. Finalidades do tratamento",
	s4_body: "Podemos tratar dados para:",
	s4_items: [
		"criar, autenticar, manter e administrar sua conta;",
		"fornecer, operar, executar, monitorar e melhorar os Serviços;",
		"processar auditorias, análises, findings, relatórios, respostas, sugestões e outputs;",
		"oferecer e gerenciar free trials, planos pagos e créditos de IA;",
		"processar cobrança, pagamento, renovações, conciliações e histórico financeiro;",
		"responder tickets, dúvidas e solicitações de suporte;",
		"detectar, prevenir e investigar fraude, abuso, uso indevido, falhas técnicas e incidentes de segurança;",
		"monitorar performance, estabilidade, disponibilidade e integridade da plataforma;",
		"cumprir obrigações legais, regulatórias, contratuais e de defesa de direitos;",
		"realizar comunicações operacionais, administrativas, técnicas e comerciais legítimas;",
		"suportar integrações autorizadas por você;",
		"manter trilhas de auditoria, logs e evidências operacionais.",
	],

	s5_title: "5. Bases legais",
	s5_body:
		"Quando aplicável, a Vestigio poderá tratar dados pessoais com base em uma ou mais das seguintes hipóteses legais:",
	s5_items: [
		"execução de contrato ou de procedimentos preliminares relacionados ao contrato;",
		"cumprimento de obrigação legal ou regulatória;",
		"exercício regular de direitos em processo judicial, administrativo ou arbitral;",
		"legítimo interesse, observados os limites da legislação aplicável;",
		"consentimento, quando exigido;",
		"prevenção à fraude e segurança do titular e da plataforma.",
	],

	s6_title: "6. Pagamentos",
	s6_body:
		"Os pagamentos da Vestigio podem ser processados pela Paddle e por parceiros, suboperadores ou instituições financeiras relacionados ao fluxo de cobrança. A Vestigio não armazena integralmente dados sensíveis de cartão quando o processamento ocorre por terceiros especializados, mas poderá armazenar identificadores de transação, status de pagamento, plano, histórico de cobrança, faturas, metadados financeiros e informações necessárias para gestão da assinatura.",

	s7_title: "7. Cookies, pixels, analytics e tecnologias semelhantes",
	s7_body_1:
		"A Vestigio pode utilizar cookies, local storage, pixels, tags, scripts, logs, identificadores e tecnologias semelhantes para:",
	s7_items_1: [
		"autenticação e segurança;",
		"funcionamento do site e da aplicação;",
		"armazenamento de preferências;",
		"mensuração de uso e performance;",
		"analytics;",
		"melhoria dos Serviços;",
		"atribuição e análise de comportamento;",
		"suporte a campanhas e mensuração de tráfego.",
	],
	s7_body_2: "No momento, a Vestigio pode utilizar, entre outros:",
	s7_items_2: ["Google Analytics;", "Meta Pixel;", "Vestigio Pixel."],
	s7_body_3:
		"Ferramentas, fornecedores e tecnologias poderão ser alterados, adicionados ou removidos ao longo do tempo.",

	s8_title: "8. Compartilhamento de dados",
	s8_body_1: "A Vestigio não vende dados pessoais.",
	s8_body_2: "Poderemos compartilhar dados, no limite do necessário, com:",
	s8_items: [
		"processadores de pagamento e parceiros financeiros;",
		"provedores de hospedagem, infraestrutura, observabilidade, analytics, email, segurança, autenticação e suporte;",
		"plataformas e integrações conectadas por você;",
		"empresas do mesmo grupo econômico, afiliadas, sucessoras ou adquirentes, em caso de reorganização societária, fusão, aquisição ou venda de ativos;",
		"consultores, auditores, assessores jurídicos, contábeis e técnicos, sob dever de confidencialidade;",
		"autoridades administrativas, regulatórias ou judiciais, quando exigido por lei ou ordem válida.",
	],

	s9_title: "9. Transferência internacional de dados",
	s9_body:
		"Seus dados poderão ser armazenados, processados ou acessados em servidores e sistemas localizados fora do Brasil, inclusive por provedores de tecnologia e infraestrutura. Nesses casos, a Vestigio adotará medidas razoáveis para assegurar proteção adequada, em conformidade com a LGPD e demais normas aplicáveis.",

	s10_title: "10. Retenção de dados",
	s10_body_1:
		"A Vestigio poderá reter dados pelo tempo necessário para cumprir as finalidades desta Política, atender obrigações legais e regulatórias, preservar evidências, exercer direitos e manter a continuidade operacional da plataforma.",
	s10_body_2:
		"Sem prejuízo de prazos legais ou necessidades específicas de retenção:",
	s10_items: [
		"dados operacionais relacionados a análises, findings, relatórios, snapshots, outputs e materiais equivalentes poderão ser mantidos por até 30 (trinta) dias;",
		"dados financeiros, fiscais, contratuais, logs de segurança e registros necessários à defesa de direitos poderão ser mantidos por prazo superior, conforme exigência legal, regulatória ou interesse legítimo devidamente justificado.",
	],

	s11_title: "11. Segurança da informação",
	s11_body_1:
		"A Vestigio adota medidas técnicas, administrativas e organizacionais razoáveis para proteger os dados contra acesso não autorizado, destruição, perda, alteração, divulgação indevida ou qualquer forma de tratamento inadequado ou ilícito.",
	s11_body_2:
		"A Vestigio busca operar com controles alinhados à LGPD e a boas práticas reconhecidas de mercado para segurança, governança e controle, inclusive com referência a frameworks e padrões amplamente utilizados no mercado, como os associados a ambientes auditáveis e programas de conformidade corporativa.",
	s11_body_3:
		"Ainda assim, nenhum ambiente é absolutamente inviolável, e não podemos garantir segurança absoluta.",

	s12_title: "12. Direitos do titular",
	s12_body:
		"Nos termos da legislação aplicável, você poderá solicitar, quando cabível:",
	s12_items: [
		"confirmação da existência de tratamento;",
		"acesso aos dados;",
		"correção de dados incompletos, inexatos ou desatualizados;",
		"anonimização, bloqueio ou eliminação;",
		"portabilidade;",
		"informação sobre compartilhamentos;",
		"revisão de decisões automatizadas, quando aplicável;",
		"revogação de consentimento, quando essa for a base legal;",
		"oposição a tratamentos específicos, nos termos legais.",
	],

	s13_title: "13. Instruções para exclusão de dados",
	s13_body_1:
		"Se você quiser solicitar a exclusão dos seus dados, envie um email para support@vestigio.io com o assunto “Solicitação de exclusão de dados” e, se possível, inclua:",
	s13_items: [
		"nome da conta ou empresa;",
		"email cadastrado;",
		"domínio ou ativo relacionado;",
		"descrição dos dados ou conta a serem excluídos.",
	],
	s13_body_2:
		"A Vestigio processará solicitações válidas de exclusão em até 7 (sete) dias, quando legal e tecnicamente possível, ressalvadas hipóteses de retenção obrigatória, prevenção à fraude, segurança, cumprimento de obrigações legais, preservação de evidências e exercício regular de direitos.",

	s14_title: "14. Menores de idade",
	s14_body:
		"A Vestigio não se destina a menores de 18 anos sem a devida autorização legal e contratual aplicável.",

	s15_title: "15. Alterações desta Política",
	s15_body:
		"A Vestigio poderá atualizar esta Política a qualquer momento. A versão vigente será sempre a mais recentemente publicada em seus canais oficiais.",

	s16_title: "16. Contato",
	s16_body:
		"Em caso de dúvidas, solicitações de privacidade, exclusão de dados ou suporte, entre em contato por:",
	s16_company: "VESTIGIO TECNOLOGIA LTDA",
	s16_cnpj: "CNPJ: 65.445.297/0001-44",
	s16_address:
		"Endereço: Av. Prefeito Osmar Cunha, 416, Sala 1108, Centro, Florianópolis/SC, CEP 88.015-100",
	s16_email: "support@vestigio.io",
};

// ── EN ────────────────────────────────────────

const en = {
	meta_title: "Privacy Policy — Vestigio",
	meta_description:
		"Vestigio's Privacy Policy. Learn how we collect, use, and protect your personal information.",
	heading: "Privacy Policy",
	last_updated: "Last updated: April 14, 2026",
	translation_disclaimer:
		"This is a courtesy English translation of our Portuguese Privacy Policy. In the event of any conflict or inconsistency between versions, the Portuguese version prevails.",
	intro_1:
		"VESTIGIO TECNOLOGIA LTDA, registered under CNPJ No. 65,445,297/0001-44, trading as VESTIGIO TECNOLOGIA, with headquarters at Av. Prefeito Osmar Cunha, 416, Sala 1108, Centro, Florianópolis/SC, ZIP 88015-100, Brazil (“Vestigio”, “we”, “our”, or “us”), respects your privacy and describes in this Privacy Policy how we collect, use, store, share, and protect data related to your use of our website, applications, dashboards, APIs, pixels, integrations, and other services associated with the vestigio.io domain, its subdomains, and any other domains or environments we may operate in the future (“Services”).",
	intro_2:
		"By accessing or using the Services, you acknowledge that you have read, understood, and agreed to this Policy.",

	s1_title: "1. Scope of this Policy",
	s1_body: "This Policy applies to:",
	s1_items: [
		"vestigio.io;",
		"its subdomains;",
		"applications, dashboards, APIs, pixels, snippets, integrations, and other surfaces operated by Vestigio;",
		"trial accounts, free trials, paid plans, AI credits, and other features we make available.",
	],

	s2_title: "2. Data we may collect",
	s2_body:
		"We may collect and process, as applicable, the following categories of data:",
	s2_1_title: "2.1. Registration and account data",
	s2_1_body:
		"We may collect data such as name, email, phone number, company, role, domain, registered URLs, login information, plan history, support information, preferences, and other data you provide when creating or managing your account.",
	s2_2_title: "2.2. Technical and operational data",
	s2_2_body:
		"We may collect IP address, browser and device identifiers, operating system, access logs, date and time of use, pages accessed, navigation events, errors, performance metrics, environment configuration, analysis history, findings, snapshots, reports, generated outputs, feature consumption, and AI credit consumption.",
	s2_3_title: "2.3. Data related to analyzed assets",
	s2_3_body:
		"We may collect and process URLs, domains, subdomains, routes, pages, structural elements, visible content, public metadata, technical signals, results of automated browsing, interactions equivalent to those of a regular user, data obtained through DevTools, the DOM, browser automation, and other techniques compatible with the purpose of the Service.",
	s2_4_title: "2.4. Data collected via pixel, snippet, or instrumentation",
	s2_4_body:
		"When you install the Vestigio Pixel, snippet, script, or other instrumentation technology in an environment under your control, we may receive technical, analytical, behavioral, structural, and operational data related to that environment, to the extent necessary to provide the Services.",
	s2_5_title: "2.5. Integration data",
	s2_5_body:
		"When you connect Vestigio to third-party services, we may collect and process everything that is technically possible and legitimately accessible in read-only mode, including tokens, metadata, snapshots, operational data, catalog data, configuration data, campaign data, event data, billing data, performance data, store data, and other information necessary for the contracted functionality.",
	s2_5_items_intro:
		"Current or planned integrations may include, among others:",
	s2_5_items: [
		"Paddle;",
		"Google;",
		"GitHub;",
		"Facebook;",
		"TikTok;",
		"Shopify;",
		"Nuvemshop.",
	],

	s3_title: "3. Nature of analyses performed by Vestigio",
	s3_body_1: "Vestigio may analyze:",
	s3_items: [
		"data publicly accessible on the internet;",
		"structures and visible elements of websites, stores, pages, and digital surfaces;",
		"data observable through common browsing;",
		"results of automated interactions equivalent to those of a regular customer or visitor;",
		"data collected through pixel, snippet, or integration authorized by you.",
	],
	s3_body_2:
		"You are solely responsible for registering, connecting, or installing Vestigio only in assets, environments, accounts, domains, pages, and integrations for which you hold legitimate authorization.",
	s3_body_3:
		"Vestigio is not liable for acts performed by you outside the platform, nor for improper use of the Services on third-party assets without adequate authorization.",

	s4_title: "4. Purposes of processing",
	s4_body: "We may process data to:",
	s4_items: [
		"create, authenticate, maintain, and administer your account;",
		"provide, operate, run, monitor, and improve the Services;",
		"process audits, analyses, findings, reports, answers, suggestions, and outputs;",
		"offer and manage free trials, paid plans, and AI credits;",
		"process billing, payments, renewals, reconciliations, and financial history;",
		"respond to tickets, inquiries, and support requests;",
		"detect, prevent, and investigate fraud, abuse, misuse, technical failures, and security incidents;",
		"monitor performance, stability, availability, and integrity of the platform;",
		"comply with legal, regulatory, contractual, and rights-defense obligations;",
		"conduct legitimate operational, administrative, technical, and commercial communications;",
		"support integrations authorized by you;",
		"maintain audit trails, logs, and operational evidence.",
	],

	s5_title: "5. Legal bases",
	s5_body:
		"When applicable, Vestigio may process personal data based on one or more of the following legal grounds:",
	s5_items: [
		"performance of a contract or preliminary procedures related to a contract;",
		"compliance with a legal or regulatory obligation;",
		"regular exercise of rights in judicial, administrative, or arbitration proceedings;",
		"legitimate interest, within the limits of applicable law;",
		"consent, where required;",
		"fraud prevention and security of the data subject and platform.",
	],

	s6_title: "6. Payments",
	s6_body:
		"Vestigio payments may be processed by Paddle and by partners, sub-processors, or financial institutions involved in the billing flow. Vestigio does not store full sensitive card data when processing occurs through specialized third parties, but may store transaction identifiers, payment status, plan, billing history, invoices, financial metadata, and information necessary for subscription management.",

	s7_title: "7. Cookies, pixels, analytics, and similar technologies",
	s7_body_1:
		"Vestigio may use cookies, local storage, pixels, tags, scripts, logs, identifiers, and similar technologies for:",
	s7_items_1: [
		"authentication and security;",
		"site and application functionality;",
		"storage of preferences;",
		"usage and performance measurement;",
		"analytics;",
		"Service improvement;",
		"attribution and behavior analysis;",
		"campaign support and traffic measurement.",
	],
	s7_body_2: "Vestigio may currently use, among others:",
	s7_items_2: ["Google Analytics;", "Meta Pixel;", "Vestigio Pixel."],
	s7_body_3:
		"Tools, vendors, and technologies may be changed, added, or removed over time.",

	s8_title: "8. Data sharing",
	s8_body_1: "Vestigio does not sell personal data.",
	s8_body_2: "We may share data, to the extent necessary, with:",
	s8_items: [
		"payment processors and financial partners;",
		"hosting, infrastructure, observability, analytics, email, security, authentication, and support providers;",
		"platforms and integrations connected by you;",
		"companies of the same economic group, affiliates, successors, or acquirers, in the event of corporate reorganization, merger, acquisition, or asset sale;",
		"consultants, auditors, legal, accounting, and technical advisors, under confidentiality obligations;",
		"administrative, regulatory, or judicial authorities, when required by law or valid order.",
	],

	s9_title: "9. International data transfer",
	s9_body:
		"Your data may be stored, processed, or accessed on servers and systems located outside Brazil, including by technology and infrastructure providers. In such cases, Vestigio will adopt reasonable measures to ensure adequate protection in compliance with the LGPD (Brazilian General Data Protection Law) and other applicable regulations.",

	s10_title: "10. Data retention",
	s10_body_1:
		"Vestigio may retain data for the time necessary to fulfill the purposes of this Policy, meet legal and regulatory obligations, preserve evidence, exercise rights, and maintain operational continuity of the platform.",
	s10_body_2:
		"Without prejudice to legal deadlines or specific retention needs:",
	s10_items: [
		"operational data related to analyses, findings, reports, snapshots, outputs, and equivalent materials may be retained for up to 30 (thirty) days;",
		"financial, tax, contractual data, security logs, and records necessary for the defense of rights may be retained for longer periods, as required by law, regulation, or duly justified legitimate interest.",
	],

	s11_title: "11. Information security",
	s11_body_1:
		"Vestigio adopts reasonable technical, administrative, and organizational measures to protect data against unauthorized access, destruction, loss, alteration, improper disclosure, or any form of inappropriate or unlawful processing.",
	s11_body_2:
		"Vestigio seeks to operate with controls aligned with the LGPD and recognized market best practices for security, governance, and control, including reference to frameworks and standards widely used in the market, such as those associated with auditable environments and corporate compliance programs.",
	s11_body_3:
		"Nonetheless, no environment is absolutely inviolable, and we cannot guarantee absolute security.",

	s12_title: "12. Data subject rights",
	s12_body:
		"Under applicable law, you may request, where applicable:",
	s12_items: [
		"confirmation of the existence of processing;",
		"access to data;",
		"correction of incomplete, inaccurate, or outdated data;",
		"anonymization, blocking, or deletion;",
		"portability;",
		"information about data sharing;",
		"review of automated decisions, where applicable;",
		"revocation of consent, where that is the legal basis;",
		"objection to specific processing, under legal terms.",
	],

	s13_title: "13. Data deletion instructions",
	s13_body_1:
		"If you wish to request the deletion of your data, send an email to support@vestigio.io with the subject “Data deletion request” and, if possible, include:",
	s13_items: [
		"account or company name;",
		"registered email;",
		"related domain or asset;",
		"description of the data or account to be deleted.",
	],
	s13_body_2:
		"Vestigio will process valid deletion requests within 7 (seven) days, when legally and technically possible, except in cases of mandatory retention, fraud prevention, security, compliance with legal obligations, preservation of evidence, and regular exercise of rights.",

	s14_title: "14. Minors",
	s14_body:
		"Vestigio is not intended for minors under 18 years of age without the applicable legal and contractual authorization.",

	s15_title: "15. Changes to this Policy",
	s15_body:
		"Vestigio may update this Policy at any time. The version in force will always be the most recently published on our official channels.",

	s16_title: "16. Contact",
	s16_body:
		"For questions, privacy requests, data deletion, or support, contact us through:",
	s16_company: "VESTIGIO TECNOLOGIA LTDA",
	s16_cnpj: "CNPJ: 65.445.297/0001-44",
	s16_address:
		"Address: Av. Prefeito Osmar Cunha, 416, Sala 1108, Centro, Florianópolis/SC, ZIP 88015-100, Brazil",
	s16_email: "support@vestigio.io",
};

// ── ES ────────────────────────────────────────

const es = {
	meta_title: "Política de Privacidad — Vestigio",
	meta_description:
		"Política de Privacidad de Vestigio. Conozca cómo recopilamos, usamos y protegemos su información personal.",
	heading: "Política de Privacidad",
	last_updated: "Última actualización: 14 de abril de 2026",
	translation_disclaimer:
		"Esta es una traducción de cortesía de nuestra Política de Privacidad en portugués. En caso de conflicto o inconsistencia entre versiones, prevalece la versión en portugués.",
	intro_1:
		"VESTIGIO TECNOLOGIA LTDA, inscrita en el CNPJ con el nº 65.445.297/0001-44, con nombre comercial VESTIGIO TECNOLOGIA, con sede en Av. Prefeito Osmar Cunha, 416, Sala 1108, Centro, Florianópolis/SC, CEP 88.015-100, Brasil (“Vestigio”, “nosotros”, “nuestro” o “nuestra”), respeta su privacidad y describe en esta Política de Privacidad cómo recopila, utiliza, almacena, comparte y protege datos relacionados con el uso de su sitio, aplicaciones, paneles, APIs, píxeles, integraciones y demás servicios vinculados al dominio vestigio.io, sus subdominios y otros dominios o entornos que pueda operar en el futuro (“Servicios”).",
	intro_2:
		"Al acceder o utilizar los Servicios, usted declara haber leído, comprendido y aceptado esta Política.",

	s1_title: "1. Alcance de esta Política",
	s1_body: "Esta Política se aplica a:",
	s1_items: [
		"vestigio.io;",
		"sus subdominios;",
		"aplicaciones, paneles, APIs, píxeles, snippets, integraciones y otras superficies operadas por Vestigio;",
		"cuentas de prueba, free trial, planes pagos, créditos de IA y demás funcionalidades que pongamos a disposición.",
	],

	s2_title: "2. Datos que podemos recopilar",
	s2_body:
		"Podemos recopilar y tratar, según corresponda, las siguientes categorías de datos:",
	s2_1_title: "2.1. Datos de registro y cuenta",
	s2_1_body:
		"Podemos recopilar datos como nombre, correo electrónico, teléfono, empresa, cargo, dominio, URLs registradas, información de inicio de sesión, historial de plan, información de soporte, preferencias y demás datos que usted proporcione al crear o administrar su cuenta.",
	s2_2_title: "2.2. Datos técnicos y operativos",
	s2_2_body:
		"Podemos recopilar dirección IP, identificadores de navegador y dispositivo, sistema operativo, registros de acceso, fecha y hora de uso, páginas accedidas, eventos de navegación, errores, métricas de rendimiento, configuración de entorno, historial de análisis, findings, snapshots, informes, outputs generados, consumo de funcionalidades y consumo de créditos de IA.",
	s2_3_title: "2.3. Datos relacionados con los activos analizados",
	s2_3_body:
		"Podemos recopilar y procesar URLs, dominios, subdominios, rutas, páginas, elementos estructurales, contenido visible, metadatos públicos, señales técnicas, resultados de navegación automatizada, interacciones equivalentes a las de un usuario común, datos obtenidos a través de DevTools, DOM, browser automation y otras técnicas compatibles con la finalidad del Servicio.",
	s2_4_title: "2.4. Datos recopilados vía píxel, snippet o instrumentación",
	s2_4_body:
		"Cuando instale el Vestigio Pixel, snippet, script u otra tecnología de instrumentación en un entorno bajo su control, podemos recibir datos técnicos, analíticos, comportamentales, estructurales y operativos relacionados con ese entorno, en la medida necesaria para prestar los Servicios.",
	s2_5_title: "2.5. Datos de integraciones",
	s2_5_body:
		"Cuando conecte Vestigio a servicios de terceros, podemos recopilar y procesar todo lo que sea técnicamente posible y legítimamente accesible en modo de lectura (“read”), incluyendo tokens, metadatos, snapshots, datos operativos, datos de catálogo, datos de configuración, datos de campañas, datos de eventos, datos de facturación, datos de rendimiento, datos de tienda y demás información necesaria para la funcionalidad contratada.",
	s2_5_items_intro:
		"Actualmente, integraciones actuales o previstas pueden incluir, entre otras:",
	s2_5_items: [
		"Paddle;",
		"Google;",
		"GitHub;",
		"Facebook;",
		"TikTok;",
		"Shopify;",
		"Nuvemshop.",
	],

	s3_title: "3. Naturaleza de los análisis realizados por Vestigio",
	s3_body_1: "Vestigio puede analizar:",
	s3_items: [
		"datos accesibles públicamente en internet;",
		"estructuras y elementos visibles de sitios, tiendas, páginas y superficies digitales;",
		"datos observables mediante navegación común;",
		"resultados de interacciones automatizadas equivalentes a las de un cliente o visitante normal;",
		"datos recopilados por píxel, snippet o integración autorizada por usted.",
	],
	s3_body_2:
		"Usted es el único responsable de registrar, conectar o instalar Vestigio únicamente en activos, entornos, cuentas, dominios, páginas e integraciones para los cuales posea autorización legítima.",
	s3_body_3:
		"Vestigio no se responsabiliza por actos realizados por usted fuera de la plataforma, ni por el uso indebido de los Servicios en activos de terceros sin la debida autorización.",

	s4_title: "4. Finalidades del tratamiento",
	s4_body: "Podemos tratar datos para:",
	s4_items: [
		"crear, autenticar, mantener y administrar su cuenta;",
		"proporcionar, operar, ejecutar, monitorear y mejorar los Servicios;",
		"procesar auditorías, análisis, findings, informes, respuestas, sugerencias y outputs;",
		"ofrecer y gestionar free trials, planes pagos y créditos de IA;",
		"procesar cobros, pagos, renovaciones, conciliaciones e historial financiero;",
		"responder tickets, consultas y solicitudes de soporte;",
		"detectar, prevenir e investigar fraudes, abusos, uso indebido, fallos técnicos e incidentes de seguridad;",
		"monitorear rendimiento, estabilidad, disponibilidad e integridad de la plataforma;",
		"cumplir con obligaciones legales, regulatorias, contractuales y de defensa de derechos;",
		"realizar comunicaciones operativas, administrativas, técnicas y comerciales legítimas;",
		"dar soporte a integraciones autorizadas por usted;",
		"mantener pistas de auditoría, logs y evidencias operativas.",
	],

	s5_title: "5. Bases legales",
	s5_body:
		"Cuando corresponda, Vestigio podrá tratar datos personales con base en una o más de las siguientes hipótesis legales:",
	s5_items: [
		"ejecución de contrato o de procedimientos preliminares relacionados con el contrato;",
		"cumplimiento de obligación legal o regulatoria;",
		"ejercicio regular de derechos en procesos judiciales, administrativos o arbitrales;",
		"interés legítimo, dentro de los límites de la legislación aplicable;",
		"consentimiento, cuando sea requerido;",
		"prevención de fraudes y seguridad del titular y de la plataforma.",
	],

	s6_title: "6. Pagos",
	s6_body:
		"Los pagos de Vestigio pueden ser procesados por Paddle y por socios, sub-operadores o instituciones financieras relacionadas con el flujo de cobranza. Vestigio no almacena íntegramente datos sensibles de tarjeta cuando el procesamiento ocurre a través de terceros especializados, pero podrá almacenar identificadores de transacción, estado de pago, plan, historial de cobranza, facturas, metadatos financieros e información necesaria para la gestión de la suscripción.",

	s7_title: "7. Cookies, píxeles, analytics y tecnologías similares",
	s7_body_1:
		"Vestigio puede utilizar cookies, local storage, píxeles, tags, scripts, logs, identificadores y tecnologías similares para:",
	s7_items_1: [
		"autenticación y seguridad;",
		"funcionamiento del sitio y de la aplicación;",
		"almacenamiento de preferencias;",
		"medición de uso y rendimiento;",
		"analytics;",
		"mejora de los Servicios;",
		"atribución y análisis de comportamiento;",
		"soporte a campañas y medición de tráfico.",
	],
	s7_body_2: "Actualmente, Vestigio puede utilizar, entre otros:",
	s7_items_2: ["Google Analytics;", "Meta Pixel;", "Vestigio Pixel."],
	s7_body_3:
		"Herramientas, proveedores y tecnologías pueden ser modificados, añadidos o eliminados con el tiempo.",

	s8_title: "8. Compartición de datos",
	s8_body_1: "Vestigio no vende datos personales.",
	s8_body_2: "Podremos compartir datos, en la medida de lo necesario, con:",
	s8_items: [
		"procesadores de pago y socios financieros;",
		"proveedores de hosting, infraestructura, observabilidad, analytics, correo electrónico, seguridad, autenticación y soporte;",
		"plataformas e integraciones conectadas por usted;",
		"empresas del mismo grupo económico, afiliadas, sucesoras o adquirentes, en caso de reorganización societaria, fusión, adquisición o venta de activos;",
		"consultores, auditores, asesores jurídicos, contables y técnicos, bajo deber de confidencialidad;",
		"autoridades administrativas, regulatorias o judiciales, cuando lo exija la ley u orden válida.",
	],

	s9_title: "9. Transferencia internacional de datos",
	s9_body:
		"Sus datos podrán ser almacenados, procesados o accedidos en servidores y sistemas ubicados fuera de Brasil, incluso por proveedores de tecnología e infraestructura. En esos casos, Vestigio adoptará medidas razonables para asegurar una protección adecuada, en cumplimiento con la LGPD (Ley General de Protección de Datos de Brasil) y demás normas aplicables.",

	s10_title: "10. Retención de datos",
	s10_body_1:
		"Vestigio podrá retener datos por el tiempo necesario para cumplir con las finalidades de esta Política, atender obligaciones legales y regulatorias, preservar evidencias, ejercer derechos y mantener la continuidad operativa de la plataforma.",
	s10_body_2:
		"Sin perjuicio de plazos legales o necesidades específicas de retención:",
	s10_items: [
		"datos operativos relacionados con análisis, findings, informes, snapshots, outputs y materiales equivalentes podrán mantenerse por hasta 30 (treinta) días;",
		"datos financieros, fiscales, contractuales, logs de seguridad y registros necesarios para la defensa de derechos podrán mantenerse por plazos superiores, conforme exigencia legal, regulatoria o interés legítimo debidamente justificado.",
	],

	s11_title: "11. Seguridad de la información",
	s11_body_1:
		"Vestigio adopta medidas técnicas, administrativas y organizativas razonables para proteger los datos contra acceso no autorizado, destrucción, pérdida, alteración, divulgación indebida o cualquier forma de tratamiento inadecuado o ilícito.",
	s11_body_2:
		"Vestigio busca operar con controles alineados con la LGPD y buenas prácticas reconocidas del mercado en materia de seguridad, gobernanza y control, incluyendo referencia a frameworks y estándares ampliamente utilizados en el mercado, como los asociados a entornos auditables y programas de conformidad corporativa.",
	s11_body_3:
		"Aun así, ningún entorno es absolutamente inviolable, y no podemos garantizar seguridad absoluta.",

	s12_title: "12. Derechos del titular",
	s12_body:
		"Conforme a la legislación aplicable, usted podrá solicitar, cuando corresponda:",
	s12_items: [
		"confirmación de la existencia de tratamiento;",
		"acceso a los datos;",
		"corrección de datos incompletos, inexactos o desactualizados;",
		"anonimización, bloqueo o eliminación;",
		"portabilidad;",
		"información sobre compartición;",
		"revisión de decisiones automatizadas, cuando corresponda;",
		"revocación del consentimiento, cuando esta sea la base legal;",
		"oposición a tratamientos específicos, en los términos legales.",
	],

	s13_title: "13. Instrucciones para eliminación de datos",
	s13_body_1:
		"Si desea solicitar la eliminación de sus datos, envíe un correo electrónico a support@vestigio.io con el asunto “Solicitud de eliminación de datos” y, si es posible, incluya:",
	s13_items: [
		"nombre de la cuenta o empresa;",
		"correo electrónico registrado;",
		"dominio o activo relacionado;",
		"descripción de los datos o cuenta a eliminar.",
	],
	s13_body_2:
		"Vestigio procesará solicitudes válidas de eliminación en hasta 7 (siete) días, cuando sea legal y técnicamente posible, salvo hipótesis de retención obligatoria, prevención de fraudes, seguridad, cumplimiento de obligaciones legales, preservación de evidencias y ejercicio regular de derechos.",

	s14_title: "14. Menores de edad",
	s14_body:
		"Vestigio no está dirigido a menores de 18 años sin la debida autorización legal y contractual aplicable.",

	s15_title: "15. Cambios en esta Política",
	s15_body:
		"Vestigio podrá actualizar esta Política en cualquier momento. La versión vigente será siempre la más recientemente publicada en sus canales oficiales.",

	s16_title: "16. Contacto",
	s16_body:
		"En caso de dudas, solicitudes de privacidad, eliminación de datos o soporte, contáctenos a través de:",
	s16_company: "VESTIGIO TECNOLOGIA LTDA",
	s16_cnpj: "CNPJ: 65.445.297/0001-44",
	s16_address:
		"Dirección: Av. Prefeito Osmar Cunha, 416, Sala 1108, Centro, Florianópolis/SC, CEP 88.015-100, Brasil",
	s16_email: "support@vestigio.io",
};

// ── DE ────────────────────────────────────────

const de = {
	meta_title: "Datenschutzrichtlinie — Vestigio",
	meta_description:
		"Datenschutzrichtlinie von Vestigio. Erfahren Sie, wie wir Ihre persönlichen Daten erheben, verwenden und schützen.",
	heading: "Datenschutzrichtlinie",
	last_updated: "Zuletzt aktualisiert: 14. April 2026",
	translation_disclaimer:
		"Dies ist eine unverbindliche deutsche Übersetzung unserer portugiesischen Datenschutzrichtlinie. Bei Widersprüchen oder Abweichungen zwischen den Fassungen ist die portugiesische Fassung maßgeblich.",
	intro_1:
		"VESTIGIO TECNOLOGIA LTDA, eingetragen unter CNPJ Nr. 65.445.297/0001-44, mit dem Handelsnamen VESTIGIO TECNOLOGIA, mit Sitz in Av. Prefeito Osmar Cunha, 416, Sala 1108, Centro, Florianópolis/SC, PLZ 88.015-100, Brasilien („Vestigio“, „wir“, „unser“ oder „uns“), respektiert Ihre Privatsphäre und beschreibt in dieser Datenschutzrichtlinie, wie Daten im Zusammenhang mit Ihrer Nutzung der Website, Anwendungen, Dashboards, APIs, Pixel, Integrationen und anderer Dienste im Zusammenhang mit der Domain vestigio.io, ihren Subdomains und allen weiteren Domains oder Umgebungen, die wir künftig betreiben („Dienste“), erhoben, verwendet, gespeichert, geteilt und geschützt werden.",
	intro_2:
		"Durch den Zugriff auf oder die Nutzung der Dienste erklären Sie, diese Richtlinie gelesen, verstanden und akzeptiert zu haben.",

	s1_title: "1. Geltungsbereich dieser Richtlinie",
	s1_body: "Diese Richtlinie gilt für:",
	s1_items: [
		"vestigio.io;",
		"ihre Subdomains;",
		"Anwendungen, Dashboards, APIs, Pixel, Snippets, Integrationen und andere von Vestigio betriebene Oberflächen;",
		"Testkonten, kostenlose Testphasen, kostenpflichtige Tarife, KI-Credits und weitere von uns bereitgestellte Funktionen.",
	],

	s2_title: "2. Daten, die wir erheben können",
	s2_body:
		"Wir können, soweit anwendbar, die folgenden Kategorien von Daten erheben und verarbeiten:",
	s2_1_title: "2.1. Registrierungs- und Kontodaten",
	s2_1_body:
		"Wir können Daten wie Name, E-Mail, Telefonnummer, Unternehmen, Position, Domain, registrierte URLs, Anmeldeinformationen, Tarifhistorie, Support-Informationen, Präferenzen und weitere Daten erheben, die Sie beim Erstellen oder Verwalten Ihres Kontos angeben.",
	s2_2_title: "2.2. Technische und betriebliche Daten",
	s2_2_body:
		"Wir können IP-Adresse, Browser- und Geräte-Identifikatoren, Betriebssystem, Zugriffsprotokolle, Datum und Uhrzeit der Nutzung, aufgerufene Seiten, Navigationsereignisse, Fehler, Performance-Metriken, Umgebungskonfiguration, Analyseverlauf, Findings, Snapshots, Berichte, generierte Outputs, Funktionsnutzung und KI-Credit-Verbrauch erheben.",
	s2_3_title: "2.3. Daten zu analysierten Assets",
	s2_3_body:
		"Wir können URLs, Domains, Subdomains, Routen, Seiten, strukturelle Elemente, sichtbare Inhalte, öffentliche Metadaten, technische Signale, Ergebnisse automatisierter Navigation, Interaktionen äquivalent zu denen eines regulären Nutzers, Daten, die mittels DevTools, DOM, Browser-Automatisierung und anderen mit dem Zweck des Dienstes kompatiblen Techniken gewonnen werden, erheben und verarbeiten.",
	s2_4_title: "2.4. Über Pixel, Snippet oder Instrumentierung erhobene Daten",
	s2_4_body:
		"Wenn Sie den Vestigio Pixel, ein Snippet, Script oder eine andere Instrumentierungstechnologie in einer unter Ihrer Kontrolle stehenden Umgebung installieren, können wir technische, analytische, verhaltensbezogene, strukturelle und betriebliche Daten zu dieser Umgebung empfangen, soweit dies zur Erbringung der Dienste erforderlich ist.",
	s2_5_title: "2.5. Integrationsdaten",
	s2_5_body:
		"Wenn Sie Vestigio mit Drittanbieter-Diensten verbinden, können wir alles erheben und verarbeiten, was technisch möglich und im Lesemodus („read“) rechtmäßig zugänglich ist, einschließlich Tokens, Metadaten, Snapshots, betrieblicher Daten, Katalogdaten, Konfigurationsdaten, Kampagnendaten, Ereignisdaten, Abrechnungsdaten, Performance-Daten, Store-Daten und weiterer für die beauftragte Funktionalität erforderlicher Informationen.",
	s2_5_items_intro:
		"Derzeitige oder geplante Integrationen können unter anderem umfassen:",
	s2_5_items: [
		"Paddle;",
		"Google;",
		"GitHub;",
		"Facebook;",
		"TikTok;",
		"Shopify;",
		"Nuvemshop.",
	],

	s3_title: "3. Art der von Vestigio durchgeführten Analysen",
	s3_body_1: "Vestigio kann analysieren:",
	s3_items: [
		"im Internet öffentlich zugängliche Daten;",
		"Strukturen und sichtbare Elemente von Websites, Shops, Seiten und digitalen Oberflächen;",
		"Daten, die durch übliches Browsen beobachtbar sind;",
		"Ergebnisse automatisierter Interaktionen, die denen eines regulären Kunden oder Besuchers entsprechen;",
		"Daten, die über Pixel, Snippet oder eine von Ihnen autorisierte Integration erhoben wurden.",
	],
	s3_body_2:
		"Sie sind allein verantwortlich dafür, Vestigio nur in Assets, Umgebungen, Konten, Domains, Seiten und Integrationen zu registrieren, zu verbinden oder zu installieren, für die Sie eine rechtmäßige Autorisierung besitzen.",
	s3_body_3:
		"Vestigio haftet nicht für Handlungen, die Sie außerhalb der Plattform vornehmen, noch für die unsachgemäße Nutzung der Dienste an Assets Dritter ohne angemessene Autorisierung.",

	s4_title: "4. Zwecke der Verarbeitung",
	s4_body: "Wir können Daten verarbeiten, um:",
	s4_items: [
		"Ihr Konto zu erstellen, zu authentifizieren, zu pflegen und zu verwalten;",
		"die Dienste bereitzustellen, zu betreiben, auszuführen, zu überwachen und zu verbessern;",
		"Audits, Analysen, Findings, Berichte, Antworten, Vorschläge und Outputs zu verarbeiten;",
		"kostenlose Testphasen, kostenpflichtige Tarife und KI-Credits anzubieten und zu verwalten;",
		"Rechnungsstellung, Zahlung, Verlängerungen, Abstimmungen und Finanzhistorie zu verarbeiten;",
		"Tickets, Anfragen und Support-Anfragen zu beantworten;",
		"Betrug, Missbrauch, unsachgemäße Nutzung, technische Fehler und Sicherheitsvorfälle zu erkennen, zu verhindern und zu untersuchen;",
		"Performance, Stabilität, Verfügbarkeit und Integrität der Plattform zu überwachen;",
		"gesetzliche, regulatorische, vertragliche und zur Rechtsverteidigung bestehende Pflichten zu erfüllen;",
		"legitime betriebliche, administrative, technische und kommerzielle Kommunikation durchzuführen;",
		"von Ihnen autorisierte Integrationen zu unterstützen;",
		"Audit-Trails, Logs und Betriebsnachweise zu führen.",
	],

	s5_title: "5. Rechtsgrundlagen",
	s5_body:
		"Soweit zutreffend, kann Vestigio personenbezogene Daten auf Grundlage einer oder mehrerer der folgenden rechtlichen Grundlagen verarbeiten:",
	s5_items: [
		"Vertragserfüllung oder vorvertragliche Maßnahmen;",
		"Erfüllung gesetzlicher oder regulatorischer Pflichten;",
		"regelmäßige Ausübung von Rechten in Gerichts-, Verwaltungs- oder Schiedsverfahren;",
		"berechtigtes Interesse, innerhalb der Grenzen der anwendbaren Gesetzgebung;",
		"Einwilligung, sofern erforderlich;",
		"Betrugsprävention und Sicherheit des Betroffenen und der Plattform.",
	],

	s6_title: "6. Zahlungen",
	s6_body:
		"Zahlungen an Vestigio können durch Paddle und durch am Abrechnungsprozess beteiligte Partner, Unterauftragsverarbeiter oder Finanzinstitute abgewickelt werden. Vestigio speichert keine vollständigen sensiblen Kartendaten, wenn die Verarbeitung durch spezialisierte Dritte erfolgt, kann jedoch Transaktionskennungen, Zahlungsstatus, Tarif, Abrechnungshistorie, Rechnungen, finanzielle Metadaten und für die Abonnementverwaltung erforderliche Informationen speichern.",

	s7_title: "7. Cookies, Pixel, Analytics und ähnliche Technologien",
	s7_body_1:
		"Vestigio kann Cookies, Local Storage, Pixel, Tags, Scripts, Logs, Identifikatoren und ähnliche Technologien einsetzen für:",
	s7_items_1: [
		"Authentifizierung und Sicherheit;",
		"Funktion der Website und der Anwendung;",
		"Speicherung von Präferenzen;",
		"Nutzungs- und Performance-Messung;",
		"Analytics;",
		"Verbesserung der Dienste;",
		"Attribution und Verhaltensanalyse;",
		"Unterstützung von Kampagnen und Traffic-Messung.",
	],
	s7_body_2: "Derzeit kann Vestigio unter anderem einsetzen:",
	s7_items_2: ["Google Analytics;", "Meta Pixel;", "Vestigio Pixel."],
	s7_body_3:
		"Tools, Anbieter und Technologien können im Laufe der Zeit geändert, hinzugefügt oder entfernt werden.",

	s8_title: "8. Datenweitergabe",
	s8_body_1: "Vestigio verkauft keine personenbezogenen Daten.",
	s8_body_2: "Wir können Daten im notwendigen Umfang teilen mit:",
	s8_items: [
		"Zahlungsabwicklern und Finanzpartnern;",
		"Hosting-, Infrastruktur-, Observability-, Analytics-, E-Mail-, Sicherheits-, Authentifizierungs- und Support-Anbietern;",
		"Plattformen und Integrationen, die Sie verbunden haben;",
		"Unternehmen derselben Wirtschaftsgruppe, verbundenen Unternehmen, Rechtsnachfolgern oder Erwerbern, im Falle einer Umstrukturierung, Fusion, Übernahme oder eines Vermögensverkaufs;",
		"Beratern, Wirtschaftsprüfern, Rechts-, Buchhaltungs- und Technikberatern, unter Vertraulichkeitsverpflichtung;",
		"Verwaltungs-, Regulierungs- oder Justizbehörden, sofern gesetzlich oder durch gültige Anordnung erforderlich.",
	],

	s9_title: "9. Internationaler Datentransfer",
	s9_body:
		"Ihre Daten können auf Servern und Systemen außerhalb Brasiliens gespeichert, verarbeitet oder abgerufen werden, auch durch Technologie- und Infrastrukturanbieter. In solchen Fällen trifft Vestigio angemessene Maßnahmen, um einen angemessenen Schutz im Einklang mit dem LGPD (brasilianisches Datenschutzgesetz) und anderen anwendbaren Vorschriften sicherzustellen.",

	s10_title: "10. Datenaufbewahrung",
	s10_body_1:
		"Vestigio kann Daten so lange aufbewahren, wie es zur Erfüllung der Zwecke dieser Richtlinie, zur Einhaltung gesetzlicher und regulatorischer Pflichten, zur Beweissicherung, zur Rechtsausübung und zur Aufrechterhaltung des Plattformbetriebs erforderlich ist.",
	s10_body_2:
		"Unbeschadet gesetzlicher Fristen oder spezifischer Aufbewahrungsanforderungen:",
	s10_items: [
		"betriebliche Daten zu Analysen, Findings, Berichten, Snapshots, Outputs und vergleichbaren Materialien können bis zu 30 (dreißig) Tage aufbewahrt werden;",
		"finanzielle, steuerliche, vertragliche Daten, Sicherheitsprotokolle und zur Rechtsverteidigung erforderliche Aufzeichnungen können für längere Zeiträume gemäß gesetzlicher, regulatorischer Anforderung oder hinreichend begründetem berechtigtem Interesse aufbewahrt werden.",
	],

	s11_title: "11. Informationssicherheit",
	s11_body_1:
		"Vestigio setzt angemessene technische, administrative und organisatorische Maßnahmen ein, um Daten vor unbefugtem Zugriff, Zerstörung, Verlust, Veränderung, unerlaubter Offenlegung oder jeglicher Form unangemessener oder rechtswidriger Verarbeitung zu schützen.",
	s11_body_2:
		"Vestigio bemüht sich, mit Kontrollen zu arbeiten, die mit dem LGPD und anerkannten Marktpraktiken für Sicherheit, Governance und Kontrolle übereinstimmen, einschließlich Verweisen auf weit verbreitete Marktstandards und Frameworks, etwa solche im Zusammenhang mit auditierbaren Umgebungen und Corporate-Compliance-Programmen.",
	s11_body_3:
		"Dennoch ist keine Umgebung absolut unverletzlich, und wir können keine absolute Sicherheit garantieren.",

	s12_title: "12. Rechte des Betroffenen",
	s12_body:
		"Nach geltendem Recht können Sie, soweit zutreffend, verlangen:",
	s12_items: [
		"Bestätigung des Bestehens einer Verarbeitung;",
		"Zugang zu den Daten;",
		"Berichtigung unvollständiger, unrichtiger oder veralteter Daten;",
		"Anonymisierung, Sperrung oder Löschung;",
		"Datenübertragbarkeit;",
		"Information über die Datenweitergabe;",
		"Überprüfung automatisierter Entscheidungen, soweit zutreffend;",
		"Widerruf der Einwilligung, sofern diese die Rechtsgrundlage ist;",
		"Widerspruch gegen bestimmte Verarbeitungen, im Rahmen der gesetzlichen Vorgaben.",
	],

	s13_title: "13. Anleitung zur Datenlöschung",
	s13_body_1:
		"Wenn Sie die Löschung Ihrer Daten beantragen möchten, senden Sie eine E-Mail an support@vestigio.io mit dem Betreff „Antrag auf Datenlöschung“ und geben Sie, falls möglich, an:",
	s13_items: [
		"Konto- oder Unternehmensname;",
		"registrierte E-Mail-Adresse;",
		"zugehörige Domain oder Asset;",
		"Beschreibung der zu löschenden Daten oder des Kontos.",
	],
	s13_body_2:
		"Vestigio bearbeitet gültige Löschanträge innerhalb von 7 (sieben) Tagen, soweit dies rechtlich und technisch möglich ist, außer in Fällen verpflichtender Aufbewahrung, Betrugsprävention, Sicherheit, Einhaltung gesetzlicher Pflichten, Beweissicherung und regelmäßiger Rechtsausübung.",

	s14_title: "14. Minderjährige",
	s14_body:
		"Vestigio ist nicht für Minderjährige unter 18 Jahren ohne die anwendbare rechtliche und vertragliche Autorisierung bestimmt.",

	s15_title: "15. Änderungen dieser Richtlinie",
	s15_body:
		"Vestigio kann diese Richtlinie jederzeit aktualisieren. Die jeweils gültige Fassung ist die zuletzt in unseren offiziellen Kanälen veröffentlichte.",

	s16_title: "16. Kontakt",
	s16_body:
		"Bei Fragen, Datenschutzanfragen, Datenlöschung oder Support kontaktieren Sie uns über:",
	s16_company: "VESTIGIO TECNOLOGIA LTDA",
	s16_cnpj: "CNPJ: 65.445.297/0001-44",
	s16_address:
		"Adresse: Av. Prefeito Osmar Cunha, 416, Sala 1108, Centro, Florianópolis/SC, PLZ 88.015-100, Brasilien",
	s16_email: "support@vestigio.io",
};

// ── inject ────────────────────────────────────

function injectPolicy(filename, policy) {
	const path = resolve(dictDir, filename);
	const raw = readFileSync(path, "utf8");
	const dict = JSON.parse(raw);
	if (dict.privacy_policy) {
		console.log(`[${filename}] privacy_policy already present — overwriting`);
	}
	dict.privacy_policy = policy;
	// Match existing tab indentation. JSON.stringify's `space` arg accepts a
	// string, so passing "\t" gives us tab indent everywhere.
	const out = JSON.stringify(dict, null, "\t") + "\n";
	writeFileSync(path, out, "utf8");
	console.log(`[${filename}] updated (${Object.keys(policy).length} keys)`);
}

injectPolicy("pt-BR.json", ptBR);
injectPolicy("en.json", en);
injectPolicy("es.json", es);
injectPolicy("de.json", de);

console.log("✓ done");
