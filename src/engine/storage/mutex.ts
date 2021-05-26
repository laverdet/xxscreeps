import type { Effect } from 'xxscreeps/utility/types';
import type { KeyValProvider, PubSubProvider } from './provider';
import type { Subscription } from 'xxscreeps/engine/storage/channel';
import { Deferred, mustNotReject } from 'xxscreeps/utility/async';
import { Channel } from 'xxscreeps/engine/storage/channel';

type Message = 'waiting' | 'unlocked';

export class Mutex {
	private lockedOrPending = false;
	private yieldPromise?: Promise<void>;
	private waitingListener?: Effect;
	private readonly localQueue: (Effect)[] = [];
	constructor(
		private readonly channel: Subscription<Message>,
		private readonly lockable: Lock,
	) {}

	static async connect(name: string, keyval: KeyValProvider, pubsub: PubSubProvider) {
		const channel = await new Channel<Message>(pubsub, `mutex/channel/${name}`, false).subscribe();
		const lock = new Lock(keyval, `mutex/${name}`);
		return new Mutex(channel, lock);
	}

	async disconnect() {
		if (this.lockedOrPending) {
			throw new Error('Can\'t disconnect while mutex locked');
		} else if (this.waitingListener) {
			await this.lockable.unlock();
			await this.channel.publish('unlocked');
			this.waitingListener = undefined;
		}
		this.channel.disconnect();
	}

	async lock() {
		if (this.lockedOrPending) {
			// Already locked locally
			const lockDefer = new Deferred();
			this.localQueue.push(lockDefer.resolve);
			return lockDefer.promise;
		} else if (this.waitingListener) {
			// If the listener is still attached it means no one else wanted the lock
			this.lockedOrPending = true;
			return;
		}
		this.lockedOrPending = true;
		// If we're yielding send message that we want the lock back
		if (this.yieldPromise) {
			await this.channel.publish('waiting');
			await this.yieldPromise;
		}
		// Listen for peers who want the lock
		this.waitingListener = this.channel.listen(message => {
			if (message === 'waiting') {
				this.waitingListener!();
				this.waitingListener = undefined;
				if (!this.lockedOrPending) {
					// If a peer is waiting while this is soft locked then yield next time we try to lock
					this.yieldLock().catch(console.error);
				}
			}
		});
		if (await this.lockable.lock()) {
			// Lock with no contention
			return;
		}
		// Must wait for lock
		const lockDefer = new Deferred;
		const tryLock = () => {
			this.lockable.lock().then(locked => {
				if (locked) {
					lockDefer.resolve();
				} else {
					this.channel.publish('waiting').catch(lockDefer.reject);
				}
			}, lockDefer.reject);
		};
		// Listen for unlock messages and try to lock again
		const unlisten = this.channel.listen(message => {
			if (message === 'unlocked') {
				tryLock();
			}
		});
		// Also keep trying in case the peer gave up
		const timer = setInterval(tryLock, 500);
		// Wait on the lock
		try {
			tryLock();
			await lockDefer.promise;
		} finally {
			clearInterval(timer);
			unlisten();
		}
	}

	async unlock() {
		if (this.lockedOrPending) {
			// If there's more waiting locally then run them
			if (this.localQueue.length !== 0) {
				this.localQueue.shift()!();
				return;
			}
			this.lockedOrPending = false;
			if (!this.waitingListener) {
				// If there's a peer waiting for the lock then give them a chance to get it
				await this.yieldLock();
			}
		} else {
			throw new Error('Not locked');
		}
	}

	async scope<Type>(callback: () => Promise<Type>): Promise<Type> {
		await this.lock();
		try {
			return await callback();
		} finally {
			await this.unlock();
		}
	}

	private async yieldLock() {
		this.yieldPromise = new Promise(resolve => {
			const finish = () => {
				clearInterval(timer);
				unlisten();
				this.yieldPromise = undefined;
				resolve();
			};
			const timer = setTimeout(finish, 500);
			const unlisten = this.channel.listen(message => {
				if (message === 'unlocked') {
					finish();
				}
			});
		});
		await this.lockable.unlock();
		await this.channel.publish('unlocked');
	}
}

class Lock {
	private interval: ReturnType<typeof setInterval> | undefined;
	private readonly value = `${Math.random()}`;
	constructor(
		private readonly keyval: KeyValProvider,
		private readonly name: string,
	) {}

	async lock() {
		if (await this.keyval.set(this.name, this.value, { px: 30000, if: 'nx' }) === null) {
			return false;
		} else {
			this.interval = setInterval(() => mustNotReject(async() => {
				if (await this.keyval.set(this.name, this.value, { px: 30000, if: 'xx' }) === null) {
					throw new Error('Lock expired unexpectedly');
				}
			}), 15000);
			return true;
		}
	}

	unlock() {
		clearInterval(this.interval!);
		this.interval = undefined;
		return this.keyval.cad(this.name, this.value);
	}
}
