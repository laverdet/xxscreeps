import type { World } from 'xxscreeps/game/map.js';
import { registerIntentProcessor, registerShardInitializer, registerShardTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { pushIntentsForRoomNextTick } from 'xxscreeps/engine/processor/model.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition, positionsInRangeTo } from 'xxscreeps/game/position.js';
import { Room as RoomClass } from 'xxscreeps/game/room/index.js';
import { isHighwayRoom } from 'xxscreeps/game/room/sector.js';
import { dueRoomsAt, scheduleRoom, seedRooms } from './model.js';
import { create } from './powerbank.js';

// World-management placement policy for power banks. Each highway room runs an independent respawn
// countdown; the next-due tick is authoritative on the room (`#nextPowerBankTime`) and the scratch
// schedule that drives the per-tick sweep is rebuilt from it on init. There is no sector throughput
// target or decay coupling (those are deposit-specific). The countdown is tick-domain — vanilla's
// `powerBankTime` is itself a game-time deadline — so the schedule gates directly on the shard-tick
// `time` rather than a wall-clock poll.

const MAX_PLACEMENT_ATTEMPTS = 1000;

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

// Rebuild the placement schedule when the shard's services start. Each highway room's next-due tick
// is read back from its persisted `#nextPowerBankTime`; a room that has never placed a bank gets an
// initial countdown rolled here. Seeding at startup, rather than behind a per-tick "already seeded?"
// read, keeps the steady-state tick free of setup I/O.
registerShardInitializer(async shard => {
	const world = await shard.loadWorld();
	const highwayRooms = [ ...Fn.filter(world.entries(), ([ roomName ]) => isHighwayRoom(roomName)) ];
	const seeds = await Fn.mapAwait(highwayRooms, async ([ roomName ]): Promise<[ score: number, roomName: string ]> => {
		// Only accessible rooms carry a saved blob (and thus a `#nextPowerBankTime`); read just that
		// field, skipping object initialization. A room that has never placed a bank rolls an initial
		// countdown here.
		const deadline = world.map.getRoomStatus(roomName).status === 'normal'
			? (await shard.loadRoom(roomName, shard.time, true))['#nextPowerBankTime']
			: 0;
		return [ deadline > 0 ? deadline : shard.time + respawnTime(), roomName ];
	});
	if (seeds.length > 0) {
		await seedRooms(shard, seeds);
	}
});

// Peek-and-reschedule (no zrem): a crash between peek and reschedule leaves the entry for retry.
registerShardTickProcessor(async (shard, time) => {
	const due = await dueRoomsAt(shard, time);
	if (due.length === 0) return;
	await Fn.mapAwait(due, async roomName => {
		// Placement waits for the room intent stage (live terrain); the timer advances now.
		const power = rollPower();
		const nextDue = time + respawnTime();
		await Promise.all([
			// Any id of length <= 2 is a system user, keeping the intent off the player pipeline.
			pushIntentsForRoomNextTick(shard, roomName, '1', {
				local: { placePowerBank: [ [ power, nextDue ] ] },
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
	(room, context, power: number, nextDue: number) => {
		// Persist the next-due tick on the room before placing, so it survives a restart and the
		// reschedule sticks even when this room has no valid wall to place on.
		room['#nextPowerBankTime'] = nextDue;
		context.didUpdate();
		if (context.state.world.map.getRoomStatus(room.name).status !== 'normal') return;
		const placement = findPlacement(context.state.world, room.name);
		if (placement === undefined) return;
		const bank = create(placement, power);
		room['#insertObject'](bank);
		context.wakeAt(bank['#nextDecayTime']);
	});
declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { powerBank: typeof placePowerBankIntent }
}
