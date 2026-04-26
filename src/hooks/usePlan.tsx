"use client";

import { createContext, useContext, type ReactNode } from "react";

// ──────────────────────────────────────────────
// Plan Context — lightweight provider for org plan
//
// Mounted in AppSidebarLayout, which already has the plan
// prop from the server. No extra fetches needed.
//
// Widgets, upgrade nudges, and feedback moments all use
// usePlan() to gate themselves by plan tier.
// ──────────────────────────────────────────────

interface PlanContext {
	plan: string;
	isStarter: boolean;
	isPro: boolean;
	isMax: boolean;
}

const PlanCtx = createContext<PlanContext>({
	plan: "vestigio",
	isStarter: true,
	isPro: false,
	isMax: false,
});

export function PlanProvider({
	plan,
	children,
}: {
	plan: string;
	children: ReactNode;
}) {
	const value: PlanContext = {
		plan,
		isStarter: plan === "vestigio",
		isPro: plan === "pro",
		isMax: plan === "max",
	};

	return <PlanCtx.Provider value={value}>{children}</PlanCtx.Provider>;
}

export function usePlan(): PlanContext {
	return useContext(PlanCtx);
}
