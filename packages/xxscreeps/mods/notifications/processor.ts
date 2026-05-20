import type { Shard } from 'xxscreeps/engine/db/index.js';
import { everyNTicks, registerShardTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Creep } from 'xxscreeps/mods/creep/creep.js';
import { Structure, registerAttackNotification } from 'xxscreeps/mods/structure/structure.js';
import { consumeDueUsers, flushNotifications, getDueNotifications, nextPendingDueAt, removeNotifications, scheduleUserDrain, sendNotification } from './model.js';
import { DEFAULT_INTERVAL_MIN, getLastNotifyDate, getNotifyPrefs, setLastNotifyDate } from './prefs.js';
import { transports } from './transports.js';
import './transport-stdout.js';

interface NamedStructure extends Structure {
	name: string;
}

function isNamedStructure(structure: Structure): structure is NamedStructure {
	return 'name' in structure && typeof structure.name === 'string';
}

function describeTarget(target: Creep | Structure) {
	if (target instanceof Creep) {
		return { label: `creep ${target.name}`, userId: target['#user'] };
	}
	const label = target.structureType === C.STRUCTURE_SPAWN && isNamedStructure(target)
		? `spawn ${target.name}`
		: `${target.structureType} #${target.id}`;
	return { label, userId: target['#user'] ?? target.room.controller?.['#user'] };
}

registerAttackNotification((context, target, source) => {
	if (!(target instanceof Creep || target instanceof Structure)) {
		return;
	}
	const { label, userId } = describeTarget(target);
	const sourceUser = source?.['#user'];
	if (
		userId !== undefined && userId !== null
		&& userId !== '2' && userId !== '3'
		&& sourceUser !== userId && sourceUser !== '2' && sourceUser !== '3'
	) {
		context.task(sendNotification(context.shard, userId, 'msg',
			`Your ${label} in room ${target.room.name} is under attack!`));
	}
});

async function drainUser(shard: Shard, userId: string) {
	const [ prefs, lastNotifyDate ] = await Promise.all([
		getNotifyPrefs(shard, userId),
		getLastNotifyDate(shard, userId),
	]);
	if (prefs.disabled) {
		await flushNotifications(shard, userId);
		return;
	}
	const intervalMs = (prefs.interval ?? DEFAULT_INTERVAL_MIN) * 60_000;
	const now = Date.now();
	const throttleEndsAt = lastNotifyDate + intervalMs;
	if (throttleEndsAt > now) {
		// Throttled — push the user's drain to the throttle deadline. Row groups maturing in
		// the meantime will be picked up at the same drain pass.
		await scheduleUserDrain(shard, userId, throttleEndsAt);
		return;
	}
	const items = await getDueNotifications(shard, userId, now);
	if (items.length > 0) {
		const rows = items.map(item => item.row);
		await Promise.all(Fn.map(transports, async fn => fn(userId, rows)));
		await Promise.all([
			removeNotifications(shard, userId, items.map(item => item.id)),
			setLastNotifyDate(shard, userId, now),
		]);
	}
	const next = await nextPendingDueAt(shard, userId);
	if (next !== undefined) {
		await scheduleUserDrain(shard, userId, next);
	}
}

async function drainAndDeliver(shard: Shard) {
	const userIds = await consumeDueUsers(shard, Date.now());
	if (userIds.length === 0) return;
	await Fn.mapAwait(userIds, userId => drainUser(shard, userId));
}

registerShardTickProcessor(everyNTicks(10, shard => drainAndDeliver(shard)));
