import { registerBackendRoute } from 'xxscreeps/backend';
import fetch from 'node-fetch';
import config from 'xxscreeps/config';

registerBackendRoute({
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
			key: config.backend.steamApiKey,
			appid: `${464350}`,
			ticket: context.request.body.ticket,
		})}`);
		const { result, steamid } = (await response.json())?.response?.params ?? {};
		if (result !== 'OK') {
			throw new Error('Steam authentication failure');
		}

		// Respond with temporary token. auth/me handles upgrading token to user
		await context.authenticateForProvider('steam', steamid);
		return {
			ok: 1,
			token: await context.flushToken(),
		};
	},
});
