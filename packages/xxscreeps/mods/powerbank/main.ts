import { registerShardInitializer, registerShardTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { pushIntentsForRoomNextTick } from 'xxscreeps/engine/processor/model.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { dueRoomsAt, scheduleRoom, seedRooms } from './model.js';

// World-management placement policy for power banks. Each highway room runs an independent respawn
// countdown; the next-due tick is authoritative on the room (`#nextPowerBankTime`) and the scratch
// schedule that drives the per-tick sweep is rebuilt from it on init. There is no sector throughput
// target or decay coupling (those are deposit-specific). The countdown is tick-domain — vanilla's
// `powerBankTime` is itself a game-time deadline — so the schedule gates directly on the shard-tick
// `time` rather than a wall-clock poll.

// 0.75x–1.25x of the base respawn time.
function respawnTime(): number {
	return Math.round(Math.random() * (C.POWER_BANK_RESPAWN_TIME / 2) + C.POWER_BANK_RESPAWN_TIME * 0.75);
}

// Capacity in [MIN, MAX), plus a MAX bonus on a critical roll.
function rollPower(): number {
	const base = Math.floor(Math.random() * (C.POWER_BANK_CAPACITY_MAX - C.POWER_BANK_CAPACITY_MIN)) + C.POWER_BANK_CAPACITY_MIN;
	return base + (Math.random() < C.POWER_BANK_CAPACITY_CRIT ? C.POWER_BANK_CAPACITY_MAX : 0);
}

// Rebuild the placement schedule when the shard's services start. Each highway room's next-due tick
// is read back from its persisted `#nextPowerBankTime`; a room that has never placed a bank gets an
// initial countdown rolled here. Seeding at startup, rather than behind a per-tick "already seeded?"
// read, keeps the steady-state tick free of setup I/O.
registerShardInitializer(async shard => {
	const world = await shard.loadWorld();
	const seeds = await Fn.pipe(
		world.map['#sectors'](),
		$$ => Fn.transform($$, ([ , sector ]) => sector.edges),
		// Edge rooms are shared between adjacent sectors; each seeds one timer.
		$$ => new Set($$),
		$$ => Fn.mapAwait($$, async (roomName): Promise<[ score: number, roomName: string ]> => {
			const room = await shard.loadRoom(roomName, shard.time, true);
			const deadline = room['#nextPowerBankTime'] || shard.time + respawnTime();
			return [ deadline, roomName ];
		}));
	await seedRooms(shard, seeds);
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
