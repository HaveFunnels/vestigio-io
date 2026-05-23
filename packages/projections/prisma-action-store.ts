// Wave 18t-B — relational store for ActionProjection rows.
//
// Mirrors PrismaFindingStore: batched INSERT ... ON CONFLICT DO UPDATE
// keyed on `(cycleId, actionKey)` so cycle re-runs upsert in place.
// Each row carries the full ActionProjection JSON in `projection` for
// drawer rehydration, plus indexed columns (severity, category,
// surface, decisionKey) for fast filters and dashboard GROUP BY dedupe.
//
// Backward-compat note: cycles predating this table have zero Action
// rows. API readers fall through to projectionsCache when the table
// is empty for a given cycleId — see src/lib/console-data.ts.

import type { ActionProjection } from "./types";

export interface SaveActionsResult {
	written: number;
	attempted: number;
	failed: Array<{ action_key: string; error: string }>;
}

export class PrismaActionStore {
	constructor(private prisma: any) {}

	async saveForCycle(
		args: {
			cycleId: string;
			environmentId: string;
			cycleRef: string;
			actions: ActionProjection[];
		},
		tx?: any,
	): Promise<SaveActionsResult> {
		const { cycleId, environmentId, cycleRef, actions } = args;
		const result: SaveActionsResult = { written: 0, attempted: actions.length, failed: [] };
		if (actions.length === 0) return result;

		// Dedupe by action_key: the unique constraint is (cycleId, actionKey)
		// and ON CONFLICT DO UPDATE cannot affect the same row twice in one
		// batch. If the engine emits duplicate action_keys (shouldn't happen
		// but defensive), keep the highest priority_score.
		const byKey = new Map<string, ActionProjection>();
		for (const a of actions) {
			const existing = byKey.get(a.id);
			if (!existing || (a.priority_score ?? 0) > (existing.priority_score ?? 0)) {
				byKey.set(a.id, a);
			}
		}
		const deduped = Array.from(byKey.values());

		const client = tx ?? this.prisma;
		const BATCH_SIZE = 50;

		for (let offset = 0; offset < deduped.length; offset += BATCH_SIZE) {
			const batch = deduped.slice(offset, offset + BATCH_SIZE);
			const params: unknown[] = [];
			const valueRows: string[] = [];

			for (const a of batch) {
				const baseIdx = params.length;
				const decisionKey = a.id
					.replace(/_secondary_\d+$/, "")
					.replace(/_verify_\d+$/, "")
					.replace(/_primary$/, "");
				const inferenceKeysJson = a.inference_keys && a.inference_keys.length > 0
					? JSON.stringify(a.inference_keys)
					: null;
				const surface = a.affected_surfaces?.[0] ?? null;
				params.push(
					cycleId,                                  // $baseIdx+1
					environmentId,                            // $baseIdx+2
					cycleRef,                                 // $baseIdx+3
					a.id,                                     // $baseIdx+4 actionKey
					decisionKey,                              // $baseIdx+5
					a.category,                               // $baseIdx+6
					a.action_type,                            // $baseIdx+7
					a.severity,                               // $baseIdx+8
					a.impact?.monthly_range.min ?? null,      // $baseIdx+9
					a.impact?.monthly_range.max ?? null,      // $baseIdx+10
					a.impact?.midpoint ?? null,               // $baseIdx+11
					a.priority_score ?? 0,                    // $baseIdx+12
					surface,                                  // $baseIdx+13
					inferenceKeysJson,                        // $baseIdx+14
					JSON.stringify(a),                        // $baseIdx+15
					// Wave 22.5 — surface_kind aggregated across linked findings.
					a.surface_kind ?? null,                   // $baseIdx+16
				);
				const placeholders = Array.from({ length: 16 }, (_, i) => `$${baseIdx + i + 1}`);
				valueRows.push(`(gen_random_uuid(), ${placeholders.join(", ")}, NOW())`);
			}

			const sql = `
				INSERT INTO "Action" (
					"id", "cycleId", "environmentId", "cycleRef", "actionKey",
					"decisionKey", "category", "actionType", "severity",
					"impactMin", "impactMax", "impactMidpoint",
					"priorityScore", "surface", "inferenceKeysJson",
					"projection", "surfaceKind", "createdAt"
				)
				VALUES ${valueRows.join(",\n                       ")}
				ON CONFLICT ("cycleId", "actionKey") DO UPDATE SET
					"decisionKey"       = EXCLUDED."decisionKey",
					"category"          = EXCLUDED."category",
					"actionType"        = EXCLUDED."actionType",
					"severity"          = EXCLUDED."severity",
					"impactMin"         = EXCLUDED."impactMin",
					"impactMax"         = EXCLUDED."impactMax",
					"impactMidpoint"    = EXCLUDED."impactMidpoint",
					"priorityScore"     = EXCLUDED."priorityScore",
					"surface"           = EXCLUDED."surface",
					"inferenceKeysJson" = EXCLUDED."inferenceKeysJson",
					"projection"        = EXCLUDED."projection",
					"surfaceKind"       = EXCLUDED."surfaceKind"
			`;

			try {
				await client.$executeRawUnsafe(sql, ...params);
				result.written += batch.length;
			} catch (err) {
				console.error(
					`[prisma-action-store] batch insert failed (${batch.length} rows), falling back to individual upserts:`,
					err,
				);
				for (const a of batch) {
					const decisionKey = a.id
						.replace(/_secondary_\d+$/, "")
						.replace(/_verify_\d+$/, "")
						.replace(/_primary$/, "");
					const inferenceKeysJson = a.inference_keys && a.inference_keys.length > 0
						? JSON.stringify(a.inference_keys)
						: null;
					const surface = a.affected_surfaces?.[0] ?? null;
					try {
						await client.action.upsert({
							where: { cycleId_actionKey: { cycleId, actionKey: a.id } },
							create: {
								cycleId,
								environmentId,
								cycleRef,
								actionKey: a.id,
								decisionKey,
								category: a.category,
								actionType: a.action_type,
								severity: a.severity,
								impactMin: a.impact?.monthly_range.min ?? null,
								impactMax: a.impact?.monthly_range.max ?? null,
								impactMidpoint: a.impact?.midpoint ?? null,
								priorityScore: a.priority_score ?? 0,
								surface,
								inferenceKeysJson,
								projection: JSON.stringify(a),
								surfaceKind: a.surface_kind ?? null,
							},
							update: {
								decisionKey,
								category: a.category,
								actionType: a.action_type,
								severity: a.severity,
								impactMin: a.impact?.monthly_range.min ?? null,
								impactMax: a.impact?.monthly_range.max ?? null,
								impactMidpoint: a.impact?.midpoint ?? null,
								priorityScore: a.priority_score ?? 0,
								surface,
								inferenceKeysJson,
								projection: JSON.stringify(a),
								surfaceKind: a.surface_kind ?? null,
							},
						});
						result.written++;
					} catch (fallbackErr) {
						const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
						result.failed.push({ action_key: a.id, error: msg });
						console.error(`[prisma-action-store] upsert failed for ${a.id}:`, fallbackErr);
					}
				}
			}
		}
		return result;
	}
}
