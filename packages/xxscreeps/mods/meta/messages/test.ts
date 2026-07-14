import * as User from 'xxscreeps/engine/db/user/index.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { makeProviderRegistration } from 'xxscreeps/utility/hook.js';
import { deterministicClockForTesting } from 'xxscreeps/utility/utility.js';
import { getConversation, getConversationIndex, getUnreadCount, markRead, sendMessage } from './model.js';

const alice = '100';
const bob = '101';

describe('messages model', () => {
	test('send stores one shared message, viewed as out/in by each party', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;

		await sendMessage(db, alice, bob, 'hello bob');

		const aliceThread = await getConversation(db, alice, bob);
		assert.strictEqual(aliceThread.length, 1);
		assert.strictEqual(aliceThread[0]?.type, 'out');
		assert.strictEqual(aliceThread[0].text, 'hello bob');

		const bobThread = await getConversation(db, bob, alice);
		assert.strictEqual(bobThread.length, 1);
		assert.strictEqual(bobThread[0]?.type, 'in');
		assert.strictEqual(bobThread[0].unread, true);

		// The message is deduplicated: both parties reference the same document.
		assert.strictEqual(aliceThread[0].id, bobThread[0].id);
	});

	test('unread-count tracks incoming, mark-read clears it', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;

		await sendMessage(db, alice, bob, 'one');
		await sendMessage(db, alice, bob, 'two');
		assert.strictEqual(await getUnreadCount(db, bob), 2);
		assert.strictEqual(await getUnreadCount(db, alice), 0);

		const [ first ] = await getConversation(db, bob, alice);
		assert.strictEqual(await markRead(db, bob, first!.id), true);
		assert.strictEqual(await getUnreadCount(db, bob), 1);
		// Re-reading the same message is a no-op.
		assert.strictEqual(await markRead(db, bob, first!.id), false);
		assert.strictEqual(await getUnreadCount(db, bob), 1);
	});

	test('mark-read flips the sender read receipt', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;

		await sendMessage(db, alice, bob, 'read me');
		// Alice's outgoing view starts unread (= not yet read by bob).
		const beforeOut = await getConversation(db, alice, bob);
		assert.strictEqual(beforeOut[0]?.unread, true);

		const [ incoming ] = await getConversation(db, bob, alice);
		await markRead(db, bob, incoming!.id);

		const afterOut = await getConversation(db, alice, bob);
		assert.strictEqual(afterOut[0]?.unread, false);
	});

	test('cannot mark someone else’s message read', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;

		await sendMessage(db, alice, bob, 'private');
		const [ incoming ] = await getConversation(db, bob, alice);
		// Alice is the sender; the message is addressed to bob, so she cannot mark it read.
		assert.strictEqual(await markRead(db, alice, incoming!.id), false);
		assert.strictEqual(await getUnreadCount(db, bob), 1);
	});

	test('index lists latest message per respondent, newest first', async () => {
		await using testShard = await instantiateTestShard();
		// Score threads by a deterministic clock that ticks once per `Date.now()`, so the two sends get
		// strictly increasing timestamps without racing on wall-clock resolution.
		using clock = deterministicClockForTesting();
		const { db } = testShard;

		await sendMessage(db, alice, bob, 'first');
		await sendMessage(db, bob, alice, 'reply');

		const { entries, respondents } = await getConversationIndex(db, alice);
		assert.strictEqual(entries.length, 1);
		assert.deepStrictEqual(respondents, [ bob ]);
		assert.strictEqual(entries[0]?.id, bob);
		// Latest message in alice's view of the thread is bob's incoming reply.
		assert.strictEqual(entries[0].message.text, 'reply');
		assert.strictEqual(entries[0].message.type, 'in');
	});

	test('removing a user clears their messages via the User.remove hook', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;

		await sendMessage(db, alice, bob, 'bye');
		assert.strictEqual(await getUnreadCount(db, bob), 1);

		await User.remove(db, bob);

		assert.strictEqual(await getUnreadCount(db, bob), 0);
		assert.deepStrictEqual(await getConversation(db, bob, alice), []);
		assert.deepStrictEqual((await getConversationIndex(db, bob)).respondents, []);
		// The shared document survives for the peer, so alice keeps her side of the conversation.
		const aliceThread = await getConversation(db, alice, bob);
		assert.strictEqual(aliceThread.length, 1);
		assert.strictEqual(aliceThread[0]?.text, 'bye');
	});
});

describe('message store override', () => {
	const fallback = { value: 'default' };
	const registration = makeProviderRegistration('test', fallback);
	assert.strictEqual(registration.current, fallback);

	const override = { value: 'override' };
	registration.register(override);
	assert.strictEqual(registration.current, override);

	assert.throws(() => registration.register({ value: 'second' }), /already registered/);
});
