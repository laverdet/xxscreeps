import type { Middleware } from 'xxscreeps/backend/index.js';
import config from 'xxscreeps/config/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { checkToken, makeToken } from './token.js';
import { findUserByProvider } from 'xxscreeps/engine/db/user/index.js';
const { allowGuestAccess } = config.backend;

declare module 'xxscreeps/backend' {
	interface Context {
		authenticateForProvider(provider: string, providerId: string): Promise<string>;
		flushToken(initializeGuest?: boolean): Promise<string | undefined>;
	}
	interface State {
		newUserId?: string | undefined;
		userId?: string | undefined;
		provider?: string | undefined;
		providerId?: string | undefined;
		token?: string | undefined;
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
				if (context.state.newUserId !== undefined) {
					return makeToken(`new:${context.state.newUserId}:${context.state.provider}:${context.state.providerId}`);
				} else if (context.state.userId !== undefined) {
					return makeToken(context.state.userId);
				} else if (allowGuestAccess && initializeGuest) {
					return 'guest';
				}
			}();
			// Set X-Token on state, and also fake the header on the request. This may be picked up by the
			// socket handler.
			context.req.headers['x-token'] =
			context.state.token = token;
			// Send X-Token response header
			if (token !== undefined && context.respond !== false) {
				context.set('X-Token', token);
			}
			return token;
		};

		try {
			// Check authentication payload
			const authValue = await async function() {
				const token = context.get('x-token');
				if (token === '') {
					// No header sent; logged out
					return false;
				} else if (token === 'guest') {
					// Header sent; guest access requested
					return allowGuestAccess;
				} else {
					const tokenValue = await checkToken(token);
					if (tokenValue === undefined) {
						// Expired / invalid header
						return false;
					}
					return tokenValue;
				}
			}();
			if (authValue === false) {
				// Allow this request to continue as long as `userId` isn't accessed
				let didThrow;
				let didSet = false;
				Object.defineProperty(context.state, 'userId', {
					configurable: true,
					get() {
						throw didThrow = new Error('Unauthorized');
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
						context.state.userId = undefined;
					}
				} catch (err) {
					// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
					if (err === didThrow) {
						// Send failure to force the Steam client to reauthenticate
						context.status = 401;
						context.body = { error: 'unauthorized' };
					} else {
						throw err;
					}
				}
			} else {
				if (authValue === true) {
					// Not logged in
					context.state.userId = undefined;
				} else if (/^[a-f0-9]+$/.test(authValue)) {
					// Real userId
					context.state.userId = authValue;
				} else {
					// Fake userId
					const unsavedUserToken = /^new:(?<id>[^:]+):(?<provider>[^:]+):(?<providerId>.+)$/.exec(authValue);
					if (unsavedUserToken) {
						context.state.newUserId = unsavedUserToken.groups!.id;
						context.state.provider = unsavedUserToken.groups!.provider;
						context.state.providerId = unsavedUserToken.groups!.providerId;
					}
				}

				// Forward request along to handlers
				await next();
			}
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
