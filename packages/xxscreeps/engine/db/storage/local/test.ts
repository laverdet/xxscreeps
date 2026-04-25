import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as Path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { BlobStorage } from './blob.js';
import { LocalKeyValResponder } from './keyval.js';

type SaveSpy = { performSave: () => Promise<void> };

async function withTempDir<Type>(body: (dir: string) => Promise<Type>): Promise<Type> {
	const dir = await fs.mkdtemp(Path.join(os.tmpdir(), 'xxscreeps-savechain-'));
	try {
		return await body(dir);
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
}

describe('Local storage save() serialization', () => {

	test('blob save() serializes overlapping invocations', () => withTempDir(async dir => {
		const url = pathToFileURL(`${dir}/`);
		const [ effect, blob ] = await BlobStorage.create(url);
		try {
			const order: string[] = [];
			const spy = blob as unknown as SaveSpy;
			const original = spy.performSave.bind(blob);
			let counter = 0;
			spy.performSave = async function() {
				const id = ++counter;
				order.push(`enter-${id}`);
				try {
					await original();
				} finally {
					order.push(`exit-${id}`);
				}
			};

			blob.set('a', new Uint8Array([ 1 ]));
			const first = blob.save();
			blob.set('b', new Uint8Array([ 2 ]));
			const second = blob.save();
			await Promise.all([ first, second ]);

			assert.deepStrictEqual(order, [ 'enter-1', 'exit-1', 'enter-2', 'exit-2' ]);
		} finally {
			effect();
		}
	}));

	test('blob save() persists last write for overlapping keys', () => withTempDir(async dir => {
		const url = pathToFileURL(`${dir}/`);
		const [ effect, blob ] = await BlobStorage.create(url);
		try {
			blob.set('k', new Uint8Array([ 1, 2, 3 ]));
			const first = blob.save();
			blob.set('k', new Uint8Array([ 4, 5, 6 ]));
			const second = blob.save();
			await Promise.all([ first, second ]);

			const persisted = await fs.readFile(Path.join(dir, 'k'));
			assert.deepStrictEqual([ ...persisted ], [ 4, 5, 6 ]);
		} finally {
			effect();
		}
	}));

	test('keyval save() serializes overlapping invocations', () => withTempDir(async dir => {
		const url = new URL(`${pathToFileURL(dir)}/`);
		const [ effect, host ] = await LocalKeyValResponder.create(url);
		try {
			const order: string[] = [];
			const spy = host as unknown as SaveSpy;
			const original = spy.performSave.bind(host);
			let counter = 0;
			spy.performSave = async function() {
				const id = ++counter;
				order.push(`enter-${id}`);
				try {
					await original();
				} finally {
					order.push(`exit-${id}`);
				}
			};

			host.set('a', '1');
			const first = host.save();
			host.set('b', '2');
			const second = host.save();
			await Promise.all([ first, second ]);

			assert.deepStrictEqual(order, [ 'enter-1', 'exit-1', 'enter-2', 'exit-2' ]);
		} finally {
			effect();
		}
	}));

	test('keyval save() persists last write for overlapping keys', () => withTempDir(async dir => {
		const url = new URL(`${pathToFileURL(dir)}/`);
		const [ effect, host ] = await LocalKeyValResponder.create(url);
		try {
			host.set('k', 'first');
			const first = host.save();
			host.set('k', 'second');
			const second = host.save();
			await Promise.all([ first, second ]);

			const payload = JSON.parse(await fs.readFile(Path.join(dir, 'data.json'), 'utf8')) as { $: Record<string, string> };
			assert.strictEqual(payload.$.k, 'second');
		} finally {
			effect();
		}
	}));
});
