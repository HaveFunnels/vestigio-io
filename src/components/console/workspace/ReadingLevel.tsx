"use client";

/**
 * ReadingLevel — Flesch-Kincaid grade level per crawled page
 * (Wave 11.5e).
 *
 * Computes FK Grade Level on the concatenation of title + h1 +
 * meta_description per page (the body text is not persisted —
 * those three fields are the visible-on-SERP copy and the most
 * leverage-bearing scope anyway).
 *
 * Formula:
 *   FKGL = 0.39 × (words/sentences) + 11.8 × (syllables/words) - 15.59
 *
 * Pure 🟢 — no LLM, no integration. Pure computation on existing
 * PageContent evidence.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

interface CopyPage {
	url: string;
	title: string | null;
	h1: string | null;
	meta_description: string | null;
	lang: string | null;
	word_count: number;
}

interface Response {
	pages: CopyPage[];
	cycleRef: string | null;
}

interface Row {
	url: string;
	grade: number;
	wordCount: number;
}

// Naive syllable counter — counts vowel groups. Good enough for FK on
// English-like text; produces a small error margin on languages with
// different vowel patterns (pt-BR slightly under-counts due to nasals)
// but the relative ordering between pages stays correct.
function countSyllables(word: string): number {
	const lower = word.toLowerCase();
	const groups = lower.match(/[aeiouáéíóúâêîôûãõàèìòùäëïöüy]+/g);
	if (!groups || groups.length === 0) return 1;
	let syllables = groups.length;
	// Silent trailing 'e' on English-style words
	if (/e$/.test(lower) && syllables > 1 && !/[aeiou][aeiou]e$/.test(lower)) {
		syllables -= 1;
	}
	return Math.max(1, syllables);
}

function computeFkGrade(text: string): { grade: number; words: number } | null {
	const trimmed = text.trim();
	if (trimmed.length === 0) return null;
	const sentenceSplit = trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 0);
	const sentences = Math.max(1, sentenceSplit.length);
	const words = trimmed.split(/\s+/).filter((w) => /[a-zA-Záéíóúâêîôûãõ]/.test(w));
	if (words.length < 3) return null; // not enough signal to grade
	const syllables = words.reduce((s, w) => s + countSyllables(w), 0);
	const grade =
		0.39 * (words.length / sentences) +
		11.8 * (syllables / words.length) -
		15.59;
	return { grade, words: words.length };
}

function assessmentTier(grade: number): "easy" | "moderate" | "complex" | "very_complex" {
	if (grade < 6) return "easy";
	if (grade < 10) return "moderate";
	if (grade < 14) return "complex";
	return "very_complex";
}

const ASSESSMENT_DOT: Record<string, string> = {
	easy: "bg-emerald-500",
	moderate: "bg-amber-500",
	complex: "bg-orange-500",
	very_complex: "bg-red-500",
};

const ASSESSMENT_TEXT: Record<string, string> = {
	easy: "text-emerald-600 dark:text-emerald-400",
	moderate: "text-amber-600 dark:text-amber-400",
	complex: "text-orange-600 dark:text-orange-400",
	very_complex: "text-red-500 dark:text-red-400",
};

function shortenUrl(url: string): string {
	try {
		const u = new URL(url);
		return u.pathname === "/" ? u.host : u.pathname;
	} catch {
		return url;
	}
}

export default function ReadingLevel() {
	const t = useTranslations("console.workspaces.detail.reading_level");
	const [data, setData] = useState<Response | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		fetch("/api/workspace/copy-content")
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => {
				if (cancelled) return;
				setData(d ?? null);
				setLoading(false);
			})
			.catch(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const rows = useMemo<Row[]>(() => {
		if (!data) return [];
		const out: Row[] = [];
		for (const p of data.pages) {
			const text = [p.title, p.h1, p.meta_description].filter(Boolean).join(". ");
			const fk = computeFkGrade(text);
			if (fk) out.push({ url: p.url, grade: fk.grade, wordCount: fk.words });
		}
		out.sort((a, b) => b.grade - a.grade);
		return out;
	}, [data]);

	if (loading) {
		return (
			<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
				<h2 className="mb-3 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
					{t("label")}
				</h2>
				<p className="text-[12px] text-content-muted">{t("loading")}</p>
			</section>
		);
	}

	if (rows.length === 0) {
		return (
			<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
				<h2 className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
					{t("label")}
				</h2>
				<p className="text-[13px] font-medium text-content">{t("empty_title")}</p>
				<p className="mt-1 text-[12px] text-content-muted">{t("empty_description")}</p>
			</section>
		);
	}

	const hasFriction = rows.some((r) => r.grade >= 12);

	return (
		<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
			<div className="mb-4">
				<h2 className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
					{t("label")}
				</h2>
				<p className="mt-1 text-[12px] text-content-muted">{t("subtitle")}</p>
			</div>
			<div className="overflow-hidden rounded-xl border border-edge">
				<table className="w-full text-left">
					<thead>
						<tr className="bg-surface-inset/60 text-[10px] font-semibold uppercase tracking-[0.08em] text-content-faint">
							<th className="px-3 py-2">{t("column_url")}</th>
							<th className="px-3 py-2 text-right">{t("column_grade")}</th>
							<th className="px-3 py-2 text-right">{t("column_assessment")}</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => {
							const tier = assessmentTier(r.grade);
							return (
								<tr key={r.url} className="border-t border-edge text-[12px]">
									<td className="px-3 py-2">
										<div className="font-mono text-[12px] text-content-secondary">
											{shortenUrl(r.url)}
										</div>
										<div className="mt-0.5 text-[10px] text-content-faint">
											{r.wordCount} words
										</div>
									</td>
									<td className="px-3 py-2 text-right font-mono text-[13px] font-medium tabular-nums text-content">
										{r.grade.toFixed(1)}
									</td>
									<td className={`px-3 py-2 text-right text-[11px] font-semibold ${ASSESSMENT_TEXT[tier]}`}>
										<span className="inline-flex items-center gap-1.5">
											<span className={`h-1.5 w-1.5 rounded-full ${ASSESSMENT_DOT[tier]}`} />
											{t(`assessment_${tier}`)}
										</span>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			{hasFriction && (
				<p className="mt-3 text-[11px] text-amber-600 dark:text-amber-400">{t("friction_note")}</p>
			)}
			<p className="mt-1 text-[11px] italic text-content-faint">{t("caveat")}</p>
		</section>
	);
}
