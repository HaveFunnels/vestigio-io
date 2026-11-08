"use client";

import { useState } from "react";
import { IconCheck, IconCopy } from "./traffic-icons";

// ──────────────────────────────────────────────
// A campaign name, shaped for what it is actually for.
//
// These names are not written to be read. They are written to be found
// again in the ad manager: "(1-3-X | H1-H4/C1 | POTE) aberto adv+
// (29/08) Cópia Cópia Cópia Cópia Cópia Cópia". Eight of twenty
// reviewers raised them, and the complaint was always the same shape,
// that the name column was wider than every number on the row
// combined. One counted the repetitions with a finger on the screen to
// tell two rows apart.
//
// So the name truncates and the function moves to a button: one click
// puts the full string on the clipboard, where it is pasted into the
// ad manager's search box. The visible text stops competing with the
// data and the name still does its job.
// ──────────────────────────────────────────────

interface Props {
	/** The full name, which is what gets copied. */
	name: string;
	/** The shortened label, already disambiguated by the engine. */
	label: string;
	/** On the deep anchor card the pill has to sit on a dark ground. */
	tone?: "light" | "deep";
}

export default function CampaignPill({ name, label, tone = "light" }: Props) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		const done = () => {
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1500);
		};
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(name);
				done();
				return;
			}
		} catch {
			// Clipboard API is unavailable in some embedded and
			// insecure contexts, so the button still has to work there
			// rather than failing silently.
		}
		const ta = document.createElement("textarea");
		ta.value = name;
		ta.setAttribute("readonly", "");
		ta.style.position = "fixed";
		ta.style.top = "-1000px";
		ta.style.opacity = "0";
		document.body.appendChild(ta);
		ta.select();
		try {
			document.execCommand("copy");
			done();
		} catch {
			// Nothing left to try. Better to do nothing than to claim a
			// copy that did not happen.
		}
		document.body.removeChild(ta);
	};

	const deep = tone === "deep";
	return (
		<span
			className={`inline-flex max-w-full items-center rounded-pill border ${
				deep ? "border-white/20 bg-white/[0.14]" : "border-edge bg-surface-inset"
			}`}
		>
			<span
				title={name}
				className={`truncate py-1 pl-3 pr-1 font-mono text-[11.5px] ${
					deep ? "text-white" : "text-content"
				}`}
				style={{ maxWidth: 250 }}
			>
				{label}
			</span>
			<button
				type="button"
				onClick={copy}
				aria-label={copied ? "Nome copiado" : "Copiar nome da campanha"}
				className={`grid place-items-center rounded-pill py-1.5 pl-1.5 pr-2.5 transition-colors ${
					deep
						? "text-emerald-100/80 hover:bg-white/15 hover:text-white"
						: "text-content-muted hover:bg-surface-card-hover hover:text-content"
				} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent`}
			>
				{copied ? (
					<IconCheck size={14} className={deep ? "text-emerald-300" : "text-accent-text"} />
				) : (
					<IconCopy size={14} />
				)}
			</button>
		</span>
	);
}
