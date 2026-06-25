import type { PowerCreep } from './powercreep.js';
import type { Database } from 'xxscreeps/engine/db/index.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { latin1ToBuffer, typedArrayToString } from 'xxscreeps/utility/string.js';
import { createPowerCreep, read, write } from './powercreep.js';

// Account-scoped power creep roster. The whole roster is stored under one key as the serialized
// `PowerCreep` blob (see `powercreep.js`) so mutations can go through keyval compare-and-swap. The
// driver hands the same bytes straight to the runtime; nothing parses the roster on the runner side.
const powerCreepsKey = (userId: string) => `user/${userId}/powerCreeps`;

interface PowerInfo { className: string; level: number[] }
const powerInfoTable: Record<number, PowerInfo> = C.POWER_INFO;
const powerInfo = (power: number) => powerInfoTable[power];

/** Channel the backend publishes to on every roster mutation; the runner refreshes when it fires. */
export function getPowerCreepChannel(db: Database, userId: string) {
	return new Channel<{ type: 'updated' }>(db.pubsub, powerCreepsKey(userId));
}

// A scheduled deletion that has elapsed is treated as gone; mutations re-serialize the live set, so
// the physical entry is reclaimed the next time the roster is written.
const isLive = (creep: PowerCreep) => creep.deleteTime == null || creep.deleteTime > Date.now();

function parseRoster(raw: string | null): PowerCreep[] {
	return raw == null ? [] : read(latin1ToBuffer(raw));
}

/** Live roster game objects, with elapsed scheduled-deletions filtered out. */
export async function loadRoster(db: Database, userId: string) {
	return parseRoster(await db.data.get(powerCreepsKey(userId))).filter(isLive);
}

/** Raw roster blob for the runtime payload — handed across untouched, into a shared buffer to transfer. */
export async function loadPowerCreepsBlob(db: Database, userId: string) {
	const raw = await db.data.get(powerCreepsKey(userId));
	return raw == null ? null : latin1ToBuffer(raw, SharedArrayBuffer);
}

// Apply `fn` to the live roster and commit it with a compare-and-swap, retrying if a concurrent
// mutation slipped in between the read and the write. `fn` validates and throws on rejection, in
// which case nothing is written.
async function mutate<Type>(db: Database, userId: string, fn: (roster: PowerCreep[]) => Type | Promise<Type>) {
	const key = powerCreepsKey(userId);
	for (let attempt = 0; ; ++attempt) {
		const raw = await db.data.get(key);
		const roster = parseRoster(raw).filter(isLive);
		const result = await fn(roster);
		const stored = await db.data.set(key, typedArrayToString(write(roster)), {
			if: raw == null ? { if: 'NX' } : { if: 'EQ', value: raw },
		});
		if (stored !== false) {
			await getPowerCreepChannel(db, userId).publish({ type: 'updated' });
			return result;
		}
		if (attempt >= 4) {
			throw new Error('Roster busy');
		}
	}
}

function gplLevel(power: number) {
	return Math.floor((power / C.POWER_LEVEL_MULTIPLY) ** (1 / C.POWER_LEVEL_POW));
}

function freeLevels(power: number, roster: PowerCreep[]) {
	const used = roster.length + Fn.accumulate(roster, creep => creep.level);
	return gplLevel(power) - used;
}

function userPower(db: Database, userId: string) {
	return db.data.hGet(User.infoKey(userId), 'power').then(power => Number(power) || 0);
}

/** Expand a roster member into the `/list` wire shape the client expects. */
export function renderRecord(creep: PowerCreep) {
	const { level } = creep;
	return {
		_id: creep.id,
		name: creep.name,
		className: creep.className,
		level,
		hits: 1000 * (level + 1),
		hitsMax: 1000 * (level + 1),
		store: {},
		storeCapacity: 100 * (level + 1),
		spawnCooldownTime: creep.spawnCooldownTime,
		powers: creep.powers,
		...creep.deleteTime != null && { deleteTime: creep.deleteTime },
	};
}

export function create(db: Database, userId: string, name: unknown, className: unknown) {
	return mutate(db, userId, async roster => {
		if (freeLevels(await userPower(db, userId), roster) <= 0) {
			throw new Error('Not enough power level');
		}
		if (typeof className !== 'string' || !Object.values(C.POWER_CLASS).includes(className)) {
			throw new Error('Invalid class');
		}
		const truncated = String(name).substring(0, 50);
		if (roster.some(creep => creep.name === truncated)) {
			throw new Error('Name already exists');
		}
		const creep = createPowerCreep(Id.generateId(), truncated, className);
		roster.push(creep);
		return creep;
	});
}

// Every requested level must be reachable by allocating one point at a time without ever exceeding a
// power's per-rank level prerequisite.
function powersAreReachable(powers: Record<number, number>) {
	const target = Fn.accumulate(Object.values(powers));
	const built = new Map<number, number>(Fn.map(Object.keys(C.POWER_INFO), power => [ Number(power), 0 ]));
	let level = 0;
	while (level < target) {
		const next = Object.keys(powers).map(Number).find(power => {
			const have = built.get(power) ?? 0;
			return have < 5 && have < (powers[power] ?? 0) && powerInfo(power)!.level[have]! <= level;
		});
		if (next === undefined) {
			return false;
		}
		built.set(next, (built.get(next) ?? 0) + 1);
		level = Fn.accumulate(built.values());
	}
	return true;
}

export function upgrade(db: Database, userId: string, id: unknown, powers: unknown) {
	return mutate(db, userId, async roster => {
		const creep = roster.find(entry => entry.id === id);
		if (!creep) {
			throw new Error('Invalid id');
		}
		if (typeof powers !== 'object' || powers === null) {
			throw new Error('Invalid powers');
		}
		const current = creep['#powers'];
		const desired: Record<number, number> = {};
		for (const [ key, value ] of Object.entries(powers)) {
			const info = powerInfo(Number(key));
			if (!info) {
				throw new Error(`Invalid power ${key}`);
			}
			if (info.className !== creep.className) {
				throw new Error(`Invalid class for power ${key}`);
			}
			if (typeof value !== 'number') {
				throw new Error(`Invalid value for power ${key}`);
			}
			if (value < (current[Number(key)] ?? 0)) {
				throw new Error(`Cannot downgrade power ${key}`);
			}
			if (value > 5) {
				throw new Error(`Invalid max value for power ${key}`);
			}
			desired[Number(key)] = value;
		}
		for (const [ key, value ] of Object.entries(current)) {
			if ((desired[Number(key)] ?? 0) < value) {
				throw new Error(`Cannot downgrade power ${key}`);
			}
		}
		const newLevel = Fn.accumulate(Object.values(desired));
		if (newLevel > C.POWER_CREEP_MAX_LEVEL) {
			throw new Error('Max level');
		}
		const learned: Record<number, number> = {};
		for (const [ key, value ] of Object.entries(desired)) {
			if (value === 0) {
				continue;
			}
			if (newLevel < powerInfo(Number(key))!.level[value - 1]!) {
				throw new Error(`Not enough level for power ${key}`);
			}
			learned[Number(key)] = value;
		}
		if (!powersAreReachable(desired)) {
			throw new Error('Powers set is not valid');
		}
		if (freeLevels(await userPower(db, userId), roster) < newLevel - creep.level) {
			throw new Error('Not enough power level');
		}
		creep['#powers'] = learned;
		return creep;
	});
}

export function rename(db: Database, userId: string, id: unknown, name: unknown) {
	return mutate(db, userId, roster => {
		const creep = roster.find(entry => entry.id === id);
		if (!creep) {
			throw new Error('Invalid id');
		}
		const truncated = String(name).substring(0, 50);
		if (roster.some(entry => entry.name === truncated)) {
			throw new Error('Name already exists');
		}
		creep.name = truncated;
		return creep;
	});
}

export function scheduleDelete(db: Database, userId: string, id: unknown) {
	return mutate(db, userId, roster => {
		const creep = roster.find(entry => entry.id === id);
		if (!creep) {
			throw new Error('Invalid id');
		}
		if (creep.deleteTime != null) {
			throw new Error('Already being deleted');
		}
		creep.deleteTime = Date.now() + C.POWER_CREEP_DELETE_COOLDOWN;
	});
}

export function cancelDelete(db: Database, userId: string, id: unknown) {
	return mutate(db, userId, roster => {
		const creep = roster.find(entry => entry.id === id);
		if (!creep) {
			throw new Error('Invalid id');
		}
		if (creep.deleteTime == null) {
			throw new Error('Not being deleted');
		}
		creep.deleteTime = undefined;
	});
}
