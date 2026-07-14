import type { Database } from 'xxscreeps/engine/db/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import * as Model from './model.js';
import { createPowerCreep, read, write } from './powercreep.js';

const owner = '100';

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
		const creep = createPowerCreep('a', 'Alice', C.POWER_CLASS.OPERATOR);
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
