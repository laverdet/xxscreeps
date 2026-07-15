import type { TypeOf } from 'xxscreeps/schema/index.js';
import { makeReaderAndWriter } from 'xxscreeps/engine/schema/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomObject } from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { compose, declare, vector, withOverlay } from 'xxscreeps/schema/index.js';
import { instantiate } from 'xxscreeps/utility/utility.js';
import { powerCreepShape } from './schema.js';

/**
 * Power Creeps are immortal "heroes" that are tied to your account and can be respawned in any
 * `PowerSpawn` after death. You can upgrade their abilities ("powers") up to your account Global
 * Power Level (see [`Game.gpl`](https://docs.screeps.com/api/#Game.gpl)).
 * @public
 * @see https://docs.screeps.com/api/#PowerCreep
 */
export class PowerCreep extends withOverlay(RoomObject, powerCreepShape) {
	/**
	 * The name of the shard where the power creep is spawned, or `null`.
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.shard
	 */
	// eslint-disable-next-line @typescript-eslint/class-literal-property-style
	get shard(): string | null { return null; }

	/**
	 * The remaining amount of game ticks after which the creep will die and become unspawned.
	 * Undefined if the creep is not spawned in the world.
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.ticksToLive
	 */
	get ticksToLive(): number | undefined { return undefined; }

	override get '#lookType'() { return C.LOOK_POWER_CREEPS; }

	/**
	 * The power creep's level.
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.level
	 */
	get level() {
		return Fn.accumulate(this['#powers'], power => power.level);
	}

	/**
	 * Available powers, an object with power ID as a key, and an object with the power's current
	 * `level` as a value.
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.powers
	 */
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

// --- Account roster checks: pure functions of account power + roster + args, each returning a result
// code. ---

interface PowerInfo { className: string; level: number[] }
interface PowerEntry { power: number; level: number }
const powerInfoTable: Record<number, PowerInfo> = C.POWER_INFO;

/** Global power level earned from accumulated power experience. */
function gplLevel(power: number) {
	return Math.floor((power / C.POWER_LEVEL_MULTIPLY) ** (1 / C.POWER_LEVEL_POW));
}

/** Unallocated GPL levels: earned levels minus one per creep and each creep's own level. */
function freeLevels(power: number, roster: PowerCreep[]) {
	const used = roster.length + Fn.accumulate(roster, creep => creep.level);
	return gplLevel(power) - used;
}

// Every requested level must be reachable by allocating one point at a time without ever exceeding a
// power's per-rank level prerequisite.
function powersAreReachable(powers: PowerEntry[]) {
	const target = Fn.accumulate(powers, entry => entry.level);
	const built = new Map(Fn.map(powers, entry => [ entry.power, 0 ]));
	let level = 0;
	while (level < target) {
		const next = powers.find(({ power, level: want }) => {
			const have = built.get(power) ?? 0;
			const info = powerInfoTable[power];
			return info && have < 5 && have < want && info.level[have]! <= level;
		});
		if (next === undefined) {
			return false;
		}
		built.set(next.power, (built.get(next.power) ?? 0) + 1);
		level = Fn.accumulate(built.values());
	}
	return true;
}

export function checkCreatePowerCreep(accountPower: number, roster: PowerCreep[], name: string, className: string) {
	if (name === '' || name.length > 100) {
		return C.ERR_INVALID_ARGS;
	}
	if (freeLevels(accountPower, roster) <= 0) {
		return C.ERR_NOT_ENOUGH_RESOURCES;
	}
	if (roster.some(creep => creep.name === name)) {
		return C.ERR_NAME_EXISTS;
	}
	if (!Object.values(C.POWER_CLASS).includes(className)) {
		return C.ERR_INVALID_ARGS;
	}
	return C.OK;
}

export function checkUpgradePowerCreep(
	accountPower: number, roster: PowerCreep[], creep: PowerCreep, powers: Record<string, number>,
) {
	const levelOf = (power: number) => creep['#powers'].find(entry => entry.power === power)?.level ?? 0;
	const desired: PowerEntry[] = [];
	for (const [ key, value ] of Object.entries(powers)) {
		const power = Number(key);
		if (powerInfoTable[power]?.className !== creep.className) {
			return C.ERR_INVALID_ARGS;
		}
		if (value < levelOf(power)) {
			return C.ERR_INVALID_ARGS;
		}
		if (value > 5) {
			return C.ERR_FULL;
		}
		if (value > 0) {
			desired.push({ power, level: value });
		}
	}
	// A power already learned may not be dropped by omitting it from the request.
	for (const { power, level } of creep['#powers']) {
		if ((desired.find(entry => entry.power === power)?.level ?? 0) < level) {
			return C.ERR_INVALID_ARGS;
		}
	}
	const newLevel = Fn.accumulate(desired, entry => entry.level);
	if (newLevel > C.POWER_CREEP_MAX_LEVEL) {
		return C.ERR_FULL;
	}
	for (const { power, level } of desired) {
		if (newLevel < powerInfoTable[power]!.level[level - 1]!) {
			return C.ERR_FULL;
		}
	}
	if (!powersAreReachable(desired)) {
		return C.ERR_FULL;
	}
	if (freeLevels(accountPower, roster) < newLevel - creep.level) {
		return C.ERR_NOT_ENOUGH_RESOURCES;
	}
	return C.OK;
}

export function checkRenamePowerCreep(roster: PowerCreep[], name: string) {
	if (name === '' || name.length > 100) {
		return C.ERR_INVALID_ARGS;
	}
	if (roster.some(creep => creep.name === name)) {
		return C.ERR_NAME_EXISTS;
	}
	return C.OK;
}

// The roster is stored as a single per-user blob: a vector of power creeps.
const rosterFormat = declare('PowerCreeps', vector(compose(powerCreepShape, PowerCreep)));
export const { read, write, upgrade: upgradeRoster } = makeReaderAndWriter(rosterFormat);

export type Roster = TypeOf<typeof rosterFormat>;
