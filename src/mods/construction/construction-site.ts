import type { GameConstructor } from 'xxscreeps/game';
import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as Id from 'xxscreeps/engine/schema/id';
import * as RoomObject from 'xxscreeps/game/object';
import { me } from 'xxscreeps/game';
import { registerObstacleChecker } from 'xxscreeps/game/path-finder';
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
	[RoomObject.Owner]: Id.format,
}));

export class ConstructionSite extends withOverlay(RoomObject.RoomObject, shape) {
	get my() { return this[RoomObject.Owner] === me }
	get owner() { return this[RoomObject.Owner] }
	get progressTotal() { return C.CONSTRUCTION_COST[this.structureType] }
	get [RoomObject.LookType]() { return C.LOOK_CONSTRUCTION_SITES }

	[RoomObject.AddToMyGame](game: GameConstructor) {
		game.constructionSites[this.id] = this;
	}
}

export function create(
	pos: RoomPosition,
	structureType: ConstructibleStructureType,
	owner: string,
	name?: string | null,
) {
	return assign(RoomObject.create(new ConstructionSite, pos), {
		structureType,
		name: name ?? '',
		[RoomObject.Owner]: owner,
	});
}

// Register path finder logic
registerObstacleChecker(params => {
	const { user } = params;
	if (params.isPathFinder) {
		return object => object instanceof ConstructionSite &&
			object.owner === user &&
			(structureFactories.get(object.structureType)?.obstacle ?? true);
	} else {
		return null;
	}
});
