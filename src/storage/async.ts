import type { KeyValProvider } from './provider';

export async function *consumeSet(keyval: KeyValProvider, key: string) {
	let value: string | null;
	while ((value = await keyval.spop(key)) !== null) {
		yield value;
	}
}

export async function *consumeSortedSet(keyval: KeyValProvider, key: string, min = -Infinity, max = Infinity) {
	let values = await keyval.zrange(key, min, max, 'byScore');
	while (values.length) {
		for (const value of values) {
			const count = await keyval.zrem(key, [ value ]);
			if (count === 1) {
				yield value;
				break;
			}
		}
		values = await keyval.zrange(key, min, max, 'byScore');
	}
}
