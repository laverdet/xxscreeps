import { hooks } from 'xxscreeps/backend/index.js';
import fetch from 'node-fetch';
import config from 'xxscreeps/config/index.js';

const { steamApiKey } = config.backend;
if (steamApiKey) {
	hooks.register('route', {
		method: 'post',
		path: '/api/auth/steam-ticket',

		async execute(context) {
			// Native auth not implemented, get an API key!
			if (context.query.useNativeAuth !== undefined) {
				context.status = 501;
				return;
			}

			// Get user id from Steam
			const response = await fetch(`https://api.steampowered.com/ISteamUserAuth/AuthenticateUserTicket/v1/?${new URLSearchParams({
				key: steamApiKey,
				appid: `${464350}`,
				ticket: context.request.body.ticket,
			})}`);
			if (response.status === 200) {
				const json = await response.json();
				const { result, steamid } = (json as any)?.response?.params ?? {};

				if (result !== 'OK') {
					throw new Error('Steam authentication failure');
				}

				// Respond with temporary token. auth/me handles upgrading token to user
				await context.authenticateForProvider('steam', steamid);
				return {
					ok: 1,
					token: await context.flushToken(),
				};
			} else {
				throw new Error('Steam failure. Check `backend.steamApiKey`');
			}
		},
	});
}
