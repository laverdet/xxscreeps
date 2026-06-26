import type { GameConstructor } from 'xxscreeps/game/index.js';
import type { Direction } from 'xxscreeps/game/position.js';
import type { Resource, ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import type { WithStore } from 'xxscreeps/mods/classic/resource/store.js';
import type { Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import type { TypeOf } from 'xxscreeps/schema/index.js';
import { makeReaderAndWriter } from 'xxscreeps/engine/schema/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { chainIntentChecks, checkRange, checkTarget } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, intents, me, userGame, userInfo } from 'xxscreeps/game/index.js';
import { RoomObject, optionalExpiryTime, saveAction } from 'xxscreeps/game/object.js';
import { registerObstacleChecker } from 'xxscreeps/game/pathfinder/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { checkCarrier, checkDrop, checkPickup, checkTransfer, checkWithdraw } from 'xxscreeps/mods/classic/creep/creep.js';
import { OpenStore, calculateChecked } from 'xxscreeps/mods/classic/resource/store.js';
import { checkIsActive } from 'xxscreeps/mods/classic/structure/structure.js';
import * as Memory from 'xxscreeps/mods/meta/memory/memory.js';
import { StructurePowerBank } from 'xxscreeps/mods/modern/powerbank/powerbank.js';
import { StructurePowerSpawn } from 'xxscreeps/mods/modern/powerspawn/powerspawn.js';
import { compose, declare, vector, withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { powerCreepShape } from './schema.js';

/**
 * Power Creeps are immortal "heroes" that are tied to your account and can be respawned in any
 * `PowerSpawn` after death. You can upgrade their abilities ("powers") up to your account Global
 * Power Level (see [`Game.gpl`](https://docs.screeps.com/api/#Game.gpl)).
 * @public
 * @see https://docs.screeps.com/api/#PowerCreep
 */
export class PowerCreep extends withOverlay(RoomObject, powerCreepShape) {
	/** @internal — raw incoming damage this tick; settled to `hits` in the tick processor. */
	declare tickRawDamage: number | undefined;

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

	override get hitsMax() { return 1000 * (this.level + 1); }
	override get my() { return this['#user'] === me; }
	get owner() { return userInfo.get(this['#user']); }

	// An unspawned creep has `#ageTime` of `0`: no remaining lifetime and no shard assignment.
	/**
	 * The remaining amount of game ticks after which the creep will die and become unspawned.
	 * Undefined if the creep is not spawned in the world.
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.ticksToLive
	 */
	get ticksToLive() { return optionalExpiryTime(this['#ageTime']); }

	/**
	 * The name of the shard where the power creep is spawned, or `null`.
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.shard
	 */
	get shard() { return this['#ageTime'] === 0 ? null : userGame?.shard.name ?? null; }

	get saying() {
		const saying = this['#saying'];
		if (saying?.time === Game.time && (saying.isPublic || this.my)) {
			return saying.message;
		}
	}

	get carry() { return this.store; }
	get carryCapacity() { return this.store.getCapacity(); }

	get memory(): Record<string, unknown> | undefined {
		if (!this.my) {
			return;
		}
		return (Memory.get().powerCreeps ??= {})[this.name] ??= {};
	}

	override get '#hasIntent'() { return true; }
	override get '#layer'() { return 0; }
	override get '#lookType'() { return C.LOOK_POWER_CREEPS; }
	override get '#providesVision'() { return true; }

	set memory(memory: Record<string, unknown>) {
		if (!this.my) {
			return;
		}
		(Memory.get().powerCreeps ??= {})[this.name] ??= memory;
	}

	override '#addToMyGame'(game: GameConstructor) {
		game.powerCreeps[this.name] = this;
	}

	// Defer incoming damage to the tick processor so death routes through the tombstone + respawn
	// cooldown path, rather than the base immediate `#destroy`. Power creeps have no body to absorb it.
	override '#applyDamage'(power: number, _type: number, source?: RoomObject) {
		this.tickRawDamage = (this.tickRawDamage ?? 0) + power;
		if (source) {
			saveAction(this, 'attacked', source.pos);
		}
	}

	override '#destroy'(type?: number) {
		if (super['#destroy'](type)) {
			appendEventLog(this.room, {
				event: C.EVENT_OBJECT_DESTROYED,
				objectId: this.id,
				type: 'powerCreep',
			});
			return true;
		}
		return false;
	}

	// --- Room verbs. A power creep acts only once spawned into a room; the account-only roster form
	// returns `ERR_BUSY`, mirroring vanilla's room guard before it delegates to the shared creep verb.
	// Power creeps share the carry/store surface with creeps (`Carrier`) but have no body or fatigue. ---

	/** Drop a resource on the ground. */
	drop(resourceType: ResourceType, amount?: number) {
		const intentAmount = (amount ?? 0) || this.store[resourceType];
		return chainIntentChecks(
			() => checkSpawned(this),
			() => checkDrop(this, resourceType, intentAmount),
			() => intents.save(this, 'drop', resourceType, intentAmount));
	}

	/** Move one square in the given direction. Power creeps move without fatigue. */
	move(direction: Direction) {
		return chainIntentChecks(
			() => checkSpawned(this),
			() => checkCarrier(this),
			() => Number.isInteger(direction) && direction >= 1 && direction <= 8 ? C.OK : C.ERR_INVALID_ARGS,
			() => intents.save(this, 'move', direction));
	}

	/** Pick up a dropped resource. */
	pickup(resource: Resource) {
		return chainIntentChecks(
			() => checkSpawned(this),
			() => checkPickup(this, resource),
			() => intents.save(this, 'pickup', resource.id));
	}

	/** Display a speech bubble. */
	say(message: string, isPublic = false) {
		return chainIntentChecks(
			() => checkSpawned(this),
			() => checkCarrier(this),
			() => intents.save(this, 'say', String(message).substring(0, 10), isPublic));
	}

	/** Transfer a resource to another object. */
	transfer(target: RoomObject & WithStore, resourceType: ResourceType, amount?: number) {
		const intentAmount = calculateChecked(this, target, () =>
			(amount ?? 0) || Math.min(this.store[resourceType], target.store.getFreeCapacity(resourceType)!));
		return chainIntentChecks(
			() => checkSpawned(this),
			() => checkTransfer(this, target, resourceType, intentAmount),
			() => intents.save(this, 'transfer', target.id, resourceType, intentAmount));
	}

	/** Withdraw a resource from a structure or tombstone. */
	withdraw(target: Structure & WithStore, resourceType: ResourceType, amount?: number) {
		const intentAmount = calculateChecked(this, target, () =>
			(amount ?? 0) || Math.min(this.store.getFreeCapacity(resourceType), target.store[resourceType]));
		return chainIntentChecks(
			() => checkSpawned(this),
			() => checkWithdraw(this, target, resourceType, intentAmount),
			() => intents.save(this, 'withdraw', target.id, resourceType, intentAmount));
	}

	/** Spawn this roster member into a room at the given power spawn. */
	spawn(powerSpawn: StructurePowerSpawn) {
		return chainIntentChecks(
			() => isSpawned(this) ? C.ERR_BUSY : C.OK,
			() => checkTarget(powerSpawn, StructurePowerSpawn),
			() => this.my && powerSpawn.my ? C.OK : C.ERR_NOT_OWNER,
			() => checkIsActive(powerSpawn),
			() => this.spawnCooldownTime > Date.now() ? C.ERR_TIRED : C.OK,
			() => intents.save(powerSpawn, 'spawnPowerCreep', this.id));
	}

	/** Reset this creep's lifetime at an adjacent power spawn or power bank. */
	renew(target: StructurePowerSpawn | StructurePowerBank) {
		return chainIntentChecks(
			() => checkSpawned(this),
			() => checkRenew(this, target),
			() => intents.save(this, 'renew', target.id));
	}

	/** Kill this power creep immediately. */
	suicide() {
		return chainIntentChecks(
			() => checkSpawned(this),
			() => checkCarrier(this),
			() => intents.save(this, 'suicide'));
	}
}

// The overlay type of `room` lies for player ergonomics — an unspawned roster member has none.
const isSpawned = (creep: PowerCreep) => (creep.room as unknown) !== undefined;

/** Room verbs act only on a spawned creep; the account-only roster form is busy. */
function checkSpawned(creep: PowerCreep) {
	return isSpawned(creep) ? C.OK : C.ERR_BUSY;
}

export function checkRenew(creep: PowerCreep, target: StructurePowerSpawn | StructurePowerBank) {
	return chainIntentChecks(
		() => creep.my ? C.OK : C.ERR_NOT_OWNER,
		() => checkTarget(target, StructurePowerSpawn, StructurePowerBank),
		() => target instanceof StructurePowerSpawn ? checkIsActive(target) : C.OK,
		() => checkRange(creep, target, 1));
}

// Power creeps block movement like creeps, deferring to the same safe-mode rules.
registerObstacleChecker(params => {
	const { room, user } = params;
	if (params.ignoreCreeps) {
		return null;
	} else if (room.controller?.safeMode === undefined) {
		return object => object instanceof PowerCreep;
	} else {
		const safeUser = room.controller['#user'];
		if (safeUser !== user) {
			return object => object instanceof PowerCreep;
		}
		return object => object instanceof PowerCreep && object['#user'] === user;
	}
});

// Initialize the fields shared by spawned and unspawned creeps.
function instantiatePowerCreep(
	id: string, pos: RoomPosition, name: string, className: string, owner: string, storeCapacity: number,
) {
	const creep = assign(new PowerCreep(), {
		id,
		pos,
		name,
		className,
		spawnCooldownTime: 0,
		deleteTime: 0,
		hits: 0,
		store: OpenStore['#create'](storeCapacity),
	});
	// Private-symbol fields are assigned by member access, not as object-literal keys: the private
	// transform only rewrites `obj['#x']` accesses, so a literal `'#x'` key would miss the symbol slot.
	creep['#posId'] = pos['#id'];
	creep['#powers'] = [];
	creep['#user'] = owner;
	creep['#actionLog'] = [];
	creep['#ageTime'] = 0;
	return creep;
}

/** Build a fresh, unspawned roster member. */
export function createPowerCreep(id: string, name: string, className: string, owner: string) {
	return instantiatePowerCreep(id, new RoomPosition(0, 0, 'E0S0'), name, className, owner, 0);
}

/** Copy a claimed roster entry into a room: same identity and powers, with fresh room presence. */
export function createSpawnedPowerCreep(pos: RoomPosition, entry: PowerCreep) {
	const creep = instantiatePowerCreep(
		entry.id, pos, entry.name, entry.className, entry['#user'], 100 * (entry.level + 1));
	creep['#powers'] = entry['#powers'].map(({ power, level }) => ({ power, level }));
	creep.hits = creep.hitsMax;
	creep['#ageTime'] = entry['#ageTime'];
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
