import type { GameConstructor } from 'xxscreeps/game/index.js';
import type { RoomPosition } from 'xxscreeps/game/position.js';
import { chainIntentChecks } from 'xxscreeps/game/checks.js';
import { intents, me, userInfo } from 'xxscreeps/game/index.js';
import { RoomObject, createRoomObject } from 'xxscreeps/game/object.js';
import { registerObstacleChecker } from 'xxscreeps/game/pathfinder/index.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import * as C from 'xxscreeps:mods/constants';
import { constructionSiteShape } from './schema.js';
import { structureFactories } from './symbols.js';

export type ConstructibleStructureType = keyof typeof C.CONSTRUCTION_COST;

/**
 * A site of a structure which is currently under construction. A construction site can be created
 * using the 'Construct' button at the left of the game field or the
 * [`Room.createConstructionSite`](https://docs.screeps.com/api/#Room.createConstructionSite)
 * method.
 *
 * To build a structure on the construction site, give a worker creep some amount of energy and
 * perform [`Creep.build`](https://docs.screeps.com/api/#Creep.build) action.
 *
 * You can remove enemy construction sites by moving a creep on it.
 * @public
 * @see https://docs.screeps.com/api/#ConstructionSite
 */
export class ConstructionSite extends withOverlay(RoomObject, constructionSiteShape) {
	/**
	 * Whether this is your own construction site.
	 * @public
	 * @see https://docs.screeps.com/api/#ConstructionSite.my
	 */
	@enumerable override get my() { return this['#user'] === me; }

	/**
	 * A {@link UserInfo} object with the structure's owner info.
	 * @public
	 * @see https://docs.screeps.com/api/#ConstructionSite.owner
	 */
	@enumerable get owner() { return userInfo.get(this['#user']); }

	override get '#lookType'() { return C.LOOK_CONSTRUCTION_SITES; }

	override '#addToMyGame'(game: GameConstructor) {
		game.constructionSites[this.id] = this;
	}

	override '#applyNukeImpact'() {
		this['#destroy'](C.EVENT_ATTACK_TYPE_NUKE);
	}

	/**
	 * Remove the construction site.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`
	 * @public
	 * @see https://docs.screeps.com/api/#ConstructionSite.remove
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
	progressTotal: number,
	name?: string | null,
) {
	const site = assign(createRoomObject(new ConstructionSite(), pos), {
		structureType,
		progressTotal,
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
	return object => object instanceof ConstructionSite &&
		object['#user'] === user &&
		(structureFactories.get(object.structureType)?.obstacle ?? true);
});
