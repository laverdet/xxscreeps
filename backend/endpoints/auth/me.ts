import { Endpoint } from '~/backend/endpoint';
import { checkToken, makeToken } from '~/backend/auth/token';

export const MeEndpoint: Endpoint = {
	path: '/me',

	async execute(req, res) {
		const tokenValue = await checkToken(req.get('x-token')!);
		if (tokenValue === undefined) {
			return;
		}
		let userId: string | undefined;

		// Check for steam provider
		const steam = /^steam:(?<id>[0-9]+)$/.exec(tokenValue);
		if (steam) {
			userId = this.context.lookupUserByProvider(tokenValue);
			if (userId === undefined) {
				// Unregistered steam user
				res.set('X-Token', await makeToken(tokenValue));
				return { ok: 1 };
			}
			// Upgrade to user token
			res.set('X-Token', await makeToken(userId));
		}

		// Check for logged in user
		if (/^[a-f0-9]+$/.test(tokenValue)) {
			userId = tokenValue;
		}

		// User not logged in
		if (userId === undefined) {
			return;
		}

		// Real user
		const user = await this.context.loadUser(userId);
		return Object.assign({
			ok: 1,
			_id: user.id,
			username: user.username,
			badge: user.badge === '' ? undefined : JSON.parse(user.badge),
		}, ...this.context.getProvidersForUser(userId).map(provider => {
			const steam = /^steam:(?<id>[0-9]+)$/.exec(provider);
			if (steam) {
				return {
					steam: { id: steam.groups!.id },
				};
			}
		}));
	},
};
