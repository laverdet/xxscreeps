import * as C from 'xxscreeps/game/constants/index.js';
import type { NotificationType } from './model.js';

const kPerTickCap = 20;

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
	return C.OK;
}

export function flush() {
	const tmp = queue;
	queue = [];
	return tmp;
}

export function reset() {
	queue = [];
}
