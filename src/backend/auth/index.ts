import type { Middleware } from 'xxscreeps/backend';
import * as Id from 'xxscreeps/engine/schema/id';
import config from 'xxscreeps/config';
import { checkToken, makeToken } from './token';
import { findUserByProvider } from 'xxscreeps/engine/db/user';
const { allowGuestAccess } = config.backend;

declare module 'xxscreeps/backend' {
	interface Context {
		authenticateForProvider(provider: string, providerId: string): Promise<void>;
		flushToken(initializeGuest?: boolean): Promise<string | undefined>;
	}
	interface State {
		newUserId?: string;
		userId?: string;
		provider?: string;
		providerId?: string;
		token?: string;
	}
}

export function authentication(): Middleware {
	return async(context, next) => {
		// eslint-disable-next-line @typescript-eslint/require-await
		context.authenticateForProvider = async(provider: string, providerId: string) => {
			if (context.state.token !== undefined) {
				throw new Error('Already flushed');
			}
			const userId = await findUserByProvider(context.db, provider, providerId);
			// Disarm `userId` exception trap from malformed token
			delete context.state.userId;
			if (userId === null) {
				context.state.newUserId = Id.generateId(12);
				context.state.provider = provider;
				context.state.providerId = providerId;
			} else {
				context.state.userId = userId;
			}
		};

		context.flushToken = async(initializeGuest = false) => {
			if (context.state.token !== undefined) {
				return context.state.token;
			}
			const token = await function() {
				if (context.state.userId !== undefined) {
					return makeToken(context.state.userId);
				} else if (context.state.newUserId !== undefined) {
					return makeToken(`new:${context.state.newUserId}:${context.state.provider}:${context.state.providerId}`);
				} else if (allowGuestAccess && initializeGuest) {
					return 'guest';
				}
			}();
			context.state.token = token;
			if (token !== undefined) {
				context.set('X-Token', token);
				if (context.state.provider) {
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
					// Allow this request to continue as long as `userId` isn't accessed
					const message = 'Malformed token';
					Object.defineProperty(context.state, 'userId', {
						configurable: true,
						get() {
							throw new Error(message);
						},
					});
					try {
						await next();
						Object.defineProperty(context.state, 'userId', { value: undefined });
					} catch (err) {
						if (err.message === message) {
							// Send failure to force the Steam client to reauthenticate
							context.status = 403;
							context.body = 'Malformed token';
						} else {
							throw err;
						}
					}
					return;
				}
				if (/^[a-f0-9]+$/.test(tokenValue)) {
					context.state.userId = tokenValue;
				} else {
					const unsavedUserToken = /^new:(?<id>[^:]+):(?<provider>[^:]+):(?<providerId>.+)$/.exec(tokenValue);
					if (unsavedUserToken) {
						context.state.newUserId = unsavedUserToken.groups!.id;
						context.state.provider = unsavedUserToken.groups!.provider;
						context.state.providerId = unsavedUserToken.groups!.providerId;
					}
				}
			}

			// Forward request along to handlers
			await next();
			return;
		} finally {
			// Send refreshed token
			if (context.status === 200) {
				await context.flushToken();
			}
		}
	};
}
