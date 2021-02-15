import { Endpoint } from 'xxscreeps/backend/endpoint';
import { checkToken, makeToken } from 'xxscreeps/backend/auth/token';
import * as Id from 'xxscreeps/engine/util/schema/id';

export const MeEndpoint: Endpoint = {
	path: '/me',

	async execute(req, res) {
		const tokenValue = await checkToken(req.get('x-token'));
		if (tokenValue === undefined) {
			return;
		}
		let userId: string | undefined;

		// Check for new user
		const newReg = /^new:(?<id>[^:]+):(?<provider>.+)$/.exec(tokenValue);
		if (newReg) {
			userId = this.context.lookupUserByProvider(newReg.groups!.provider);
			if (userId === undefined) {
				res.set('X-Token', await makeToken(tokenValue));
				return { ok: 1, id: newReg.groups!.id };
			}
		}

		// Check for steam provider
		const steam = /^steam:(?<id>[0-9]+)$/.exec(tokenValue);
		if (steam) {
			userId = this.context.lookupUserByProvider(tokenValue);
			if (userId === undefined) {
				// Unregistered steam user
				const id = Id.generateId(12);
				res.set('X-Token', await makeToken(`new:${id}:${tokenValue}`));
				return { ok: 1, id };
			}
		}

		// Check for logged in user
		if (/^[a-f0-9]+$/.test(tokenValue)) {
			userId = tokenValue;
		}

		// User not logged in
		if (userId === undefined) {
			return;
		}
		res.set('X-Token', await makeToken(userId));

		// Real user
		const user = await this.context.loadUser(userId);
		return Object.assign({
			ok: 1,
			_id: user.id,
			cpu: 100,
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
