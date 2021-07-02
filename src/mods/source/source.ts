import * as C from './constants';
import * as RoomObject from 'xxscreeps/game/object';
import { Game, registerGlobal } from 'xxscreeps/game';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';

export const format = declare('Source', () => compose(shape, Source));
const shape = struct(RoomObject.format, {
	...variant('source'),
	energy: 'int32',
	energyCapacity: 'int32',
	'#nextRegenerationTime': 'int32',
});

// Game object declaration
export class Source extends withOverlay(RoomObject.RoomObject, shape) {
	@enumerable get ticksToRegeneration() {
		return this['#nextRegenerationTime'] === 0 ? undefined : Math.max(0, this['#nextRegenerationTime'] - Game.time);
	}

	get ['#lookType']() { return C.LOOK_SOURCES }

	override ['#roomStatusDidChange'](level: number, userId: string | undefined | null) {
		this.energyCapacity = function() {
			if (userId === undefined) {
				return C.SOURCE_ENERGY_KEEPER_CAPACITY;
			} else if (userId === null) {
				return C.SOURCE_ENERGY_NEUTRAL_CAPACITY;
			} else {
				return C.SOURCE_ENERGY_CAPACITY;
			}
		}();
		this.energy = Math.min(this.energy, this.energyCapacity);
	}
}

// Export `Source` to runtime globals
registerGlobal(Source);
declare module 'xxscreeps/game/runtime' {
	interface Global { Source: typeof Source }
}
