import type { Store } from './store.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { LabStore } from 'xxscreeps/mods/chemistry/store.js';
import { create as createCreep } from 'xxscreeps/mods/creep/creep.js';
import { assert, describe, reconstructor, simulate, test } from 'xxscreeps/test/index.js';
import { renderStore } from './backend.js';
import { create as createContainer } from './container.js';
import { OpenStore, RestrictedStore, SingleStore, openStoreFormat, restrictedStoreFormat, singleStoreFormat } from './store.js';

const keys = (object: {}) => [ ...function*() {
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

	describe('renderStore', () => {
		test('Open store renders storeCapacity', () => {
			const store = OpenStore['#create'](300);
			const rendered = renderStore(store);
			assert.deepStrictEqual({ ...rendered.store }, {});
			assert.strictEqual(rendered.storeCapacity, 300);
			assert.strictEqual(rendered.storeCapacityResource, undefined);
		});

		test('Single store empty renders capacity', () => {
			const store = SingleStore['#create'](C.RESOURCE_ENERGY, 200);
			const rendered = renderStore(store);
			assert.deepStrictEqual({ ...rendered.store }, {});
			assert.deepStrictEqual({ ...rendered.storeCapacityResource }, { [C.RESOURCE_ENERGY]: 200 });
			assert.strictEqual(rendered.storeCapacity, undefined);
		});

		test('Single store with resources renders capacity', () => {
			const store = SingleStore['#create'](C.RESOURCE_ENERGY, 200, 100);
			const rendered = renderStore(store);
			assert.deepStrictEqual({ ...rendered.store }, { [C.RESOURCE_ENERGY]: 100 });
			assert.deepStrictEqual({ ...rendered.storeCapacityResource }, { [C.RESOURCE_ENERGY]: 200 });
		});

		test('Restricted store empty renders capacity', () => {
			const store = RestrictedStore['#create']({ [C.RESOURCE_ENERGY]: 100, [C.RESOURCE_POWER]: 50 });
			const rendered = renderStore(store);
			assert.deepStrictEqual({ ...rendered.store }, {});
			assert.deepStrictEqual({ ...rendered.storeCapacityResource }, { [C.RESOURCE_ENERGY]: 100, [C.RESOURCE_POWER]: 50 });
			assert.strictEqual(rendered.storeCapacity, undefined);
		});

		test('Restricted store with resources renders capacity', () => {
			const store = RestrictedStore['#create']({ [C.RESOURCE_ENERGY]: 100 });
			store['#add'](C.RESOURCE_ENERGY, 40);
			const rendered = renderStore(store);
			assert.deepStrictEqual({ ...rendered.store }, { [C.RESOURCE_ENERGY]: 40 });
			assert.deepStrictEqual({ ...rendered.storeCapacityResource }, { [C.RESOURCE_ENERGY]: 100 });
		});

		test('Lab store empty renders energy capacity', () => {
			const store = new LabStore();
			const rendered = renderStore(store);
			assert.deepStrictEqual({ ...rendered.store }, {});
			assert.deepStrictEqual({ ...rendered.storeCapacityResource }, { [C.RESOURCE_ENERGY]: C.LAB_ENERGY_CAPACITY });
			assert.strictEqual(rendered.storeCapacity, undefined);
		});

		test('Lab store with mineral renders both capacities', () => {
			const store = new LabStore();
			store['#add'](C.RESOURCE_ENERGY, 500);
			store['#add'](C.RESOURCE_HYDROXIDE, 100);
			const rendered = renderStore(store);
			assert.deepStrictEqual({ ...rendered.store }, { [C.RESOURCE_ENERGY]: 500, [C.RESOURCE_HYDROXIDE]: 100 });
			assert.deepStrictEqual({ ...rendered.storeCapacityResource }, { [C.RESOURCE_ENERGY]: C.LAB_ENERGY_CAPACITY, [C.RESOURCE_HYDROXIDE]: C.LAB_MINERAL_CAPACITY });
		});
	});
});

describe('Container decay', () => {
	const decaySim = simulate({
		W1N1: room => {
			room['#user'] = room.controller!['#user'] = '100';
			// Owned creep keeps the room in the active processing queue so the
			// container's tick processor is invoked.
			room['#insertObject'](createCreep(
				new RoomPosition(0, 0, 'W1N1'),
				[ C.MOVE ], 'witness', '100',
			));
			const container = createContainer(new RoomPosition(25, 25, 'W1N1'));
			container.hits = 1;
			container.store['#add'](C.RESOURCE_ENERGY, 100);
			container['#nextDecayTime'] = 1;
			room['#insertObject'](container);
		},
	});

	test('decayed container spills its store to the ground', () => decaySim(async ({ peekRoom, tick }) => {
		await tick();
		await peekRoom('W1N1', room => {
			const containers = room.find(C.FIND_STRUCTURES)
				.filter(structure => structure.structureType === C.STRUCTURE_CONTAINER);
			assert.strictEqual(containers.length, 0, 'decayed container should be removed');
			const dropped = room.find(C.FIND_DROPPED_RESOURCES)
				.filter(resource => resource.pos.x === 25 && resource.pos.y === 25);
			const energy = dropped.find(resource => resource.resourceType === C.RESOURCE_ENERGY);
			assert.ok(energy, 'expected dropped energy at the decayed container position');
			assert.strictEqual(energy.amount, 100);
		});
	}));

	test('decayed container emits EVENT_OBJECT_DESTROYED with structureType', () => decaySim(async ({ peekRoom, tick }) => {
		await tick();
		await peekRoom('W1N1', room => {
			const log = room.getEventLog();
			const destroyed = log.find(entry => entry.event === C.EVENT_OBJECT_DESTROYED);
			assert.ok(destroyed, 'expected EVENT_OBJECT_DESTROYED on container decay');
			assert.ok(destroyed.data, 'expected nested data payload');
			assert.strictEqual(destroyed.data.type, C.STRUCTURE_CONTAINER);
		});
	}));
});
