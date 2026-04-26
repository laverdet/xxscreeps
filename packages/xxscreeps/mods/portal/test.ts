import { RoomPosition } from 'xxscreeps/game/position.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { StructurePortal, create } from './portal.js';

const findPortal = (room: any) =>
	room['#objects'].find((object: any) => object instanceof StructurePortal) as StructurePortal | undefined;

describe('Portal', () => {
	test('decaying portal exposes positive ticksToDecay', () => simulate({
		W1N1: room => {
			room['#insertObject'](create(
				new RoomPosition(25, 25, 'W1N1'),
				{ room: 'W2N2', x: 30, y: 30 },
				/* decayTime */ 100,
			));
		},
	})(async ({ peekRoom }) => {
		await peekRoom('W1N1', (room, game) => {
			const portal = findPortal(room);
			assert.ok(portal, 'portal should exist');
			const ttd = portal!.ticksToDecay;
			assert.ok(typeof ttd === 'number' && ttd > 0 && ttd <= 100,
				`ticksToDecay should count down from #decayTime; got ${ttd}`);
			assert.strictEqual(ttd, 100 - game.time);
		});
	}));

	test('permanent portal has undefined ticksToDecay', () => simulate({
		W1N1: room => {
			room['#insertObject'](create(
				new RoomPosition(25, 25, 'W1N1'),
				{ room: 'W2N2', x: 30, y: 30 },
				/* decayTime */ 0,
			));
		},
	})(async ({ peekRoom }) => {
		await peekRoom('W1N1', room => {
			const portal = findPortal(room);
			assert.ok(portal, 'permanent portal should exist');
			assert.strictEqual(portal!.ticksToDecay, undefined);
		});
	}));

	test('same-shard destination is a RoomPosition with x/y/roomName', () => simulate({
		W1N1: room => {
			room['#insertObject'](create(
				new RoomPosition(25, 25, 'W1N1'),
				{ room: 'W3N3', x: 17, y: 23 },
			));
		},
	})(async ({ peekRoom }) => {
		await peekRoom('W1N1', room => {
			const portal = findPortal(room);
			const dest = portal!.destination as RoomPosition;
			assert.strictEqual(dest.roomName, 'W3N3');
			assert.strictEqual(dest.x, 17);
			assert.strictEqual(dest.y, 23);
		});
	}));

	test('cross-shard destination is { shard, room }', () => simulate({
		W1N1: room => {
			room['#insertObject'](create(
				new RoomPosition(25, 25, 'W1N1'),
				{ shard: 'shard1', room: 'W5N5' },
			));
		},
	})(async ({ peekRoom }) => {
		await peekRoom('W1N1', room => {
			const portal = findPortal(room);
			const dest = portal!.destination as { shard: string; room: string };
			assert.strictEqual(dest.shard, 'shard1');
			assert.strictEqual(dest.room, 'W5N5');
		});
	}));
});
