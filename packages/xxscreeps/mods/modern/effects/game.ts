import type { RoomObjectEffect } from 'xxscreeps/game/object.js';
import { RoomObject, optionalExpiryTime } from 'xxscreeps/game/object.js';
import { StructureController } from 'xxscreeps/mods/classic/controller/controller.js';
import { extend } from 'xxscreeps/utility/utility.js';
import * as C from 'xxscreeps:mods/constants';

declare module 'xxscreeps/game/object.js' {
	interface RoomObject {
		/**
		 * Yields the entries behind the `effects` getter. A mod contributes entries for the state it
		 * owns by wrapping the previous implementation:
		 *
		 *   Type.prototype['#effects'] = function(effects) {
		 *     return function*() { yield* effects.apply(this); yield ...; };
		 *   }(Type.prototype['#effects']);
		 *
		 * A class which controls its own body chains with `yield* super['#effects']()` instead.
		 *
		 * Wrapping captures the chain below as of load time, so a later contribution to an ancestor
		 * prototype does not reach a class already wrapped; `super` resolves late and is immune.
		 */
		// Declared as a method because `super['#effects']()` is only legal against a method.
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		'#effects'(): Iterable<RoomObjectEffect>;
	}
}

RoomObject.prototype['#effects'] = function*() {};

extend(RoomObject, {
	effects: {
		enumerable: true,
		get() {
			const effects = [ ...this['#effects']() ];
			const value = effects.length > 0 ? effects : undefined;
			Object.defineProperty(this, 'effects', { value });
			return value;
		},
	},
});

// `#upgradeInvulnerableUntil` belongs to the controller mod, but the effect id and the derived view
// are modern-era surface, so this mod contributes the entry.
StructureController.prototype['#effects'] = function(effects) {
	return function*(this: StructureController) {
		yield* effects.apply(this);
		const ticksRemaining = optionalExpiryTime(this['#upgradeInvulnerableUntil']);
		if (ticksRemaining !== undefined) {
			yield { effect: C.EFFECT_INVULNERABILITY, ticksRemaining };
		}
	};
}(StructureController.prototype['#effects']);
