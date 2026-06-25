import { parentPort } from 'node:worker_threads';
import { listen } from 'xxscreeps/utility/async.js';

let didSetupBroadcast = false;

// Just an awful debugging experience by default. These properties are not enumerable and nodejs
// doesn't bother to show them to you.
Object.assign(SuppressedError.prototype, {
	[Symbol.for('nodejs.util.inspect.custom')](this: SuppressedError) {
		if (this.error) {
			Object.defineProperty(this, 'error', { enumerable: true, value: this.error });
		}
		if (this.suppressed) {
			Object.defineProperty(this, 'suppressed', { enumerable: true, value: this.suppressed });
		}
		return this;
	},
});

process.on('uncaughtException', error => {
	console.error(error);
	process.exit(1);
});

process.on('unhandledRejection', error => {
	console.error(error);
	process.exit(1);
});

/** @internal */
export function initializeInterruptSignal() {
	if (!parentPort && !didSetupBroadcast) {
		didSetupBroadcast = true;
		// Broadcast SIGINT to workers
		const broadcast = new BroadcastChannel('SIGINT');
		// @ts-expect-error
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call
		broadcast.unref();
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
	// @ts-expect-error
	// eslint-disable-next-line @typescript-eslint/no-unsafe-call
	broadcast.unref();
	return disposable;
}
