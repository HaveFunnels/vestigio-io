import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const cycleId = "cmq6x9ays0009jqebn055kqhu";
console.log("Waiting for cycle", cycleId, "to complete...");
const start = Date.now();
let lastPhase = "";
while (Date.now() - start < 25 * 60_000) {
	const c = await p.auditCycle.findUnique({
		where: { id: cycleId },
		select: { status: true, currentPhase: true, completedAt: true, lastError: true },
	});
	if (!c) {
		console.log("Cycle not found");
		break;
	}
	if (c.currentPhase !== lastPhase) {
		console.log(`[${new Date().toISOString().slice(11, 19)}] status=${c.status} phase=${c.currentPhase ?? "(none)"}`);
		lastPhase = c.currentPhase ?? "";
	}
	if (c.status === "complete" || c.status === "failed") {
		console.log(`\n✓ Final: status=${c.status} phase=${c.currentPhase} err=${c.lastError ?? "(none)"}`);
		break;
	}
	await new Promise((r) => setTimeout(r, 5000));
}
await p.$disconnect();
