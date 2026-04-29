import type { BufferView } from 'xxscreeps/schema/index.js';
import { chainIntentChecks, checkRange, checkTarget } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, registerGlobal } from 'xxscreeps/game/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { checkCommon } from 'xxscreeps/mods/creep/creep.js';
import { registerHarvestable } from 'xxscreeps/mods/harvestable/index.js';
import { resourceEnumFormat } from 'xxscreeps/mods/resource/resource.js';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';

export const format = declare('Deposit', () => compose(shape, Deposit));
const shape = struct(RoomObject.format, {
	...variant('deposit'),
	depositType: resourceEnumFormat,
	'#harvested': 'int32',
	'#cooldownTime': 'int32',
	'#lastCooldown': 'int32',
	'#nextDecayTime': 'int32',
});

export class Deposit extends withOverlay(RoomObject.RoomObject, shape) {

	constructor(id?: string);
	constructor(buffer?: BufferView, offset?: number);
	constructor(idOrBuffer?: BufferView | string, offset?: number) {
		super(typeof idOrBuffer === 'string' ? undefined : idOrBuffer, offset);
		if (typeof idOrBuffer === 'string') assign<Deposit>(this, RoomObject.getById(Deposit, idOrBuffer));
	}

	@enumerable get cooldown() { return Math.max(0, this['#cooldownTime'] - Game.time); }
	@enumerable get lastCooldown() { return this['#lastCooldown']; }
	@enumerable get ticksToDecay() { return Math.max(0, this['#nextDecayTime'] - Game.time); }

	get '#lookType'() { return C.LOOK_DEPOSITS; }
}

registerGlobal(Deposit);
declare module 'xxscreeps/game/runtime.js' {
	interface Global { Deposit: typeof Deposit }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const harvest = registerHarvestable(Deposit, function(creep) {
	return chainIntentChecks(
		() => checkCommon(creep, C.WORK),
		() => checkTarget(this, Deposit),
		() => checkRange(creep, this, 1),
		() => this.cooldown === 0 ? undefined : C.ERR_TIRED);
});
declare module 'xxscreeps/mods/harvestable/index.js' {
	interface Harvest { deposit: typeof harvest }
}
