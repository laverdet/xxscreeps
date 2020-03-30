import { Endpoint } from '~/backend/endpoint';
import config from '~/engine/config';

export const TickEndpoint: Endpoint = {
	method: 'get',
	path: '/tick',

	async execute() {
		return {
			ok: 1,
			tick: (await config).config.game?.tickSpeed ?? 250,
		};
	},
};

export const TimeEndpoint: Endpoint = {
	method: 'get',
	path: '/time',

	execute() {
		return {
			ok: 1,
			time: this.context.time,
		};
	},
};
