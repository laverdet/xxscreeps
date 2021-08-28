import type { Shard } from 'xxscreeps/engine/db';
import { isTopThread } from 'xxscreeps/config/raw';
import { Channel } from 'xxscreeps/engine/db/channel';
import { listen } from 'xxscreeps/utility/async';

export function getServiceChannel(shard: Shard) {
	type Message =
		{ type: 'shutdown' } |
		{ type: 'mainConnected' } |
		{ type: 'mainDisconnected' } |
		{ type: 'processorInitialized' } |
		{ type: 'runnerConnected' } |
		{ type: 'tickFinished'; time: number };
	return new Channel<Message>(shard.pubsub, 'channel/service');
}

let isEntry = isTopThread;
export function checkIsEntry() {
	const result = isEntry;
	isEntry = false;
	return result;
}

export function handleInterrupt(fn: () => void) {
	const unlisten = listen(process, 'SIGINT', () => {
		unlisten();
		fn();
		process.on('SIGINT', () => {});
		setTimeout(() => process.removeAllListeners('SIGINT'), 250);
	});
}
