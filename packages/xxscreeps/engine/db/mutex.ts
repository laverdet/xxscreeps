import type { SubscriptionFor } from './channel.js';
import type { KeyValProvider, PubSubProvider } from './storage/provider.js';
import type { Effect } from 'xxscreeps/utility/types.js';
import * as assert from 'node:assert/strict';
import { mustNotReject } from 'xxscreeps/utility/async.js';
import { acquireInterval, acquireTimeout } from 'xxscreeps/utility/utility.js';
import { Channel } from './channel.js';

type MutexChannel = Channel<'waiting' | 'unlocked'>;
const mutexChannel =
	(pubsub: PubSubProvider, name: string): MutexChannel => new Channel(pubsub, `mutex/channel/${name}`, false);
const kLockTimeout = 10_000;

export class Mutex {
	private internalLock = false;
	private lockedOrPending = false;
	private yieldPromise: Promise<void> | undefined;
	private waitingListener: Effect | undefined;
	private readonly channel;
	private readonly lockable;

	constructor(channel: SubscriptionFor<MutexChannel>, lockable: Lock) {
		this.channel = channel;
		this.lockable = lockable;
	}

	static async connect(name: string, keyval: KeyValProvider, pubsub: PubSubProvider) {
		const channel = await mutexChannel(pubsub, name).subscribe();
		const lock = new Lock(keyval, `mutex/${name}`);
		return new Mutex(channel, lock);
	}

	async [Symbol.asyncDispose]() {
		if (this.lockedOrPending) {
			throw new Error('Can\'t disconnect while mutex locked');
		} else if (this.internalLock) {
			await this.yieldLock();
		}
		this.waitingListener?.();
		this.channel.disconnect();
	}

	async acquire() {
		await this.lock();
		const unlock = () => this.unlock();
		return { [Symbol.asyncDispose]: unlock };
	}

	async lock() {
		if (this.lockedOrPending) {
			throw new Error('Already locked');
		}
		this.lockedOrPending = true;

		// If the listener is still attached it means no one else wanted the lock
		if (this.waitingListener) {
			return;
		}

		// If we're yielding send message that we want the lock back
		if (this.yieldPromise) {
			await this.channel.publish('waiting');
			await this.yieldPromise;
		}

		// Listen for peers who want the lock
		this.waitingListener = (() => {
			const waitingListener = this.channel.listen(message => {
				if (message === 'waiting') {
					this.waitingListener = undefined;
					waitingListener();
					if (!this.lockedOrPending) {
						// If a peer is waiting while this is soft locked then yield next time we try to lock
						this.yieldLock().catch(console.error);
					}
				}
			});
			return waitingListener;
		})();
		if (await this.lockable.lock()) {
			// Lock with no contention
			this.internalLock = true;
			return;
		}

		// Must wait for lock
		const lockDefer: PromiseWithResolvers<void> = Promise.withResolvers();
		const tryLock = () => {
			mustNotReject(async () => {
				try {
					const locked = await this.lockable.lock();
					if (locked) {
						this.internalLock = true;
						lockDefer.resolve();
					} else {
						await this.channel.publish('waiting');
					}
				} catch (error) {
					lockDefer.reject(error);
				}
			});
		};

		// Listen for unlock messages and try to lock again
		using disposable = new DisposableStack();
		disposable.defer(this.channel.listen(message => {
			if (message === 'unlocked') {
				tryLock();
			}
		}));

		// Also keep trying in case the peer gave up
		disposable.use(acquireInterval(500, tryLock));

		// Wait on the lock
		tryLock();
		await lockDefer.promise;
	}

	async unlock() {
		if (this.lockedOrPending) {
			this.lockedOrPending = false;
			if (!this.waitingListener) {
				// If there's a peer waiting for the lock then give them a chance to get it
				await this.yieldLock();
			}
		} else {
			throw new Error('Not locked');
		}
	}

	private async yieldLock() {
		assert.equal(this.yieldPromise, undefined);
		this.yieldPromise = (async () => {
			using disposable = new DisposableStack();
			const timer = new Promise<void>(resolve => {
				disposable.use(acquireTimeout(500, resolve));
			});
			const unlocked = new Promise<void>(resolve => {
				disposable.defer(this.channel.listen(message => {
					if (message === 'unlocked') {
						resolve();
					}
				}));
			});
			await Promise.race([ timer, unlocked ]);
			this.yieldPromise = undefined;
		})();
		this.internalLock = false;
		await this.lockable.unlock();
		await this.channel.publish('unlocked');
	}
}

class Lock {
	private interval: ReturnType<typeof setInterval> | undefined;
	private readonly value = `${Math.random() * (Number.MAX_SAFE_INTEGER + 1)}`;
	private readonly keyval;
	private readonly name;

	constructor(keyval: KeyValProvider, name: string) {
		this.keyval = keyval;
		this.name = name;
	}

	async lock() {
		if (await this.keyval.set(this.name, this.value, { px: kLockTimeout, if: { if: 'NX' } }) === undefined) {
			this.interval = setInterval(() => mustNotReject(async () => {
				if (await this.keyval.set(this.name, this.value, { px: kLockTimeout, if: { if: 'EQ', value: this.value } }) !== undefined) {
					throw new Error('Lock expired unexpectedly');
				}
			}), kLockTimeout / 2);
			return true;
		} else {
			const ttl = await this.keyval.pTTL(this.name);
			if (ttl > 0) {
				console.warn(`Lock contention '${this.name}' -> ${ttl}ms`);
			}
			return false;
		}
	}

	async unlock() {
		clearInterval(this.interval);
		this.interval = undefined;
		if (!await this.keyval.delEx(this.name, { eq: this.value })) {
			throw new Error('Lock not owned');
		}
	}
}
