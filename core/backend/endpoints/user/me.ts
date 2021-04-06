import type { Endpoint } from 'xxscreeps/backend';

const MeEndpoint: Endpoint = {
	path: '/api/auth/me',

	async execute(context) {
		if (context.state.providerKey) {
			// Authenticated with provider, registration not complete
			return { ok: 1, id: context.state.userId };

		} else if (context.state.userId) {
			// Real user
			const user = await context.backend.loadUser(context.state.userId);
			return Object.assign({
				ok: 1,
				_id: user.id,
				cpu: 100,
				username: user.username,
				badge: user.badge === '' ? undefined : JSON.parse(user.badge),
			}, ...context.backend.auth.getProvidersForUser(context.state.userId).map(provider => {
				const steam = /^steam:(?<id>[0-9]+)$/.exec(provider);
				if (steam) {
					return {
						steam: { id: steam.groups!.id },
					};
				}
			}));
		}
	},
};

export default [ MeEndpoint ];
