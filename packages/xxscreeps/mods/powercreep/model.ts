import type { PowerCreep } from './powercreep.js';
import type { Database } from 'xxscreeps/engine/db/index.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { createPowerCreep, read, write } from './powercreep.js';

// Account-scoped power creep roster.
const powerCreepsKey = (userId: string) => `user/${userId}/powerCreeps`;

interface PowerInfo {
	className: string;
	level: number[];
}

interface PowerEntry {
	power: number;
	level: number;
}

const powerInfoTable: Record<number, PowerInfo> = C.POWER_INFO;

/** Channel the backend publishes to on every roster mutation; the runner refreshes when it fires. */
export function getPowerCreepChannel(db: Database, userId: string) {
	return new Channel<{ type: 'updated' }>(db.pubsub, powerCreepsKey(userId));
}

// A scheduled deletion that has elapsed is treated as gone; mutations re-serialize the live set, so
// the physical entry is reclaimed the next time the roster is written. `deleteTime` is `0` while the
// creep is not scheduled for deletion.
const isLive = (creep: PowerCreep) => creep.deleteTime === 0 || creep.deleteTime > Date.now();

function parseRoster(blob: Readonly<Uint8Array> | null): PowerCreep[] {
	return blob == null ? [] : read(blob);
}

/** Live roster game objects, with elapsed scheduled-deletions filtered out. */
export async function loadRoster(db: Database, userId: string) {
	return parseRoster(await db.data.get(powerCreepsKey(userId), { blob: true })).filter(isLive);
}

/** Raw roster blob for the runtime payload — read as a shared buffer and handed across untouched. */
export function loadPowerCreepsBlob(db: Database, userId: string) {
	return db.data.get(powerCreepsKey(userId), { blob: true });
}

// Apply `fn` to the live roster and commit it with a compare-and-swap, retrying if a concurrent
// mutation slipped in between the read and the write. `fn` validates and throws on rejection, in
// which case nothing is written.
async function mutate<Type>(db: Database, userId: string, fn: (roster: PowerCreep[]) => Type | Promise<Type>) {
	const key = powerCreepsKey(userId);
	for (let attempt = 0; attempt <= 4; ++attempt) {
		const prior = await db.data.get(key, { blob: true });
		const roster = parseRoster(prior).filter(isLive);
		const result = await fn(roster);
		const stored = await db.data.set(key, write(roster), {
			if: prior == null ? { if: 'NX' } : { if: 'EQ', value: prior },
		});
		if (stored !== false) {
			await getPowerCreepChannel(db, userId).publish({ type: 'updated' });
			return result;
		}
	}
	throw new Error('Roster busy');
}

function gplLevel(power: number) {
	return Math.floor((power / C.POWER_LEVEL_MULTIPLY) ** (1 / C.POWER_LEVEL_POW));
}

function freeLevels(power: number, roster: PowerCreep[]) {
	const used = roster.length + Fn.accumulate(roster, creep => creep.level);
	return gplLevel(power) - used;
}

async function userPower(db: Database, userId: string) {
	return Number(await db.data.hGet(User.infoKey(userId), 'power')) || 0;
}

export function create(db: Database, userId: string, name: string, className: string) {
	return mutate(db, userId, async roster => {
		if (freeLevels(await userPower(db, userId), roster) <= 0) {
			throw new Error('Not enough power level');
		}
		if (!Object.values(C.POWER_CLASS).includes(className)) {
			throw new Error('Invalid class');
		}
		const truncated = String(name).slice(0, 50);
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
function powersAreReachable(powers: PowerEntry[]) {
	const target = Fn.accumulate(powers, entry => entry.level);
	const built = new Map(Fn.map(powers, entry => [ entry.power, 0 ]));
	let level = 0;
	while (level < target) {
		const next = powers.find(({ power, level: want }) => {
			const have = built.get(power) ?? 0;
			const info = powerInfoTable[power];
			return info && have < 5 && have < want && powerInfoTable[power]!.level[have]! <= level;
		});
		if (next === undefined) {
			return false;
		}
		built.set(next.power, (built.get(next.power) ?? 0) + 1);
		level = Fn.accumulate(built.values());
	}
	return true;
}

export function upgrade(db: Database, userId: string, id: string, powers: Record<string, number>) {
	return mutate(db, userId, async roster => {
		const creep = roster.find(entry => entry.id === id);
		if (!creep) {
			throw new Error('Invalid id');
		}
		const levelOf = (power: number) => creep['#powers'].find(entry => entry.power === power)?.level ?? 0;
		const desired: PowerEntry[] = [];
		for (const [ key, value ] of Object.entries(powers)) {
			const power = Number(key);
			const info = powerInfoTable[power];
			if (!info) {
				throw new Error(`Invalid power ${key}`);
			}
			if (info.className !== creep.className) {
				throw new Error(`Invalid class for power ${key}`);
			}
			if (value < levelOf(power)) {
				throw new Error(`Cannot downgrade power ${key}`);
			}
			if (value > 5) {
				throw new Error(`Invalid max value for power ${key}`);
			}
			if (value > 0) {
				desired.push({ power, level: value });
			}
		}
		// A power already learned may not be dropped by omitting it from the request.
		for (const { power, level } of creep['#powers']) {
			if ((desired.find(entry => entry.power === power)?.level ?? 0) < level) {
				throw new Error(`Cannot downgrade power ${power}`);
			}
		}
		const newLevel = Fn.accumulate(desired, entry => entry.level);
		if (newLevel > C.POWER_CREEP_MAX_LEVEL) {
			throw new Error('Max level');
		}
		for (const { power, level } of desired) {
			if (newLevel < powerInfoTable[power]!.level[level - 1]!) {
				throw new Error(`Not enough level for power ${power}`);
			}
		}
		if (!powersAreReachable(desired)) {
			throw new Error('Powers set is not valid');
		}
		if (freeLevels(await userPower(db, userId), roster) < newLevel - creep.level) {
			throw new Error('Not enough power level');
		}
		creep['#powers'] = desired;
		return creep;
	});
}

export function rename(db: Database, userId: string, id: unknown, name: unknown) {
	return mutate(db, userId, roster => {
		const creep = roster.find(entry => entry.id === id);
		if (!creep) {
			throw new Error('Invalid id');
		}
		const truncated = String(name).slice(0, 50);
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
		if (creep.deleteTime !== 0) {
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
		if (creep.deleteTime === 0) {
			throw new Error('Not being deleted');
		}
		creep.deleteTime = 0;
	});
}
