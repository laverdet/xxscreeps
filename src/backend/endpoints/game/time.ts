import { Endpoint, registerBackendMiddleware } from 'xxscreeps/backend';
import config from 'xxscreeps/config';

registerBackendMiddleware((koa, router) => {
	router.get([ '/api/game/tick', '/api/game/shards/tick' ], context => {
		context.body = {
			ok: 1,
			tick: config.game.tickSpeed,
		};
	});
});

const TimeEndpoint: Endpoint = {
	path: '/api/game/time',

	execute(context) {
		return {
			ok: 1,
			time: context.backend.time,
		};
	},
};

export default [ TimeEndpoint ];
