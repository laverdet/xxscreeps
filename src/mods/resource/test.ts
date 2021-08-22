import * as C from 'xxscreeps/game/constants';
import { OpenStore } from './store';
import { assert, describe, test } from 'xxscreeps/test';

describe('Open store', () => {
	const store = OpenStore['#create'](100);

	test('empty', () => {
		assert.deepEqual(
			[ ...Object.entries(store) ],
			[ [ C.RESOURCE_ENERGY, 0 ] ]);
		assert.strictEqual(store.getFreeCapacity(), 100);
		assert.strictEqual(store.getUsedCapacity(), 0);
		assert.strictEqual(store.getUsedCapacity(C.RESOURCE_ENERGY), 0);
		assert.strictEqual(store.getUsedCapacity(C.RESOURCE_CATALYST), 0);
		assert.strictEqual(store[C.RESOURCE_ENERGY], 0);
		assert.strictEqual(store[C.RESOURCE_CATALYST], undefined);
	});

	test('add', () => {
		store['#add'](C.RESOURCE_ENERGY, 10);
		store['#add'](C.RESOURCE_CATALYST, 10);
		assert.deepEqual(
			[ ...Object.entries(store) ],
			[ [ C.RESOURCE_ENERGY, 10 ], [ C.RESOURCE_CATALYST, 10 ] ]);
		assert.strictEqual(store.getFreeCapacity(), 80);
		assert.strictEqual(store.getUsedCapacity(), 20);
		assert.strictEqual(store.getUsedCapacity(C.RESOURCE_ENERGY), 10);
		assert.strictEqual(store.getUsedCapacity(C.RESOURCE_CATALYST), 10);
		assert.strictEqual(store[C.RESOURCE_ENERGY], 10);
		assert.strictEqual(store[C.RESOURCE_CATALYST], 10);
	});

	test('reset', () => {
		store['#subtract'](C.RESOURCE_ENERGY, 10);
		store['#subtract'](C.RESOURCE_CATALYST, 10);
		assert.deepEqual(
			[ ...Object.entries(store) ],
			[ [ C.RESOURCE_ENERGY, 0 ] ]);
		assert.strictEqual(store.getFreeCapacity(), 100);
		assert.strictEqual(store.getUsedCapacity(), 0);
		assert.strictEqual(store.getUsedCapacity(C.RESOURCE_ENERGY), 0);
		assert.strictEqual(store.getUsedCapacity(C.RESOURCE_CATALYST), 0);
		assert.strictEqual(store[C.RESOURCE_ENERGY], 0);
		assert.strictEqual(store[C.RESOURCE_CATALYST], undefined);
	});
});
