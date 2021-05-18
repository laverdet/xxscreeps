import type { GameConstructor } from 'xxscreeps/game';
import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as Id from 'xxscreeps/engine/schema/id';
import * as RoomObject from 'xxscreeps/game/object';
import { intents, me } from 'xxscreeps/game';
import { registerObstacleChecker } from 'xxscreeps/game/path-finder';
import { chainIntentChecks } from 'xxscreeps/game/checks';
import { compose, declare, enumerated, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';
import { structureFactories } from './symbols';

export type ConstructibleStructureType = keyof typeof C.CONSTRUCTION_COST;

export function format() { return compose(shape, ConstructionSite) }
const shape = () => declare('ConstructionSite', struct(RoomObject.format, {
	...variant('constructionSite'),
	name: 'string',
	progress: 'int32',
	structureType: enumerated(...structureFactories.keys() as never as ConstructibleStructureType[]),
	'#user': Id.format,
}));

export class ConstructionSite extends withOverlay(RoomObject.RoomObject, shape) {
	get my() { return this['#user'] === me }
	get owner() { return this['#user'] }
	get progressTotal() { return C.CONSTRUCTION_COST[this.structureType] }
	get ['#lookType']() { return C.LOOK_CONSTRUCTION_SITES }

	['#addToMyGame'](game: GameConstructor) {
		game.constructionSites[this.id] = this;
	}

	/**
	 * Remove the construction site.
	 */
	remove() {
		return chainIntentChecks(
			() => checkRemove(this),
			() => intents.save(this, 'remove'));
	}
}

export function create(
	pos: RoomPosition,
	structureType: ConstructibleStructureType,
	owner: string,
	name?: string | null,
) {
	const site = assign(RoomObject.create(new ConstructionSite, pos), {
		structureType,
		name: name ?? '',
	});
	site['#user'] = owner;
	return site;
}

export function checkRemove(site: ConstructionSite) {
	if (!site.my && !site.room.controller?.my) {
		return C.ERR_NOT_OWNER;
	}
	return C.OK;
}

// Register path finder logic
registerObstacleChecker(params => {
	const { user } = params;
	if (params.isPathFinder) {
		return object => object instanceof ConstructionSite &&
			object['#user'] === user &&
			(structureFactories.get(object.structureType)?.obstacle ?? true);
	} else {
		return null;
	}
});
