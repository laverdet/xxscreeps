import type { World } from 'xxscreeps/game/map.js';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { RoomPosition, iterateNeighbors } from 'xxscreeps/game/position.js';
import { Room as RoomClass } from 'xxscreeps/game/room/index.js';
import { shuffledSquare } from 'xxscreeps/utility/random.js';
import * as C from 'xxscreeps:mods/constants';
import { StructurePowerBank, create } from './powerbank.js';

registerObjectTickProcessor(StructurePowerBank, (powerBank, context) => {
	if (powerBank.ticksToDecay === 0) {
		powerBank.room['#removeObject'](powerBank);
		context.didUpdate();
	} else {
		context.wakeAt(powerBank['#nextDecayTime']);
	}
});

// The first wall position in 5..44, in random order, with at least one non-wall neighbour (incl.
// diagonals), or undefined in a room without a qualifying wall.
function findPlacement(world: World, roomName: string) {
	const terrain = world.map.getRoomTerrain(roomName);
	return Fn.pipe(
		shuffledSquare(5, 40),
		$$ => Fn.filter($$, ([ xx, yy ]) => terrain.get(xx, yy) === C.TERRAIN_MASK_WALL),
		$$ => Fn.map($$, ([ xx, yy ]) => new RoomPosition(xx, yy, roomName)),
		$$ => Fn.find($$, from => Fn.some(iterateNeighbors(from), pos => terrain.get(pos.x, pos.y) !== C.TERRAIN_MASK_WALL)));
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
