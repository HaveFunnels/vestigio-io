// ────────────────────────��─────────────────────
// Remediation Prompt Generator — Vibecoding Bridge
//
// Generates a context-rich prompt from an ActionProjection that
// the user can copy into any AI coding tool (Cursor, Claude Code,
// Replit, Lovable, Codex) to implement the fix.
//
// Zero LLM cost — pure string template with placeholders.
// Technology-aware via detected tech stack.
// ──────────────────────────────────────────────

import type { ActionProjection } from "../../packages/projections/types";

interface PromptContext {
	action: ActionProjection;
	domain?: string;
	techStack?: string[];
}

/**
 * Generate a remediation prompt for AI coding tools.
 * Returns a copy-ready string.
 */
export function generateRemediationPrompt(ctx: PromptContext): string {
	const { action, domain, techStack } = ctx;

	const sections: string[] = [];

	// Header
	sections.push(`# Fix: ${action.title}`);
	sections.push("");

	// Context
	sections.push("## Context");
	if (domain) sections.push(`- **Site:** ${domain}`);
	sections.push(`- **Severity:** ${action.severity}`);
	if (action.impact) {
		const mid = action.impact.midpoint;
		sections.push(`- **Estimated monthly impact:** $${mid.toLocaleString()}/mo`);
	}
	if (action.category) {
		sections.push(`- **Category:** ${action.category}`);
	}
	sections.push("");

	// Tech stack
	if (techStack && techStack.length > 0) {
		sections.push("## Detected Tech Stack");
		sections.push(techStack.map((t) => `- ${t}`).join("\n"));
		sections.push("");
	}

	// Problem description
	sections.push("## Problem");
	sections.push(action.description || "No description available.");
	sections.push("");

	// Root cause
	if (action.root_cause) {
		sections.push("## Root Cause");
		sections.push(action.root_cause);
		sections.push("");
	}

	// Remediation steps
	if (action.remediation_steps && action.remediation_steps.length > 0) {
		sections.push("## Remediation Steps");
		action.remediation_steps.forEach((step, i) => {
			sections.push(`${i + 1}. ${step}`);
		});
		sections.push("");
	}

	// Effort hint
	if (action.estimated_effort_hours) {
		sections.push(`**Estimated effort:** ~${action.estimated_effort_hours}h`);
		sections.push("");
	}

	// Verification
	sections.push("## Verification");
	sections.push("After implementing the fix:");
	if (action.verification_notes) {
		sections.push(`- ${action.verification_notes}`);
	}
	sections.push("- Deploy and verify the fix is live");
	sections.push("- Return to Vestigio and click 'Validate fix' to confirm the remediation worked");
	sections.push("");

	// Instructions for the AI tool
	sections.push("## Instructions");
	sections.push("Implement the remediation steps above. Follow the existing code patterns and conventions in the codebase. Make minimal, focused changes — fix only what's described, don't refactor surrounding code.");

	return sections.join("\n");
}
