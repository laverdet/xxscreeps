import type { Store } from './store.js';
import C from 'xxscreeps/game/constants/index.js';
import { OpenStore, RestrictedStore, SingleStore, openStoreFormat, restrictedStoreFormat, singleStoreFormat } from './store.js';
import { assert, describe, reconstructor, test } from 'xxscreeps/test/index.js';

const keys = (object: {}) => [ ...function *() {
	for (const key in object) {
		yield key;
	}
}() ];

describe('Store', () => {
	const types: [ string, any, () => Store][] = [
		[ 'Open store', openStoreFormat, () => OpenStore['#create'](100) ],
		[ 'Restricted store', restrictedStoreFormat, () => RestrictedStore['#create']({ [C.RESOURCE_ENERGY]: 100 }) ],
		[ 'Single store', singleStoreFormat, () => SingleStore['#create'](C.RESOURCE_ENERGY, 100) ],
	];

	for (const [ label, format, create ] of types) {
		describe(`Common: ${label}`, () => {
			const reconstruct = reconstructor(format);
			test('resources are 0', () => {
				const store = create();
				C.RESOURCES_ALL.forEach(type => assert.strictEqual(store[type], 0));
			});

			test('empty resources are non-enumerable', () => {
				const store = create();
				assert.deepStrictEqual(keys(store), []);
			});

			test('enumerable resources', () => {
				const store = create();
				store['#add'](C.RESOURCE_ENERGY, 10);
				assert.deepStrictEqual(keys(store), [ C.RESOURCE_ENERGY ]);
				assert.deepStrictEqual(keys(reconstruct(store)), [ C.RESOURCE_ENERGY ]);
				store['#subtract'](C.RESOURCE_ENERGY, 10);
				assert.deepStrictEqual(keys(store), []);
				assert.deepStrictEqual(keys(reconstruct(store)), []);
			});

			test('used capacity', () => {
				const store = create();
				assert.strictEqual(store.getUsedCapacity(C.RESOURCE_ENERGY), 0);
				store['#add'](C.RESOURCE_ENERGY, 10);
				assert.strictEqual(store.getUsedCapacity(C.RESOURCE_ENERGY), 10);
				assert.strictEqual(reconstruct(store).getUsedCapacity(C.RESOURCE_ENERGY), 10);
				store['#subtract'](C.RESOURCE_ENERGY, 10);
				assert.strictEqual(store.getUsedCapacity(C.RESOURCE_ENERGY), 0);
				assert.strictEqual(reconstruct(store).getUsedCapacity(C.RESOURCE_ENERGY), 0);
			});
		});

		test('Open store', () => {
			const store = OpenStore['#create'](100);
			assert.strictEqual(store.getCapacity(), 100);
			assert.strictEqual(store.getCapacity(C.RESOURCE_ENERGY), 100);
			assert.strictEqual(store.getCapacity(C.RESOURCE_POWER), 100);
			assert.strictEqual(store.getUsedCapacity(), 0);
			store['#add'](C.RESOURCE_ENERGY, 10);
			assert.strictEqual(store.getUsedCapacity(), 10);
			store['#subtract'](C.RESOURCE_ENERGY, 10);
			assert.strictEqual(store.getUsedCapacity(), 0);
		});

		test('Restricted store', () => {
			const store = RestrictedStore['#create']({ [C.RESOURCE_ENERGY]: 100 });
			assert.strictEqual(store.getCapacity(), null);
			assert.strictEqual(store.getCapacity(C.RESOURCE_ENERGY), 100);
			assert.strictEqual(store.getCapacity(C.RESOURCE_POWER), null);
			assert.strictEqual(store.getUsedCapacity(), null);
		});

		test('Single store', () => {
			const store = SingleStore['#create'](C.RESOURCE_ENERGY, 100);
			assert.strictEqual(store.getCapacity(), null);
			assert.strictEqual(store.getCapacity(C.RESOURCE_ENERGY), 100);
			assert.strictEqual(store.getCapacity(C.RESOURCE_POWER), null);
			assert.strictEqual(store.getUsedCapacity(), null);
		});
	}
});
