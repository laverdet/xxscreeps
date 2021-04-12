import type { Endpoint } from 'xxscreeps/backend';
import { pushExtraIntentsForRoom } from 'xxscreeps/engine/model/processor';

const AddObjectIntentEndpoint: Endpoint = {
	path: '/api/game/add-object-intent',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		if (!userId) {
			return;
		}
		const { room, name, intent } = context.request.body;
		const { id } = Array.isArray(intent) ? intent[0] : intent;
		if (typeof room !== 'string' || typeof name !== 'string' || typeof id !== 'string') {
			throw new TypeError('Invalid parameters');
		}
		await pushExtraIntentsForRoom(context.shard, room, context.shard.time + 2, userId, {
			local: {},
			object: {
				[id]: { [name]: [] },
			},
		});
		return { ok: 1 };
	},
};

export default [ AddObjectIntentEndpoint ];
