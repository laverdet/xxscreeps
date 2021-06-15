import type { Endpoint } from 'xxscreeps/backend';
import { registerBackendMiddleware } from 'xxscreeps/backend';
import { tickSpeed } from 'xxscreeps/engine/service/tick';

registerBackendMiddleware((koa, router) => {
	router.get([ '/api/game/tick', '/api/game/shards/tick' ], context => {
		context.body = {
			ok: 1,
			tick: tickSpeed,
		};
	});
});

const TimeEndpoint: Endpoint = {
	path: '/api/game/time',

	execute(context) {
		return {
			ok: 1,
			time: context.shard.time,
		};
	},
};

export default [ TimeEndpoint ];
