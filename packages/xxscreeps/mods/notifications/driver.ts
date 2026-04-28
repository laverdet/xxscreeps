import { dispatchUserIntents } from 'xxscreeps/engine/processor/index.js';
import { hooks } from 'xxscreeps/engine/runner/index.js';
import './processor.js';

hooks.register('runnerConnector', player => [ undefined, {
	async save(result) {
		await dispatchUserIntents(player.shard, player.userId, result.userIntents);
	},
} ]);
