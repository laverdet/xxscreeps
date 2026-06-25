import type { Database } from 'xxscreeps/engine/db/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import * as Model from './model.js';
import { PowerCreep } from './powercreep.js';
import { levelOf } from './record.js';

const owner = '100';

// GPL level = floor(sqrt(power / 1000)): 1000 -> 1, 4000 -> 2, 9000 -> 3.
const setPower = (db: Database, power: number) => db.data.hSet(User.infoKey(owner), 'power', `${power}`);

describe('PowerCreep account', () => {
	const sim = simulate({});

	test('create is gated by free GPL levels', () => sim(async ({ shard }) => {
		await setPower(shard.db, 1000);
		await Model.create(shard.db, owner, 'Alice', C.POWER_CLASS.OPERATOR);
		assert.strictEqual((await Model.loadRoster(shard.db, owner)).length, 1);
		await assert.rejects(Model.create(shard.db, owner, 'Bob', C.POWER_CLASS.OPERATOR), /power level/);
	}));

	test('create with no GPL is rejected', () => sim(async ({ shard }) => {
		await setPower(shard.db, 0);
		await assert.rejects(Model.create(shard.db, owner, 'Alice', C.POWER_CLASS.OPERATOR), /power level/);
	}));

	test('create rejects an invalid class and a duplicate name', () => sim(async ({ shard }) => {
		await setPower(shard.db, 4000);
		await Model.create(shard.db, owner, 'Alice', C.POWER_CLASS.OPERATOR);
		await assert.rejects(Model.create(shard.db, owner, 'X', 'wizard'), /class/);
		await assert.rejects(Model.create(shard.db, owner, 'Alice', C.POWER_CLASS.OPERATOR), /exists/);
	}));

	test('upgrade learns a power and raises the level', () => sim(async ({ shard }) => {
		await setPower(shard.db, 4000);
		const creep = await Model.create(shard.db, owner, 'Alice', C.POWER_CLASS.OPERATOR);
		await Model.upgrade(shard.db, owner, creep.id, { [C.PWR_GENERATE_OPS]: 1 });
		const updated = (await Model.loadRoster(shard.db, owner))[0]!;
		assert.strictEqual(levelOf(updated), 1);
		assert.strictEqual(updated.powers[C.PWR_GENERATE_OPS], 1);
	}));

	test('upgrade rejects an unreachable rank jump', () => sim(async ({ shard }) => {
		// gpl 3 leaves budget to spare, so the rejection is the reachability rule, not the GPL gate:
		// reaching rank 2 of a power needs a total level >= 2 already allocated.
		await setPower(shard.db, 9000);
		const creep = await Model.create(shard.db, owner, 'Alice', C.POWER_CLASS.OPERATOR);
		await assert.rejects(Model.upgrade(shard.db, owner, creep.id, { [C.PWR_GENERATE_OPS]: 2 }), /not valid/);
	}));

	test('upgrade rejects when over the free-level budget', () => sim(async ({ shard }) => {
		// gpl 1; the create consumed the only free level, so any upgrade is over budget.
		await setPower(shard.db, 1000);
		const creep = await Model.create(shard.db, owner, 'Alice', C.POWER_CLASS.OPERATOR);
		await assert.rejects(Model.upgrade(shard.db, owner, creep.id, { [C.PWR_GENERATE_OPS]: 1 }), /power level/);
	}));

	test('rename changes the name and rejects collisions', () => sim(async ({ shard }) => {
		await setPower(shard.db, 4000);
		const alice = await Model.create(shard.db, owner, 'Alice', C.POWER_CLASS.OPERATOR);
		await Model.create(shard.db, owner, 'Bob', C.POWER_CLASS.OPERATOR);
		await Model.rename(shard.db, owner, alice.id, 'Alice2');
		const names = (await Model.loadRoster(shard.db, owner)).map(record => record.name).sort();
		assert.deepStrictEqual(names, [ 'Alice2', 'Bob' ]);
		await assert.rejects(Model.rename(shard.db, owner, alice.id, 'Bob'), /exists/);
	}));

	test('delete schedules a cooldown that cancel reverses', () => sim(async ({ shard }) => {
		await setPower(shard.db, 1000);
		const creep = await Model.create(shard.db, owner, 'Alice', C.POWER_CLASS.OPERATOR);
		await Model.scheduleDelete(shard.db, owner, creep.id);
		const pending = (await Model.loadRoster(shard.db, owner))[0]!;
		assert.ok(pending.deleteTime != null && pending.deleteTime > Date.now());
		await assert.rejects(Model.scheduleDelete(shard.db, owner, creep.id), /being deleted/);
		await Model.cancelDelete(shard.db, owner, creep.id);
		const restored = (await Model.loadRoster(shard.db, owner))[0]!;
		assert.strictEqual(restored.deleteTime, undefined);
		await assert.rejects(Model.cancelDelete(shard.db, owner, creep.id), /Not being deleted/);
	}));

	test('the runtime view expands the stored record', () => {
		const view = new PowerCreep({
			id: 'a', name: 'Alice', className: C.POWER_CLASS.OPERATOR,
			powers: { [C.PWR_GENERATE_OPS]: 2 }, spawnCooldownTime: 0,
		});
		assert.strictEqual(view.level, 2);
		assert.deepStrictEqual(view.powers, { [C.PWR_GENERATE_OPS]: { level: 2 } });
		assert.strictEqual(view.shard, null);
		assert.strictEqual(view.ticksToLive, undefined);
	});
});
