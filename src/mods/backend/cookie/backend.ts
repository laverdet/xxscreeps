import * as Crypto from 'crypto';
import * as User from 'xxscreeps/engine/db/user';
import { hooks } from 'xxscreeps/backend';

hooks.register('middleware', koa => koa.use(async(context, next) => {
	if (context.path === '/api/auth/me') {
		await async function() {
			const token = context.get('X-Token');
			if (token === '' || token === '"guest"') {
				// User explicity logged out, so clear session
				const now = new Date;
				context.cookies.set('id', '', { expires: now, httpOnly: false });
				context.cookies.set('session', '', { expires: now, httpOnly: false });
				return;

			} else if (token !== '' && token !== '"guest"') {
				// Authenticate from session cookie
				const userId = context.cookies.get('id')!;
				if (
					/^[0-9a-f]+$/.test(userId) &&
					context.cookies.get('session') === await context.db.data.hget(User.infoKey(userId), 'session')
				) {
					context.state.userId = userId;
					return;
				}
			}

			// Save session after login
			const { userId } = context.state;
			if (userId) {
				const sessionId = Crypto.randomBytes(16).toString('hex');
				context.cookies.set('id', userId, { httpOnly: false });
				context.cookies.set('session', sessionId, { httpOnly: false });
				await context.db.data.hset(User.infoKey(userId), 'session', sessionId);
			}
		}();
	}
	return next();
}));
