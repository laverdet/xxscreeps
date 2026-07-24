import type { WithOverlay } from 'xxscreeps/engine/schema/index.js';
import type { RoomPosition } from 'xxscreeps/game/position.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import type { StructureTerminalSchema } from 'xxscreeps:mods/game';
import { chainIntentChecks, checkString } from 'xxscreeps/game/checks.js';
import { Game, intents } from 'xxscreeps/game/index.js';
import { cooldownTime, createRoomObject } from 'xxscreeps/game/object.js';
import { registerBuildableStructure } from 'xxscreeps/mods/classic/construction/game.js';
import { OpenStore, checkHasResource } from 'xxscreeps/mods/classic/resource/store.js';
import { OwnedStructure, checkIsActive, checkMyStructure, checkPlacement } from 'xxscreeps/mods/classic/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import * as C from 'xxscreeps:mods/constants';
import { terminalShape } from './schema.js';

export interface StructureTerminal extends WithOverlay<StructureTerminalSchema> {}

/**
 * Sends any resources to a Terminal in another room. The destination Terminal can belong to any
 * player. Each transaction requires additional energy (regardless of the transfer resource type)
 * that can be calculated using
 * [`Game.market.calcTransactionCost`](https://docs.screeps.com/api/#Game.market.calcTransactionCost)
 * method. For example, sending 1000 mineral units from W0N0 to W10N5 will consume 742 energy units.
 * You can track your incoming and outgoing transactions using the
 * [`Game.market`](https://docs.screeps.com/api/#Game.market) object. Only one Terminal per room is
 * allowed that can be addressed by [`Room.terminal`](https://docs.screeps.com/api/#Room.terminal)
 * property.
 *
 * Terminals are used in the [Market system](https://docs.screeps.com/market.html).
 * @public
 * @see https://docs.screeps.com/api/#StructureTerminal
 */
export class StructureTerminal extends withOverlay(OwnedStructure, terminalShape) {
	/**
	 * The remaining amount of ticks while this terminal cannot be used to make
	 * [`StructureTerminal.send`](https://docs.screeps.com/api/#StructureTerminal.send) or
	 * [`Game.market.deal`](https://docs.screeps.com/api/#Game.market.deal) calls.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureTerminal.cooldown
	 */
	@enumerable get cooldown() { return cooldownTime(this['#cooldownTime']); }

	override get hitsMax() { return C.TERMINAL_HITS; }
	override get structureType() { return C.STRUCTURE_TERMINAL; }

	/**
	 * An alias for [`.store.getCapacity()`](https://docs.screeps.com/api/#Store.getCapacity).
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#StructureTerminal.storeCapacity
	 */
	get storeCapacity() { return this.store.getCapacity(); }

	/**
	 * Sends resource to a Terminal in another room with the specified name.
	 * @param resourceType One of the `RESOURCE_*` constants.
	 * @param amount The amount of resources to be sent.
	 * @param destination The name of the target room. You don't have to gain visibility in this room.
	 * @param description The description of the transaction. It is visible to the recipient. The
	 * maximum length is 100 characters.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_NOT_ENOUGH_RESOURCES`,
	 * `ERR_INVALID_ARGS`, `ERR_TIRED`
	 * @public
	 * @see https://docs.screeps.com/api/#StructureTerminal.send
	 */
	send(resourceType: ResourceType, amount: number, destination: string, description?: string) {
		return chainIntentChecks(
			() => checkSend(this, resourceType, amount, destination, description),
			() => intents.save(this, 'send', resourceType, amount, destination, description));
	}

	override '#afterRemove'() {
		this.room.terminal = undefined;
		super['#afterRemove']();
	}

	override '#beforeInsert'(room: Room) {
		super['#beforeInsert'](room);
		room.terminal = this;
	}
}

//
// Intent checks
export function checkSend(terminal: StructureTerminal, resourceType: ResourceType, amount: number, destination: string, description: string | null | undefined) {
	const range = Game.map.getRoomLinearDistance(terminal.room.name, destination);
	const energyCost = calculateEnergyCost(amount, range);
	return chainIntentChecks(
		() => checkMyStructure(terminal, StructureTerminal),
		() => checkIsActive(terminal),
		resourceType === C.RESOURCE_ENERGY
			? () => checkHasResource(terminal, C.RESOURCE_ENERGY, amount + energyCost) :
			() => chainIntentChecks(
				() => checkHasResource(terminal, C.RESOURCE_ENERGY, energyCost),
				() => checkHasResource(terminal, resourceType, amount)),
		() => description == null ? C.OK : checkString(description, 100),
		() => {
			if (!(range < Infinity) || range === 0) {
				return C.ERR_INVALID_ARGS;
			} else if (terminal.cooldown) {
				return C.ERR_TIRED;
			}
		},
	);
}

export function calculateEnergyCost(amount: number, range: number) {
	return Math.ceil(amount * (1 - Math.exp(-range / 30)));
}

//
// Construction implementation
export function create(pos: RoomPosition, owner: string) {
	const terminal = assign(createRoomObject(new StructureTerminal(), pos), {
		hits: C.TERMINAL_HITS,
		store: OpenStore['#create'](C.TERMINAL_CAPACITY),
	});
	terminal['#user'] = owner;
	return terminal;
}

registerBuildableStructure(C.STRUCTURE_TERMINAL, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK
			? C.CONSTRUCTION_COST.terminal : null;
	},
	create(site) {
		return create(site.pos, site['#user']);
	},
});
