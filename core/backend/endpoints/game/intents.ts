import type { Endpoint } from 'xxscreeps/backend';
import { getRunnerUserChannel } from 'xxscreeps/engine/runner/channel';

const AddObjectIntentEndpoint: Endpoint = {
	path: '/api/game/add-object-intent',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		if (!userId) {
			return;
		}
		const { room, name, intent: { id } } = context.request.body;
		if (typeof room !== 'string' || typeof name !== 'string' || typeof id !== 'string') {
			throw new TypeError('Invalid parameters');
		}
		await getRunnerUserChannel(context.shard, userId)
			.publish({ type: 'intent', intent: { receiver: id, intent: name, params: true } });
		return { ok: 1 };
	},
};

export default [ AddObjectIntentEndpoint ];
