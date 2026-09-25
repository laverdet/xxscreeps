import type { Database } from 'xxscreeps/engine/db/index.js';
import type { GameConstructor } from 'xxscreeps/game/index.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { lookForStructures } from 'xxscreeps/mods/classic/structure/structure.js';
import * as Model from 'xxscreeps/mods/mmo/powercreep/model.js';
import { createPowerCreep, powerDuration, powerOpsCost } from 'xxscreeps/mods/mmo/powercreep/powercreep.js';
import { create as createFactory } from 'xxscreeps/mods/modern/factory/factory.js';
import { create as createPowerSpawn } from 'xxscreeps/mods/modern/powerspawn/powerspawn.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import * as C from 'xxscreeps:mods/constants';

const owner = '100';
const operateInfo = C.POWER_INFO[C.PWR_OPERATE_FACTORY]!;
const operateOps = powerOpsCost(operateInfo, 1);

describe('mods/mmo/operator', () => {
	const createAliceWith = async (db: Database, powers: Record<string, number>) => {
		await db.data.hSet(User.infoKey(owner), 'power', '16000');
		await Model.create(db, owner, 'Alice', C.POWER_CLASS.OPERATOR);
		const [ created ] = await Model.loadRoster(db, owner);
		assert.strictEqual(await Model.upgrade(db, owner, created!.id, powers), C.OK);
		return created!.id;
	};

	const spawnAlice = (Game: GameConstructor, id: string) => {
		const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
		assert.strictEqual(createPowerCreep(id, 'Alice', C.POWER_CLASS.OPERATOR, owner).spawn(powerSpawn), C.OK);
	};

	// A factory two tiles from the power spawn, well inside `PWR_OPERATE_FACTORY`'s range of 3.
	const factorySim = simulate({
		W1N1: room => {
			room['#insertObject'](createPowerSpawn(new RoomPosition(25, 25, 'W1N1'), owner));
			room['#insertObject'](createFactory(new RoomPosition(27, 25, 'W1N1'), owner));
			room['#level'] = 8;
			room['#user'] = room.controller!['#user'] = owner;
			room.controller!.isPowerEnabled = true;
		},
	});

	const getFactory = (room: Room | undefined) => lookForStructures(room, C.STRUCTURE_FACTORY)[0]!;

	// Exactly one use worth of ops, so any charge to Alice shows up as an empty store.
	const giveOps = (room: Room) => {
		room['#lookFor'](C.LOOK_POWER_CREEPS)[0]!.store['#add'](C.RESOURCE_OPS, operateOps);
	};

	test('OPERATE_FACTORY stamps the level and applies the effect', () => factorySim(async ({ peekRoom, player, poke, tick, shard }) => {
		const id = await createAliceWith(shard.db, { [C.PWR_OPERATE_FACTORY]: 1 });
		await player(owner, Game => spawnAlice(Game, id));
		await tick();
		await poke('W1N1', owner, (Game, room) => giveOps(room));
		await tick();
		await player(owner, Game => {
			const factory = getFactory(Game.rooms.W1N1);
			assert.strictEqual(factory.level, undefined);
			assert.strictEqual(Game.powerCreeps.Alice?.usePower(C.PWR_OPERATE_FACTORY, factory), C.OK);
		});
		await tick();
		await player(owner, Game => {
			const alice = Game.powerCreeps.Alice!;
			const factory = getFactory(Game.rooms.W1N1);
			assert.strictEqual(factory.level, 1);
			assert.deepStrictEqual(factory.effects, [ {
				effect: C.PWR_OPERATE_FACTORY,
				power: C.PWR_OPERATE_FACTORY,
				level: 1,
				ticksRemaining: powerDuration(operateInfo, 1) - 1,
			} ]);
			assert.strictEqual(alice.store[C.RESOURCE_OPS], 0);
			assert.deepStrictEqual({ ...alice.powers }, {
				[C.PWR_OPERATE_FACTORY]: { cooldown: operateInfo.cooldown, level: 1 },
			});
		});
		await peekRoom('W1N1', room => {
			const event = room.getEventLog().find(event => event.event === C.EVENT_POWER);
			assert.strictEqual(event?.objectId, id);
			assert.strictEqual(event.data?.power, C.PWR_OPERATE_FACTORY);
		});
	}));

	test('a level mismatch costs nothing', () => factorySim(async ({ peekRoom, player, poke, tick, shard }) => {
		const id = await createAliceWith(shard.db, { [C.PWR_OPERATE_FACTORY]: 1 });
		await player(owner, Game => spawnAlice(Game, id));
		await tick();
		// A factory's level is permanent, so a rank-1 operator can never work this one.
		await poke('W1N1', owner, (Game, room) => {
			giveOps(room);
			getFactory(room)['#level'] = 2;
		});
		await tick();
		await player(owner, Game => {
			const factory = getFactory(Game.rooms.W1N1);
			assert.strictEqual(Game.powerCreeps.Alice?.usePower(C.PWR_OPERATE_FACTORY, factory), C.OK);
		});
		await tick();
		await player(owner, Game => {
			const alice = Game.powerCreeps.Alice!;
			const factory = getFactory(Game.rooms.W1N1);
			assert.strictEqual(factory.level, 2);
			assert.strictEqual(factory.effects, undefined);
			assert.strictEqual(alice.store[C.RESOURCE_OPS], operateOps);
			assert.deepStrictEqual({ ...alice.powers }, {
				[C.PWR_OPERATE_FACTORY]: { cooldown: 0, level: 1 },
			});
		});
		await peekRoom('W1N1', room => {
			assert.strictEqual(room.getEventLog().some(event => event.event === C.EVENT_POWER), false);
		});
	}));

	test('a non-factory target costs nothing', () => factorySim(async ({ player, poke, tick, shard }) => {
		const id = await createAliceWith(shard.db, { [C.PWR_OPERATE_FACTORY]: 1 });
		await player(owner, Game => spawnAlice(Game, id));
		await tick();
		await poke('W1N1', owner, (Game, room) => giveOps(room));
		await tick();
		await player(owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			assert.strictEqual(Game.powerCreeps.Alice?.usePower(C.PWR_OPERATE_FACTORY, powerSpawn), C.OK);
		});
		await tick();
		await player(owner, Game => {
			const alice = Game.powerCreeps.Alice!;
			assert.strictEqual(alice.store[C.RESOURCE_OPS], operateOps);
			assert.deepStrictEqual({ ...alice.powers }, {
				[C.PWR_OPERATE_FACTORY]: { cooldown: 0, level: 1 },
			});
		});
	}));
});
