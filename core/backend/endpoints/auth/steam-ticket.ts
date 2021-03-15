import fetch from 'node-fetch';
import { makeToken } from 'xxscreeps/backend/auth/token';
import { Endpoint } from 'xxscreeps/backend/endpoint';
import config from 'xxscreeps/config';

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
		const response = await fetch(`https://api.steampowered.com/ISteamUserAuth/AuthenticateUserTicket/v1/?${new URLSearchParams({
			key: config.backend.steamApiKey,
			appid: `${464350}`,
			ticket: req.body.ticket,
		})}`);
		const payload = await response.json();
		if (payload.response?.params?.result !== 'OK') {
			throw new Error('Steam authentication failure');
		}

		// Respond with temporary token. auth/me handles upgrading token to user
		const steamid = +payload.response?.params?.steamid;
		return {
			ok: 1,
			token: await makeToken(`steam:${steamid}`),
		};
	},
};
