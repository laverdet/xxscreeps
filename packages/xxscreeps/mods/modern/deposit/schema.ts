import { roomObjectShape } from 'xxscreeps/game/schema.js';
import { resourceEnumFormat } from 'xxscreeps/mods/classic/resource/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';

/** @internal */
export const depositShape = declare('Deposit', struct(roomObjectShape, {
	...variant('deposit'),
	depositType: resourceEnumFormat,
	lastCooldown: 'int32',
	'#harvested': 'int32',
	'#cooldownTime': 'int32',
	'#nextDecayTime': 'int32',
}));
