import { Endpoint } from 'xxscreeps/backend/endpoint';
import { getRunnerUserChannel } from 'xxscreeps/engine/runner/channel';

const AddObjectIntentEndpoint: Endpoint = {
	path: '/add-object-intent',
	method: 'post',

	async execute(req) {
		const { userid } = req.locals;
		const { room, name, intent: { id } } = req.body;
		if (typeof room !== 'string' || typeof name !== 'string' || typeof id !== 'string') {
			throw new TypeError('Invalid parameters');
		}
		await getRunnerUserChannel(this.context.shard, userid!)
			.publish({ type: 'intent', intent: { receiver: id, intent: name, params: true } });
		return { ok: 1 };
	},
};

export default [ AddObjectIntentEndpoint ];
