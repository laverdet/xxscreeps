import type { ResourceType } from 'xxscreeps/mods/resource/index.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import type { RoomPosition } from 'xxscreeps/game/position.js';
import C from 'xxscreeps/game/constants/index.js';
import { create as createObject } from 'xxscreeps/game/object.js';
import { Game, intents } from 'xxscreeps/game/index.js';
import { OpenStore, checkHasResource, openStoreFormat } from 'xxscreeps/mods/resource/store.js';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';
import { OwnedStructure, checkMyStructure, checkPlacement, ownedStructureFormat } from 'xxscreeps/mods/structure/structure.js';
import { chainIntentChecks, checkString } from 'xxscreeps/game/checks.js';
import { registerBuildableStructure } from 'xxscreeps/mods/construction/index.js';
import { assign } from 'xxscreeps/utility/utility.js';

export const format = declare('StructureTerminal', () => compose(shape, StructureTerminal));
const shape = struct(ownedStructureFormat, {
	...variant('terminal'),
	hits: 'int32',
	store: openStoreFormat,
	'#cooldownTime': 'int32',
});

/**
 * Sends any resources to a Terminal in another room. The destination Terminal can belong to any
 * player. Each transaction requires additional energy (regardless of the transfer resource type)
 * that can be calculated using `Game.market.calcTransactionCost` method. For example, sending 1000
 * mineral units from W0N0 to W10N5 will consume 742 energy units. You can track your incoming and
 * outgoing transactions using the `Game.market` object. Only one Terminal per room is allowed that
 * can be addressed by `Room.terminal` property.
 *
 * Terminals are used in the [Market system](https://docs.screeps.com/market.html).
 */
export class StructureTerminal extends withOverlay(OwnedStructure, shape) {
	override get hitsMax() { return C.TERMINAL_HITS }
	override get structureType() { return C.STRUCTURE_TERMINAL }

	/** @deprecated  */
	get storeCapacity() { return this.store.getCapacity() }

	/**
	 * The remaining amount of ticks while this terminal cannot be used to make
	 * `StructureTerminal.send` or `Game.market.deal` calls.
	 */
	@enumerable get cooldown() { return Math.max(0, this['#cooldownTime'] - Game.time) }

	/**
	 * Sends resource to a Terminal in another room with the specified name.
	 * @param resourceType One of the `RESOURCE_*` constants.
	 * @param amount The amount of resources to be sent.
	 * @param destination The name of the target room. You don't have to gain visibility in this room.
	 * @param description The description of the transaction. It is visible to the recipient. The
	 * maximum length is 100 characters.
	 */
	send(resourceType: ResourceType, amount: number, destination: string, description?: string) {
		return chainIntentChecks(
			() => checkSend(this, resourceType, amount, destination, description),
			() => intents.save(this, 'send', resourceType, amount, destination, description));
	}

	override ['#afterInsert'](room: Room) {
		super['#afterInsert'](room);
		room.terminal = this;
	}

	override ['#beforeRemove']() {
		this.room.terminal = undefined;
		super['#beforeRemove']();
	}
}

//
// Intent checks
export function checkSend(terminal: StructureTerminal, resourceType: ResourceType, amount: number, destination: string, description: string | null | undefined) {
	const range = Game.map.getRoomLinearDistance(terminal.room.name, destination);
	const energyCost = calculateEnergyCost(amount, range);
	return chainIntentChecks(
		() => checkMyStructure(terminal, StructureTerminal),
		resourceType === C.RESOURCE_ENERGY ?
			() => checkHasResource(terminal, C.RESOURCE_ENERGY, amount + energyCost) :
			() => chainIntentChecks(
				() => checkHasResource(terminal, C.RESOURCE_ENERGY, energyCost),
				() => checkHasResource(terminal, resourceType, amount)),
		() => description ? checkString(description, 100) : C.OK,
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
function create(pos: RoomPosition, owner: string) {
	const terminal = assign(createObject(new StructureTerminal, pos), {
		hits: C.TERMINAL_HITS,
		store: OpenStore['#create'](C.TERMINAL_CAPACITY),
	});
	terminal['#user'] = owner;
	return terminal;
}

registerBuildableStructure(C.STRUCTURE_TERMINAL, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK ?
			C.CONSTRUCTION_COST.terminal : null;
	},
	create(site) {
		return create(site.pos, site['#user']);
	},
});
