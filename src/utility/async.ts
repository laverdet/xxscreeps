import type { AsyncEffectAndResult, Effect } from './types';
import Fn from './functional';

// Given a series of effect-returning promises this waits for them all to resolve and returns a
// single effect that owns all the underlying effects. In the case that one throws the successful
// effects are destroyed.
export function acquire<Type extends AsyncEffectAndResult[]>(...async: [ ...Type ]): Promise<[ Effect, {
	[Key in keyof Type]: Type[Key] extends AsyncEffectAndResult<infer Result> ? Result : never;
} ]>;
export function acquire(...async: AsyncEffectAndResult[]): Promise<[ Effect, any ]> {
	// Not implemented as an async function to keep original stack traces
	return new Promise((resolve, reject) => {
		void Promise.allSettled(async).then(settled => {
			let effect: Effect = () => {};
			const results = [];
			let rejected = false;
			for (const result of settled) {
				if (result.status === 'fulfilled') {
					const { value } = result;
					if (Array.isArray(value)) {
						// Returned `[ effect, result ]`
						const nextEffect = value[0];
						if (nextEffect) {
							const prevEffect = effect;
							effect = () => { prevEffect(); nextEffect() };
						}
						results.push(value[1]);
					} else {
						// Returned `effect`
						if (value) {
							const prevEffect = effect;
							effect = () => { prevEffect(); (value as Effect)() };
						}
						results.push(undefined);
					}
				} else if (!rejected) {
					// Reject with first error found
					rejected = true;
					reject(result.reason);
				}
			}
			if (rejected) {
				effect();
			} else {
				resolve([ effect, results as never ]);
			}
		});
	});
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
	const delegate = async function *() {
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
			generator.return?.();
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
 * Concatenates the supplied async generators sequentially.
 */
export async function *concat<Type>(...generators: AsyncIterable<Type>[]) {
	for (const generator of generators) {
		for await (const value of generator) {
			yield value;
		}
	}
}

/**
 * Returns an iterator which proxies the given generator, requesting up to `count` elements in
 * advance. If you break ouf of this loop there will be abandoned values!
 */
export function lookAhead<Type>(iterable: AsyncIterable<Type>, count: number) {
	if (count <= 0) {
		return iterable;
	}
	return async function *() {
		const generator = iterable[Symbol.asyncIterator]();
		try {
			const push = (result: IteratorResult<Type>) => {
				if (!result.done && queue.length <= count) {
					const next = generator.next();
					void next.then(push);
					queue.push(next);
				}
			};
			const first = generator.next();
			void first.then(push);
			const queue = [ first ];
			while (true) {
				const next = await queue[0];
				if (next.done) {
					return;
				}
				void queue.shift();
				push(next);
				yield next.value;
			}
		} finally {
			generator.return?.();
		}
	}();
}

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
				await Promise.all(Fn.map(pending, deferred => deferred.promise));
				return;
			}
			pending.push(new Deferred);
			if (pending.length > concurrency) {
				await pending[0].promise;
				pending[0] = pending[offset--];
				pending[offset] = pending[pending.length - 1];
				pending.pop();
			}
			Promise.resolve(fn(next.value)).then(
				() => pending[offset++].resolve(),
				err => pending[offset++].reject(err));
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
			Fn.forEach(listeners, listener => listener(...payload));
		},
	};
}

// Attaches a listener to an EventEmitter and returns a lambda which removes the listener
export function listen<
	Message extends string,
	Listener extends (...params: any[]) => void,
	Type extends {
		on: (message: Message, listener: Listener) => void;
		removeListener: (message: Message, listener: Listener) => void;
	},
>(emitter: Type, message: Message, listener: Listener): Effect {
	emitter.on(message, listener);
	return () => emitter.removeListener(message, listener);
}

// Exits immediately if a promise rejects
export function mustNotReject(task: (() => Promise<any>) | Promise<any>) {
	(typeof task === 'function' ? task() : task).catch(error => {
		console.error(error);
		process.exit();
	});
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
