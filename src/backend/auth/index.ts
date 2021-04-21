import type { Middleware } from 'xxscreeps/backend';
import * as Id from 'xxscreeps/engine/schema/id';
import config from 'xxscreeps/config';
import { checkToken, makeToken } from './token';
const { allowGuestAccess } = config.backend;

declare module 'xxscreeps/backend' {
	interface Context {
		authenticateForProvider(providerKey: string): Promise<void>;
		flushToken(): Promise<string | undefined>;
	}
	interface State {
		newUserId?: string;
		userId?: string;
		providerKey?: string;
		token?: string;
	}
}

export function authentication(): Middleware {
	return async(context, next) => {
		// eslint-disable-next-line @typescript-eslint/require-await
		context.authenticateForProvider = async(providerKey: string) => {
			if (context.state.token !== undefined) {
				throw new Error('Already flushed');
			}
			const userId = context.backend.auth.lookupUserByProvider(providerKey);
			context.state.providerKey = providerKey;
			if (userId === undefined) {
				context.state.newUserId = Id.generateId(12);
			} else {
				context.state.userId = userId;
			}
		};

		context.flushToken = async() => {
			if (context.state.token !== undefined) {
				return context.state.token;
			}
			const token = await function() {
				if (context.state.userId !== undefined) {
					return makeToken(context.state.userId);
				} else if (context.state.newUserId !== undefined) {
					return makeToken(`new:${context.state.newUserId}:${context.state.providerKey}`);
				} else if (allowGuestAccess) {
					return 'guest';
				}
			}();
			context.state.token = token;
			if (token !== undefined) {
				context.set('X-Token', token);
				if (context.state.providerKey) {
					// Authenticated on this request
					context.cookies.set('token', token, { maxAge: 60 * 1000 });
				}
			}
			return token;
		};

		try {
			// Attempt to use request token
			const token = function() {
				const token = context.get('x-token');
				if (token && token !== 'guest') {
					return token;
				}
				return context.cookies.get('token');
			}();
			if (token && token !== 'guest') {
				const tokenValue = await checkToken(token);
				if (tokenValue === undefined) {
					context.status = 403;
					context.body = 'Malformed token';
					return;
				}
				if (/^[a-f0-9]+$/.test(tokenValue)) {
					context.state.userId = tokenValue;
				} else {
					const unsavedUserToken = /^new:(?<id>[^:]+):(?<provider>.+)$/.exec(tokenValue);
					if (unsavedUserToken) {
						context.state.newUserId = unsavedUserToken.groups!.id;
						context.state.providerKey = unsavedUserToken.groups!.provider;
					}
				}
			}

			// Forward request along to handlers
			await next();
			return;
		} finally {
			// Send refreshed token
			await context.flushToken();
		}
	};
}

export function checkUsername(username: string) {
	return (
		typeof username === 'string' &&
		username.length <= 20 &&
		/^[a-zA-Z0-9][a-zA-Z0-9_-]+[a-zA-Z0-9]$/.test(username)
	);
}
