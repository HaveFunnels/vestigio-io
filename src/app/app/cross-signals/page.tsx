"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import ConsoleState from "@/components/console/ConsoleState";
import CrossSignalsShell from "@/components/console/cross-signals/CrossSignalsShell";
import type { CrossSignalChain } from "@/lib/dashboard/types";

// ──────────────────────────────────────────────
// Cross-Signals Page — Dedicated view for all chains
//
// Fetches from /api/cross-signals and renders the
// CrossSignalsShell client component.
// ──────────────────────────────────────────────

type DataState =
	| { status: "loading" }
	| { status: "loaded"; chains: CrossSignalChain[] }
	| { status: "error"; message: string };

export default function CrossSignalsPage() {
	const t = useTranslations("console.cross_signals");
	const [state, setState] = useState<DataState>({ status: "loading" });

	useEffect(() => {
		fetch("/api/cross-signals")
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json();
			})
			.then((data) => {
				setState({ status: "loaded", chains: data.chains || [] });
			})
			.catch((err) => {
				setState({ status: "error", message: err.message });
			});
	}, []);

	return (
		<ConsoleState state={
			state.status === "loading" ? { status: "loading" }
			: state.status === "error" ? { status: "error", message: state.message }
			: { status: "ready", data: state.chains }
		}>
			{(chains) => <CrossSignalsShell chains={chains} />}
		</ConsoleState>
	);
}
