import { hashMix } from 'xxscreeps/utility/utility.js';

export class DeterministicClockForTesting {
	readonly #now = Date.now;
	#ts: number;

	constructor({ start, step = 1 }: { start?: number; step?: number } = {}) {
		this.#ts = start ?? this.#now();
		Date.now = () => {
			const value = this.#ts;
			this.#ts += step;
			return value;
		};
	}

	[Symbol.dispose]() {
		Date.now = this.#now;
	}

	increment(offset: number) {
		this.#ts += offset;
	}

	set(value: number) {
		this.#ts = value;
	}
}

export function deterministicRandomForTesting(seed = 1) {
	const disposable = new DisposableStack();
	const { random } = Math;
	disposable.defer(() => Math.random = random);
	let state = hashMix(seed);
	Math.random = () => (state = hashMix(state)) / 0xffffffff + 0.5;
	return disposable;
}
