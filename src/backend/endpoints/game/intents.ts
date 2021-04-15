import type { Endpoint } from 'xxscreeps/backend';
import { pushIntentsForRoomNextTick } from 'xxscreeps/engine/model/processor';

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
		await pushIntentsForRoomNextTick(context.shard, room, userId, {
			local: {},
			object: {
				[id]: { [name]: [] },
			},
		});
		return { ok: 1 };
	},
};

export default [ AddObjectIntentEndpoint ];
