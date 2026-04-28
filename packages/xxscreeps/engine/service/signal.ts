import { parentPort } from 'node:worker_threads';
import { listen } from 'xxscreeps/utility/async.js';

let didSetupBroadcast = false;

/** @internal */
export function initializeInterruptSignal() {
	if (!parentPort && !didSetupBroadcast) {
		didSetupBroadcast = true;
		// Broadcast SIGINT to workers
		const broadcast = new BroadcastChannel('SIGINT');
		const unlisten = listen(process, 'SIGINT', () => {
			broadcast.postMessage('SIGINT');
			setTimeout(() => {
				unlisten();
				broadcast.close();
			}, 250).unref();
		});
	}
}

/** @internal */
export function handleInterruptSignal(fn: () => void) {
	initializeInterruptSignal();
	const disposable = new DisposableStack();
	const broadcast = disposable.adopt(new BroadcastChannel('SIGINT'), channel => channel.close());
	broadcast.onmessage = () => {
		fn();
		disposable.dispose();
	};
	return disposable;
}
