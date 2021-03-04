import * as C from 'xxscreeps/game/constants';
import { me } from 'xxscreeps/game/game';
import { ConstructibleStructureType } from 'xxscreeps/game/objects/construction-site';
import { RoomPosition } from 'xxscreeps/game/position';
import { registerIntentProcessor } from 'xxscreeps/processor';
import { Room, insertObject } from 'xxscreeps/game/room';
import { checkCreateConstructionSite } from 'xxscreeps/game/room/room';
import * as ConstructionIntent from './construction-site';

declare module 'xxscreeps/processor' {
	interface Intent { room: typeof intent }
}

const intent = registerIntentProcessor(Room, 'createConstructionSite',
(room, structureType: ConstructibleStructureType, xx: number, yy: number, name: string | null) => {
	const pos = new RoomPosition(xx, yy, room.name);
	if (checkCreateConstructionSite(room, pos, structureType) === C.OK) {
		const site = ConstructionIntent.create(pos, structureType, name, me);
		insertObject(room, site);
	}
});
