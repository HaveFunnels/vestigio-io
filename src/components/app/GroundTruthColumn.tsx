"use client";

import { useState } from "react";

// ──────────────────────────────────────────────
// The column we cannot measure, and the person who can.
//
// The dentist offered the trade himself, which is the only reason this
// screen is allowed to exist: "eu preencho duas células por semana se
// vocês me devolverem a costura. Agendados e compareceram. O resto
// vocês medem."
//
// Two things make it work or kill it.
//
// Restraint. Two inputs, not fourteen. Every field added here is a
// field that stops being filled, and a column filled three weeks and
// abandoned is worse than an empty one, because the stitch built on it
// looks continuous and is not.
//
// And the return. He said "se vocês me devolverem", and he meant it as
// a condition. A form that takes two numbers a week and gives nothing
// back is data entry, and nobody does data entry for a vendor twice.
// So the stitched sentence sits directly above the inputs, not on
// another screen.
//
// What the stitch is NOT allowed to say is a cause. Counting weeks
// that moved together is a count; on eight weeks it is barely that.
// The copy says "andaram juntas" and never "porque".
// ──────────────────────────────────────────────

export interface StitchedWeek {
	week: string;
	blindPct: number;
	outcome: number | null;
	outcomeKind: "showed" | "booked" | "revenue" | null;
	note: string | null;
	changes: string[];
}

export interface StitchData {
	weeks: StitchedWeek[];
	paired: number;
	together: number;
	against: number;
	sayable: boolean;
	outcomeKind: "showed" | "booked" | "revenue" | null;
	filledWeeks: number;
}

const OUTCOME_NOUN: Record<string, { label: string; col: string }> = {
	showed: { label: "quem compareceu", col: "Compareceram" },
	booked: { label: "quem agendou", col: "Agendaram" },
	revenue: { label: "o seu faturamento", col: "Faturamento" },
};

/** Monday of the current week, which is the row the operator is being
 *  asked to fill. */
function thisMonday(): string {
	const d = new Date();
	const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
	const shift = (new Date(utc).getUTCDay() + 6) % 7;
	return new Date(utc - shift * 86400000).toISOString().slice(0, 10);
}

export default function GroundTruthColumn({
	stitch,
	onSaved,
}: {
	stitch: StitchData | null;
	onSaved: () => void;
}) {
	const [week, setWeek] = useState(thisMonday());
	const [booked, setBooked] = useState("");
	const [showed, setShowed] = useState("");
	const [note, setNote] = useState("");
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [changeWhat, setChangeWhat] = useState("");
	const [changeOn, setChangeOn] = useState(new Date().toISOString().slice(0, 10));
	const [changeSaved, setChangeSaved] = useState(false);

	const save = async () => {
		setSaving(true);
		setError(null);
		try {
			const r = await fetch("/api/traffic-ground-truth", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ week, booked, showed, note }),
			});
			if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? "erro");
			setSaved(true);
			setBooked("");
			setShowed("");
			setNote("");
			onSaved();
		} catch {
			setError("não deu para salvar agora. Tenta de novo em um minuto.");
		} finally {
			setSaving(false);
		}
	};

	const saveChange = async () => {
		if (!changeWhat.trim()) return;
		try {
			const r = await fetch("/api/traffic-ground-truth/changes", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ what: changeWhat, happenedOn: changeOn }),
			});
			if (!r.ok) throw new Error("erro");
			setChangeWhat("");
			setChangeSaved(true);
			onSaved();
		} catch {
			setError("não deu para salvar a anotação agora.");
		}
	};

	const noun = stitch?.outcomeKind ? OUTCOME_NOUN[stitch.outcomeKind] : null;
	const filled = stitch?.filledWeeks ?? 0;

	return (
		<div className="mb-6 rounded-card border border-edge bg-surface-card px-5 py-4">
			<div className="mb-1 text-[14.5px] font-semibold text-content">
				A parte que a gente não consegue medir
			</div>
			<p className="mb-4 text-[12.5px] leading-relaxed text-content-muted">
				O pixel vê o site. Ele não vê a cadeira, não vê a ligação que fechou e não vê quem
				marcou e não apareceu. Se você escrever duas células por semana, a gente costura com
				o que mediu.
			</p>

			{/* The return, placed above the inputs because that is the
			    order the trade was offered in. */}
			{stitch && stitch.sayable && noun && (
				<p className="mb-4 rounded-mid border border-edge bg-surface-inset px-3.5 py-3 text-[13.5px] leading-relaxed text-content">
					Em <strong>{stitch.paired}</strong> semanas as duas colunas se mexeram de
					verdade. Em <strong>{stitch.together}</strong> delas a perda subiu enquanto{" "}
					{noun.label} caía, ou o contrário. Em <strong>{stitch.against}</strong> as duas
					subiram ou caíram juntas.
					<span className="mt-1.5 block text-[12px] text-content-muted">
						{/* The sentence that keeps this honest. Nine weeks of two
						    columns is not evidence of a cause, and a product that
						    prints a coefficient here would be lying with
						    arithmetic. */}
						Isso é uma contagem de semanas, não uma causa. Serve para você saber onde
						olhar, não para fechar a conta.
					</span>
				</p>
			)}
			{stitch && !stitch.sayable && filled > 0 && (
				<p className="mb-4 text-[12.5px] leading-relaxed text-content-secondary">
					{filled} {filled === 1 ? "semana preenchida" : "semanas preenchidas"}. A costura
					aparece quando as duas colunas tiverem se mexido junto em algumas semanas, porque
					antes disso qualquer padrão que a gente desenhasse seria sorte.
				</p>
			)}

			<div className="flex flex-wrap items-end gap-3">
				<label className="flex flex-col gap-1">
					<span className="text-[11px] text-content-muted">Semana (segunda)</span>
					<input
						type="date"
						value={week}
						onChange={(e) => setWeek(e.target.value)}
						className="w-[9.5rem] rounded-mid border border-edge bg-surface-inset px-2.5 py-1.5 text-[13px] text-content"
					/>
				</label>
				<label className="flex flex-col gap-1">
					<span className="text-[11px] text-content-muted">Agendaram</span>
					<input
						type="number"
						min={0}
						inputMode="numeric"
						value={booked}
						onChange={(e) => setBooked(e.target.value)}
						className="w-24 rounded-mid border border-edge bg-surface-inset px-2.5 py-1.5 text-[13px] tabular-nums text-content"
					/>
				</label>
				<label className="flex flex-col gap-1">
					<span className="text-[11px] text-content-muted">Compareceram</span>
					<input
						type="number"
						min={0}
						inputMode="numeric"
						value={showed}
						onChange={(e) => setShowed(e.target.value)}
						className="w-24 rounded-mid border border-edge bg-surface-inset px-2.5 py-1.5 text-[13px] tabular-nums text-content"
					/>
				</label>
				<label className="flex min-w-[12rem] flex-1 flex-col gap-1">
					<span className="text-[11px] text-content-muted">
						Algo sobre a semana (opcional)
					</span>
					<input
						type="text"
						value={note}
						onChange={(e) => setNote(e.target.value)}
						placeholder="feriado na quinta, fechamos mais cedo"
						className="w-full rounded-mid border border-edge bg-surface-inset px-2.5 py-1.5 text-[13px] text-content placeholder:text-content-faint"
					/>
				</label>
				<button
					type="button"
					onClick={save}
					disabled={saving || (!booked && !showed && !note)}
					className="rounded-pill bg-accent px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
				>
					{saving ? "salvando" : "salvar a semana"}
				</button>
			</div>
			{saved && !error && (
				<p className="mt-2 text-[12px] text-accent-text">
					Salvo. Se você preencher a mesma semana de novo, a gente corrige em vez de somar.
				</p>
			)}
			{error && <p className="mt-2 text-[12px] text-attention">{error}</p>}

			{/* The log, from the other end of the same problem: "o meu
			    problema não é não saber a taxa, é não saber o que eu
			    mexi. Trocamos a foto do produto em algum momento de
			    setembro e ninguém anotou." */}
			{/* The warning goes next to the field, not in the policy.
			    The policy is what covers us; this is what actually
			    prevents the thing. A dentist typing "Maria faltou" into
			    a note is the realistic failure, and we cannot detect it:
			    trying to would mean guessing at names and producing
			    false confidence. So the only honest control is telling
			    the person before they type.

			    Asked for by the DPO on the second council, who did not
			    evaluate whether the feature was useful: "voces acabaram
			    de criar uma tabela que guarda quantos pacientes
			    compareceram num consultorio odontologico." */}
			<p className="mt-3 text-[11.5px] leading-relaxed text-content-muted">
				Só totais da semana, por favor. Não escreva nome, telefone ou qualquer coisa que
				identifique uma pessoa: a gente não precisa disso para costurar, e esses campos são
				lidos por gente, não interpretados por máquina.
			</p>

			<div className="mt-5 border-t border-edge pt-4">
				<div className="mb-2 text-[13px] font-semibold text-content">
					Mexeu em alguma coisa? Anota aqui
				</div>
				<p className="mb-3 text-[12px] leading-relaxed text-content-muted">
					Quando a taxa muda, a primeira pergunta é o que mudou. Isso fica marcado na
					semana e aparece junto do número, com a data que você lembra, não a de hoje.
				</p>
				<div className="flex flex-wrap items-end gap-3">
					<label className="flex flex-col gap-1">
						<span className="text-[11px] text-content-muted">Quando</span>
						<input
							type="date"
							value={changeOn}
							onChange={(e) => setChangeOn(e.target.value)}
							className="w-[9.5rem] rounded-mid border border-edge bg-surface-inset px-2.5 py-1.5 text-[13px] text-content"
						/>
					</label>
					<label className="flex min-w-[14rem] flex-1 flex-col gap-1">
						<span className="text-[11px] text-content-muted">O que você mexeu</span>
						<input
							type="text"
							value={changeWhat}
							onChange={(e) => setChangeWhat(e.target.value)}
							placeholder="trocamos a foto do produto"
							className="w-full rounded-mid border border-edge bg-surface-inset px-2.5 py-1.5 text-[13px] text-content placeholder:text-content-faint"
						/>
					</label>
					<button
						type="button"
						onClick={saveChange}
						disabled={!changeWhat.trim()}
						className="rounded-pill border border-edge px-4 py-1.5 text-[13px] font-medium text-content disabled:opacity-40"
					>
						anotar
					</button>
				</div>
				{changeSaved && <p className="mt-2 text-[12px] text-accent-text">Anotado.</p>}
			</div>

			{/* The stitched history, which is the proof the trade is
			    being honoured. */}
			{stitch && filled > 0 && (
				<div className="mt-5 max-h-64 overflow-auto rounded-mid border border-edge bg-surface-inset">
					<table className="w-full border-collapse text-[12px]">
						<thead className="sticky top-0 bg-surface-inset">
							<tr className="text-left text-content-muted">
								<th className="px-3 py-2 font-medium">Semana</th>
								<th className="px-3 py-2 text-right font-medium">Mudas</th>
								<th className="px-3 py-2 text-right font-medium">
									{noun?.col ?? "Seu número"}
								</th>
								<th className="px-3 py-2 font-medium">O que mexeu</th>
							</tr>
						</thead>
						<tbody>
							{[...stitch.weeks].reverse().map((w) => (
								<tr key={w.week} className="border-t border-edge/60">
									<td className="px-3 py-2 tabular-nums text-content-secondary">
										{w.week.slice(5)}
									</td>
									<td className="px-3 py-2 text-right tabular-nums text-content-secondary">
										{w.blindPct.toFixed(0)}%
									</td>
									<td className="px-3 py-2 text-right tabular-nums text-content-secondary">
										{w.outcome === null ? (
											<span className="text-content-faint">em branco</span>
										) : (
											w.outcome
										)}
									</td>
									<td className="px-3 py-2 text-content-secondary">
										{w.changes.length === 0 && !w.note ? (
											<span className="text-content-faint">nada anotado</span>
										) : (
											[...w.changes, w.note].filter(Boolean).join("; ")
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
