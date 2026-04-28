import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { UserIntent, UserIntentPayload } from 'xxscreeps/game/intents.js';

type Handler<Name extends keyof UserIntent> =
	(shard: Shard, userId: string, ...args: UserIntent[Name]) => Promise<void> | void;

const handlers = new Map<string, Handler<keyof UserIntent>>();

export function registerUserIntentHandler<Name extends keyof UserIntent>(
	intent: Name, handler: Handler<Name>,
) {
	if (handlers.has(intent)) {
		throw new Error(`Duplicate user-intent handler registered for '${intent}'`);
	}
	handlers.set(intent, handler as Handler<keyof UserIntent>);
}

export async function dispatchUserIntents(
	shard: Shard, userId: string, userIntents: UserIntentPayload | undefined,
) {
	if (!userIntents) {
		return;
	}
	// Per-user serial: notification upserts read-then-write the same row, and concurrent
	// dispatches for the same user would TOCTOU. Different users still parallelize at the caller.
	for (const [ intent, calls ] of Object.entries(userIntents)) {
		const handler = handlers.get(intent);
		if (!handler) {
			continue;
		}
		for (const args of calls) {
			await handler(shard, userId, ...args);
		}
	}
}
