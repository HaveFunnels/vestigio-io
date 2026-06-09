"use client";

import { useEffect, useState } from "react";
import type { StrategyPlan } from "@/components/strategy/types";

/*
 * Shared plan fetch hook used by the main plan route and the
 * standalone sub-pages (copy-lens, maps). Centralises the 423/404/200
 * handling + the export_token forwarding so the sub-pages don't
 * re-implement the polling and adapter layer.
 */

export type PlanFetchStatus = "loading" | "ready" | "generating" | "missing" | "error";

export interface PlanFetchState {
	status: PlanFetchStatus;
	plan?: StrategyPlan;
	error?: string;
}

function getEnvironmentId(): string {
	if (typeof window !== "undefined") {
		const params = new URLSearchParams(window.location.search);
		const fromUrl = params.get("env");
		if (fromUrl) return fromUrl;
		const match = document.cookie.match(/(?:^|;\s*)active_env=([^;]*)/);
		if (match?.[1]) return match[1];
	}
	return "default_env";
}

function adaptApiResponse(raw: any): StrategyPlan {
	return {
		...raw,
		generatedAt: new Date(raw.generatedAt),
		lastRegenerated: new Date(raw.lastRegenerated),
		nextSteps: (raw.nextSteps ?? []).map((s: any) => ({
			...s,
			dueAt: s.dueAt ? new Date(s.dueAt) : null,
		})),
	};
}

export function usePlanFetch(month: string | undefined): PlanFetchState {
	const [state, setState] = useState<PlanFetchState>({ status: "loading" });
	const envId = getEnvironmentId();

	useEffect(() => {
		if (!month) return;
		let cancelled = false;
		let pollTimer: ReturnType<typeof setTimeout> | null = null;

		const load = async () => {
			try {
				const sp = new URLSearchParams(window.location.search);
				const exportToken = sp.get("export_token");
				const qs = new URLSearchParams({ envId });
				if (exportToken) qs.set("export_token", exportToken);
				const res = await fetch(
					`/api/library/strategy/${encodeURIComponent(month)}?${qs.toString()}`,
				);
				if (cancelled) return;

				if (res.status === 423) {
					setState({ status: "generating" });
					pollTimer = setTimeout(load, 5000);
					return;
				}
				if (res.status === 404) {
					setState({ status: "missing" });
					return;
				}
				if (!res.ok) {
					setState({
						status: "error",
						error: `Falha ao carregar (HTTP ${res.status})`,
					});
					return;
				}
				const data = await res.json();
				setState({ status: "ready", plan: adaptApiResponse(data) });
			} catch (err) {
				if (cancelled) return;
				setState({
					status: "error",
					error: err instanceof Error ? err.message : "Erro desconhecido",
				});
			}
		};

		void load();
		return () => {
			cancelled = true;
			if (pollTimer) clearTimeout(pollTimer);
		};
	}, [month, envId]);

	return state;
}
