import type { Database } from 'xxscreeps/engine/db/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition, getPositionInDirection } from 'xxscreeps/game/position.js';
import { lookForStructures } from 'xxscreeps/mods/classic/structure/structure.js';
import { create as createPowerSpawn } from 'xxscreeps/mods/modern/powerspawn/powerspawn.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import * as Model from './model.js';
import { createPowerCreep, read, write } from './powercreep.js';

const owner = '100';
const hostile = '101';

// GPL level = floor(sqrt(power / 1000)): 1000 -> 1, 4000 -> 2, 9000 -> 3.
const setPower = (db: Database, power: number) => db.data.hSet(User.infoKey(owner), 'power', `${power}`);

describe('mod/powercreep', () => {
	const sim = simulate({});

	test('create is gated by free GPL levels', () => sim(async ({ shard }) => {
		await setPower(shard.db, 1000);
		assert.strictEqual(await Model.create(shard.db, owner, 'Alice', C.POWER_CLASS.OPERATOR), C.OK);
		assert.strictEqual((await Model.loadRoster(shard.db, owner)).length, 1);
		assert.strictEqual(await Model.create(shard.db, owner, 'Bob', C.POWER_CLASS.OPERATOR), C.ERR_NOT_ENOUGH_RESOURCES);
	}));

	test('create with no GPL is rejected', () => sim(async ({ shard }) => {
		await setPower(shard.db, 0);
		assert.strictEqual(await Model.create(shard.db, owner, 'Alice', C.POWER_CLASS.OPERATOR), C.ERR_NOT_ENOUGH_RESOURCES);
	}));

	test('create rejects an invalid class and a duplicate name', () => sim(async ({ shard }) => {
		await setPower(shard.db, 4000);
		assert.strictEqual(await Model.create(shard.db, owner, 'Alice', C.POWER_CLASS.OPERATOR), C.OK);
		assert.strictEqual(await Model.create(shard.db, owner, 'X', 'wizard'), C.ERR_INVALID_ARGS);
		assert.strictEqual(await Model.create(shard.db, owner, 'Alice', C.POWER_CLASS.OPERATOR), C.ERR_NAME_EXISTS);
	}));

	test('upgrade learns a power and raises the level', () => sim(async ({ shard }) => {
		await setPower(shard.db, 4000);
		assert.strictEqual(await Model.create(shard.db, owner, 'Alice', C.POWER_CLASS.OPERATOR), C.OK);
		const creep = (await Model.loadRoster(shard.db, owner))[0]!;
		assert.strictEqual(await Model.upgrade(shard.db, owner, creep.id, { [C.PWR_GENERATE_OPS]: 1 }), C.OK);
		const updated = (await Model.loadRoster(shard.db, owner))[0]!;
		assert.strictEqual(updated.level, 1);
		assert.strictEqual(updated.powers[C.PWR_GENERATE_OPS]!.level, 1);
	}));

	test('upgrade rejects an unreachable rank jump', () => sim(async ({ shard }) => {
		// gpl 3 leaves budget to spare, so the rejection is the reachability rule, not the GPL gate:
		// reaching rank 2 of a power needs a total level >= 2 already allocated.
		await setPower(shard.db, 9000);
		assert.strictEqual(await Model.create(shard.db, owner, 'Alice', C.POWER_CLASS.OPERATOR), C.OK);
		const creep = (await Model.loadRoster(shard.db, owner))[0]!;
		assert.strictEqual(await Model.upgrade(shard.db, owner, creep.id, { [C.PWR_GENERATE_OPS]: 2 }), C.ERR_FULL);
	}));

	test('upgrade rejects when over the free-level budget', () => sim(async ({ shard }) => {
		// gpl 1; the create consumed the only free level, so any upgrade is over budget.
		await setPower(shard.db, 1000);
		assert.strictEqual(await Model.create(shard.db, owner, 'Alice', C.POWER_CLASS.OPERATOR), C.OK);
		const creep = (await Model.loadRoster(shard.db, owner))[0]!;
		assert.strictEqual(await Model.upgrade(shard.db, owner, creep.id, { [C.PWR_GENERATE_OPS]: 1 }), C.ERR_NOT_ENOUGH_RESOURCES);
	}));

	test('rename changes the name and rejects collisions', () => sim(async ({ shard }) => {
		await setPower(shard.db, 4000);
		assert.strictEqual(await Model.create(shard.db, owner, 'Alice', C.POWER_CLASS.OPERATOR), C.OK);
		assert.strictEqual(await Model.create(shard.db, owner, 'Bob', C.POWER_CLASS.OPERATOR), C.OK);
		const alice = (await Model.loadRoster(shard.db, owner)).find(creep => creep.name === 'Alice')!;
		assert.strictEqual(await Model.rename(shard.db, owner, alice.id, 'Alice2'), C.OK);
		const names = (await Model.loadRoster(shard.db, owner)).map(creep => creep.name).sort();
		assert.deepStrictEqual(names, [ 'Alice2', 'Bob' ]);
		assert.strictEqual(await Model.rename(shard.db, owner, alice.id, 'Bob'), C.ERR_NAME_EXISTS);
	}));

	test('delete schedules a cooldown that cancel reverses', () => sim(async ({ shard }) => {
		await setPower(shard.db, 1000);
		assert.strictEqual(await Model.create(shard.db, owner, 'Alice', C.POWER_CLASS.OPERATOR), C.OK);
		const creep = (await Model.loadRoster(shard.db, owner))[0]!;
		assert.strictEqual(await Model.scheduleDelete(shard.db, owner, creep.id), C.OK);
		const pending = (await Model.loadRoster(shard.db, owner))[0]!;
		assert.ok(pending.deleteTime > Date.now());
		// A repeated delete keeps the original timer rather than resetting it.
		assert.strictEqual(await Model.scheduleDelete(shard.db, owner, creep.id), C.OK);
		assert.strictEqual((await Model.loadRoster(shard.db, owner))[0]!.deleteTime, pending.deleteTime);
		assert.strictEqual(await Model.cancelDelete(shard.db, owner, creep.id), C.OK);
		assert.strictEqual((await Model.loadRoster(shard.db, owner))[0]!.deleteTime, 0);
	}));

	test('the driver blob materializes an unspawned roster member', () => sim(async ({ shard }) => {
		await setPower(shard.db, 4000);
		assert.strictEqual(await Model.create(shard.db, owner, 'Alice', C.POWER_CLASS.OPERATOR), C.OK);
		const blob = await Model.loadPowerCreepsBlob(shard.db, owner);
		assert.ok(blob);
		const [ view ] = read(blob);
		assert.strictEqual(view!.name, 'Alice');
		// Unspawned creeps sit at the all-zero signed position so spawning is a copy into a room.
		assert.strictEqual(view!.pos.roomName, 'E0S0');
		assert.strictEqual(view!.shard, null);
		assert.strictEqual(view!.ticksToLive, undefined);
	}));

	test('the stored object round-trips its powers through the blob', () => {
		const creep = createPowerCreep('a', 'Alice', C.POWER_CLASS.OPERATOR, owner);
		creep['#powers'] = [ { power: C.PWR_GENERATE_OPS, level: 2 } ];
		const [ view ] = read(write([ creep ]));
		assert.strictEqual(view!.level, 2);
		assert.deepStrictEqual(view!.powers, { [C.PWR_GENERATE_OPS]: { level: 2 } });
	});

	test('concurrent mutations both survive through blob compare-and-swap', () => sim(async ({ shard }) => {
		// Two creates race on the same roster key. Without CAS one read-modify-write clobbers the other
		// and a creep is lost; the `if: EQ`/`NX` retry loop forces the second writer to re-read first.
		await setPower(shard.db, 9000);
		await Promise.all([
			Model.create(shard.db, owner, 'Alice', C.POWER_CLASS.OPERATOR),
			Model.create(shard.db, owner, 'Bob', C.POWER_CLASS.OPERATOR),
		]);
		const names = (await Model.loadRoster(shard.db, owner)).map(creep => creep.name).sort();
		assert.deepStrictEqual(names, [ 'Alice', 'Bob' ]);
	}));
});

describe('PowerCreep spawned', () => {
	const spawnPos = new RoomPosition(25, 25, 'W1N1');
	const sim = simulate({
		W1N1: room => {
			room['#insertObject'](createPowerSpawn(spawnPos, owner));
			room['#level'] = 8;
			room['#user'] = room.controller!['#user'] = owner;
		},
	});

	// Seed the account roster with a creep named Alice and return her id. Spawning claims the
	// authoritative roster entry, so every spawned creep starts from one.
	const createAlice = async (db: Database) => {
		await setPower(db, 1000);
		await Model.create(db, owner, 'Alice', C.POWER_CLASS.OPERATOR);
		const [ created ] = await Model.loadRoster(db, owner);
		return created!.id;
	};

	// The harness never materializes the account roster into the runtime, so the roster member is
	// reconstructed inline and spawned through the real intent path; the intent carries only the
	// roster id, and once processed the creep is a normal room object reachable through
	// `Game.powerCreeps`.
	test('spawn places the creep on the power spawn with a full lifetime', () => sim(async ({ player, tick, shard }) => {
		const id = await createAlice(shard.db);
		await player(owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			const forged = createPowerCreep(id, 'Forged', C.POWER_CLASS.OPERATOR, owner);
			forged['#powers'] = [ { power: C.PWR_GENERATE_OPS, level: 5 } ];
			assert.strictEqual(forged.spawn(powerSpawn), C.OK);
		});
		await tick();
		await player(owner, Game => {
			const alice = Game.powerCreeps.Alice!;
			assert.strictEqual(Game.powerCreeps.Forged, undefined);
			assert.strictEqual(alice.room.name, 'W1N1');
			assert.strictEqual(alice.pos.isEqualTo(spawnPos), true);
			assert.strictEqual(alice.ticksToLive, C.POWER_CREEP_LIFE_TIME);
			assert.strictEqual(alice.hits, 1000);
			assert.deepStrictEqual(alice.powers, {});
		});
	}));

	test('spawn on an already-spawned creep returns ERR_BUSY', () => sim(async ({ player, tick, shard }) => {
		const id = await createAlice(shard.db);
		await player(owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			assert.strictEqual(createPowerCreep(id, 'Alice', C.POWER_CLASS.OPERATOR, owner).spawn(powerSpawn), C.OK);
		});
		await tick();
		await player(owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			assert.strictEqual(Game.powerCreeps.Alice!.spawn(powerSpawn), C.ERR_BUSY);
		});
	}));

	test('a second spawn cannot claim an already-spawned roster entry', () => sim(async ({ player, peekRoom, tick, shard }) => {
		const id = await createAlice(shard.db);
		await player(owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			assert.strictEqual(createPowerCreep(id, 'Alice', C.POWER_CLASS.OPERATOR, owner).spawn(powerSpawn), C.OK);
		});
		await tick();
		await player(owner, Game => {
			// Step off the power spawn so the tile guard can't mask the roster claim.
			assert.strictEqual(Game.powerCreeps.Alice!.move(C.TOP), C.OK);
		});
		await tick();
		await player(owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			// A room-less inline handle passes the runtime checks; the roster entry is already claimed.
			assert.strictEqual(createPowerCreep(id, 'Alice', C.POWER_CLASS.OPERATOR, owner).spawn(powerSpawn), C.OK);
		});
		await tick();
		await peekRoom('W1N1', room => {
			assert.strictEqual(room['#lookFor'](C.LOOK_POWER_CREEPS).length, 1);
		});
	}));

	test('a spawned power creep moves without fatigue', () => sim(async ({ player, tick, shard }) => {
		const id = await createAlice(shard.db);
		await player(owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			assert.strictEqual(createPowerCreep(id, 'Alice', C.POWER_CLASS.OPERATOR, owner).spawn(powerSpawn), C.OK);
		});
		await tick();
		let target: RoomPosition;
		await player(owner, Game => {
			const alice = Game.powerCreeps.Alice!;
			// Step off the power spawn, into open terrain.
			target = getPositionInDirection(alice.pos, C.TOP)!;
			assert.strictEqual(alice.move(C.TOP), C.OK);
		});
		await tick();
		await player(owner, Game => {
			assert.strictEqual(Game.powerCreeps.Alice!.pos.isEqualTo(target), true);
		});
	}));

	test('a spawned power creep drops a carried resource', () => sim(async ({ player, poke, tick, shard }) => {
		const id = await createAlice(shard.db);
		await player(owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			assert.strictEqual(createPowerCreep(id, 'Alice', C.POWER_CLASS.OPERATOR, owner).spawn(powerSpawn), C.OK);
		});
		await tick();
		await poke('W1N1', owner, (Game, room) => {
			room['#lookFor'](C.LOOK_POWER_CREEPS)[0]!.store['#add'](C.RESOURCE_ENERGY, 50);
		});
		await player(owner, Game => {
			assert.strictEqual(Game.powerCreeps.Alice!.drop(C.RESOURCE_ENERGY), C.OK);
		});
		await tick();
		await player(owner, Game => {
			assert.strictEqual(Game.powerCreeps.Alice!.store[C.RESOURCE_ENERGY], 0);
		});
	}));

	test('renew at the power spawn resets the lifetime', () => sim(async ({ player, poke, tick, shard }) => {
		const id = await createAlice(shard.db);
		await player(owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			assert.strictEqual(createPowerCreep(id, 'Alice', C.POWER_CLASS.OPERATOR, owner).spawn(powerSpawn), C.OK);
		});
		await tick();
		// Age the creep partway down so the renew is observable.
		await poke('W1N1', owner, (Game, room) => {
			room['#lookFor'](C.LOOK_POWER_CREEPS)[0]!['#ageTime'] = shard.time + 100;
		});
		await player(owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			assert.ok(Game.powerCreeps.Alice!.ticksToLive! < C.POWER_CREEP_LIFE_TIME);
			assert.strictEqual(Game.powerCreeps.Alice!.renew(powerSpawn), C.OK);
		});
		await tick();
		await player(owner, Game => {
			assert.strictEqual(Game.powerCreeps.Alice!.ticksToLive, C.POWER_CREEP_LIFE_TIME);
		});
	}));

	test('suicide leaves a tombstone and starts the respawn cooldown', () => sim(async ({ player, peekRoom, tick, shard }) => {
		const id = await createAlice(shard.db);
		await player(owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			assert.strictEqual(createPowerCreep(id, 'Alice', C.POWER_CLASS.OPERATOR, owner).spawn(powerSpawn), C.OK);
		});
		await tick();
		await player(owner, Game => {
			assert.strictEqual(Game.powerCreeps.Alice!.suicide(), C.OK);
		});
		await tick();
		await peekRoom('W1N1', room => {
			assert.strictEqual(room['#lookFor'](C.LOOK_POWER_CREEPS).length, 0);
			assert.strictEqual(room['#lookFor'](C.LOOK_TOMBSTONES).length, 1);
		});
		const [ entry ] = await Model.loadRoster(shard.db, owner);
		assert.ok(entry!.spawnCooldownTime > Date.now());
	}));

	test('spawn is rejected while a roster spawn cooldown is still pending', () => sim(async ({ player, peekRoom, tick, shard }) => {
		const id = await createAlice(shard.db);
		// A recent death's cooldown writeback the runtime has not seen yet.
		await Model.setSpawnCooldown(shard.db, owner, id, Date.now() + C.POWER_CREEP_SPAWN_COOLDOWN);
		await player(owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			// The inline runtime creep carries a stale cooldown of 0, so the runtime check passes; the
			// roster claim must reject it against the authoritative cooldown.
			assert.strictEqual(createPowerCreep(id, 'Alice', C.POWER_CLASS.OPERATOR, owner).spawn(powerSpawn), C.OK);
		});
		await tick();
		await peekRoom('W1N1', room => {
			assert.strictEqual(room['#lookFor'](C.LOOK_POWER_CREEPS).length, 0);
		});
	}));

	test('age-out leaves a tombstone and starts the respawn cooldown', () => sim(async ({ player, poke, peekRoom, tick, shard }) => {
		const id = await createAlice(shard.db);
		await player(owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			assert.strictEqual(createPowerCreep(id, 'Alice', C.POWER_CLASS.OPERATOR, owner).spawn(powerSpawn), C.OK);
		});
		await tick();
		await poke('W1N1', owner, (Game, room) => {
			room['#lookFor'](C.LOOK_POWER_CREEPS)[0]!['#ageTime'] = shard.time + 1;
		});
		await tick();
		await peekRoom('W1N1', room => {
			assert.strictEqual(room['#lookFor'](C.LOOK_POWER_CREEPS).length, 0);
			assert.strictEqual(room['#lookFor'](C.LOOK_TOMBSTONES).length, 1);
		});
		const [ entry ] = await Model.loadRoster(shard.db, owner);
		assert.ok(entry!.spawnCooldownTime > Date.now());
	}));

	test('lethal damage routes death through the tombstone + respawn cooldown', () => sim(async ({ player, poke, peekRoom, tick, shard }) => {
		const id = await createAlice(shard.db);
		await player(owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			assert.strictEqual(createPowerCreep(id, 'Alice', C.POWER_CLASS.OPERATOR, owner).spawn(powerSpawn), C.OK);
		});
		await tick();
		// Ranged mass attack reaches this through `#applyDamage` → tick settlement; drive hits to
		// zero directly.
		await poke('W1N1', owner, (Game, room) => {
			room['#lookFor'](C.LOOK_POWER_CREEPS)[0]!.hits = 0;
		});
		await tick();
		await peekRoom('W1N1', room => {
			assert.strictEqual(room['#lookFor'](C.LOOK_POWER_CREEPS).length, 0);
			assert.strictEqual(room['#lookFor'](C.LOOK_TOMBSTONES).length, 1);
		});
		const [ entry ] = await Model.loadRoster(shard.db, owner);
		assert.ok(entry!.spawnCooldownTime > Date.now());
	}));

	test('spawning a creep you do not own is rejected', () => sim(async ({ player }) => {
		await player(owner, Game => {
			const powerSpawn = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_SPAWN)[0]!;
			// A creep owned by another player cannot be spawned, even at your own power spawn.
			assert.strictEqual(createPowerCreep(Id.generateId(), 'Wrong', C.POWER_CLASS.OPERATOR, hostile).spawn(powerSpawn), C.ERR_NOT_OWNER);
		});
	}));
});
