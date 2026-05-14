import { hooks } from 'xxscreeps/game/index.js';
import { Tombstone } from 'xxscreeps/mods/creep/tombstone.js';
import { Deposit } from 'xxscreeps/mods/deposit/deposit.js';
import { StructureFactory } from 'xxscreeps/mods/factory/factory.js';
import { StructureObserver } from 'xxscreeps/mods/observer/observer.js';
import { Ruin } from 'xxscreeps/mods/structure/ruin.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { RoomPosition } from './position.js';

type Ctor = abstract new(...args: never[]) => object;

// Replay driver/runtime/index.ts: last-registered runtimeConnector hook runs last.
for (const hook of [ ...hooks.map('runtimeConnector') ].reverse()) {
	hook.initialize?.({} as never);
}

const globalRegistry = globalThis as unknown as Record<string, Ctor | undefined>;

describe('RoomPosition', () => {
	test('__packedPos setter round-trips through the getter', () => {
		const cases: [number, number, string][] = [
			[ 0, 0, 'W0N0' ],
			[ 25, 25, 'W1N1' ],
			[ 49, 49, 'E5S5' ],
			[ 13, 7, 'E0S0' ],
		];
		for (const [ xx, yy, roomName ] of cases) {
			const original = new RoomPosition(xx, yy, roomName);
			const target = new RoomPosition(0, 0, 'W0N0');
			target.__packedPos = original.__packedPos;
			assert.strictEqual(target.x, original.x);
			assert.strictEqual(target.y, original.y);
			assert.strictEqual(target.roomName, original.roomName);
			assert.strictEqual(target.__packedPos, original.__packedPos);
		}
	});
});

// TODO: drop once stub-shadowing of mod class registrations is no longer plausible.
describe('Runtime class globals', () => {
	const registered: { name: string; cls: Ctor }[] = [
		{ name: 'Tombstone', cls: Tombstone },
		{ name: 'Deposit', cls: Deposit },
		{ name: 'Ruin', cls: Ruin },
		{ name: 'StructureFactory', cls: StructureFactory },
		{ name: 'StructureObserver', cls: StructureObserver },
	];

	for (const { name, cls } of registered) {
		test(`${name}: globalThis.${name} is the imported class`, () => {
			assert.strictEqual(globalRegistry[name], cls,
				`globalThis.${name} should reference the canonical class, not a stub`);
		});

		test(`${name}: instance prototype tracks globalThis.${name}`, () => {
			const proto = cls.prototype as object;
			const instance = Object.create(proto) as { constructor?: unknown };
			assert.strictEqual(instance.constructor, globalRegistry[name]);
			assert.ok(instance instanceof globalRegistry[name]!);
		});

		test(`${name}: prototype patches via globalThis are visible on instances`, () => {
			const probe = '__probeRuntimeClassGlobals';
			const proto = globalRegistry[name]!.prototype as Record<string, unknown>;
			proto[probe] = 'ok';
			try {
				const instance = Object.create(proto) as Record<string, unknown>;
				assert.strictEqual(instance[probe], 'ok',
					`patch to globalThis.${name}.prototype.${probe} should reach instances`);
			} finally {
				delete proto[probe];
			}
		});
	}
});
