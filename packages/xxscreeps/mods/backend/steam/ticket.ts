import { Ajv, JSONSchemaType } from 'ajv';
import fetch from 'node-fetch';
import { hooks, makeValidatedPayloadRoute } from 'xxscreeps/backend/index.js';
import config from 'xxscreeps/config/index.js';

const ajv = new Ajv();

interface SteamTicketRequest {
	ticket: string;
}

const steamTicketRequestSchema: JSONSchemaType<SteamTicketRequest> = {
	type: 'object',
	properties: {
		ticket: { type: 'string' },
	},
	required: [ 'ticket' ],
};

interface SteamAuthenticateResponse {
	response: {
		params: {
			result: string;
			steamid: string;
		};
	};
}

const validateSteamAuthenticateResponseSchema = ajv.compile<SteamAuthenticateResponse>({
	type: 'object',
	properties: {
		response: {
			type: 'object',
			properties: {
				params: {
					type: 'object',
					properties: {
						result: { type: 'string' },
						steamid: { type: 'string' },
					},
					required: [ 'result', 'steamid' ],
				},
			},
			required: [ 'params' ],
		},
	},
	required: [ 'response' ],
});

const { steamApiKey } = config.backend;
if (steamApiKey !== undefined) {
	hooks.register('route', {
		method: 'post',
		path: '/api/auth/steam-ticket',

		execute: makeValidatedPayloadRoute(steamTicketRequestSchema, async context => {
			// Native auth not implemented, get an API key!
			if (context.query.useNativeAuth !== undefined) {
				context.status = 501;
				return;
			}

			// Get user id from Steam
			const response = await fetch(`https://api.steampowered.com/ISteamUserAuth/AuthenticateUserTicket/v1/?${new URLSearchParams({
				key: steamApiKey,
				appid: '464350',
				ticket: context.request.body.ticket,
			})}`);
			if (response.status === 200) {
				const json = await response.json();
				if (!validateSteamAuthenticateResponseSchema(json)) {
					throw new Error('Invalid Steam authentication response');
				}
				const { result, steamid } = json.response.params;
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
		}),
	});
}
