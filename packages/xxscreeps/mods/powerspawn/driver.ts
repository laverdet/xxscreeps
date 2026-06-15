import * as User from 'xxscreeps/engine/db/user/index.js';
import { hooks } from 'xxscreeps/engine/runner/index.js';

declare module 'xxscreeps/engine/runner/index.js' {
	interface TickPayload {
		power: number;
	}
}

hooks.register('runnerConnector', player => {
	const { shard, userId } = player;
	return [ undefined, {
		async refresh(payload) {
			payload.power = Number(await shard.db.data.hGet(User.infoKey(userId), 'power')) || 0;
		},
	} ];
});
