import type { GameConstructor } from 'xxscreeps/game/index.js';
import type { Direction } from 'xxscreeps/game/position.js';
import type { Resource, ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import type { WithStore } from 'xxscreeps/mods/classic/resource/store.js';
import type { TypeOf } from 'xxscreeps/schema/index.js';
import { makeReaderAndWriter } from 'xxscreeps/engine/schema/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { chainIntentChecks, checkRange, checkSafeMode, checkTarget } from 'xxscreeps/game/checks.js';
import { Game, intents, me, userGame, userInfo } from 'xxscreeps/game/index.js';
import { RoomObject, cooldownTime, optionalExpiryTime, saveAction } from 'xxscreeps/game/object.js';
import { registerObstacleChecker } from 'xxscreeps/game/pathfinder/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { StructureController } from 'xxscreeps/mods/classic/controller/controller.js';
import { checkCarrier, checkDrop, checkPickup, checkTransfer, checkWithdraw } from 'xxscreeps/mods/classic/creep/creep.js';
import { OpenStore, calculateChecked, checkHasResourceAmount } from 'xxscreeps/mods/classic/resource/store.js';
import { Structure, checkIsActive, checkMyStructure } from 'xxscreeps/mods/classic/structure/structure.js';
import * as Memory from 'xxscreeps/mods/meta/memory/memory.js';
import { StructurePowerBank } from 'xxscreeps/mods/modern/powerbank/powerbank.js';
import { StructurePowerSpawn } from 'xxscreeps/mods/modern/powerspawn/powerspawn.js';
import { compose, declare, vector, withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import * as C from 'xxscreeps:mods/constants';
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
	 * `level` and remaining `cooldown` ticks as a value.
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.powers
	 */
	get powers(): Record<number, { cooldown: number; level: number }> {
		// Roster copies are read outside a game context; their cooldowns are always `0`, which
		// short-circuits before the `Game.time` read.
		return Object.fromEntries(Fn.map(this['#powers'], ({ cooldownTime: time, level, power }) =>
			[ power, { cooldown: time === 0 ? 0 : cooldownTime(time), level } ]));
	}

	/**
	 * The maximum amount of hit points of the creep.
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.hitsMax
	 */
	override get hitsMax() { return 1000 * (this.level + 1); }

	/**
	 * Whether it is your creep or foe.
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.my
	 */
	override get my() { return this['#user'] === me; }

	/**
	 * An object with the creep's owner info.
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.owner
	 */
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

	/**
	 * The text message that the creep was saying at the last tick.
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.saying
	 */
	get saying() {
		const saying = this['#saying'];
		if (saying?.time === Game.time && (saying.isPublic || this.my)) {
			return saying.message;
		}
	}

	/**
	 * Alias for `PowerCreep.store`.
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#PowerCreep.store
	 */
	get carry() { return this.store; }

	/**
	 * Alias for `PowerCreep.store.getCapacity()`.
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#Store.getCapacity
	 */
	get carryCapacity() { return this.store.getCapacity(); }

	/**
	 * A shorthand to `Memory.powerCreeps[creep.name]`. You can use it for quick access the creep's
	 * specific memory data object.
	 * [Learn more about memory](https://docs.screeps.com/global-objects.html#Memory-object)
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.memory
	 */
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
	// cooldown path, rather than the base immediate `#destroy`.
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

	/**
	 * Drop this resource on the ground.
	 * @param resourceType One of the `RESOURCE_*` constants.
	 * @param amount The amount of resource units to be dropped. If omitted, all the available
	 * carried amount is used.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_INVALID_ARGS`,
	 * `ERR_NOT_ENOUGH_RESOURCES`
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.drop
	 */
	drop(resourceType: ResourceType, amount?: number) {
		const intentAmount = (amount ?? 0) || this.store[resourceType];
		return chainIntentChecks(
			() => checkSpawned(this),
			() => checkDrop(this, resourceType, intentAmount),
			() => intents.save(this, 'drop', resourceType, intentAmount));
	}

	/**
	 * Move the creep one square in the specified direction.
	 * @param direction One of the following constants: `TOP`, `TOP_RIGHT`, `RIGHT`, `BOTTOM_RIGHT`,
	 * `BOTTOM`, `BOTTOM_LEFT`, `LEFT`, `TOP_LEFT`
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_INVALID_ARGS`
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.move
	 */
	move(direction: Direction) {
		return chainIntentChecks(
			() => checkSpawned(this),
			() => checkCarrier(this),
			() => Number.isInteger(direction) && direction >= 1 && direction <= 8 ? C.OK : C.ERR_INVALID_ARGS,
			() => intents.save(this, 'move', direction));
	}

	/**
	 * Pick up an item (a dropped piece of energy). The target has to be at adjacent square to the
	 * creep or at the same square.
	 * @param resource The target object to be picked up.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_INVALID_TARGET`,
	 * `ERR_FULL`, `ERR_NOT_IN_RANGE`
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.pickup
	 */
	pickup(resource: Resource) {
		return chainIntentChecks(
			() => checkSpawned(this),
			() => checkPickup(this, resource),
			() => intents.save(this, 'pickup', resource.id));
	}

	/**
	 * Display a visual speech balloon above the creep with the specified message. The message will be
	 * available for one tick. You can read the last message using the `saying` property. Any valid
	 * Unicode characters are allowed, including emoji.
	 * @param message The message to be displayed. Maximum length is 10 characters.
	 * @param isPublic Set to true to allow other players to see this message. Default is false.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.say
	 */
	say(message: string, isPublic = false) {
		return chainIntentChecks(
			() => checkSpawned(this),
			() => checkCarrier(this),
			() => intents.save(this, 'say', String(message).substring(0, 10), isPublic));
	}

	/**
	 * Transfer resource from the creep to another object. The target has to be at adjacent square to
	 * the creep.
	 * @param target The target object.
	 * @param resourceType One of the `RESOURCE_*` constants.
	 * @param amount The amount of resources to be transferred. If omitted, all the available carried
	 * amount is used.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`,
	 * `ERR_NOT_ENOUGH_RESOURCES`, `ERR_INVALID_TARGET`, `ERR_FULL`, `ERR_NOT_IN_RANGE`,
	 * `ERR_INVALID_ARGS`
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.transfer
	 */
	transfer(target: RoomObject & WithStore, resourceType: ResourceType, amount?: number) {
		const intentAmount = calculateChecked(this, target, () =>
			(amount ?? 0) || Math.min(this.store[resourceType], target.store.getFreeCapacity(resourceType)!));
		return chainIntentChecks(
			() => checkSpawned(this),
			() => checkTransfer(this, target, resourceType, intentAmount),
			() => intents.save(this, 'transfer', target.id, resourceType, intentAmount));
	}

	/**
	 * Withdraw resources from a structure or tombstone. The target has to be at adjacent square to
	 * the creep. Multiple creeps can withdraw from the same object in the same tick. Your creeps can
	 * withdraw resources from hostile structures/tombstones as well, in case if there is no hostile
	 * rampart on top of it.
	 * @param target The target object.
	 * @param resourceType One of the `RESOURCE_*` constants.
	 * @param amount The amount of resources to be transferred. If omitted, all the available amount
	 * is used.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`,
	 * `ERR_NOT_ENOUGH_RESOURCES`, `ERR_INVALID_TARGET`, `ERR_FULL`, `ERR_NOT_IN_RANGE`,
	 * `ERR_INVALID_ARGS`
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.withdraw
	 */
	withdraw(target: Structure & WithStore, resourceType: ResourceType, amount?: number) {
		const intentAmount = calculateChecked(this, target, () =>
			(amount ?? 0) || Math.min(this.store.getFreeCapacity(resourceType), target.store[resourceType]));
		return chainIntentChecks(
			() => checkSpawned(this),
			() => checkWithdraw(this, target, resourceType, intentAmount),
			() => intents.save(this, 'withdraw', target.id, resourceType, intentAmount));
	}

	/**
	 * Spawn this power creep in the specified Power Spawn.
	 * @param powerSpawn Your Power Spawn structure.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_INVALID_TARGET`,
	 * `ERR_TIRED`, `ERR_RCL_NOT_ENOUGH`
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.spawn
	 */
	spawn(powerSpawn: StructurePowerSpawn) {
		return chainIntentChecks(
			() => isSpawned(this) ? C.ERR_BUSY : C.OK,
			() => checkMyStructure(powerSpawn, StructurePowerSpawn),
			() => this.my ? C.OK : C.ERR_NOT_OWNER,
			() => checkIsActive(powerSpawn),
			() => this.spawnCooldownTime > Date.now() ? C.ERR_TIRED : C.OK,
			() => intents.save(powerSpawn, 'spawnPowerCreep', this.id));
	}

	/**
	 * Instantly restore time to live to the maximum using a Power Spawn or a Power Bank nearby. It
	 * has to be at adjacent tile.
	 * @param target The target structure.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_INVALID_TARGET`,
	 * `ERR_NOT_IN_RANGE`
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.renew
	 */
	renew(target: StructurePowerSpawn | StructurePowerBank) {
		return chainIntentChecks(
			() => checkSpawned(this),
			() => checkRenew(this, target),
			() => intents.save(this, 'renew', target.id));
	}

	/**
	 * Kill the power creep immediately. It will not be destroyed permanently, but will become
	 * unspawned, so that you can spawn it again.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.suicide
	 */
	suicide() {
		return chainIntentChecks(
			() => checkSpawned(this),
			() => checkCarrier(this),
			() => intents.save(this, 'suicide'));
	}

	/**
	 * Enable powers usage in this room. The room controller should be at adjacent tile.
	 * @param controller The room controller.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_INVALID_TARGET`,
	 * `ERR_NOT_IN_RANGE`
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.enableRoom
	 */
	enableRoom(controller: StructureController) {
		return chainIntentChecks(
			() => checkEnableRoom(this, controller),
			() => intents.save(this, 'enableRoom', controller.id));
	}

	/**
	 * Apply one of the creep's powers on the specified target. You can only use powers in rooms
	 * either without a controller, or with a power-enabled one. Only one power can be used during
	 * the same tick, each `usePower` call will override the previous one. If the target has the same
	 * effect of a lower or equal level, it is overridden. If the existing effect level is higher, an
	 * error is returned.
	 * @param power The power ID to apply, one of the `PWR_*` constants.
	 * @param target A target game object, for powers which require one.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`, `ERR_INVALID_ARGS`,
	 * `ERR_NO_BODYPART`, `ERR_TIRED`, `ERR_NOT_ENOUGH_RESOURCES`, `ERR_INVALID_TARGET`,
	 * `ERR_NOT_IN_RANGE`
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.usePower
	 */
	usePower(power: number, target?: RoomObject) {
		return chainIntentChecks(
			() => checkUsePower(this, power, target),
			() => intents.save(this, 'usePower', power, target?.id ?? null));
	}
}

// The overlay type of `room` lies for player ergonomics — an unspawned roster member has none.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const isSpawned = (creep: PowerCreep) => creep.room !== undefined;

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

export function checkEnableRoom(creep: PowerCreep, target: StructureController) {
	return chainIntentChecks(
		() => creep.my ? C.OK : C.ERR_NOT_OWNER,
		() => checkSpawned(creep),
		() => checkTarget(target, Structure),
		() => checkRange(creep, target, 1),
		() => checkTarget(target, StructureController),
		() => checkSafeMode(target.room, C.ERR_INVALID_TARGET));
}

// A room without a controller never needs enabling; a hostile safe mode suspends powers outright.
function checkPowersEnabled(creep: PowerCreep) {
	const { controller } = creep.room;
	if (controller === undefined) {
		return C.OK;
	}
	if (!controller.isPowerEnabled) {
		return C.ERR_INVALID_ARGS;
	}
	return checkSafeMode(creep.room, C.ERR_INVALID_ARGS);
}

/** Ops consumed per use — flat, or per-rank when the table carries an array. */
export function powerOpsCost(info: PowerInfo, level: number) {
	const { ops } = info;
	return Array.isArray(ops) ? ops[level - 1]! : ops ?? 0;
}

export function checkUsePower(creep: PowerCreep, power: number, target?: RoomObject) {
	const info: PowerInfo | undefined = powerInfoTable[power];
	const entry = creep['#powers'].find(entry => entry.power === power);
	return chainIntentChecks(
		() => creep.my ? C.OK : C.ERR_NOT_OWNER,
		() => checkSpawned(creep),
		() => checkPowersEnabled(creep),
		() => {
			if (info === undefined || entry === undefined) {
				return C.ERR_NO_BODYPART;
			}
			const cost = powerOpsCost(info, entry.level);
			const { range } = info;
			return chainIntentChecks(
				() => cooldownTime(entry.cooldownTime) > 0 ? C.ERR_TIRED : C.OK,
				() => cost > 0 ? checkHasResourceAmount(creep, C.RESOURCE_OPS, cost) : C.OK,
				() => range === undefined ? C.OK : chainIntentChecks(
					() => checkTarget(target, RoomObject),
					() => checkRange(creep, target!, range)));
		});
}

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
	creep['#powers'] = entry['#powers'].map(({ level, power }) => ({ cooldownTime: 0, level, power }));
	creep.hits = creep.hitsMax;
	creep['#ageTime'] = entry['#ageTime'];
	return creep;
}

// --- Account roster checks: pure functions of account power + roster + args, each returning a result
// code. ---

export interface PowerInfo {
	className: string;
	cooldown: number;
	duration?: number | number[];
	effect?: number[];
	level: number[];
	ops?: number | number[];
	range?: number;
}
interface PowerEntry { power: number; level: number }
/** @internal */
export const powerInfoTable: Record<number, PowerInfo> = C.POWER_INFO;

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
