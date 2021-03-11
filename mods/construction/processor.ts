import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game';
import * as Store from 'xxscreeps/mods/resource/processor/store';
import { Creep } from 'xxscreeps/game/objects/creep';
import { Room } from 'xxscreeps/game/room';
import { RoomPosition } from 'xxscreeps/game/position';
import { calculatePower } from 'xxscreeps/engine/processor/intents/creep';
import { insertObject, removeObject } from 'xxscreeps/game/room/methods';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/processor';
import { saveAction } from 'xxscreeps/game/objects/action-log';
import { ConstructionSite, ConstructibleStructureType, create } from './construction-site';
import { checkBuild } from './creep';
import { checkCreateConstructionSite } from './room';
import { structureFactories } from './symbols';

declare module 'xxscreeps/processor' {
	interface Intent { construction: typeof intents }
}

const intents = [
	registerIntentProcessor(Room, 'createConstructionSite',
	(room, structureType: ConstructibleStructureType, xx: number, yy: number, name: string | null) => {
		const pos = new RoomPosition(xx, yy, room.name);
		if (checkCreateConstructionSite(room, pos, structureType) === C.OK) {
			const site = create(pos, structureType, Game.me, name);
			insertObject(room, site);
		}
	}),

	registerIntentProcessor(Creep, 'build', (creep, id: string) => {
		const target = Game.getObjectById<ConstructionSite>(id)!;
		if (checkBuild(creep, target) === C.OK) {
			const power = calculatePower(creep, C.WORK, C.BUILD_POWER);
			const energy = Math.min(
				target.progressTotal - target.progress,
				creep.store.energy,
				power,
			);
			if (energy > 0) {
				Store.subtract(creep.store, 'energy', energy);
				target.progress += energy;
				saveAction(creep, 'build', target.pos.x, target.pos.y);
			}
		}
	}),
];

registerObjectTickProcessor(ConstructionSite, site => {
	if (site.progress >= site.progressTotal) {
		const { room } = site;
		const structure = structureFactories.get(site.structureType)?.(site);
		removeObject(site);
		if (structure) {
			insertObject(room, structure);
		}
	}
});
