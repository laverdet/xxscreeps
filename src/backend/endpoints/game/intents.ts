import type { Endpoint } from 'xxscreeps/backend';
import { pushIntentsForRoomNextTick } from 'xxscreeps/engine/processor/model';

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
		const realIntentName = {
			removeConstructionSite: 'remove',
		}[name] ?? name;
		await pushIntentsForRoomNextTick(context.shard, room, userId, {
			local: {},
			object: {
				[id]: { [realIntentName]: [] },
			},
		});
		return { ok: 1 };
	},
};

export default [ AddObjectIntentEndpoint ];
