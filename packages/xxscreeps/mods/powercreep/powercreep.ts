import type { TypeOf } from 'xxscreeps/schema/index.js';
import { makeReaderAndWriter } from 'xxscreeps/engine/schema/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomObject, format as baseFormat } from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { compose, declare, enumerated, struct, vector, withOverlay } from 'xxscreeps/schema/index.js';
import { instantiate } from 'xxscreeps/utility/utility.js';

// A power creep is a `RoomObject` whether it is sitting in the account roster or spawned into a room,
// so it gets a single serialized format. Unspawned creeps live at `RoomPosition(0, 0, 'E0S0')` (the
// all-zero signed position); spawning is then just a matter of copying the object into a room.
export const format = declare('PowerCreep', () => compose(shape, PowerCreep));
const shape = struct(baseFormat, {
	name: 'string',
	className: enumerated(...Object.values(C.POWER_CLASS)),
	// One entry per learned power and its rank; the public `powers` getter shapes it for the client.
	'#powers': vector(struct({ power: 'int8', level: 'int8' })),
	// Wall-clock ms; `spawnCooldownTime` is set when a spawned creep dies (slice 4), `0` while idle.
	spawnCooldownTime: 'double',
	// Wall-clock ms when the scheduled deletion elapses; `0` when the creep is not being deleted.
	deleteTime: 'double',
});

export class PowerCreep extends withOverlay(RoomObject, shape) {
	// No room presence until a spawn copies the creep into a room (slice 4): an unspawned creep has no
	// `shard` assignment (`null`) and no remaining lifetime (`ticksToLive` is `undefined`). Backed by
	// prototype constants so they survive blob materialization, which bypasses field initializers.
	declare readonly shard: string | null;
	declare readonly ticksToLive: number | undefined;

	override get '#lookType'() { return C.LOOK_POWER_CREEPS; }

	get level() {
		return Fn.accumulate(this['#powers'], power => power.level);
	}

	/** Public `{ [PWR]: { level } }` view over the stored vector. */
	get powers(): Record<number, { level: number }> {
		return Object.fromEntries(Fn.map(this['#powers'], ({ power, level }) => [ power, { level } ]));
	}
}

Object.defineProperty(PowerCreep.prototype, 'shard', { value: null });
Object.defineProperty(PowerCreep.prototype, 'ticksToLive', { value: undefined });

/** Build a fresh, unspawned roster member. */
export function createPowerCreep(id: string, name: string, className: string) {
	const pos = new RoomPosition(0, 0, 'E0S0');
	const creep = instantiate(PowerCreep, {
		id,
		pos,
		name,
		className,
		spawnCooldownTime: 0,
		deleteTime: 0,
	});
	// Private-symbol fields are assigned by member access, not as object-literal keys: the private
	// transform only rewrites `obj['#x']` accesses, so a literal `'#x'` key would miss the symbol slot.
	creep['#posId'] = pos['#id'];
	creep['#powers'] = [];
	return creep;
}

// The roster is stored as a single per-user blob: a vector of power creeps.
const rosterFormat = declare('PowerCreeps', vector(format));
export const { read, write } = makeReaderAndWriter(rosterFormat, { materialize: true, release: true });

export type Roster = TypeOf<typeof rosterFormat>;
