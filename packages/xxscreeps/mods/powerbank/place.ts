import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { World } from 'xxscreeps/game/map.js';
import { registerIntentProcessor, registerShardInitializer, registerShardTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { pushIntentsForRoomNextTick } from 'xxscreeps/engine/processor/model.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition, positionsInRangeTo } from 'xxscreeps/game/position.js';
import { Room as RoomClass } from 'xxscreeps/game/room/index.js';
import { isHighwayRoom } from 'xxscreeps/game/room/sector.js';
import { create } from './powerbank.js';

// World-management placement policy for power banks. Each highway room runs an independent respawn
// countdown on the shard-tick substrate; there is no sector throughput target or decay coupling
// (those are deposit-specific). The countdown is tick-domain — vanilla's `powerBankTime` is itself
// a game-time deadline — so the schedule gates directly on the shard-tick `time` rather than a
// wall-clock poll.

const MAX_PLACEMENT_ATTEMPTS = 1000;

// Sorted set: score = the tick a room is next due, member = highway room name. One row per room.
const dueRoomsKey = 'powerbanks/dueRooms';

// 0.75x–1.25x of the base respawn time.
function respawnTime(): number {
	return Math.round(Math.random() * (C.POWER_BANK_RESPAWN_TIME / 2) + C.POWER_BANK_RESPAWN_TIME * 0.75);
}

// Capacity in [MIN, MAX), plus a MAX bonus on a critical roll.
function rollPower(): number {
	const base = Math.floor(Math.random() * (C.POWER_BANK_CAPACITY_MAX - C.POWER_BANK_CAPACITY_MIN)) + C.POWER_BANK_CAPACITY_MIN;
	return base + (Math.random() < C.POWER_BANK_CAPACITY_CRIT ? C.POWER_BANK_CAPACITY_MAX : 0);
}

// A wall position in 5..44 with at least one non-wall neighbour (incl. diagonals). The bounded loop
// guards against a wall-less room hanging the official unbounded `do/while`.
function findPlacement(world: World, roomName: string) {
	const terrain = world.map.getRoomTerrain(roomName);
	for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; ++attempt) {
		const xx = Math.floor(Math.random() * 40) + 5;
		const yy = Math.floor(Math.random() * 40) + 5;
		if (terrain.get(xx, yy) !== C.TERRAIN_MASK_WALL) continue;
		const from = new RoomPosition(xx, yy, roomName);
		const hasExit = Fn.some(positionsInRangeTo(from, 1), pos => terrain.get(pos.x, pos.y) !== C.TERRAIN_MASK_WALL);
		if (!hasExit) continue;
		return from;
	}
}

// Overwrites a room's next-due score; shared by the reschedule and tests.
export async function scheduleRoom(shard: Shard, roomName: string, dueAt: number) {
	await shard.data.zAdd(dueRoomsKey, [ [ dueAt, roomName ] ]);
}

// Seed every highway room's timer once at service start. Bootstrapping here rather than behind a
// per-tick "already seeded?" read keeps the steady-state tick free of setup I/O. The set is
// persistent, so `up: 'LT'` preserves timers a prior run already scheduled and only adds rooms
// new to the world. Rooms are seeded regardless of status — the placement-side `status === 'normal'`
// check is the gate, so a room that turns normal after boot still places instead of being filtered
// out here once.
registerShardInitializer(async shard => {
	const world = await shard.loadWorld();
	const seeds = Fn.pipe(
		world.entries(),
		$$ => Fn.filter($$, ([ roomName ]) => isHighwayRoom(roomName)),
		$$ => Fn.map($$, ([ roomName ]): [ score: number, roomName: string ] => [ shard.time + respawnTime(), roomName ]),
		$$ => [ ...$$ ],
	);
	if (seeds.length > 0) {
		await shard.data.zAdd(dueRoomsKey, seeds, { up: 'LT' });
	}
});

// Peek-and-reschedule (no zrem): a crash between peek and reschedule leaves the entry for retry.
registerShardTickProcessor(async (shard, time) => {
	const due = await shard.data.zRange(dueRoomsKey, 0, time, { by: 'SCORE' });
	if (due.length === 0) return;
	await Fn.mapAwait(due, async roomName => {
		// Placement waits for the room intent stage (live terrain); the timer advances now.
		const power = rollPower();
		const nextDue = time + respawnTime();
		await Promise.all([
			// Any id of length <= 2 is a system user, keeping the intent off the player pipeline.
			pushIntentsForRoomNextTick(shard, roomName, '1', {
				local: { placePowerBank: [ [ power ] ] },
				internal: true,
			}),
			scheduleRoom(shard, roomName, nextDue),
		]);
	});
});

// Placement runs at the room intent stage so it reads terrain via the live `world.map`.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const placePowerBankIntent = registerIntentProcessor(
	RoomClass, 'placePowerBank', { internal: true },
	(room, context, power: number) => {
		if (context.state.world.map.getRoomStatus(room.name).status !== 'normal') return;
		const placement = findPlacement(context.state.world, room.name);
		if (placement === undefined) return;
		const bank = create(placement, power);
		room['#insertObject'](bank);
		context.didUpdate();
		context.wakeAt(bank['#nextDecayTime']);
	});
declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { powerBank: typeof placePowerBankIntent }
}

// Test-only accessor so specs don't have to know the redis key shape.
export async function inspectDuePowerBankRoomsForTest(shard: Shard): Promise<[ score: number, roomName: string ][]> {
	return shard.data.zRangeWithScores(dueRoomsKey, 0, -1);
}
