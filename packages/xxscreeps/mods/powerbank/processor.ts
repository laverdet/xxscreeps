import type { World } from 'xxscreeps/game/map.js';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition, positionsInRangeTo } from 'xxscreeps/game/position.js';
import { Room as RoomClass } from 'xxscreeps/game/room/index.js';
import { StructurePowerBank, create } from './powerbank.js';

const MAX_PLACEMENT_ATTEMPTS = 1000;

registerObjectTickProcessor(StructurePowerBank, (powerBank, context) => {
	if (powerBank.ticksToDecay === 0) {
		powerBank.room['#removeObject'](powerBank);
		context.didUpdate();
	} else {
		context.wakeAt(powerBank['#nextDecayTime']);
	}
});

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
