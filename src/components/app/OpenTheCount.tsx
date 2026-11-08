"use client";

import { useState } from "react";

// ──────────────────────────────────────────────
// Opening a counted number.
//
// "A palavra contagem não me protege, a auditoria protege. Se eu não
// consigo abrir a conta, contar e escrever com IA são o mesmo salto de
// fé com vocabulário diferente, e o seu vocabulário é mais arrogante."
//
// This is the control that makes the claim true. Each session shows
// every signal the predicate looked at, so a reader can check the
// verdict on an individual visit instead of taking the total on faith.
// ──────────────────────────────────────────────

interface SessionRow {
	at: string;
	mute: boolean;
	events: number;
	scroll: number;
	sawCta: boolean;
	clicked: boolean;
	paused: boolean;
	form: boolean;
	checkout: boolean;
	contact: string[];
	pages: number;
	durationS: number;
}

interface Props {
	dimension: "campaign" | "page";
	keyValue: string;
	/** The number on the row, so a mismatch is visible rather than
	 *  silent. */
	expected: number;
	label?: string;
}

export default function OpenTheCount({ dimension, keyValue, expected, label }: Props) {
	const [open, setOpen] = useState(false);
	const [rows, setRows] = useState<SessionRow[] | null>(null);
	const [matched, setMatched] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);

	const load = async () => {
		if (open) {
			setOpen(false);
			return;
		}
		setOpen(true);
		if (rows) return;
		try {
			const r = await fetch(
				`/api/traffic-statement/sessions?dimension=${dimension}&key=${encodeURIComponent(keyValue)}`,
			);
			const body = await r.json();
			if (!Array.isArray(body.sessions)) throw new Error(body.message ?? "sem dados");
			setRows(body.sessions);
			setMatched(typeof body.matched === "number" ? body.matched : null);
		} catch {
			setError("não foi possível abrir a conta agora");
		}
	};

	return (
		<>
			<button
				type="button"
				onClick={load}
				className="text-[11px] text-content-muted underline decoration-dotted underline-offset-2 hover:text-content"
				aria-expanded={open}
			>
				{open ? "fechar" : "abrir a conta"}
			</button>
			{open && (
				<div className="mt-2 rounded-mid border border-edge bg-surface-inset p-3">
					{error && <p className="text-[12px] text-attention">{error}</p>}
					{!error && !rows && (
						<div className="h-16 animate-pulse rounded bg-surface-card" />
					)}
					{rows && (
						<>
							<p className="mb-2 text-[11.5px] text-content-muted">
								{matched !== null && (
									<>
										A tabela contou <strong className="text-content">{expected}</strong>
										{matched !== expected ? (
											// A mismatch is shown, never smoothed. The row and
											// the list read the same window from the same
											// predicate, so a difference is information.
											<>
												{" "}
												e esta lista acha{" "}
												<strong className="text-attention">{matched}</strong>
											</>
										) : (
											<> e esta lista acha o mesmo</>
										)}
										. Mostrando {rows.length}
										{matched > rows.length && ` das ${matched}`}.
									</>
								)}
							</p>
							<div className="max-h-64 overflow-auto">
								<table className="w-full border-collapse text-[11.5px]">
									<thead>
										<tr className="text-left text-content-muted">
											<th className="py-1 pr-3 font-medium">Quando</th>
											<th className="py-1 pr-3 font-medium">Rolou</th>
											<th className="py-1 pr-3 font-medium">Tempo</th>
											<th className="py-1 font-medium">O que fez</th>
										</tr>
									</thead>
									<tbody>
										{rows.map((s, i) => {
											const did: string[] = [];
											if (s.sawCta) did.push("viu botão");
											if (s.clicked) did.push("clicou");
											if (s.paused) did.push("parou perto do botão");
											if (s.form) did.push("formulário");
											if (s.checkout) did.push("checkout");
											if (s.pages > 1) did.push(`${s.pages} páginas`);
											for (const c of s.contact) did.push(c);
											return (
												<tr key={`${s.at}-${i}`} className="border-t border-edge/60">
													<td className="py-1.5 pr-3 tabular-nums text-content-secondary">
														{s.at.slice(5, 16).replace("T", " ")}
													</td>
													<td className="py-1.5 pr-3 tabular-nums text-content-secondary">
														{s.scroll}%
													</td>
													<td className="py-1.5 pr-3 tabular-nums text-content-secondary">
														{s.durationS}s
													</td>
													<td className="py-1.5 text-content-secondary">
														{did.length === 0 ? (
															<span className="text-content-faint">nada</span>
														) : (
															did.join(", ")
														)}
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
							<p className="mt-2 text-[11px] leading-relaxed text-content-muted">
								Qualquer coisa na última coluna tira a visita da conta. {label}
							</p>
						</>
					)}
				</div>
			)}
		</>
	);
}
