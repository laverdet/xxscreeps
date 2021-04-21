import { Effect, MaybePromise } from './types';

// Given a series of effect-returning promises this waits for them all to resolve and returns a
// single effect that owns all the underlying effects. In the case that one throws the successful
// effects are destroyed.
type Acquired<Type> = MaybePromise<ResolvedAcquired<Type>> | undefined;
type ResolvedAcquired<Type> = void | Effect | readonly [ Effect | void, Type ];
export function acquire<Type extends Acquired<any>[]>(...async: [ ...Type ]): Promise<[ Effect, {
	[Key in keyof Type]: Type[Key] extends Acquired<infer Result> ? Result : never;
} ]>;
export function acquire(...async: Acquired<any>[]): Promise<[ Effect, any ]> {
	// Not implemented as an async function to keep original stack traces
	return new Promise((resolve, reject) => {
		void Promise.allSettled(async).then(settled => {
			const effects: Effect[] = [];
			const results = [];
			let rejected = false;
			for (const result of settled) {
				if (result.status === 'fulfilled') {
					const { value } = result;
					if (Array.isArray(value)) {
						// Returned `[ effect, result ]`
						const effect = value[0];
						if (effect) {
							effects.push(effect);
						}
						results.push(value[1]);
					} else {
						// Returned `effect`
						if (value) {
							effects.push(value as never);
						}
						results.push(undefined);
					}
				} else if (!rejected) {
					// Reject with first error found
					rejected = true;
					reject(result.reason);
				}
			}
			const effect = () => effects.forEach(effect => effect());
			if (rejected) {
				effect();
			} else {
				resolve([ effect, results as never ]);
			}
		});
	});
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
export function mustNotReject(task: () => Promise<void> | Promise<void>) {
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
