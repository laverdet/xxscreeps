import type { TypeOf } from 'xxscreeps/schema/index.js';
import { makeReaderAndWriter } from 'xxscreeps/engine/schema/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomObject, format as baseFormat } from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { compose, declare, optional, struct, vector, withOverlay } from 'xxscreeps/schema/index.js';
import { instantiate } from 'xxscreeps/utility/utility.js';

// A power creep is a `RoomObject` whether it is sitting in the account roster or spawned into a room,
// so it gets a single serialized format. Unspawned creeps live at `RoomPosition(0, 0, 'E0S0')` (the
// all-zero signed position); spawning is then just a matter of copying the object into a room.
export const format = declare('PowerCreep', () => compose(shape, PowerCreep));
const shape = struct(baseFormat, {
	name: 'string',
	className: 'string',
	// Flat `{ [PWR]: level }`; the public `powers` getter expands it to `{ [PWR]: { level } }`.
	'#powers': compose(vector(struct({ power: 'int8', level: 'int8' })), {
		compose: (powers: { power: number; level: number }[]) =>
			Fn.fromEntries(powers, ({ power, level }) => [ power, level ]),
		decompose: (powers: Record<number, number>) =>
			Object.entries(powers).map(([ power, level ]) => ({ power: Number(power), level })),
	}),
	// Wall-clock ms; `spawnCooldownTime` is set when a spawned creep dies (slice 4), `0` while idle.
	spawnCooldownTime: 'double',
	// Wall-clock ms; deletion scheduled this far out, cancellable until it elapses.
	deleteTime: optional('double'),
});

export class PowerCreep extends withOverlay(RoomObject, shape) {
	// No room presence until a spawn copies the creep into a room (slice 4): an unspawned creep has no
	// `shard` assignment (`null`) and no remaining lifetime (`ticksToLive` is `undefined`). Backed by
	// prototype constants so they survive blob materialization, which bypasses field initializers.
	declare readonly shard: string | null;
	declare readonly ticksToLive: number | undefined;

	override get '#lookType'() { return C.LOOK_POWER_CREEPS; }

	get level() {
		return Fn.accumulate(Object.values(this['#powers']));
	}

	/** Public `{ [PWR]: { level } }` view over the flat stored map. */
	get powers(): Record<number, { level: number }> {
		return Object.fromEntries(Object.entries(this['#powers'])
			.map(([ power, level ]) => [ Number(power), { level } ]));
	}
}

Object.defineProperty(PowerCreep.prototype, 'shard', { value: null });
Object.defineProperty(PowerCreep.prototype, 'ticksToLive', { value: undefined });

/** Build a fresh, unspawned roster member. */
export function createPowerCreep(id: string, name: string, className: string) {
	const pos = new RoomPosition(0, 0, 'E0S0');
	return instantiate(PowerCreep, {
		id,
		pos,
		'#posId': pos['#id'],
		name,
		className,
		'#powers': {},
		spawnCooldownTime: 0,
	});
}

// The roster is stored as a single per-user blob: a vector of power creeps.
const rosterFormat = declare('PowerCreeps', vector(format));
export const { read, write } = makeReaderAndWriter(rosterFormat, { materialize: true, release: true });

export type Roster = TypeOf<typeof rosterFormat>;
