import type { PowerCreepRecord } from './record.js';
import type { Database } from 'xxscreeps/engine/db/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { levelOf, nestPowers } from './record.js';

// Account-scoped power creep roster keyspace operations. Stored per-user as a hash keyed by id; the
// value is the dense `PowerCreepRecord` (see `record.js`). Powers are flattened to `{ [PWR]: level }`
// here and expanded to the public `{ [PWR]: { level } }` shape at the runtime/API boundary.
const powerCreepsKey = (userId: string) => `user/${userId}/powerCreeps`;

interface PowerInfo { className: string; level: number[] }
const powerInfoTable: Record<number, PowerInfo> = C.POWER_INFO;
const powerInfo = (power: number) => powerInfoTable[power];

// Expand a stored record into the `/list` wire shape the client expects: `_id`, nested `powers`,
// and the hits/store fields derived from level (1000 hits / 100 capacity per level).
export function renderRecord(record: PowerCreepRecord) {
	const level = levelOf(record);
	return {
		_id: record.id,
		name: record.name,
		className: record.className,
		level,
		hits: 1000 * (level + 1),
		hitsMax: 1000 * (level + 1),
		store: {},
		storeCapacity: 100 * (level + 1),
		spawnCooldownTime: record.spawnCooldownTime,
		powers: nestPowers(record.powers),
		...record.deleteTime != null && { deleteTime: record.deleteTime },
	};
}

function gplLevel(power: number) {
	return Math.floor((power / C.POWER_LEVEL_MULTIPLY) ** (1 / C.POWER_LEVEL_POW));
}

function freeLevels(power: number, roster: PowerCreepRecord[]) {
	const used = roster.length + Fn.accumulate(roster, levelOf);
	return gplLevel(power) - used;
}

async function userPower(db: Database, userId: string) {
	return Number(await db.data.hGet(User.infoKey(userId), 'power')) || 0;
}

// A scheduled deletion that has elapsed is treated as gone everywhere; the physical hash entry is
// left in place (a cheap leak bounded by deletions; a separate purge job would reclaim it).
const isLive = (record: PowerCreepRecord) => record.deleteTime == null || record.deleteTime > Date.now();

/** Live roster, with elapsed scheduled-deletions filtered out. */
export async function loadRoster(db: Database, userId: string) {
	return Object.values(await db.data.hGetAll(powerCreepsKey(userId)))
		.map(value => JSON.parse(value) as PowerCreepRecord)
		.filter(isLive);
}

async function loadOwned(db: Database, userId: string, id: unknown) {
	const record = await db.data.hGet(powerCreepsKey(userId), String(id));
	if (record == null) {
		throw new Error('Invalid id');
	}
	const parsed = JSON.parse(record) as PowerCreepRecord;
	if (!isLive(parsed)) {
		throw new Error('Invalid id');
	}
	return parsed;
}

function save(db: Database, userId: string, record: PowerCreepRecord) {
	return db.data.hSet(powerCreepsKey(userId), record.id, JSON.stringify(record));
}

export async function create(db: Database, userId: string, name: unknown, className: unknown) {
	const [ power, roster ] = await Promise.all([ userPower(db, userId), loadRoster(db, userId) ]);
	if (freeLevels(power, roster) <= 0) {
		throw new Error('Not enough power level');
	}
	if (typeof className !== 'string' || !Object.values(C.POWER_CLASS).includes(className)) {
		throw new Error('Invalid class');
	}
	const truncated = String(name).substring(0, 50);
	if (roster.some(record => record.name === truncated)) {
		throw new Error('Name already exists');
	}
	const record: PowerCreepRecord = {
		id: Id.generateId(),
		name: truncated,
		className,
		powers: {},
		spawnCooldownTime: 0,
	};
	await save(db, userId, record);
	return record;
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

export async function upgrade(db: Database, userId: string, id: unknown, powers: unknown) {
	const [ power, roster ] = await Promise.all([ userPower(db, userId), loadRoster(db, userId) ]);
	const record = roster.find(entry => entry.id === id);
	if (!record) {
		throw new Error('Invalid id');
	}
	if (typeof powers !== 'object' || powers === null) {
		throw new Error('Invalid powers');
	}
	const desired: Record<number, number> = {};
	for (const [ key, value ] of Object.entries(powers)) {
		const info = powerInfo(Number(key));
		if (!info) {
			throw new Error(`Invalid power ${key}`);
		}
		if (info.className !== record.className) {
			throw new Error(`Invalid class for power ${key}`);
		}
		if (typeof value !== 'number') {
			throw new Error(`Invalid value for power ${key}`);
		}
		if (value < (record.powers[Number(key)] ?? 0)) {
			throw new Error(`Cannot downgrade power ${key}`);
		}
		if (value > 5) {
			throw new Error(`Invalid max value for power ${key}`);
		}
		desired[Number(key)] = value;
	}
	for (const [ key, value ] of Object.entries(record.powers)) {
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
	if (freeLevels(power, roster) < newLevel - levelOf(record)) {
		throw new Error('Not enough power level');
	}
	record.powers = learned;
	await save(db, userId, record);
	return record;
}

export async function rename(db: Database, userId: string, id: unknown, name: unknown) {
	const roster = await loadRoster(db, userId);
	const record = roster.find(entry => entry.id === id);
	if (!record) {
		throw new Error('Invalid id');
	}
	const truncated = String(name).substring(0, 50);
	if (roster.some(entry => entry.name === truncated)) {
		throw new Error('Name already exists');
	}
	record.name = truncated;
	await save(db, userId, record);
	return record;
}

export async function scheduleDelete(db: Database, userId: string, id: unknown) {
	const record = await loadOwned(db, userId, id);
	if (record.deleteTime != null) {
		throw new Error('Already being deleted');
	}
	record.deleteTime = Date.now() + C.POWER_CREEP_DELETE_COOLDOWN;
	await save(db, userId, record);
}

export async function cancelDelete(db: Database, userId: string, id: unknown) {
	const record = await loadOwned(db, userId, id);
	if (record.deleteTime == null) {
		throw new Error('Not being deleted');
	}
	delete record.deleteTime;
	await save(db, userId, record);
}
