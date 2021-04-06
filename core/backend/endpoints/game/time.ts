import type { Endpoint } from 'xxscreeps/backend';
import config from 'xxscreeps/config';

const TickEndpoint: Endpoint = {
	path: '/api/game/tick',

	execute() {
		return {
			ok: 1,
			tick: config.game?.tickSpeed ?? 250,
		};
	},
};

const TimeEndpoint: Endpoint = {
	path: '/api/game/time',

	execute(context) {
		return {
			ok: 1,
			time: context.backend.time,
		};
	},
};

export default [ TickEndpoint, TimeEndpoint ];
