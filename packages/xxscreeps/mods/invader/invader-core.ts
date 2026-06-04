import type { RoomPosition } from 'xxscreeps/game/position.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, registerGlobal } from 'xxscreeps/game/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { OwnedStructure, ownedStructureFormat } from 'xxscreeps/mods/structure/structure.js';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';

export const format = declare('InvaderCore', () => compose(shape, StructureInvaderCore));
const shape = struct(ownedStructureFormat, {
	...variant('invaderCore'),
	hits: 'int32',
	level: 'int8',
	'#deployTime': 'int32',
});

/**
 * Non-player structure. Spawns NPC invader creeps that defend a stronghold core. Cannot be
 * destroyed by player intents; takes no damage while deploying because of a natural
 * `EFFECT_INVULNERABILITY` produced by the deploy timer.
 */
export class StructureInvaderCore extends withOverlay(OwnedStructure, shape) {
	@enumerable override get effects(): RoomObject.RoomObjectEffect[] | undefined {
		const ticksRemaining = this.ticksToDeploy;
		return ticksRemaining === undefined ? undefined : [ { effect: C.EFFECT_INVULNERABILITY, ticksRemaining } ];
	}

	// TODO: stronghold spawning
	// eslint-disable-next-line @typescript-eslint/class-literal-property-style
	@enumerable get spawning(): null { return null; }

	@enumerable get ticksToDeploy(): number | undefined {
		return RoomObject.optionalExpiryTime(Game, this['#deployTime']);
	}

	override get hitsMax(): number {
		return C.INVADER_CORE_HITS;
	}

	override get structureType() { return C.STRUCTURE_INVADER_CORE; }

	override get '#invulnerable'() {
		return this.ticksToDeploy !== undefined;
	}

	override '#applyDamage'(power: number, type: number, source?: RoomObject.RoomObject) {
		if (this['#invulnerable']) {
			return;
		}
		super['#applyDamage'](power, type, source);
	}
}

export function create(pos: RoomPosition, level: number, deployTime: number) {
	const core = assign(RoomObject.create(new StructureInvaderCore(), pos), {
		hits: C.INVADER_CORE_HITS,
		level,
	});
	core['#user'] = '2';
	core['#deployTime'] = deployTime;
	return core;
}

registerGlobal(StructureInvaderCore);
declare module 'xxscreeps/game/runtime.js' {
	interface Global { StructureInvaderCore: typeof StructureInvaderCore }
}
