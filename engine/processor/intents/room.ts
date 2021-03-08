import * as C from 'xxscreeps/game/constants';
import * as ConstructionSite from 'xxscreeps/game/objects/construction-site';
import { me } from 'xxscreeps/game/game';
import { RoomPosition } from 'xxscreeps/game/position';
import { registerIntentProcessor } from 'xxscreeps/processor';
import { Room } from 'xxscreeps/game/room';
import { insertObject } from 'xxscreeps/game/room/methods';
import { checkCreateConstructionSite } from 'xxscreeps/game/room/room';

declare module 'xxscreeps/processor' {
	interface Intent { room: typeof intent }
}

const intent = registerIntentProcessor(Room, 'createConstructionSite',
(room, structureType: ConstructionSite.ConstructibleStructureType, xx: number, yy: number, name: string | null) => {
	const pos = new RoomPosition(xx, yy, room.name);
	if (checkCreateConstructionSite(room, pos, structureType) === C.OK) {
		const site = ConstructionSite.create(pos, structureType, name, me);
		insertObject(room, site);
	}
});
