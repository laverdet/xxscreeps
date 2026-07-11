import type { Database } from 'xxscreeps/engine/db/index.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import { hooks as userHooks } from 'xxscreeps/engine/db/user/index.js';
import { generateId } from 'xxscreeps/engine/schema/id.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { makeProviderRegistration } from 'xxscreeps/utility/hook.js';

// Private messages are an account-level feature, so all state lives in the shared `db.data` store
// (like notification prefs) rather than per-shard.
//
// A private message is stored exactly once, as a single shared document holding `from`, `to`, `text`
// and the send time. Both parties' conversation threads point at that same id, so a large payload is
// never duplicated. Read-state is a single fact per message — "has the recipient read it yet?" —
// tracked as membership in the recipient's unread set; that one bit drives both the recipient's unread
// badge and the sender's read receipt. The `in`/`out` direction and the `unread` flag the client sees
// are derived per viewer, never stored.
//
// All of this is the *default* store, registered as the fallback of `messageStore`. A mod can call
// `messageStore.register(...)` to replace the persistence wholesale with a different backend (e.g. a
// SQL store with native queries) without forcing every other account feature off the keyval store.
// An override owns the full contract, including publishing on the channels below for live updates.

export type MessageType = 'in' | 'out';

export interface Message {
	id: string;
	type: MessageType;
	text: string;
	// Send time as epoch milliseconds. The backend renders this into whatever the client expects.
	date: number;
	unread: boolean;
}

export interface ConversationIndex {
	// One entry per respondent (keyed by respondent id), latest message, newest first.
	entries: { id: string; message: Message }[];
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

// hash: { from, to, text, date }. One shared document per message, referenced by both parties.
const messageKey = (messageId: string) => `messages/${messageId}`;
// zset: score = send time of the last message, member = respondentId. Drives the conversation index.
const conversationsKey = (userId: string) => `user/${userId}/messages/conversations`;
// zset: score = send time, member = shared messageId. One conversation thread; both parties' threads
// reference the same ids.
const threadKey = (userId: string, respondentId: string) => `user/${userId}/messages/with/${respondentId}`;
// set of unread messageIds the given user has received. unread-count is an O(1) `sCard` over this, and
// membership doubles as the sender's read receipt.
const unreadKey = (userId: string) => `user/${userId}/messages/unread`;

// Client subscribes to `user:<id>/newMessage`; we publish on this internal channel name.
export function getNewMessageChannel(db: Database, userId: string) {
	return new Channel<{ message: Message }>(db.pubsub, `user/${userId}/newMessage`);
}

// Client subscribes to `user:<id>/message:<respondentId>`.
export function getMessageChannel(db: Database, userId: string, respondentId: string) {
	return new Channel<{ message: Message }>(db.pubsub, `user/${userId}/message/${respondentId}`);
}

interface MessageRow {
	id: string;
	from: string;
	to: string;
	text: string;
	date: number;
}

async function readMessage(db: Database, messageId: string): Promise<MessageRow | undefined> {
	const fields = await db.data.hGetAll(messageKey(messageId)) as Partial<Omit<MessageRow, 'id'>>;
	if (fields.from === undefined) {
		return undefined;
	}
	return { id: messageId, from: fields.from, to: fields.to!, text: fields.text!, date: Number(fields.date!) };
}

/**
 * Build the message as seen by `viewerId`. `type` follows from whether the viewer sent it; `unread`
 * is the single shared fact "the recipient has not read it yet" — the recipient's badge and the
 * sender's read receipt are the same bit.
 */
function toMessage(row: MessageRow, viewerId: string, unread: boolean): Message {
	return {
		id: row.id,
		type: row.from === viewerId ? 'out' : 'in',
		text: row.text,
		date: Number(row.date),
		unread,
	};
}

// The default keyval-backed implementation of `MessageStore`.
const defaultMessageStore: MessageStore = {
	/**
	 * Persist a PM from `senderId` to `respondentId` as one shared document, link it into both parties'
	 * threads and conversation indexes, add it to the recipient's unread set, and publish the
	 * new-message events the client listens for. Returns the recipient's view (for the notification hook).
	 */
	async sendMessage(db, senderId, respondentId, text) {
		const now = Date.now();
		const id = generateId(24);
		await Promise.all([
			db.data.hmSet(messageKey(id), { from: senderId, to: respondentId, text, date: String(now) }),
			db.data.zAdd(threadKey(senderId, respondentId), [ [ now, id ] ]),
			db.data.zAdd(threadKey(respondentId, senderId), [ [ now, id ] ]),
			db.data.zAdd(conversationsKey(senderId), [ [ now, respondentId ] ]),
			db.data.zAdd(conversationsKey(respondentId), [ [ now, senderId ] ]),
			db.data.sAdd(unreadKey(respondentId), [ id ]),
		]);

		const row: MessageRow = { id, from: senderId, to: respondentId, text, date: now };
		// A freshly sent message is unread by definition (the recipient hasn't opened it yet).
		const incoming = toMessage(row, respondentId, true);
		const outgoing = toMessage(row, senderId, true);
		await Promise.all([
			getMessageChannel(db, respondentId, senderId).publish({ message: incoming }),
			getNewMessageChannel(db, respondentId).publish({ message: incoming }),
			// Echo the sent message back to the sender's other sessions so an open conversation updates
			// live without a refresh.
			getMessageChannel(db, senderId, respondentId).publish({ message: outgoing }),
		]);
		return incoming;
	},

	/**
	 * The conversation index: the latest message per respondent, newest first.
	 */
	async getConversationIndex(db, userId) {
		// Read all respondents descending by last-message time
		const respondents = await db.data.zRange(conversationsKey(userId), Infinity, 0, { by: 'SCORE', rev: true });
		if (respondents.length === 0) {
			return { entries: [], respondents };
		}
		const myUnread = new Set(await db.data.sMembers(unreadKey(userId)));
		const entries = await Fn.mapAwait(respondents, async respondentId => {
			const [ latestId ] = await db.data.zRange(threadKey(userId, respondentId), -1, -1);
			const row = latestId === undefined ? undefined : await readMessage(db, latestId);
			if (!row) {
				return undefined;
			}
			// Incoming: unread lives in my set. Outgoing: unread lives in the respondent's set (the
			// read receipt), so ask directly rather than preloading every peer's unread set.
			const unread = row.to === userId
				? myUnread.has(row.id)
				: await db.data.sIsMember(unreadKey(respondentId), row.id);
			return { id: respondentId, message: toMessage(row, userId, unread) };
		});
		return {
			entries: [ ...Fn.filter(entries) ],
			respondents,
		};
	},

	/**
	 * All messages in one conversation, chronological. Capped to the most recent `limit`.
	 */
	async getConversation(db, userId, respondentId, limit = 100) {
		const ids = await db.data.zRange(threadKey(userId, respondentId), -limit, -1);
		if (ids.length === 0) {
			return [];
		}
		// A thread only ever involves these two users, so their two unread sets cover every message's
		// read-state; read each once and test membership in memory.
		const [ rows, myUnread, theirUnread ] = await Promise.all([
			Fn.mapAwait(ids, id => readMessage(db, id)),
			db.data.sMembers(unreadKey(userId)),
			db.data.sMembers(unreadKey(respondentId)),
		]);
		const myUnreadSet = new Set(myUnread);
		const theirUnreadSet = new Set(theirUnread);
		return Fn.pipe(
			rows,
			$$ => Fn.filter($$),
			$$ => Fn.map($$, row => {
				const unreadSet = row.to === userId ? myUnreadSet : theirUnreadSet;
				return toMessage(row, userId, unreadSet.has(row.id));
			}),
			$$ => [ ...$$ ]);
	},

	async getUnreadCount(db, userId) {
		return db.data.sCard(unreadKey(userId));
	},

	/**
	 * Mark a single received message read. Only the recipient may do so. Clears the shared unread bit
	 * and notifies the sender's open sessions that their read receipt flipped.
	 *
	 * Returns false if the message does not exist, is not addressed to `userId`, or was already read
	 * (so the caller does not over-decrement any cached counter).
	 */
	async markRead(db, userId, messageId) {
		const row = await readMessage(db, messageId);
		if (!row) {
			return false;
		}
		// Only the recipient may mark their received message read.
		if (row.to !== userId) {
			return false;
		}
		// `sRem` reports how many members it actually removed, so a repeat call (already read) removes 0
		// and skips the side effects below — no double-fire, no cached-counter drift.
		const removed = await db.data.sRem(unreadKey(userId), [ messageId ]);
		if (removed === 0) {
			return false;
		}
		// The sender's `out` view of this same shared message is now read; push the receipt to them.
		const receipt = toMessage(row, row.from, false);
		await getMessageChannel(db, row.from, row.to).publish({ message: receipt });
		return true;
	},

	/**
	 * Remove a user's message state. The shared message documents are co-owned by the peer, so we only
	 * tear down *this* user's own view: their threads, their conversation index and their unread set.
	 * The documents and the peers' threads stay intact, keeping the other party's history readable.
	 * (If both parties are eventually removed the shared docs orphan permanently — acceptable, and
	 * consistent with the read paths tolerating dangling references.)
	 */
	async removeAllForUser(db, userId) {
		const respondents = await db.data.zRange(conversationsKey(userId), 0, -1);
		await Promise.all([
			...respondents.map(respondentId => db.data.del(threadKey(userId, respondentId))),
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
