import { Endpoint } from '~/backend/endpoint';

export const SteamTicketEndpoint: Endpoint = {
	method: 'post',
	path: '/steam-ticket',

	execute() {
		return {
			ok: 1,
			token: '123',
			steamid: 'abc',
		};
	},
};
