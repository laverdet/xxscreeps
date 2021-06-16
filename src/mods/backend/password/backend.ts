import { hooks } from 'xxscreeps/backend';
import { findUserByName } from 'xxscreeps/engine/db/user';

hooks.register('middleware', koa => {
	koa.use(async(context, next) => {
		const auth64 = context.headers.authorization && /^Basic (?<auth>.+)$/.exec(context.headers.authorization)?.groups?.auth;
		if (auth64) {
			// Passwordless auth
			// TODO(important): Remove this :)
			const auth = Buffer.from(auth64, 'base64').toString();
			const userId = await findUserByName(context.db, auth);
			if (userId) {
				context.state.userId = userId;
			}
		}
		return next();
	});
});

hooks.register('route', {
	method: 'post',
	path: '/api/auth/signin',

	async execute(context) {
		const { email } = context.request.body;
		const userId = await findUserByName(context.db, email);
		if (userId) {
			context.state.userId = userId;
			return { ok: 1, token: await context.flushToken() };
		} else {
			context.status = 401;
			return 'Unauthorized';
		}
	},
});
