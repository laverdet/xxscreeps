import * as User from 'xxscreeps/engine/db/user/index.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { makeProviderRegistration } from 'xxscreeps/utility/hook.js';
import {
	getConversation, getConversationIndex, getUnreadCount, markRead, messageStore, sendMessage,
} from './model.js';

const alice = '100';
const bob = '101';

describe('messages model', () => {
	test('send delivers in/out copies to both parties', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;

		await sendMessage(db, alice, bob, 'hello bob');

		const aliceThread = await getConversation(db, alice, bob);
		assert.strictEqual(aliceThread.length, 1);
		assert.strictEqual(aliceThread[0]!.type, 'out');
		assert.strictEqual(aliceThread[0]!.text, 'hello bob');

		const bobThread = await getConversation(db, bob, alice);
		assert.strictEqual(bobThread.length, 1);
		assert.strictEqual(bobThread[0]!.type, 'in');
		assert.strictEqual(bobThread[0]!.unread, true);
	});

	test('unread-count tracks incoming, mark-read clears it', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;

		await sendMessage(db, alice, bob, 'one');
		await sendMessage(db, alice, bob, 'two');
		assert.strictEqual(await getUnreadCount(db, bob), 2);
		assert.strictEqual(await getUnreadCount(db, alice), 0);

		const [ first ] = await getConversation(db, bob, alice);
		assert.strictEqual(await markRead(db, bob, first!._id), true);
		assert.strictEqual(await getUnreadCount(db, bob), 1);
		// Re-reading the same message is a no-op.
		assert.strictEqual(await markRead(db, bob, first!._id), false);
		assert.strictEqual(await getUnreadCount(db, bob), 1);
	});

	test('mark-read flips the sender read receipt', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;

		await sendMessage(db, alice, bob, 'read me');
		// Alice's outgoing copy starts unread (= not yet read by bob).
		const beforeOut = await getConversation(db, alice, bob);
		assert.strictEqual(beforeOut[0]!.unread, true);

		const [ incoming ] = await getConversation(db, bob, alice);
		await markRead(db, bob, incoming!._id);

		const afterOut = await getConversation(db, alice, bob);
		assert.strictEqual(afterOut[0]!.unread, false);
	});

	test('cannot mark someone else’s message read', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;

		await sendMessage(db, alice, bob, 'private');
		const [ incoming ] = await getConversation(db, bob, alice);
		// Alice is the sender; she cannot mark bob's incoming copy read.
		assert.strictEqual(await markRead(db, alice, incoming!._id), false);
		assert.strictEqual(await getUnreadCount(db, bob), 1);
	});

	test('index lists latest message per respondent, newest first', async () => {
		await using testShard = await instantiateTestShard();
		const { db } = testShard;

		await sendMessage(db, alice, bob, 'first');
		// Thread order is scored by wall-clock ms with no tiebreaker, so give these two sends
		// distinguishable timestamps (real messages are human-paced and never collide like this).
		await new Promise(resolve => setTimeout(resolve, 2));
		await sendMessage(db, bob, alice, 'reply');

		const { entries, respondents } = await getConversationIndex(db, alice);
		assert.strictEqual(entries.length, 1);
		assert.deepStrictEqual(respondents, [ bob ]);
		assert.strictEqual(entries[0]!._id, bob);
		// Latest message in alice's view of the thread is bob's incoming reply.
		assert.strictEqual(entries[0]!.message.text, 'reply');
		assert.strictEqual(entries[0]!.message.type, 'in');
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
	});
});

describe('message store override', () => {
	// The real `messageStore` is process-global and has no unregister, so we exercise the override
	// semantics on a throwaway registration to avoid leaking a mock into other tests.
	test('built-in store is the default', () => {
		assert.strictEqual(typeof messageStore.current.sendMessage, 'function');
	});

	test('register replaces the default; registering twice throws', () => {
		const fallback = { value: 'default' };
		const registration = makeProviderRegistration('test', fallback);
		assert.strictEqual(registration.current, fallback);

		const override = { value: 'override' };
		registration.register(override);
		assert.strictEqual(registration.current, override);

		assert.throws(() => registration.register({ value: 'second' }), /already registered/);
	});
});
