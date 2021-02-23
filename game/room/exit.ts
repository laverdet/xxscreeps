import * as C from 'xxscreeps/game/constants';
import { RoomPosition } from 'xxscreeps/game/position';
import { mapToKeys } from 'xxscreeps/util/utility';
import { registerFindHandlers } from './find';
import type { Room } from './room';

// Base FIND_EXIT_ handler (i.e. doesn't include FIND_EXIT)
const exits = [ C.FIND_EXIT_TOP, C.FIND_EXIT_RIGHT, C.FIND_EXIT_BOTTOM, C.FIND_EXIT_LEFT ];
type ExitType = typeof exits[number];
function makeFindExit(exit: ExitType) {
	const generators: Record<ExitType, ((name: string, ii: number) => RoomPosition)> = {
		[C.FIND_EXIT_TOP]: (name, ii) => new RoomPosition(ii, 0, name),
		[C.FIND_EXIT_RIGHT]: (name, ii) => new RoomPosition(49, ii, name),
		[C.FIND_EXIT_BOTTOM]: (name, ii) => new RoomPosition(ii, 49, name),
		[C.FIND_EXIT_LEFT]: (name, ii) => new RoomPosition(0, ii, name),
	};
	const generator = generators[exit];
	return (room: Room) => {
		const results: RoomPosition[] = [];
		const terrain = room.getTerrain();
		for (let ii = 1; ii < 49; ++ii) {
			const pos = generator(room.name, ii);
			if (terrain.get(pos.x, pos.y) !== C.TERRAIN_MASK_WALL) {
				results.push(pos);
			}
		}
		return results;
	};
}

// All FIND_EXIT_ handlers
const find = registerFindHandlers({
	...mapToKeys(exits.map(exit => [ exit, makeFindExit(exit) ])),
	[C.FIND_EXIT]: (room: Room): RoomPosition[] => [
		...room.find(C.FIND_EXIT_TOP),
		...room.find(C.FIND_EXIT_RIGHT),
		...room.find(C.FIND_EXIT_BOTTOM),
		...room.find(C.FIND_EXIT_LEFT),
	],
});
declare module 'xxscreeps/game/room' {
	interface Find { exit: typeof find }
}
