import request from 'request-promise-native';
import { makeToken } from 'xxscreeps/backend/auth/token';
import { Endpoint } from 'xxscreeps/backend/endpoint';
import config from 'xxscreeps/engine/config';

export const SteamTicketEndpoint: Endpoint = {
	method: 'post',
	path: '/steam-ticket',

	async execute(req, res) {
		// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
		if (req.query.useNativeAuth) {
			res.writeHead(501);
			res.end();
			return;
		}

		// Get user id from Steam
		const result = JSON.parse(await request('https://api.steampowered.com/ISteamUserAuth/AuthenticateUserTicket/v1/', {
			qs: {
				key: config.backend.steamApiKey,
				appid: 464350,
				ticket: req.body.ticket,
			},
		}));
		if (result?.response?.params?.result !== 'OK') {
			throw new Error('Steam authentication failure');
		}

		// Respond with temporary token. auth/me handles upgrading token to user
		const steamid = +result?.response?.params?.steamid;
		return {
			ok: 1,
			token: await makeToken(`steam:${steamid}`),
		};
	},
};
