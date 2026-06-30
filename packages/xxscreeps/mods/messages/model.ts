import type { Database } from 'xxscreeps/engine/db/index.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import { hooks as userHooks } from 'xxscreeps/engine/db/user/index.js';
import { generateId } from 'xxscreeps/engine/schema/id.js';
import { makeProviderRegistration } from 'xxscreeps/utility/hook.js';

// Private messages are an account-level feature, so all state lives in the shared `db.data` store
// (like notification prefs) rather than per-shard.
//
// Each PM is persisted as two linked documents, mirroring the original screeps-server model: an
// `in` copy owned by the recipient and an `out` copy owned by the sender. This lets each side track
// its own read-state — the recipient's unread badge and the sender's read receipt — independently.
// The `peer` field links an `out` copy to the recipient's `in` copy so `markRead` can flip the
// sender's receipt.
//
// All of this is the *default* store, registered as the fallback of `messageStore`. A mod can call
// `messageStore.register(...)` to replace the persistence wholesale with a different backend (e.g. a
// SQL store with native queries) without forcing every other account feature off the keyval store.
// An override owns the full contract, including publishing on the channels below for live updates.

export type MessageType = 'in' | 'out';

export interface Message {
	_id: string;
	type: MessageType;
	text: string;
	// ISO-8601 string, matching the official server's JSON-serialized Mongo date.
	date: string;
	unread: boolean;
}

export interface ConversationIndex {
	// One entry per respondent (keyed by respondent id), latest message, newest first.
	entries: { _id: string; message: Message }[];
	respondents: string[];
}

/**
 * The pluggable message-storage contract. The default implementation below is keyval-backed; a mod
 * may override it via `messageStore.register(...)` to persist messages somewhere else entirely.
 */
export interface MessageStore {
	sendMessage: (db: Database, senderId: string, respondentId: string, text: string) => Promise<Message>;
	getConversationIndex: (db: Database, userId: string) => Promise<ConversationIndex>;
	getConversation: (db: Database, userId: string, respondentId: string, limit?: number) => Promise<Message[]>;
	getUnreadCount: (db: Database, userId: string) => Promise<number>;
	markRead: (db: Database, userId: string, messageId: string) => Promise<boolean>;
	removeAllForUser: (db: Database, userId: string) => Promise<void>;
}

// hash: { user, respondent, date, type, text, unread, peer }
const messageKey = (messageId: string) => `messages/${messageId}`;
// zset: score = sequence of the last message, member = respondentId. Drives the conversation index.
const conversationsKey = (userId: string) => `user/${userId}/messages/conversations`;
// zset: score = global send sequence, member = messageId. One conversation thread.
const threadKey = (userId: string, respondentId: string) => `user/${userId}/messages/with/${respondentId}`;
// set of unread incoming messageIds. unread-count is an O(1) `sCard` over this.
const unreadKey = (userId: string) => `user/${userId}/messages/unread`;
// Strictly-increasing send counter, used as the zset score so message ordering is deterministic
// even when several messages land in the same millisecond (which `date` cannot disambiguate).
const sequenceKey = 'messages/sequence';

// Client subscribes to `user:<id>/newMessage`; we publish on this internal channel name.
export function getNewMessageChannel(db: Database, userId: string) {
	return new Channel<{ message: Message }>(db.pubsub, `user/${userId}/newMessage`);
}

// Client subscribes to `user:<id>/message:<respondentId>`.
export function getMessageChannel(db: Database, userId: string, respondentId: string) {
	return new Channel<{ message: Message }>(db.pubsub, `user/${userId}/message/${respondentId}`);
}

interface MessageFields {
	user: string;
	respondent: string;
	date: string;
	type: MessageType;
	text: string;
	unread: string;
	peer: string;
}

async function readMessage(db: Database, messageId: string): Promise<(MessageFields & { _id: string }) | undefined> {
	const fields = await db.data.hGetAll(messageKey(messageId)) as Partial<MessageFields>;
	if (fields.user === undefined) {
		return undefined;
	}
	return { _id: messageId, ...fields as MessageFields };
}

function toMessage(row: MessageFields & { _id: string }): Message {
	return {
		_id: row._id,
		type: row.type,
		text: row.text,
		date: new Date(Number(row.date)).toISOString(),
		unread: row.unread === '1',
	};
}

// The default keyval-backed implementation of `MessageStore`.
const defaultMessageStore: MessageStore = {
	/**
	 * Persist a PM from `senderId` to `respondentId`. Writes both the recipient's `in` copy and the
	 * sender's `out` copy, updates both conversation threads and the recipient's unread set, and
	 * publishes the new-message events the client listens for.
	 *
	 * Returns the recipient's `in` message so the caller (e.g. the notification hook) can act on it.
	 */
	async sendMessage(db, senderId, respondentId, text) {
		const date = String(Date.now());
		const inId = generateId(24);
		const outId = generateId(24);
		// One increment per send gives a score that strictly increases in send order within any thread.
		const seq = await db.data.incr(sequenceKey);

		// `in` copy: owned by the recipient, unread until they read it.
		// `out` copy: owned by the sender, `unread` here means "not yet read by the recipient" (the
		// read receipt), flipped by `markRead`.
		await Promise.all([
			db.data.hmset(messageKey(inId), {
				user: respondentId, respondent: senderId, date, type: 'in', text, unread: '1', peer: outId,
			}),
			db.data.hmset(messageKey(outId), {
				user: senderId, respondent: respondentId, date, type: 'out', text, unread: '1', peer: inId,
			}),
			db.data.zAdd(threadKey(respondentId, senderId), [ [ seq, inId ] ]),
			db.data.zAdd(threadKey(senderId, respondentId), [ [ seq, outId ] ]),
			db.data.zAdd(conversationsKey(respondentId), [ [ seq, senderId ] ]),
			db.data.zAdd(conversationsKey(senderId), [ [ seq, respondentId ] ]),
			db.data.sAdd(unreadKey(respondentId), [ inId ]),
		]);

		const inMessage = toMessage({
			_id: inId, user: respondentId, respondent: senderId, date, type: 'in', text, unread: '1', peer: outId,
		});
		const outMessage = toMessage({
			_id: outId, user: senderId, respondent: respondentId, date, type: 'out', text, unread: '1', peer: inId,
		});
		await Promise.all([
			getMessageChannel(db, respondentId, senderId).publish({ message: inMessage }),
			getNewMessageChannel(db, respondentId).publish({ message: inMessage }),
			// Echo the sent message back to the sender's other sessions so an open conversation updates
			// live without a refresh.
			getMessageChannel(db, senderId, respondentId).publish({ message: outMessage }),
		]);
		return inMessage;
	},

	/**
	 * The conversation index: the latest message per respondent, newest first.
	 */
	async getConversationIndex(db, userId) {
		// Read all respondents ascending by last-message time, then reverse for newest-first.
		const respondents = (await db.data.zRange(conversationsKey(userId), 0, -1)).reverse();
		const entries = await Promise.all(respondents.map(async respondentId => {
			const [ latestId ] = await db.data.zRange(threadKey(userId, respondentId), -1, -1);
			const row = latestId === undefined ? undefined : await readMessage(db, latestId);
			return { _id: respondentId, message: row && toMessage(row) };
		}));
		return {
			entries: entries.filter((entry): entry is { _id: string; message: Message } => entry.message !== undefined),
			respondents,
		};
	},

	/**
	 * All messages in one conversation, chronological. Capped to the most recent `limit`.
	 */
	async getConversation(db, userId, respondentId, limit = 100) {
		const ids = await db.data.zRange(threadKey(userId, respondentId), -limit, -1);
		const rows = await Promise.all(ids.map(id => readMessage(db, id)));
		return rows.filter((row): row is MessageFields & { _id: string } => row !== undefined).map(toMessage);
	},

	async getUnreadCount(db, userId) {
		return db.data.sCard(unreadKey(userId));
	},

	/**
	 * Mark a single incoming message read. Clears the recipient's unread state and flips the linked
	 * sender copy's read receipt, publishing it on the sender's conversation channel.
	 *
	 * Returns false if the message does not exist, is not owned by `userId`, is not incoming, or was
	 * already read (so the caller does not over-decrement any cached counter).
	 */
	async markRead(db, userId, messageId) {
		const row = await readMessage(db, messageId);
		if (!row) {
			return false;
		}
		if (row.user !== userId || row.type !== 'in' || row.unread !== '1') {
			return false;
		}
		await Promise.all([
			db.data.hSet(messageKey(messageId), 'unread', '0'),
			db.data.sRem(unreadKey(userId), [ messageId ]),
		]);
		// Flip the sender's read receipt and notify their open sessions.
		const peer = await readMessage(db, row.peer);
		if (peer?.unread === '1') {
			await db.data.hSet(messageKey(row.peer), 'unread', '0');
			const receipt = toMessage({ ...peer, unread: '0' });
			await getMessageChannel(db, peer.user, peer.respondent).publish({ message: receipt });
		}
		return true;
	},

	/**
	 * Remove all of a user's message state. Drops their threads, conversation index and unread set,
	 * and the message documents they own. The peer (other party) keeps their own copies; orphaned
	 * references are tolerated by the read paths.
	 */
	async removeAllForUser(db, userId) {
		const respondents = await db.data.zRange(conversationsKey(userId), 0, -1);
		const threadKeys = respondents.map(respondentId => threadKey(userId, respondentId));
		const ownedIds: string[] = [];
		await Promise.all(respondents.map(async respondentId => {
			const ids = await db.data.zRange(threadKey(userId, respondentId), 0, -1);
			ownedIds.push(...ids);
		}));
		await Promise.all([
			...ownedIds.map(id => db.data.del(messageKey(id))),
			...threadKeys.map(key => db.data.del(key)),
			db.data.del(conversationsKey(userId)),
			db.data.del(unreadKey(userId)),
		]);
	},
};

/**
 * The active message store. Defaults to the keyval implementation above; a mod can replace the whole
 * backend with `messageStore.register(myStore)`. Registering twice throws.
 */
export const messageStore = makeProviderRegistration<MessageStore>('messages', defaultMessageStore);

export function sendMessage(db: Database, senderId: string, respondentId: string, text: string): Promise<Message> {
	return messageStore.current.sendMessage(db, senderId, respondentId, text);
}

export function getConversationIndex(db: Database, userId: string): Promise<ConversationIndex> {
	return messageStore.current.getConversationIndex(db, userId);
}

export function getConversation(db: Database, userId: string, respondentId: string, limit?: number): Promise<Message[]> {
	return messageStore.current.getConversation(db, userId, respondentId, limit);
}

export function getUnreadCount(db: Database, userId: string): Promise<number> {
	return messageStore.current.getUnreadCount(db, userId);
}

export function markRead(db: Database, userId: string, messageId: string): Promise<boolean> {
	return messageStore.current.markRead(db, userId, messageId);
}

export function removeAllForUser(db: Database, userId: string): Promise<void> {
	return messageStore.current.removeAllForUser(db, userId);
}

// Tear down a removed user's messages as part of `User.remove`.
userHooks.register('remove', removeAllForUser);
