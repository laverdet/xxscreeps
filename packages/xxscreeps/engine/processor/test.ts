import {
	acquireFinalIntentsForRoom,
	acquireIntentsForRoom,
	finalIntentsListForRoomKey,
	intentsListForRoomKey,
	parseFinalIntentPayload,
	parseIntentPayload,
} from 'xxscreeps/engine/processor/model.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';

const goodEnvelope = { userId: 'u1', intents: { local: {}, object: {} } };

describe('engine/processor', () => {
	describe('intent payloads', () => {
		test('a well formed payload is read', () => {
			assert.deepStrictEqual(
				parseIntentPayload(JSON.stringify(goodEnvelope), 'W1N1'),
				goodEnvelope);
		});

		// One payload that cannot be parsed must not stop the shard: this runs
		// inside the tick loop, and an error here stops every player's creeps.
		test('an unreadable payload is skipped, not thrown', () => {
			// A raw control character inside a string literal.
			assert.strictEqual(parseIntentPayload('{"userId":"u1","note":"a\tb"}', 'W1N1'), undefined);
			assert.strictEqual(parseIntentPayload('{\u0000"userId":"u1"}', 'W1N1'), undefined);
			assert.strictEqual(parseIntentPayload('not json at all', 'W1N1'), undefined);
			// Truncated, which is what a torn write leaves behind.
			assert.strictEqual(parseIntentPayload('{"userId":"u1","intents":{"local":{}}', 'W1N1'), undefined);
			assert.strictEqual(parseIntentPayload('', 'W1N1'), undefined);
		});

		// `JSON.parse` succeeds on every one of these, and every one throws on the
		// next line, where the payload is destructured.
		test('a payload of the wrong shape is skipped, not thrown', () => {
			for (const json of [
				'null',
				'[]',
				'0',
				'"x"',
				'true',
				'{"userId":"u1"}',
				'{"intents":{"local":{},"object":{}}}',
				'{"userId":5,"intents":{"local":{},"object":{}}}',
				'{"userId":"u1","intents":null}',
				'{"userId":"u1","intents":[]}',
			]) {
				assert.strictEqual(parseIntentPayload(json, 'W1N1'), undefined, `accepted ${json}`);
			}
		});

		test('no stored value makes the reader throw', () => {
			for (const json of [
				'', '\u0000', '\u001f', '{', '}', '[', ']', '"', '"\\ud800"',
				'{"__proto__":{"polluted":true}}',
			]) {
				assert.doesNotThrow(() => parseIntentPayload(json, 'W1N1'), json);
				assert.doesNotThrow(() => parseFinalIntentPayload(json, 'W1N1'), json);
			}
			assert.strictEqual(parseIntentPayload(undefined as unknown as string, 'W1N1'), undefined);
			assert.strictEqual(parseFinalIntentPayload(42 as unknown as string, 'W1N1'), undefined);
		});

		test('a final intent payload is read, and a malformed one is skipped', () => {
			assert.deepStrictEqual(
				parseFinalIntentPayload('[{"intent":"move"}]', 'W1N1'),
				[ { intent: 'move' } ]);
			assert.strictEqual(parseFinalIntentPayload('{"intent":"move"}', 'W1N1'), undefined);
			assert.strictEqual(parseFinalIntentPayload('null', 'W1N1'), undefined);
			assert.strictEqual(parseFinalIntentPayload('[{"intent":"move"', 'W1N1'), undefined);
		});
	});

	describe('acquiring intents', () => {
		test('a poisoned payload does not stop the room', async () => {
			await using testShard = await instantiateTestShard();
			const { scratch } = testShard.shard;
			await scratch.rPush(intentsListForRoomKey('W1N1'), [
				'not json at all',
				JSON.stringify(goodEnvelope),
			]);
			assert.deepStrictEqual(
				await acquireIntentsForRoom(testShard.shard, 'W1N1'),
				[ goodEnvelope ]);
		});

		test('the good payloads keep their order around a bad one', async () => {
			await using testShard = await instantiateTestShard();
			const { scratch } = testShard.shard;
			const second = { userId: 'u2', intents: { local: {}, object: {} } };
			await scratch.rPush(intentsListForRoomKey('W1N1'), [
				JSON.stringify(goodEnvelope),
				'{"userId":"u3"}',
				JSON.stringify(second),
			]);
			assert.deepStrictEqual(
				await acquireIntentsForRoom(testShard.shard, 'W1N1'),
				[ goodEnvelope, second ]);
		});

		test('a list of nothing but bad payloads yields nothing, and is consumed', async () => {
			await using testShard = await instantiateTestShard();
			const { scratch } = testShard.shard;
			const key = intentsListForRoomKey('W1N1');
			await scratch.rPush(key, [ 'null', '[]', '\u0000' ]);
			assert.deepStrictEqual(await acquireIntentsForRoom(testShard.shard, 'W1N1'), []);
			// A payload that cannot be read must not be retried on the next tick.
			assert.deepStrictEqual(await scratch.lRange(key, 0, -1), []);
		});

		test('a room with no intents yields an empty list', async () => {
			await using testShard = await instantiateTestShard();
			assert.deepStrictEqual(await acquireIntentsForRoom(testShard.shard, 'W1N1'), []);
			assert.deepStrictEqual(await acquireFinalIntentsForRoom(testShard.shard, 'W1N1'), []);
		});

		// The caller iterates the outer array and then the intents inside each
		// element, so one payload must stay one element.
		test('inter-room intents keep one entry per payload', async () => {
			await using testShard = await instantiateTestShard();
			const { scratch } = testShard.shard;
			await scratch.rPush(finalIntentsListForRoomKey('W1N1'), [
				JSON.stringify([ { intent: 'move' }, { intent: 'stop' } ]),
				'not json',
				JSON.stringify([ { intent: 'harvest' } ]),
			]);
			assert.deepStrictEqual(
				await acquireFinalIntentsForRoom(testShard.shard, 'W1N1'),
				[ [ { intent: 'move' }, { intent: 'stop' } ], [ { intent: 'harvest' } ] ]);
		});
	});
});
