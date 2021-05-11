import { registerBackendMiddleware } from 'xxscreeps/backend';
import { findUserByName } from 'xxscreeps/engine/user/user';

registerBackendMiddleware(koa => {
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
