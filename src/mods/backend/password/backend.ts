import { registerBackendMiddleware } from 'xxscreeps/backend';

registerBackendMiddleware(koa => {
	koa.use((context, next) => {
		const auth64 = context.headers.authorization && /^Basic (?<auth>.+)$/.exec(context.headers.authorization)?.groups?.auth;
		if (auth64) {
			// Passwordless auth
			// TODO(important): Remove this :)
			const auth = Buffer.from(auth64, 'base64').toString();
			const user = context.backend.auth.lookupUserByProvider(auth);
			if (user) {
				context.state.userId = user;
			}
		}
		return next();
	});
});
