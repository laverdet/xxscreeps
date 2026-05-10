import type { Shard } from 'xxscreeps/engine/db/index.js';

export interface NotifyPrefs {
	disabled: boolean;
	disabledOnMessages: boolean;
	sendOnline: boolean;
	interval?: number;
	errorsInterval?: number;
}

const prefsKey = (userId: string) => `user/${userId}/notifications/prefs`;
const lastNotifyDateKey = (userId: string) => `user/${userId}/notifications/lastDate`;

export const DEFAULT_INTERVAL_MIN = 60;

export async function getNotifyPrefs(shard: Shard, userId: string): Promise<NotifyPrefs> {
	interface PrefsFields {
		disabled?: string;
		disabledOnMessages?: string;
		sendOnline?: string;
		interval?: string;
		errorsInterval?: string;
	}
	const fields = await shard.data.hgetall(prefsKey(userId)) as PrefsFields;
	return {
		disabled: fields.disabled === '1',
		disabledOnMessages: fields.disabledOnMessages === '1',
		sendOnline: fields.sendOnline === '1',
		...fields.interval === undefined ? {} : { interval: Number(fields.interval) },
		...fields.errorsInterval === undefined ? {} : { errorsInterval: Number(fields.errorsInterval) },
	};
}

export async function setNotifyPrefs(shard: Shard, userId: string, prefs: Partial<NotifyPrefs>) {
	const fields: Record<string, string> = {};
	if (prefs.disabled !== undefined) fields.disabled = prefs.disabled ? '1' : '0';
	if (prefs.disabledOnMessages !== undefined) fields.disabledOnMessages = prefs.disabledOnMessages ? '1' : '0';
	if (prefs.sendOnline !== undefined) fields.sendOnline = prefs.sendOnline ? '1' : '0';
	if (prefs.interval !== undefined) fields.interval = String(prefs.interval);
	if (prefs.errorsInterval !== undefined) fields.errorsInterval = String(prefs.errorsInterval);
	if (Object.keys(fields).length > 0) {
		await shard.data.hmset(prefsKey(userId), fields);
	}
}

export async function getLastNotifyDate(shard: Shard, userId: string): Promise<number> {
	const value = await shard.data.get(lastNotifyDateKey(userId));
	return value === null ? 0 : Number(value);
}

export async function setLastNotifyDate(shard: Shard, userId: string, time: number) {
	await shard.data.set(lastNotifyDateKey(userId), String(time));
}
