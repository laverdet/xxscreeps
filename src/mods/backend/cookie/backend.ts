import * as Crypto from 'node:crypto';
import { hooks } from 'xxscreeps/backend/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';

hooks.register('middleware', koa => koa.use(async (context, next): Promise<unknown> => {
	const clear = () => {
		if (context.cookies.get('id') !== undefined) {
			const now = new Date();
			context.cookies.set('id', null, { expires: now, httpOnly: false });
			context.cookies.set('session', null, { expires: now, httpOnly: false });
		}
	};

	const token = context.get('X-Token');
	if (token === '' && context.path.startsWith('/api/')) {
		// User explicity logged out, so clear session
		if (context.path === '/api/auth/me') {
			clear();
		}

	} else if (token !== '"guest"' && (context.path.startsWith('/api/') || context.path.startsWith('/socket/'))) {
		// Authenticate from session cookie
		const cookieUserId = context.cookies.get('id')!;
		if (cookieUserId) {
			const userId = function() {
				try {
					return context.state.userId;
				} catch {}
			}();
			if (userId !== undefined) {
				if (userId !== cookieUserId) {
					clear();
				}
			} else if (
				/^[0-9a-f]{1,32}$/.test(cookieUserId) &&
				context.cookies.get('session') === await context.db.data.hget(User.infoKey(cookieUserId), 'session')
			) {
				context.state.userId = cookieUserId;
				await context.flushToken();
			}
		}
	}

	if (context.path === '/api/auth/me') {
		// Save session after login
		const { userId } = context.state;
		if (userId !== undefined) {
			const sessionId = Crypto.randomBytes(16).toString('hex');
			context.cookies.set('id', userId, { httpOnly: false });
			context.cookies.set('session', sessionId, { httpOnly: false });
			await context.db.data.hset(User.infoKey(userId), 'session', sessionId);
		}
	}
	return next();
}));
