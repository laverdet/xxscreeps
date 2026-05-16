import type { NotificationType } from './model.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { intents } from 'xxscreeps/game/index.js';

const kPerTickCap = 20;
const kCpuCost = 0.2;

export type QueuedNotification = {
	type: NotificationType;
	message: unknown;
	groupInterval: unknown;
};

let queue: QueuedNotification[] = [];

export function notify(message: unknown, groupInterval?: unknown) {
	if (queue.length >= kPerTickCap) {
		return C.ERR_FULL;
	}
	queue.push({ type: 'msg', message, groupInterval });
	intents.cpu += kCpuCost;
	return C.OK;
}

export function flush() {
	const tmp = queue;
	queue = [];
	return tmp;
}
