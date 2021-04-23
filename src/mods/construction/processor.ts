import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game';
import * as Store from 'xxscreeps/mods/resource/processor/store';
import { Creep } from 'xxscreeps/mods/creep/creep';
import { RoomPosition } from 'xxscreeps/game/position';
import { calculatePower } from 'xxscreeps/mods/creep/processor';
import { InsertObject, RemoveObject, Room } from 'xxscreeps/game/room';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/processor';
import { saveAction } from 'xxscreeps/game/action-log';
import { ConstructionSite, ConstructibleStructureType, create } from './construction-site';
import { checkBuild } from './creep';
import { checkCreateConstructionSite } from './room';
import { structureFactories } from './symbols';

declare module 'xxscreeps/processor' {
	interface Intent { construction: typeof intents }
}

const intents = [
	registerIntentProcessor(Room, 'createConstructionSite',
	(room, context, structureType: ConstructibleStructureType, xx: number, yy: number, name: string | null) => {
		const pos = new RoomPosition(xx, yy, room.name);
		if (checkCreateConstructionSite(room, pos, structureType) === C.OK) {
			const site = create(pos, structureType, Game.me, name);
			room[InsertObject](site);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'build', (creep, context, id: string) => {
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
				context.didUpdate();
			}
		}
	}),
];

registerObjectTickProcessor(ConstructionSite, (site, context) => {
	if (site.progress >= site.progressTotal) {
		const { room } = site;
		const structure = structureFactories.get(site.structureType)?.create(site, site.name);
		site.room[RemoveObject](site);
		if (structure) {
			room[InsertObject](structure);
		}
		context.didUpdate();
	}
});
