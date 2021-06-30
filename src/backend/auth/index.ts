import type { Middleware } from 'xxscreeps/backend';
import config from 'xxscreeps/config';
import * as Id from 'xxscreeps/engine/schema/id';
import { checkToken, makeToken } from './token';
import { findUserByProvider } from 'xxscreeps/engine/db/user';
const { allowGuestAccess } = config.backend;

declare module 'xxscreeps/backend' {
	interface Context {
		authenticateForProvider(provider: string, providerId: string): Promise<string>;
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
			if (userId === null) {
				context.state.newUserId = Id.generateId(12);
				context.state.provider = provider;
				context.state.providerId = providerId;
				return context.state.newUserId;
			} else {
				context.state.userId = userId;
				return userId;
			}
		};

		context.flushToken = async(initializeGuest = false) => {
			if (context.state.token !== undefined) {
				return context.state.token;
			}
			// Make token from middleware authentication
			const token = await function() {
				if (context.state.userId !== undefined) {
					return makeToken(context.state.userId);
				} else if (context.state.newUserId !== undefined) {
					return makeToken(`new:${context.state.newUserId}:${context.state.provider}:${context.state.providerId}`);
				} else if (allowGuestAccess && initializeGuest) {
					return 'guest';
				}
			}();
			// Send X-Token response header
			context.state.token = token;
			if (token !== undefined && context.respond !== false) {
				context.set('X-Token', token);
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
			}();
			if (token && token !== 'guest') {
				const tokenValue = await checkToken(token);
				if (tokenValue === undefined) {
					// Allow this request to continue as long as `userId` isn't accessed
					const message = 'Malformed token';
					let didSet = false;
					Object.defineProperty(context.state, 'userId', {
						configurable: true,
						get() {
							throw new Error(message);
						},
						set(value: string) {
							didSet = true;
							Object.defineProperty(context.state, 'userId', {
								configurable: true,
								writable: true,
								value,
							});
						},
					});
					try {
						await next();
						// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
						if (!didSet) {
							Object.defineProperty(context.state, 'userId', { value: undefined });
						}
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
			} else if (context.upgrade) {
				// If this is an upgrade request then attach authentication information on the request, so
				// that Koa middleware which authenticates will carry over to the socket
				const token = await context.flushToken();
				if (token) {
					context.request.headers['x-token'] = token;
				}
			}
		}
	};
}
