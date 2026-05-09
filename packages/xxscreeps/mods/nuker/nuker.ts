import { chainIntentChecks } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, intents } from 'xxscreeps/game/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { registerBuildableStructure } from 'xxscreeps/mods/construction/index.js';
import { OwnedStructure, checkIsActive, checkMyStructure, checkPlacement, ownedStructureFormat } from 'xxscreeps/mods/structure/structure.js';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { NukerStore, nukerStoreFormat } from './store.js';

export const format = declare('Nuker', () => compose(shape, StructureNuker));
const shape = struct(ownedStructureFormat, {
	...variant('nuker'),
	hits: 'int32',
	store: nukerStoreFormat,
	'#cooldownTime': 'int32',
});

export class StructureNuker extends withOverlay(OwnedStructure, shape) {
	@enumerable get cooldown() { return Math.max(0, this['#cooldownTime'] - Game.time); }

	/** @deprecated */
	@enumerable get energy() { return this.store[C.RESOURCE_ENERGY]; }
	/** @deprecated */
	@enumerable get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) ?? 0; }
	/** @deprecated */
	@enumerable get ghodium() { return this.store[C.RESOURCE_GHODIUM]; }
	/** @deprecated */
	@enumerable get ghodiumCapacity() { return this.store.getCapacity(C.RESOURCE_GHODIUM) ?? 0; }

	override get hitsMax() { return C.NUKER_HITS; }
	override get structureType() { return C.STRUCTURE_NUKER; }

	override '#doesPreventWithdraw'() { return true; }

	/**
	 * Launch a nuke to the specified position. The target must be at most `NUKE_RANGE`
	 * rooms away (Chebyshev distance). Consumes the nuker's full store and starts a
	 * `NUKER_COOLDOWN` cooldown.
	 * @param target The target position.
	 */
	launchNuke(target: RoomPosition) {
		return chainIntentChecks(
			() => checkLaunchNuke(this, target),
			() => intents.save(this, 'launchNuke', target.roomName, target.x, target.y));
	}
}

export function create(pos: RoomPosition, owner: string) {
	const nuker = assign(RoomObject.create(new StructureNuker(), pos), {
		hits: C.NUKER_HITS,
		store: new NukerStore(),
	});
	nuker['#user'] = owner;
	return nuker;
}

registerBuildableStructure(C.STRUCTURE_NUKER, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK
			? C.CONSTRUCTION_COST.nuker : null;
	},
	create(site) {
		return create(site.pos, site['#user']);
	},
});

function checkLaunchTarget(target: RoomPosition) {
	if (!(target instanceof RoomPosition)) {
		return C.ERR_INVALID_ARGS;
	}
	return C.OK;
}

function checkLaunchCooldown(nuker: StructureNuker) {
	if (nuker.cooldown > 0) {
		return C.ERR_TIRED;
	}
	return C.OK;
}

function checkLaunchRange(nuker: StructureNuker, target: RoomPosition) {
	if (Game.map.getRoomLinearDistance(nuker.room.name, target.roomName) > C.NUKE_RANGE) {
		return C.ERR_NOT_IN_RANGE;
	}
	return C.OK;
}

function checkLaunchResources(nuker: StructureNuker) {
	const energyCapacity = nuker.store.getCapacity(C.RESOURCE_ENERGY) ?? 0;
	const ghodiumCapacity = nuker.store.getCapacity(C.RESOURCE_GHODIUM) ?? 0;
	if (
		nuker.store[C.RESOURCE_ENERGY] < energyCapacity ||
		nuker.store[C.RESOURCE_GHODIUM] < ghodiumCapacity
	) {
		return C.ERR_NOT_ENOUGH_RESOURCES;
	}
	return C.OK;
}

export function checkLaunchNuke(nuker: StructureNuker, target: RoomPosition) {
	return chainIntentChecks(
		() => checkMyStructure(nuker, StructureNuker),
		() => checkLaunchTarget(target),
		() => checkLaunchCooldown(nuker),
		() => checkIsActive(nuker),
		// TODO: Return ERR_INVALID_TARGET for novice and respawn-area source or
		// destination rooms once room start areas are modeled.
		() => checkLaunchRange(nuker, target),
		() => checkLaunchResources(nuker),
	);
}
