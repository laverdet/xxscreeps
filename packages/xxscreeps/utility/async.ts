import type { Effect } from './types.js';
import { Fn } from 'xxscreeps/functional/fn.js';

/**
 * Given a series of promises this waits for them all to resolve and invokes `acquire` on each one
 * that resolved as completed.
 */
export async function acquireWith<
	Type extends PromiseLike<unknown>[],
>(
	acquire: (fn: Awaited<Type[number]>) => void,
	...async: Type
): Promise<{
	[Key in keyof Type]: Awaited<Type[Key]>
}>;

export async function acquireWith(acquire: (fn: unknown) => void, ...async: PromiseLike<unknown>[]) {
	const settled = await Promise.allSettled(async);
	for (const result of settled) {
		if (result.status === 'fulfilled') {
			acquire(result.value);
		}
	}
	if (settled.every(result => result.status === 'fulfilled')) {
		return settled.map(result => result.value);
	} else {
		const threw = settled.filter(result => result.status === 'rejected');
		if (threw.length === 1) {
			throw threw[0]!.reason;
		} else {
			throw new AggregateError(threw);
		}
	}
}

/**
 * Returns a delegate generator which can be broken externally. This will cause the generator to
 * discard a result.
 */
export function breakable<Type>(iterable: AsyncIterable<Type>): [ Effect, AsyncIterable<Type> ];
export function breakable<Type>(iterable: AsyncIterable<Type>, fn: (breaker: Effect) => void): AsyncIterable<Type>;
export function breakable<Type>(iterable: AsyncIterable<Type>, fn?: (breaker: Effect) => void):
AsyncIterable<Type> | [ Effect, AsyncIterable<Type> ] {
	// Set up breaker
	type Value = IteratorResult<Type> | typeof breakToken;
	let broken = false as boolean;
	let resolveNow: ((value: Value) => void) | undefined;
	const breaker = () => {
		broken = true;
		resolveNow?.(breakToken);
	};
	// Create delegate iterable
	const delegate = async function*() {
		const generator = iterable[Symbol.asyncIterator]();
		try {
			while (true) {
				const next = await new Promise<Value>((resolve, reject) => {
					// Care needs to be taken here to avoid adding `then` handlers onto the break case, because
					// otherwise they will build up with each iteration.
					resolveNow = resolve;
					generator.next().then(resolve, reject);
				});
				if (next === breakToken || next.done) {
					return;
				}
				yield next.value;
				if (broken) {
					return;
				}
			}
		} finally {
			void generator.return?.();
		}
	}();
	// Return overloaded result
	if (fn) {
		fn(breaker);
		return delegate;
	} else {
		return [ breaker, delegate ];
	}
}

const breakToken: Record<any, never> = {};

/**
 * Maps over the iterable with up to `concurrency` parallel tasks.
 */
export async function spread<Type>(
	concurrency: number,
	iterable: Iterable<Type> | AsyncIterable<Type>,
	fn: (value: Type) => void | Promise<void>,
) {
	if (!(concurrency >= 1)) {
		throw new Error('Invalid concurrency');
	}
	const iterator =
		(iterable as Iterable<Type> | Record<keyof Iterable<Type>, undefined>)[Symbol.iterator]?.() ??
		(iterable as AsyncIterable<Type>)[Symbol.asyncIterator]();

	try {
		let offset = 0;
		const pending: Deferred[] = [];
		while (true) {
			const next = await iterator.next();
			if (next.done) {
				await Fn.mapAwait(pending, ({ promise }) => promise);
				return;
			}
			pending.push(new Deferred());
			if (pending.length > concurrency) {
				await pending[0]!.promise;
				pending[0] = pending[offset--]!;
				pending[offset] = pending.at(-1)!;
				pending.pop();
			}
			Promise.resolve(fn(next.value)).then(
				() => pending[offset++]!.resolve(),
				err => pending[offset++]!.reject(err));
		}
	} finally {
		iterator.return?.();
	}
}

/**
 * Returns a general purpose event listener. `onDrain` is called any time there are 0 listeners.
 */
export function makeEventPublisher<Message extends any[]>(onDrain = () => {}) {
	type Listener = (...payload: Message) => void;
	const listeners = new Set<Listener>();
	return {
		listen: (fn: Listener): Effect => {
			// Add new listener
			const { size } = listeners;
			listeners.add(fn);
			if (listeners.size === size) {
				throw new Error('Listener already exists');
			}
			// Unlisten effect
			return () => {
				const { size } = listeners;
				listeners.delete(fn);
				if (listeners.size === size) {
					throw new Error('Listener already removed');
				} else if (listeners.size === 0) {
					onDrain();
				}
			};
		},

		publish: (...payload: Message) => {
			for (const listener of listeners) {
				listener(...payload);
			}
		},
	};
}

interface WithEventEmitter<Message extends string, Listener extends (...params: any[]) => void> {
	addListener: (message: Message, listener: Listener) => void;
	removeListener: (message: Message, listener: Listener) => void;
}

// Attaches a listener to an EventEmitter and returns a lambda which removes the listener
export function listen<
	Message extends string,
	Listener extends (...params: any[]) => void,
	Type extends WithEventEmitter<Message, Listener>,
>(emitter: Type, message: Message, listener: Listener): Effect {
	emitter.addListener(message, listener);
	return () => emitter.removeListener(message, listener);
}

interface WithListenEvent<Message extends string, Listener extends (...params: any[]) => void> {
	addEventListener: (message: Message, listener: Listener) => void;
	removeEventListener: (message: Message, listener: Listener) => void;
}

// Attaches a listener to an EventEmitter and returns a lambda which removes the listener
export function listenEvent<
	Message extends string,
	Listener extends (...params: any[]) => void,
	Type extends WithListenEvent<Message, Listener>,
>(emitter: Type, message: Message, listener: Listener): Effect {
	emitter.addEventListener(message, listener);
	return () => emitter.removeEventListener(message, listener);
}

// Exits immediately if a promise rejects
export function mustNotReject(task: (() => PromiseLike<any>) | PromiseLike<any> | undefined) {
	if (task) {
		void (async function() {
			try {
				await (typeof task === 'function' ? task() : task);
			} catch (error) {
				console.error(error);
				process.exit();
			}
		})();
	}
}

// For when a plain promise is just too unwieldy
export class Deferred<Type = void> {
	promise: Promise<Type>;
	resolve!: (payload: Type) => void;
	reject!: (error: Error) => void;
	constructor() {
		this.promise = new Promise<Type>((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}
}
