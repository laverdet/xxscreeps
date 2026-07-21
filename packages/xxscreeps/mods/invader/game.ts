import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { optionalExpiryTime } from 'xxscreeps/game/object.js';
import { Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import { compose } from 'xxscreeps/schema/index.js';
import { extend } from 'xxscreeps/utility/utility.js';
import { StructureInvaderCore } from './invader-core.js';
import { invaderCoreShape } from './schema.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const invaderCoreSchema = registerVariant('Room.objects', compose(invaderCoreShape, StructureInvaderCore));

// Deployed stronghold peers surface their shared collapse timer. This mod registers
// `#collapseTime` on every structure, so it also owns the derived view; subclasses with their own
// `effects` getters (the invader core, controllers) shadow it with their own state.
extend(Structure, {
	effects: {
		enumerable: true,
		get() {
			const ticksRemaining = optionalExpiryTime(this['#collapseTime']);
			return ticksRemaining === undefined ? undefined : [ { effect: C.EFFECT_COLLAPSE_TIMER, ticksRemaining } ];
		},
	},
});

// ---

declare module 'xxscreeps/game/room/index.js' {
	interface RoomSchema { invader: [ typeof invaderCoreSchema ] }
}
