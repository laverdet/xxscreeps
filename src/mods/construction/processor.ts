import type { ConstructibleStructureType } from './construction-site';
import * as C from 'xxscreeps/game/constants';
import * as Store from 'xxscreeps/mods/resource/processor/store';
import { Game, me } from 'xxscreeps/game';
import { Creep } from 'xxscreeps/mods/creep/creep';
import { RoomPosition } from 'xxscreeps/game/position';
import { calculatePower } from 'xxscreeps/mods/creep/processor';
import { drop } from 'xxscreeps/mods/resource/processor/resource';
import { Room } from 'xxscreeps/game/room';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor';
import { saveAction } from 'xxscreeps/game/action-log';
import { ConstructionSite, checkRemove, create } from './construction-site';
import { checkBuild } from './creep';
import { checkCreateConstructionSite } from './room';
import { structureFactories } from './symbols';

declare module 'xxscreeps/engine/processor' {
	interface Intent { construction: typeof intents }
}

const intents = [
	registerIntentProcessor(Room, 'createConstructionSite',
		(room, context, structureType: ConstructibleStructureType, xx: number, yy: number, name: string | null) => {
			const pos = new RoomPosition(xx, yy, room.name);
			if (checkCreateConstructionSite(room, pos, structureType) === C.OK) {
				const site = create(pos, structureType, me, name);
				room['#insertObject'](site);
				context.didUpdate();
			}
		}),

	registerIntentProcessor(ConstructionSite, 'remove', (site, context) => {
		if (checkRemove(site) === C.OK) {
			drop(site.pos, C.RESOURCE_ENERGY, site.progress / 2);
			site.room['#removeObject'](site);
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
		site.room['#removeObject'](site);
		if (structure) {
			room['#insertObject'](structure);
		}
		context.didUpdate();
	}
});
