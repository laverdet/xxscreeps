import type { PowerCreep } from './powercreep.js';
import type { Database } from 'xxscreeps/engine/db/index.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import * as C from 'xxscreeps/game/constants/index.js';
import {
	checkCreatePowerCreep, checkRenamePowerCreep, checkUpgradePowerCreep, createPowerCreep, read, write,
} from './powercreep.js';

// Account-scoped power creep roster.
const powerCreepsKey = (userId: string) => `user/${userId}/powerCreeps`;

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
// mutation slipped in between the read and the write. `fn` runs the shared check and returns its result
// code; the roster is written only when the check passes.
async function mutate(
	db: Database, userId: string,
	fn: (roster: PowerCreep[]) => C.ErrorCode | Promise<C.ErrorCode>,
): Promise<C.ErrorCode> {
	const key = powerCreepsKey(userId);
	for (let attempt = 0; attempt <= 4; ++attempt) {
		const prior = await db.data.get(key, { blob: true });
		const roster = parseRoster(prior).filter(isLive);
		const code = await fn(roster);
		if (code !== C.OK) {
			return code;
		}
		const stored = await db.data.set(key, write(roster), {
			if: prior == null ? { if: 'NX' } : { if: 'EQ', value: prior },
		});
		if (stored !== false) {
			await getPowerCreepChannel(db, userId).publish({ type: 'updated' });
			return C.OK;
		}
	}
	throw new Error('Roster busy');
}

async function userPower(db: Database, userId: string) {
	return Number(await db.data.hGet(User.infoKey(userId), 'power')) || 0;
}

export function create(db: Database, userId: string, name: string, className: string) {
	return mutate(db, userId, async roster => {
		const code = checkCreatePowerCreep(await userPower(db, userId), roster, name, className);
		if (code === C.OK) {
			roster.push(createPowerCreep(Id.generateId(), name.slice(0, 50), className));
		}
		return code;
	});
}

export function upgrade(db: Database, userId: string, id: string, powers: Record<string, number>) {
	return mutate(db, userId, async roster => {
		const creep = roster.find(entry => entry.id === id);
		if (!creep) {
			return C.ERR_NOT_OWNER;
		}
		const code = checkUpgradePowerCreep(await userPower(db, userId), roster, creep, powers);
		if (code === C.OK) {
			creep['#powers'] = Object.entries(powers)
				.filter(([ , level ]) => level !== 0)
				.map(([ power, level ]) => ({ power: Number(power), level }));
		}
		return code;
	});
}

export function rename(db: Database, userId: string, id: string, name: string) {
	return mutate(db, userId, roster => {
		const creep = roster.find(entry => entry.id === id);
		if (!creep) {
			return C.ERR_NOT_OWNER;
		}
		const code = checkRenamePowerCreep(roster, name);
		if (code === C.OK) {
			creep.name = name.slice(0, 50);
		}
		return code;
	});
}

// delete / cancel-delete are idempotent and never fail: a repeated delete keeps the original timer, a
// cancel clears it, and an unknown id is a no-op.
export function scheduleDelete(db: Database, userId: string, id: string) {
	return mutate(db, userId, roster => {
		const creep = roster.find(entry => entry.id === id);
		if (creep?.deleteTime === 0) {
			creep.deleteTime = Date.now() + C.POWER_CREEP_DELETE_COOLDOWN;
		}
		return C.OK;
	});
}

export function cancelDelete(db: Database, userId: string, id: string) {
	return mutate(db, userId, roster => {
		const creep = roster.find(entry => entry.id === id);
		if (creep) {
			creep.deleteTime = 0;
		}
		return C.OK;
	});
}
