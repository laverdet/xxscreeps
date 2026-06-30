import type { TypeOf } from 'xxscreeps/schema/index.js';
import { makeReaderAndWriter } from 'xxscreeps/engine/schema/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomObject, format as baseFormat } from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { compose, declare, enumerated, struct, vector, withOverlay } from 'xxscreeps/schema/index.js';
import { instantiate } from 'xxscreeps/utility/utility.js';

export const format = declare('PowerCreep', () => compose(shape, PowerCreep));
const shape = struct(baseFormat, {
	name: 'string',
	className: enumerated(...Object.values(C.POWER_CLASS)),
	'#powers': vector(struct({ power: 'int8', level: 'int8' })),
	spawnCooldownTime: 'double',
	deleteTime: 'double',
});

export class PowerCreep extends withOverlay(RoomObject, shape) {
	// eslint-disable-next-line @typescript-eslint/class-literal-property-style
	get shard(): string | null { return null; }
	get ticksToLive(): number | undefined { return undefined; }

	override get '#lookType'() { return C.LOOK_POWER_CREEPS; }

	get level() {
		return Fn.accumulate(this['#powers'], power => power.level);
	}

	/** Public `{ [PWR]: { level } }` view over the stored vector. */
	get powers(): Record<number, { level: number }> {
		return Object.fromEntries(Fn.map(this['#powers'], ({ power, level }) => [ power, { level } ]));
	}
}

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
	creep['#posId'] = pos['#id'];
	creep['#powers'] = [];
	return creep;
}

// The roster is stored as a single per-user blob: a vector of power creeps.
const rosterFormat = declare('PowerCreeps', vector(format));
export const { read, write } = makeReaderAndWriter(rosterFormat);

export type Roster = TypeOf<typeof rosterFormat>;
