import type { JSONSchemaType } from 'ajv';
import type { Endpoint } from 'xxscreeps/backend/index.js';
import { hooks, makeValidatedPayloadRoute, makeValidatedQueryRoute } from 'xxscreeps/backend/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { sendNotification } from 'xxscreeps/mods/notifications/model.js';
import { getNotifyPrefs } from 'xxscreeps/mods/notifications/prefs.js';
import {
	getConversation, getConversationIndex, getMessageChannel, getNewMessageChannel,
	getUnreadCount, markRead, sendMessage,
} from './model.js';

// Mirrors the original server's cap; longer payloads are rejected rather than truncated.
const kMaxMessageLength = 2000;

const UnreadCountEndpoint: Endpoint = {
	path: '/api/user/messages/unread-count',

	async execute(context) {
		const { userId } = context.state;
		if (userId == null) {
			return { ok: 1, count: 0 };
		}
		return { ok: 1, count: await getUnreadCount(context.db, userId) };
	},
};

const IndexEndpoint: Endpoint = {
	path: '/api/user/messages/index',

	async execute(context) {
		const { userId } = context.state;
		if (userId == null) {
			return { error: 'not authenticated' };
		}
		const { entries, respondents } = await getConversationIndex(context.db, userId);
		const users: Record<string, { _id: string; username?: string; badge?: unknown }> = {};
		await Promise.all(respondents.map(async id => {
			const info = await context.db.data.hmGet(User.infoKey(id), [ 'username', 'badge' ]);
			users[id] = {
				_id: id,
				...info.username != null && { username: info.username },
				...info.badge != null && { badge: JSON.parse(info.badge) },
			};
		}));
		return { ok: 1, messages: entries, users };
	},
};

interface ListRequest {
	respondent: string;
}
const listRequestSchema: JSONSchemaType<ListRequest> = {
	type: 'object',
	properties: {
		respondent: { type: 'string' },
	},
	required: [ 'respondent' ],
	additionalProperties: true,
};
const ListEndpoint: Endpoint = {
	path: '/api/user/messages/list',

	execute: makeValidatedQueryRoute(listRequestSchema, async context => {
		const { userId } = context.state;
		if (userId == null) {
			return { error: 'not authenticated' };
		}
		const messages = await getConversation(context.db, userId, context.request.query.respondent);
		return { ok: 1, messages };
	}),
};

interface SendRequest {
	respondent: string;
	text: string;
}
const sendRequestSchema: JSONSchemaType<SendRequest> = {
	type: 'object',
	properties: {
		respondent: { type: 'string' },
		text: { type: 'string' },
	},
	required: [ 'respondent', 'text' ],
	additionalProperties: true,
};
const SendEndpoint: Endpoint = {
	path: '/api/user/messages/send',
	method: 'post',

	execute: makeValidatedPayloadRoute(sendRequestSchema, async context => {
		const { userId } = context.state;
		if (userId == null) {
			return { error: 'not authenticated' };
		}
		const { respondent } = context.request.body;
		const text = context.request.body.text.trim();
		if (text === '' || text.length > kMaxMessageLength) {
			return { error: 'invalid text' };
		}
		if (respondent === userId) {
			return { error: 'invalid respondent' };
		}
		// The recipient must be a real, registered user.
		const recipient = await context.db.data.hmGet(User.infoKey(respondent), [ 'username' ]);
		if (recipient.username == null) {
			return { error: 'invalid respondent' };
		}

		await sendMessage(context.db, userId, respondent, text);

		// Best-effort message notification, gated by the recipient's notify prefs.
		try {
			const prefs = await getNotifyPrefs(context.shard, respondent);
			if (!prefs.disabled && !prefs.disabledOnMessages) {
				const sender = await context.db.data.hmGet(User.infoKey(userId), [ 'username' ]);
				await sendNotification(context.shard, respondent, 'msg', `You have a new message from ${sender.username ?? 'a player'}`);
			}
		} catch (err) {
			console.error('Failed to enqueue message notification', err);
		}
		return { ok: 1 };
	}),
};

interface MarkReadRequest {
	id: string;
}
const markReadRequestSchema: JSONSchemaType<MarkReadRequest> = {
	type: 'object',
	properties: {
		id: { type: 'string' },
	},
	required: [ 'id' ],
	additionalProperties: true,
};
const MarkReadEndpoint: Endpoint = {
	path: '/api/user/messages/mark-read',
	method: 'post',

	execute: makeValidatedPayloadRoute(markReadRequestSchema, async context => {
		const { userId } = context.state;
		if (userId == null) {
			return { error: 'not authenticated' };
		}
		await markRead(context.db, userId, context.request.body.id);
		return { ok: 1 };
	}),
};

const endpoints = [
	UnreadCountEndpoint, IndexEndpoint, ListEndpoint, SendEndpoint, MarkReadEndpoint,
];
for (const endpoint of endpoints) {
	hooks.register('route', endpoint);
}

// Socket subscriptions. The client subscribes with `user:<id>/newMessage` and
// `user:<id>/message:<respondentId>`; both are self-only, matching the console subscription guard.
hooks.register('subscription', {
	pattern: /^user:(?<user>[^/]+)\/newMessage$/,

	subscribe(params) {
		if (this.user === undefined || params.user !== this.user) {
			return () => {};
		}
		return getNewMessageChannel(this.context.db, this.user).listen(message => {
			this.send(JSON.stringify(message));
		});
	},
});

hooks.register('subscription', {
	pattern: /^user:(?<user>[^/]+)\/message:(?<respondent>[^/]+)$/,

	subscribe(params) {
		const { respondent } = params;
		if (this.user === undefined || params.user !== this.user || respondent === undefined) {
			return () => {};
		}
		return getMessageChannel(this.context.db, this.user, respondent).listen(message => {
			this.send(JSON.stringify(message));
		});
	},
});
