import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { resolveOrgContext } from "@/libs/resolve-org";
import { RULER_VERSION } from "../../../../../packages/strategy-plan/sections/traffic-statement";

// ──────────────────────────────────────────────
// The series, as a file the customer owns.
//
// The CFO asked a question across three rounds that nobody had
// answered: if he cancels, does he keep the weeks or lose them?
//
//   "Se eu perco, cada mês que eu pago é também um mês de dado
//    sequestrado, e isso entra na minha conta de risco, não na de
//    custo."
//
// He is right that it is a risk question rather than a feature
// question, and it has an obvious answer: the measurements are his.
// PostHog is open source, so its data is portable by construction; a
// paid tool that locks the history is strictly worse on an axis the
// buyer already checks.
//
// Four reviewers asked for export and none of them called it a
// filter. The accountant drew the line: "exportar não é filtro, é
// entrega de papel de trabalho."
//
// CSV rather than JSON because the destination is a spreadsheet, which
// is where every one of them said they actually work. The ruler
// version rides in the file, so a series exported today and compared
// against one exported next year cannot silently mix two definitions.
// ──────────────────────────────────────────────

function csvCell(v: unknown): string {
	const s = v === null || v === undefined ? "" : String(v);
	return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
	const session = await getServerSession(authOptions);
	if (!session?.user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}
	const orgCtx = await resolveOrgContext();
	if (!orgCtx.orgId || !orgCtx.envId) {
		return NextResponse.json({ message: "no environment" }, { status: 404 });
	}

	try {
		const { prisma } = await import("@/libs/prismaDb");
		const rows = await prisma.$queryRawUnsafe<
			{
				day: Date;
				dimension: string;
				key: string;
				label: string | null;
				sessions: number;
				blind: number;
				action: number;
				purchases: number;
				contacts: number;
				rulerVersion: number;
			}[]
		>(
			`SELECT "day", "dimension", "key", "label", "sessions", "blind",
			        "action", "purchases", "contacts", "rulerVersion"
			 FROM "TrafficDailyRollup"
			 WHERE "envId" = $1
			 ORDER BY "day" ASC, "dimension" ASC, "sessions" DESC`,
			orgCtx.envId,
		);

		// Semicolon-separated: the destination is a Brazilian
		// spreadsheet, where the comma is the decimal separator and a
		// comma-separated file opens as one column.
		const head = [
			"dia",
			"dimensao",
			"chave",
			"nome",
			"acessos",
			"mudas",
			"chegaram_a_acao",
			"compras",
			"contatos",
			"taxa_mudas_pct",
			"regua",
		].join(";");

		const body = rows.map((r) =>
			[
				r.day.toISOString().slice(0, 10),
				r.dimension,
				r.key,
				r.label ?? "",
				r.sessions,
				r.blind,
				r.action,
				r.purchases,
				r.contacts,
				r.sessions > 0
					? String(Math.round((1000 * r.blind) / r.sessions) / 10).replace(".", ",")
					: "",
				r.rulerVersion,
			]
				.map(csvCell)
				.join(";"),
		);

		// A header the spreadsheet ignores and a human does not. The
		// ruler is stated in the file because a number without its
		// definition stops being auditable the moment it leaves here.
		const preamble = [
			`# Extrato de trafego pago, serie diaria`,
			`# Exportado em ${new Date().toISOString().slice(0, 10)}`,
			`# Regua em vigor na exportacao: v${RULER_VERSION}`,
			`# "mudas" = entrou pelo anuncio e nao deixou rastro: nao rolou, nao`,
			`#   teve botao entrando na tela, nao clicou, nao abriu formulario,`,
			`#   WhatsApp ou telefone, e nao abriu uma segunda pagina.`,
			`# Linhas com regua diferente foram medidas com outra definicao e nao`,
			`#   devem ser comparadas diretamente.`,
		].join("\n");

		const csv = `${preamble}\n${head}\n${body.join("\n")}\n`;
		return new NextResponse(csv, {
			headers: {
				"Content-Type": "text/csv; charset=utf-8",
				"Content-Disposition": `attachment; filename="vestigio-serie-${new Date().toISOString().slice(0, 10)}.csv"`,
				"Cache-Control": "no-store",
			},
		});
	} catch (err) {
		console.error("[traffic-export]", err);
		return NextResponse.json({ message: "Failed to export" }, { status: 500 });
	}
}
