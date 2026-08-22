import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { optionalExpiryTime } from 'xxscreeps/game/object.js';
import { Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import { compose } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps:mods/constants';
import { StructureInvaderCore } from './invader-core.js';
import { invaderCoreShape } from './schema.js';

export type StrongholdRoomSchema = typeof invaderCoreSchema;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const invaderCoreSchema = registerVariant('Room.objects', compose(invaderCoreShape, StructureInvaderCore));

// Deployed stronghold peers surface their shared collapse timer. This mod registers
// `#collapseTime` on every structure, so it also contributes the entry.
Structure.prototype['#effects'] = function(effects) {
	return function*(this: Structure) {
		yield* effects.apply(this);
		const ticksRemaining = optionalExpiryTime(this['#collapseTime']);
		if (ticksRemaining !== undefined) {
			yield { effect: C.EFFECT_COLLAPSE_TIMER, ticksRemaining };
		}
	};
}(Structure.prototype['#effects']);
