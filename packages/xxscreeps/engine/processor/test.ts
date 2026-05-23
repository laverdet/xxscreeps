import type { RoomObject } from 'xxscreeps/game/object.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createResource } from 'xxscreeps/mods/resource/resource.js';
import { describe, simulate, test } from 'xxscreeps/test/index.js';

describe('Engine', () => {
	describe('RoomProcessor', () => {

		const downgradeWithEarlierQueuedRemoval = simulate({
			W1N1: room => {
				room['#level'] = 2;
				room['#user'] = '100';
				room.controller!['#user'] = '100';
				// ticksToDowngrade === 0 when #downgradeTime === Game.time (1 on first processed tick)
				room.controller!['#downgradeTime'] = 1;
			},
		});

		test('Tick loop survives queued removal that fires before a downgrading controller',
			() => downgradeWithEarlierQueuedRemoval(async ({ poke, tick }) => {
				// Place a decay-ready Resource ahead of the controller in `#objects` so its Tick queues
				// its own removal *before* the controller's Tick fires `updateRoomStatus → #flushObjects`
				// and shrinks the array. Captured-length iteration then dereferences past the new end.
				await poke('W1N1', undefined, (_Game, room) => {
					const dropped = createResource(new RoomPosition(10, 10, 'W1N1'), C.RESOURCE_ENERGY, 1);
					room['#insertObject'](dropped, true);
					const objects = room['#objects'] as RoomObject[];
					objects.unshift(objects.pop()!);
				});
				await tick();
			}));
	});
});
