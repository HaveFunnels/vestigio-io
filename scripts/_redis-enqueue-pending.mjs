import Redis from "ioredis";
const PREFIX = "vestigio:auditq";
const cycleId = "cmq70858o000pmw0fp774rxqo";
const r = new Redis(process.env.REDIS_URL);
const listKey = PREFIX + ":priority:hot";
const meta = PREFIX + ":meta:" + cycleId;
const existing = await r.lrange(listKey, 0, -1);
if (existing.includes(cycleId)) {
	console.log("Already in queue — worker not polling");
} else {
	const pipe = r.pipeline();
	pipe.rpush(listKey, cycleId);
	pipe.hmset(meta, {
		cycleId,
		environmentId: "cmot57x2i006cbidwuwaw5z3s",
		organizationId: "cmot0oiyc0031bidwhtuh1mnr",
		priority: "hot",
		enqueuedAt: new Date().toISOString(),
	});
	pipe.expire(meta, 86400);
	const res = await pipe.exec();
	console.log("Pushed. Result:", res.map(x => x[1]));
}
const lens = await Promise.all([
	r.llen(PREFIX + ":priority:hot"),
	r.llen(PREFIX + ":priority:warm"),
	r.llen(PREFIX + ":priority:cold"),
]);
console.log("Queue lens: hot=" + lens[0] + " warm=" + lens[1] + " cold=" + lens[2]);
r.disconnect();
